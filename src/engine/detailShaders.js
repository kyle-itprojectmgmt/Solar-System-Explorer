// ---------------------------------------------------------------------------
// Procedural surface-detail shader framework.
//
// Bodies opt in through their system config:
//   detail: { style: 'gasGiant', activationKm: 50000, fullKm: 5000, params: {…} }
//
// The style's GLSL is injected into the body's MeshPhongMaterial via
// onBeforeCompile, so Three's lighting/eclipse pipeline is untouched.
// Injected code runs inside main() after <map_fragment>:
//   - `dUv`            base texture UV (vec2)
//   - `vObjPos`        normalized object-space position (unit sphere)
//   - `diffuseColor`   the lit base color — modify .rgb in place
//   - `gDetailEmissive` add self-illumination (hot spots, glows, auroras)
// Everything is gated on uDetailBlend, which the renderer drives from the
// camera's altitude each frame (0 above activationKm — near-zero GPU cost
// when far away).
// ---------------------------------------------------------------------------

import * as THREE from 'three';
import SIMPLEX_GLSL from './glsl/simplex.glsl?raw';

/** Registry of detail styles. Populated per body type below. */
export const DETAIL_STYLES = {};

/**
 * Wire a detail style into a MeshPhongMaterial. Returns the uniform handles
 * the renderer updates per frame ({ uTime, uAltitude, uDetailBlend, ... }).
 */
export function applyDetailShader(material, style, params = {}, quality = {}) {
  const def = DETAIL_STYLES[style];
  if (!def) return null;

  const uniforms = {
    uTime: { value: 0 },
    uAltitude: { value: 1e9 },
    uDetailBlend: { value: 0 },
    ...(def.uniforms ? def.uniforms(params) : {}),
  };

  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);

    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>
        varying vec3 vObjPos;`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        vObjPos = normalize(position);`);

    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
        varying vec3 vObjPos;
        uniform float uTime;
        uniform float uAltitude;
        uniform float uDetailBlend;
        ${def.decls || ''}
        ${quality.tier === 'mobile' ? '#define DETAIL_QUALITY_LOW' : ''}
        ${SIMPLEX_GLSL}
        ${def.fns || ''}`)
      .replace('#include <map_fragment>', `#include <map_fragment>
        vec3 gDetailEmissive = vec3(0.0);
        if (uDetailBlend > 0.001) {
          vec2 dUv = vMapUv;
          ${def.apply}
        }`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        totalEmissiveRadiance += gDetailEmissive;`);

    material.userData.detailUniforms = shader.uniforms;
  };
  material.customProgramCacheKey = () => `detail-${style}-${quality.tier}`;
  material.needsUpdate = true;
  return uniforms;
}

/** JS mirror of GLSL smoothstep for the altitude -> blend mapping. */
export function detailBlend(altKm, activationKm, fullKm) {
  const t = Math.min(1, Math.max(0, (activationKm - altKm) / (activationKm - fullKm)));
  return t * t * (3 - 2 * t);
}

// ---------------------------------------------------------------------------
// Body detail styles are registered below, one per geological archetype.
// (gasGiant = banded clouds, volcanic = sulfur/lava, ice = cracked shell,
//  grooved = two-tone tectonic, cratered = ancient impact terrain.)
//
// Convention inside `apply` (see injection wrapper above):
//   dTint  = material.color (carries eclipse darkening — multiply back in)
//   dBase  = pure texture color, detail layers derive from this
// ---------------------------------------------------------------------------

const DETAIL_PREAMBLE = /* glsl */ `
  vec3 dTint = max(diffuse, vec3(0.001));
  vec3 dBase = diffuseColor.rgb / dTint;
  vec3 detail = dBase;
`;
const DETAIL_FINAL = /* glsl */ `
  diffuseColor.rgb = mix(diffuseColor.rgb, detail * dTint, uDetailBlend);
`;

// -- Gas giant: banded cloud turbulence + vortex + limb haze ---------------------

