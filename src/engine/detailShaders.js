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
// ---------------------------------------------------------------------------
