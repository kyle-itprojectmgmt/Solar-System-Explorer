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
import SURFACE_BASE_GLSL from './glsl/surface-base.glsl?raw';
import TERRA_CLOUDS from './shaders/earth-clouds.glsl?raw';
import TERRA_LIGHTS from './shaders/earth-lights.glsl?raw';
import TERRA_AURORA from './shaders/earth-aurora.glsl?raw';
import TERRA_OCEAN from './shaders/earth-ocean.glsl?raw';
import LUNA_DETAIL from './shaders/moon-detail.glsl?raw';
import ARES_SURFACE from './shaders/mars-surface.glsl?raw';
import ARES_DUST from './shaders/mars-dust.glsl?raw';
import ARES_POLAR from './shaders/mars-polar.glsl?raw';

/** Registry of detail styles. Populated per body type below. */
export const DETAIL_STYLES = {};

// Altitude-staged octave counts (0f): each zoom level reveals genuinely new
// noise octaves as the camera descends. Styles pick one via `octaves`.
const OCTAVES_GAS_GIANT =
  'uAltitude > 20000.0 ? 3 : (uAltitude > 5000.0 ? 5 : (uAltitude > 1000.0 ? 7 : 9))';
const OCTAVES_MOON =
  'uAltitude > 5000.0 ? 3 : (uAltitude > 1000.0 ? 5 : (uAltitude > 200.0 ? 7 : 9))';

/**
 * Wire a detail style into a MeshPhongMaterial. Returns the uniform handles
 * the renderer updates per frame ({ uTime, uAltitude, uDetailBlend, ... }).
 */