DETAIL_STYLES.gasGiant = {
  uniforms: (p) => ({
    uGrsUV: { value: new THREE.Vector2(...(p.grsUV || [0.5, 0.38])) },
  }),
  decls: /* glsl */ `uniform vec2 uGrsUV;`,
  apply: /* glsl */ `
    ${DETAIL_PREAMBLE}
    float dLum = dot(dBase, vec3(0.299, 0.587, 0.114));
    float t1 = uTime * 0.00005;

    // LAYER 1 — fine cloud turbulence, modulated by the banding pattern.
    float turb = fbm3(vObjPos * 30.0 + vec3(t1, 0.0, -0.7 * t1));
    vec3 wispy = vec3(0.961, 0.941, 0.878) * (0.92 + 0.16 * turb);      // #F5F0E0
    vec3 eddy = mix(vec3(0.545, 0.353, 0.169),                          // #8B5A2B
                    vec3(0.769, 0.478, 0.169),                          // #C47A2B
                    0.5 + 0.5 * turb);
    float zone = smoothstep(0.34, 0.58, dLum); // 1 = light zone, 0 = dark belt
    vec3 turbTint = mix(eddy, wispy, zone);
    detail = mix(detail * (0.86 + 0.28 * (0.5 + 0.5 * turb)), turbTint, 0.22 * abs(turb));

    // LAYER 1b/1c — progressively finer turbulence as the camera descends,
    // so there is always sub-frame cloud structure ("infinite detail").
    float midAct = 1.0 - smoothstep(3000.0, 15000.0, uAltitude);
    if (midAct > 0.001) {
      float turb2 = fbm3(vObjPos * 170.0 + vec3(-2.0 * t1, t1, 0.0));
      detail = mix(detail, detail * (0.88 + 0.24 * (0.5 + 0.5 * turb2)), midAct);
      detail = mix(detail, turbTint, 0.10 * abs(turb2) * midAct);
    }
    float fineAct = 1.0 - smoothstep(800.0, 4000.0, uAltitude);
    if (fineAct > 0.001) {
      float turb3 = snoise(vObjPos * 750.0 + vec3(3.0 * t1, 0.0, -t1));
      detail *= 1.0 + 0.10 * turb3 * fineAct;
    }

    // LAYER 2 — thin wisps stretched 4:1 along latitude lines.
    float wisp = snoise(vec3(dUv.x * 55.0, dUv.y * 220.0, 4.2 + t1 * 2.0));
    detail *= 1.0 + 0.07 * wisp;
    float wisp2 = snoise(vec3(dUv.x * 300.0, dUv.y * 1200.0, 7.7 + t1));
    detail *= 1.0 + 0.05 * wisp2 * midAct;

    // LAYER 3 — Great Red Spot internal vortex (within 20,000 km).
    float grsAct = 1.0 - smoothstep(5000.0, 20000.0, uAltitude);
    if (grsAct > 0.001) {
      vec2 gl = (dUv - uGrsUV) * vec2(2.0, 1.0); // equirect aspect correction
      float gr = length(gl) / 0.045;             // normalized vortex radius
      if (gr < 1.6) {
        // Spiral: rotation angle grows toward the center, plus a slow drift
        // so the vortex turns relative to the base texture.
        float ang = 2.4 / (gr + 0.35) + uTime * 0.00002;
        vec2 rl = mat2(cos(ang), -sin(ang), sin(ang), cos(ang)) * gl;
        float vort = fbm3(vec3(rl * 42.0, 3.7 + t1));
        vec3 grsCol = mix(vec3(0.545, 0.0, 0.0), vec3(1.0, 0.4, 0.0),   // #8B0000 -> #FF6600
                          smoothstep(0.0, 0.7, gr));
        grsCol = mix(grsCol, vec3(0.961, 0.902, 0.784),                  // -> #F5E6C8
                     smoothstep(0.75, 1.25, gr));
        grsCol *= 0.85 + 0.3 * vort;
        // Fine internal swirl, resolved only at the lowest altitudes.
        grsCol *= 1.0 + 0.15 * snoise(vec3(rl * 220.0, 9.1 + t1)) * fineAct;
        detail = mix(detail, grsCol, (1.0 - smoothstep(1.05, 1.5, gr)) * grsAct * 0.85);
      }
    }

    // LAYER 4 — atmospheric depth haze at the horizon (below 10,000 km).
    float hazeAct = 1.0 - smoothstep(2000.0, 10000.0, uAltitude);
    if (hazeAct > 0.001) {
      float limb = 1.0 - abs(dot(normalize(vNormal), normalize(vViewPosition)));
      detail = mix(detail, vec3(0.784, 0.831, 0.910),                    // #C8D4E8
                   hazeAct * pow(limb, 2.2) * 0.5);
    }
    ${DETAIL_FINAL}
  `,
};