export function applyDetailShader(material, style, params = {}, quality = {}, shaderParams = {}) {
  const def = DETAIL_STYLES[style];
  if (!def) return null;

  const uniforms = {
    uTime: { value: 0 },
    uAltitude: { value: 1e9 },
    uDetailBlend: { value: 0 },
    uNormalScale: { value: 1.5 }, // per-body relief strength (cfg.normalScale)
    // Object-space sun direction and camera position (V5): sun-relative
    // effects (terminator, city lights, glint, earthshine) rotate with the
    // body because vObjPos does. The renderer updates these per frame.
    uSunObj: { value: new THREE.Vector3(1, 0, 0) },
    uCamObj: { value: new THREE.Vector3(0, 0, 1) },
    // Unified fade convention (V7 1b) — per-body terminator / grazing-sun
    // bands from body.shaderParams; see glsl/surface-base.glsl. Defaults
    // are the Mars-calibrated bands (the v6.0.2 night-fade values).
    uDayFade0: { value: shaderParams.dayFadeSoft0 ?? -0.08 },
    uDayFade1: { value: shaderParams.dayFadeSoft1 ?? 0.15 },
    uGrazeFade0: { value: shaderParams.grazeFade0 ?? 0.20 },
    uGrazeFade1: { value: shaderParams.grazeFade1 ?? 0.55 },
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
        uniform float uNormalScale;
        uniform vec3 uSunObj;
        uniform vec3 uCamObj;
        uniform float uDayFade0;
        uniform float uDayFade1;
        uniform float uGrazeFade0;
        uniform float uGrazeFade1;
        ${def.decls || ''}
        ${quality.tier === 'mobile' ? '#define DETAIL_QUALITY_LOW' : ''}
        ${SIMPLEX_GLSL}
        ${SURFACE_BASE_GLSL}
        ${def.fns || ''}`)
      .replace('#include <map_fragment>', `#include <map_fragment>
        vec3 gDetailEmissive = vec3(0.0);
        float gDetailHeight = 0.0;
        if (uDetailBlend > 0.001) {
          vec2 dUv = vMapUv;
          int dOct = ${def.octaves || OCTAVES_MOON};
          #ifdef DETAIL_QUALITY_LOW
          dOct = max(dOct - 2, 1); // mobile tier: two fewer octaves
          #endif
          ${def.apply}
        }`)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
        // 0g — procedural relief drives the lighting: perturb the shading
        // normal from the screen-space gradient of the detail height field.
        // Derivatives are clamped: octaves finer than the pixel footprint
        // otherwise decorrelate and shade as uniform gravel.
        if (uDetailBlend > 0.001) {
          normal = dtlPerturbNormal(-vViewPosition, normal,
            clamp(dFdx(gDetailHeight), -0.02, 0.02),
            clamp(dFdy(gDetailHeight), -0.02, 0.02),
            uNormalScale * 0.25 * uDetailBlend);
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

// -- Volcanic (Io): sulfur palette, lava flows, calderas, hot spots, frost --------

DETAIL_STYLES.volcanic = {
  apply: /* glsl */ `
    ${DETAIL_PREAMBLE}
    float t1 = uTime * 0.0001;

    // LAYER 1 — sulfur compound zones at several noise frequencies.
    float zoneN = fbmN(vObjPos * 28.0 + vec3(t1), dOct);
    float zoneN2 = snoise(vObjPos * 84.0 - vec3(t1, 0.0, t1)) * dtlFreqFade(vObjPos, 84.0);
    vec3 sulfurY = vec3(0.910, 0.831, 0.302); // #E8D44D SO2 frost yellow
    vec3 sulfurO = vec3(0.831, 0.329, 0.102); // #D4541A mid-temp allotropes
    vec3 sulfurR = vec3(0.545, 0.102, 0.102); // #8B1A1A high-temp sulfur
    vec3 basalt  = vec3(0.102, 0.102, 0.0);   // #1A1A00 fresh lava
    vec3 palette = mix(sulfurY, sulfurO, smoothstep(-0.4, 0.4, zoneN));
    palette = mix(palette, sulfurR, smoothstep(0.25, 0.75, zoneN2) * 0.6);
    detail = mix(detail, detail * 0.4 + palette * 0.6, 0.35 + 0.2 * abs(zoneN));

    // LAYER 2 — lava flows: elongated noise, direction rotated per region.
    float flowAng = snoise(vObjPos * 3.0) * 1.6;
    vec2 flowUv = mat2(cos(flowAng), -sin(flowAng), sin(flowAng), cos(flowAng)) * dUv;
    float flow = fbmN(vec3(flowUv.x * 360.0, flowUv.y * 120.0, 2.5 + t1), dOct); // 3:1 stretch
    float flowMask = smoothstep(0.35, 0.7, flow);
    detail = mix(detail, vec3(0.102, 0.071, 0.0), flowMask * 0.65);       // #1A1200

    // LAYER 3 — calderas: cellular depressions, dark floors, sulfur rims.
    float cal1Id; float cal1 = craterProfile(dUv * 24.0, cal1Id);
    float cal2Id; float cal2 = craterProfile(dUv * 90.0 + 31.7, cal2Id);
    // Not every cell hosts a caldera — thin them out by cell hash.
    float calderas = cal1 * step(0.35, cal1Id) + cal2 * 0.5 * step(0.55, cal2Id);
    detail = mix(detail, vec3(0.051, 0.051, 0.0), clamp(-calderas, 0.0, 1.0) * 0.8); // #0D0D00 floor
    detail = mix(detail, vec3(1.0, 0.894, 0.302), clamp(calderas, 0.0, 1.0) * 0.5);  // #FFE44D rim

    // LAYER 5 — SO2 frost in topographic lows between flows.
    float frost = snoise(vObjPos * 260.0);
    detail = mix(detail, vec3(0.961, 0.961, 0.878),                                   // #F5F5E0
                 smoothstep(0.55, 0.9, frost) * (1.0 - flowMask) * 0.18
                 * dtlFreqFade(vObjPos, 260.0));

    // Relief height (0g): flows sit low, caldera rims high, floors deep.
    gDetailHeight = zoneN * 0.12 - flowMask * 0.4 + clamp(calderas, -1.0, 1.0) * 0.55;

    // LAYER 4 — hot spot glow, below 200 km only; slow breathing pulse.
    float hotAct = 1.0 - smoothstep(80.0, 200.0, uAltitude);
    if (hotAct > 0.001) {
      float hot = dtlAAstep(0.78, 0.95, snoise(vObjPos * 120.0 + 17.3));
      float pulse = sin(uTime * 0.2) * 0.3 + 0.7;
      gDetailEmissive += vec3(1.0, 0.267, 0.0) * hot * pulse * hotAct * uDetailBlend; // #FF4400
    }
    ${DETAIL_FINAL}
  `,
};

// -- Ice shell (Europa): fractal cracks, chaos terrain, ocean glow ---------------

DETAIL_STYLES.ice = {
  apply: /* glsl */ `
    ${DETAIL_PREAMBLE}
    float t1 = uTime * 0.00002;
    float dLum = dot(dBase, vec3(0.299, 0.587, 0.114));

    // LAYER 2 — subtle blue-white flexing of the ice plains.
    float plain = fbmN(vObjPos * 18.0 + vec3(t1), dOct);
    vec3 iceCold = vec3(0.910, 0.957, 0.973); // #E8F4F8
    vec3 iceBlue = vec3(0.690, 0.831, 0.910); // #B0D4E8
    detail = mix(detail, mix(iceBlue, iceCold, 0.5 + 0.5 * plain), 0.05 + 0.03 * plain);

    // LAYER 1 — fractal micro-crack network at three scales, following a
    // slowly-rotating regional stress field.
    float stress = snoise(vObjPos * 2.2) * 1.3; // stress field orientation
    vec2 sUv = mat2(cos(stress), -sin(stress), sin(stress), cos(stress)) * dUv;
    vec3 crackCol = vec3(0.545, 0.271, 0.075); // #8B4513 organic deposits
    // Domain-warp the crack field so ridged zero-sets meander like real
    // lineae instead of closing into concentric loops.
    vec2 wUv = sUv + 0.06 * vec2(fbm2(vObjPos * 7.0 + t1), fbm2(vObjPos * 7.0 + 27.3));
    float c1 = dtlAAstep(0.90, 0.985, ridged(vec3(wUv * 68.0, 1.7))) * dtlFreqFade2(wUv, 68.0);
    float c2 = dtlAAstep(0.92, 0.990, ridged(vec3(wUv * 220.0, 5.1))) * dtlFreqFade2(wUv, 220.0);
    float c3 = dtlAAstep(0.94, 0.995, ridged(vec3(wUv * 320.0, 9.3))) * dtlFreqFade2(wUv, 320.0);
    float cracks = clamp(c1 * 0.6 + c2 * 0.4 + c3 * 0.25, 0.0, 1.0);
    detail = mix(detail, crackCol, cracks * 0.55);

    // LAYER 3 — chaos terrain: jumbled refrozen ice rafts in mid-tone regions.
    float chaosZone = smoothstep(0.35, 0.42, dLum) * (1.0 - smoothstep(0.58, 0.65, dLum));
    if (chaosZone > 0.001) {
      vec2 w = worley2(dUv * 150.0);
      float block = 0.94 + 0.12 * (w.y - 0.5);            // per-raft brightness
      float edge = 0.85 + 0.15 * smoothstep(0.0, 0.12, w.x); // soft seams
      detail = mix(detail, detail * block * edge,
                   chaosZone * 0.55 * dtlFreqFade2(dUv, 150.0));
    }

    // LAYER 5 — fresh impact sites: bright exposed water ice.
    float fresh = dtlAAstep(0.86, 0.97, snoise(vObjPos * 70.0 + 41.2))
      * dtlFreqFade(vObjPos, 70.0);
    detail = mix(detail, vec3(1.0), fresh * 0.5);

    // Relief height (0g): crack troughs cut into gently flexing plains.
    gDetailHeight = plain * 0.15 - cracks * 0.6;

    // LAYER 4 — subsurface ocean glow below 1,000 km. Almost subliminal.
    float oceanAct = 1.0 - smoothstep(300.0, 1000.0, uAltitude);
    if (oceanAct > 0.001) {
      float pulse = sin(uTime * 0.1) * 0.025 + 0.025;
      float thin = 0.5 + 0.5 * snoise(vObjPos * 6.0);     // thinner ice glows more
      gDetailEmissive += vec3(0.267, 0.533, 1.0)          // #4488FF
        * (0.025 + pulse) * thin * oceanAct * uDetailBlend;
    }
    ${DETAIL_FINAL}
  `,
};

// -- Grooved (Ganymede): two-tone tectonic terrain + polar aurora ----------------

DETAIL_STYLES.grooved = {
  apply: /* glsl */ `
    ${DETAIL_PREAMBLE}
    float t1 = uTime * 0.00003;
    float dLum = dot(dBase, vec3(0.299, 0.587, 0.114));

    // DARK TERRAIN — ancient cratered silicate regolith.
    vec3 darkDetail = detail;
    float ghDark = 0.0, ghLight = 0.0; // relief per terrain type (0g)
    {
      float dust = fbmN(vObjPos * 440.0 + vec3(t1), dOct);
      darkDetail = mix(darkDetail,
        mix(vec3(0.165, 0.122, 0.055), vec3(0.239, 0.169, 0.102),      // #2A1F0E -> #3D2B1A
            0.5 + 0.5 * dust), 0.45);
      // Crater micro-detail eases in below ~3,000 km so the global view
      // isn't tiled with rim rings.
      float crAct = 1.0 - smoothstep(500.0, 3000.0, uAltitude);
      float dcId; float dc = craterProfile(dUv * 120.0, dcId);
      dc *= step(0.45, dcId) * crAct;
      darkDetail = mix(darkDetail, vec3(0.290, 0.220, 0.157), clamp(dc, 0.0, 1.0) * 0.35);  // #4A3828 rims
      darkDetail = mix(darkDetail, vec3(0.102, 0.063, 0.031), clamp(-dc, 0.0, 1.0) * 0.5);  // #1A1008 floors
      // Impact gardening — billions of years of micrometeorite powder.
      darkDetail *= 1.0 + (0.12 * snoise(vObjPos * 900.0) - 0.06)
        * dtlFreqFade(vObjPos, 900.0);
      ghDark = clamp(dc, -1.0, 1.0) * 0.5; // dust is too fine for relief
    }

    // LIGHT TERRAIN — younger grooved ice, parallel ridge-and-groove bands.
    vec3 lightDetail = detail;
    {
      // Groove orientation rotates slowly by region (separate tectonic episodes).
      float gAng = snoise(vObjPos * 2.6 + 5.0) * 1.8;
      vec2 gUv = mat2(cos(gAng), -sin(gAng), sin(gAng), cos(gAng)) * dUv;
      // Vinyl-record parallel bands with a little waviness.
      float bands = sin(gUv.y * 1350.0 + snoise(vObjPos * 30.0) * 4.0)
        * dtlFreqFade2(gUv, 1350.0);
      vec3 ridgeCol = vec3(0.784, 0.831, 0.753);  // #C8D4C0
      vec3 grooveCol = vec3(0.502, 0.565, 0.627); // #8090A0
      lightDetail = mix(lightDetail, mix(grooveCol, ridgeCol, 0.5 + 0.5 * bands), 0.30);
      // Fresh crater ejecta rays.
      float ray = dtlAAstep(0.88, 0.98, snoise(vObjPos * 55.0 + 23.0));
      lightDetail = mix(lightDetail, vec3(0.910, 0.933, 0.878), ray * 0.5);   // #E8EEE0
      ghLight = bands * 0.2; // ridge-and-groove relief catches directional light
    }

    // Terrain split by base luminance with a smooth transition zone.
    float split = smoothstep(0.35, 0.45, dLum);
    detail = mix(darkDetail, lightDetail, split);
    gDetailHeight = mix(ghDark, ghLight, split);

    // POLAR AURORA — Ganymede's own magnetosphere, below 2,000 km.
    float aurAct = 1.0 - smoothstep(600.0, 2000.0, uAltitude);
    if (aurAct > 0.001) {
      float lat = abs(vObjPos.y);
      float polar = smoothstep(0.866, 0.94, lat); // above ~60 deg latitude
      if (polar > 0.001) {
        float dance = 0.5 + 0.5 * sin(uTime * 0.3 + vObjPos.y * 6.0 + snoise(vObjPos * 40.0 + t1 * 40.0) * 3.0);
        gDetailEmissive += vec3(0.267, 1.0, 0.533)                     // #44FF88
          * 0.03 * polar * dance * aurAct * uDetailBlend;
      }
    }
    ${DETAIL_FINAL}
  `,
};

// -- Cratered (Callisto): 4 octaves of impact history + Valhalla rings -----------

DETAIL_STYLES.cratered = {
  uniforms: (p) => {
    // Basin anchor given as texture UV; convert via the SphereGeometry
    // mapping so the rings land on the map's actual basin.
    const [u, v] = p.basinUV || [0.5, 0.5];
    const phi = u * Math.PI * 2;
    const theta = (1 - v) * Math.PI;
    return {
      uBasinDir: { value: new THREE.Vector3(
        -Math.cos(phi) * Math.sin(theta), Math.cos(theta), Math.sin(phi) * Math.sin(theta)) },
    };
  },
  decls: /* glsl */ `uniform vec3 uBasinDir;`,
  apply: /* glsl */ `
    ${DETAIL_PREAMBLE}
    float t1 = uTime * 0.00001; // geologically dead — near-zero motion

    // LAYER 2 — dark carbonaceous regolith base with warm dust patches.
    float dustN = fbmN(vObjPos * 48.0 + vec3(t1), dOct);
    detail = mix(detail,
      mix(vec3(0.102, 0.082, 0.063), vec3(0.239, 0.169, 0.122),        // #1A1510 -> #3D2B1F
          smoothstep(-0.3, 0.5, dustN)), 0.35);

    // LAYER 1 — craters on craters on craters, four scales. The crater
    // micro-detail ramps in as the camera descends.
    float crAct = 1.0 - smoothstep(500.0, 3500.0, uAltitude);
    float id1; float c1 = craterProfile(dUv * 36.0, id1);
    float id2; float c2 = craterProfile(dUv * 110.0 + 7.3, id2);
    float id3; float c3 = craterProfile(dUv * 340.0 + 19.1, id3);
    float id4; float c4 = craterProfile(dUv * 1040.0 + 3.7, id4);
    // Large craters: deep shadowed floors, raised rims, faint ejecta.
    detail = mix(detail, vec3(0.051), clamp(-c1, 0.0, 1.0) * 0.55);                    // #0D0D0D
    detail = mix(detail, vec3(0.239, 0.188, 0.125), clamp(c1, 0.0, 1.0) * 0.4);        // #3D3020
    detail = mix(detail, vec3(0.165, 0.125, 0.094), smoothstep(0.4, 0.0, abs(c1)) * 0.10); // ejecta
    // Medium: brighter floors (less shadow), overlapping everywhere.
    detail = mix(detail, vec3(0.09), clamp(-c2, 0.0, 1.0) * 0.4 * (0.4 + 0.6 * crAct));
    detail = mix(detail, vec3(0.220, 0.176, 0.125), clamp(c2, 0.0, 1.0) * 0.3 * (0.4 + 0.6 * crAct));
    // Small: covering floors and rims alike (faded before sub-pixel).
    float c3Fade = dtlFreqFade2(dUv, 340.0);
    detail = mix(detail, vec3(0.10), clamp(-c3, 0.0, 1.0) * 0.5 * crAct * c3Fade);
    detail = mix(detail, vec3(0.27, 0.23, 0.17), clamp(c3, 0.0, 1.0) * 0.32 * crAct * c3Fade);
    // Micro-cratering / powdery regolith.
    detail *= 1.0 + (clamp(c4, -1.0, 1.0) * 0.18 * dtlFreqFade2(dUv, 1040.0)
      + snoise(vObjPos * 1100.0) * 0.05 * dtlFreqFade(vObjPos, 1100.0)) * crAct;

    // Relief height (0g): rims lit, floors shadowed, at every crater scale.
    gDetailHeight = clamp(c1, -1.0, 1.0) * 0.45
      + clamp(c2, -1.0, 1.0) * 0.25 * (0.4 + 0.6 * crAct)
      + clamp(c3, -1.0, 1.0) * 0.12 * crAct;

    // LAYER 3 — bright ice floors in the freshest craters.
    float fresh = step(0.82, id2) * clamp(-c2, 0.0, 1.0);
    detail = mix(detail, mix(vec3(1.0), vec3(0.910, 0.941, 1.0), id2), fresh * 0.7);   // #FFFFFF/#E8F0FF

    // LAYER 4 — Valhalla multi-ring basin: concentric, ancient, worn flat.
    float basinAngle = acos(clamp(dot(vObjPos, normalize(uBasinDir)), -1.0, 1.0));
    if (basinAngle < 0.45) {
      float rings = sin(basinAngle * 55.0);
      float ringFade = 1.0 - smoothstep(0.30, 0.42, basinAngle);
      detail = mix(detail,
        mix(vec3(0.078, 0.063, 0.031), vec3(0.165, 0.125, 0.094),      // #141008 -> #2A2018
            0.5 + 0.5 * rings), ringFade * 0.25);
      // Central plain: refrozen impact melt, pale and flat.
      float core = 1.0 - smoothstep(0.05, 0.12, basinAngle);
      detail = mix(detail, vec3(0.784, 0.753, 0.690), core * 0.45);    // #C8C0B0
    }
    ${DETAIL_FINAL}
  `,
};

// -- Terra (Earth) + Luna (Moon) — V5 worker shader chunks -------------------------
// Worker files are fragment chunks; clouds and lights carry helper functions
// above an `// === APPLY ===` marker. Each chunk is brace-isolated so their
// local variables can't collide; they share detail / gDetailEmissive /
// gDetailHeight.

function splitChunk(src) {
  const i = src.indexOf('// === APPLY ===');
  return i === -1
    ? { fns: '', apply: src }
    : { fns: src.slice(0, i), apply: src.slice(i) };
}

const terraClouds = splitChunk(TERRA_CLOUDS);
const terraLights = splitChunk(TERRA_LIGHTS);

DETAIL_STYLES.terra = {
  fns: terraClouds.fns + terraLights.fns,
  apply: /* glsl */ `
    ${DETAIL_PREAMBLE}
    { ${terraClouds.apply} }
    { ${TERRA_OCEAN} }
    { ${terraLights.apply} }
    { ${TERRA_AURORA} }
    ${DETAIL_FINAL}
  `,
};

// The moon chunk includes its own preamble and final mix (matches the
// framework's exactly), so it injects bare.
DETAIL_STYLES.luna = {
  apply: LUNA_DETAIL,
};

// -- Ares (Mars) — V6 worker shader chunks ----------------------------------------
// Chunk order matters: surface terrain first, polar caps paint over it, and
// the dust layer goes LAST so a global storm (uDustStorm -> 1) veils caps
// and terrain alike. uDustStorm is the style's extra uniform — the VIEW
// panel's Dust Storm slider writes it directly.

const aresSurface = splitChunk(ARES_SURFACE);
const aresDust = splitChunk(ARES_DUST);
const aresPolar = splitChunk(ARES_POLAR);

DETAIL_STYLES.ares = {
  uniforms: (p) => ({ uDustStorm: { value: p.dustIntensity ?? 0.2 } }),
  decls: /* glsl */ `uniform float uDustStorm;`,
  fns: aresSurface.fns + aresPolar.fns + aresDust.fns,
  apply: /* glsl */ `
    ${DETAIL_PREAMBLE}
    { ${aresSurface.apply} }
    { ${aresPolar.apply} }
    { ${aresDust.apply} }
    ${DETAIL_FINAL}
  `,
};

// -- Gas giant: banded cloud turbulence + vortex + limb haze ---------------------

DETAIL_STYLES.gasGiant = {
  uniforms: (p) => ({
    uGrsUV: { value: new THREE.Vector2(...(p.grsUV || [0.5, 0.38])) },
  }),
  decls: /* glsl */ `uniform vec2 uGrsUV;`,
  octaves: OCTAVES_GAS_GIANT,
  apply: /* glsl */ `
    ${DETAIL_PREAMBLE}
    float dLum = dot(dBase, vec3(0.299, 0.587, 0.114));
    float t1 = uTime * 0.00005;

    // LAYER 1 — fine cloud turbulence, modulated by the banding pattern.
    float turb = fbmN(vObjPos * 45.0 + vec3(t1, 0.0, -0.7 * t1), dOct);
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
    gDetailHeight = turb * 0.3; // cloud-top relief (0g)
    if (midAct > 0.001) {
      float turb2 = fbmN(vObjPos * 255.0 + vec3(-2.0 * t1, t1, 0.0), dOct);
      detail = mix(detail, detail * (0.88 + 0.24 * (0.5 + 0.5 * turb2)), midAct);
      detail = mix(detail, turbTint, 0.10 * abs(turb2) * midAct);
      gDetailHeight += turb2 * 0.1 * midAct;
    }
    float fineAct = 1.0 - smoothstep(800.0, 4000.0, uAltitude);
    if (fineAct > 0.001) {
      float turb3 = snoise(vObjPos * 1125.0 + vec3(3.0 * t1, 0.0, -t1));
      // color only: too fine for relief; faded before going sub-pixel
      detail *= 1.0 + 0.10 * turb3 * fineAct * dtlFreqFade(vObjPos, 1125.0);
    }

    // LAYER 2 — thin wisps stretched 4:1 along latitude lines.
    float wisp = snoise(vec3(dUv.x * 82.0, dUv.y * 330.0, 4.2 + t1 * 2.0));
    detail *= 1.0 + 0.07 * wisp * dtlFreqFade2(dUv, 330.0);
    float wisp2 = snoise(vec3(dUv.x * 450.0, dUv.y * 1800.0, 7.7 + t1));
    detail *= 1.0 + 0.05 * wisp2 * midAct * dtlFreqFade2(dUv, 1800.0);

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
        float vort = fbmN(vec3(rl * 63.0, 3.7 + t1), dOct);
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
