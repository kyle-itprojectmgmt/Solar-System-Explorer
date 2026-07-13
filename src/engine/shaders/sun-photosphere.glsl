// Sun photosphere — the visible solar surface (V9, Worker 1).
// Self-luminous: no scene lighting, no uSunDirection, no dayFade — the Sun
// IS the light source. Brightness is modulated only by limb darkening,
// granulation, and sunspots.
//
// RENDER SETUP (renderer.js _buildSunPrimary — do not change here):
//   FrontSide opaque sphere, unit geometry scaled to radius; the renderer
//   prepends simplex.glsl (snoise/fbm3/worley2 available) and then
//   sun-spots.glsl (sse_spotShade available) to the FRAGMENT stage.
//
// UNIFORM CONTRACT (frozen — the renderer updates these per frame):
//   uTime      sim seconds WRAPPED at 1e6 (house rule: any periodic drift
//              must complete an integer number of cycles per 1e6 s or it
//              pops at the wrap — use the circular looping-noise trick).
//   uDays      UNWRAPPED sim days since epoch (float32-safe for decades) —
//              use for slow secular drifts like differential rotation.
//   uActivity  0..1 solar activity (VIEW panel slider).
//   uCamPos    world-space camera position.
//   uGranScale / uLimbCoeff / uSuperAmp — config knobs (sun.js photosphere).
//
// DIFFERENTIAL ROTATION (Worker 1): the mesh already rotates at the
// EQUATORIAL rate (physics.primaryRotation). Apply only the RESIDUAL
// Snodgrass drift, which is 0 at the equator by construction:
//   omegaDegPerDay(lat) = 14.713 - 2.396 sin²lat - 1.787 sin⁴lat
//   residualRad = radians(omegaDegPerDay(lat) - 14.713) * uDays
//   lon' = atan(objDir.z, objDir.x) + residualRad   (then wrap for sampling)

// === VERTEX ===
// Log-depth chunks (V7 Titan lesson): raw ShaderMaterials do not write
// logarithmic depth without these — the mesh would lose every depth test.
#include <common>
#include <logdepthbuf_pars_vertex>
varying vec3 vObjPos;
varying vec3 vWPos;
varying vec3 vWNormal;

void main() {
  vObjPos = position;   // unit sphere — object-space direction (rides rotation)
  vWPos = (modelMatrix * vec4(position, 1.0)).xyz;
  vWNormal = normalize(mat3(modelMatrix) * normal);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  #include <logdepthbuf_vertex>
}

// === FRAGMENT ===
#include <common>
#include <logdepthbuf_pars_fragment>
uniform float uTime;
uniform float uDays;
uniform float uActivity;
uniform vec3  uCamPos;
uniform float uGranScale;
uniform float uLimbCoeff;
uniform float uSuperAmp;
varying vec3 vObjPos;
varying vec3 vWPos;
varying vec3 vWNormal;

// 3D cellular (Worley F1) noise — local to this shader (the shared library
// only carries 2D worley2). Sampled directly on the sphere direction: no
// planar projection, so no pole pinch, no equatorial stripe degeneracy, no
// hemisphere mirroring (the review finding on the 2-plane worley2 blend).
vec3 ph_hash3(vec3 p) {
  p = vec3(dot(p, vec3(127.1, 311.7, 74.7)),
           dot(p, vec3(269.5, 183.3, 246.1)),
           dot(p, vec3(113.5, 271.9, 124.6)));
  return fract(sin(p) * 43758.5453123);
}
float ph_worley3(vec3 p) {
  vec3 ip = floor(p), fp = fract(p);
  float d = 8.0;
  for (int x = -1; x <= 1; x++)
  for (int y = -1; y <= 1; y++)
  for (int z = -1; z <= 1; z++) {
    vec3 g = vec3(float(x), float(y), float(z));
    vec3 r = g + ph_hash3(ip + g) - fp;
    d = min(d, dot(r, r));
  }
  return sqrt(d);
}

void main() {
  #include <logdepthbuf_fragment>
  vec3 objDir = normalize(vObjPos);

  // Limb darkening — Eddington approximation, mu = cos(angle from disc
  // center as seen by the camera). I(mu)/I(1) = 1 - u(1 - mu).
  vec3 viewDir = normalize(uCamPos - vWPos);
  float mu = max(0.0, dot(normalize(vWNormal), viewDir));
  float limb = 1.0 - uLimbCoeff * (1.0 - mu);

  // ===== GRANULATION + SUPERGRANULATION + DIFFERENTIAL ROTATION =====

  // Residual differential rotation (relative to mesh equatorial rotation)
  // Snodgrass coefficients: the mesh already rotates at 14.713 deg/day (equator),
  // so we apply only the residual drift which is 0 at equator by construction.
  float ph_lat = asin(clamp(objDir.y, -1.0, 1.0));
  float ph_s2 = sin(ph_lat) * sin(ph_lat);
  float ph_omegaResid = -(2.396 * ph_s2 + 1.787 * ph_s2 * ph_s2);  // deg/day
  float ph_lonShift = radians(ph_omegaResid) * uDays;

  // Rotate direction by residual drift around Y axis (longitude)
  float ph_c = cos(ph_lonShift);
  float ph_s = sin(ph_lonShift);
  vec3 ph_dir = vec3(objDir.x * ph_c - objDir.z * ph_s, objDir.y, objDir.x * ph_s + objDir.z * ph_c);

  // Granulation drift: closed circular path in domain (K=1667, period
  // ~600 s sim — integer cycles per the 1e6 s uTime wrap, seamless).
  float ph_timeA = 6.2831853 * uTime * (1667.0 / 1.0e6);
  vec3 ph_drift = vec3(cos(ph_timeA), sin(ph_timeA), 0.0) * 0.5;

  // Primary granules: 3D Worley F1 on the (differentially rotated) sphere
  // direction — small at rising cell centers, large at the sinking lanes.
  // Each octave fades toward its mean once it goes sub-pixel (dtlFreqFade,
  // the v4b anti-shimmer rule) — without this the whole disc reads as
  // static white confetti from orbital distance (measured in calibration).
  vec3 ph_gp = ph_dir * uGranScale;
  // freq 8/20 (not the literal layer frequencies): fades start well before
  // sub-pixel so the disc smooths toward its mean by ~2-3M km — a granulated
  // star up close, a clean luminous disc from far away.
  float ph_fade1 = dtlFreqFade(ph_gp, 8.0);
  float ph_w1 = ph_worley3(ph_gp + ph_drift);
  float ph_bright1 = mix(0.45, 1.0 - smoothstep(0.15, 0.75, ph_w1), ph_fade1);

  // Secondary finer octave (2.5x scale, same closed drift path scaled).
  float ph_fade2 = dtlFreqFade(ph_gp, 20.0);
  float ph_w2 = ph_worley3(ph_gp * 2.5 + ph_drift * 1.7);
  float ph_bright2 = mix(0.45, 1.0 - smoothstep(0.15, 0.75, ph_w2), ph_fade2);
  float ph_granBright = ph_bright1 * 0.65 + ph_bright2 * 0.35;

  // Granule colors: hot yellow-white rising centers, cool orange sinking lanes
  vec3 ph_hotCol = vec3(1.00, 0.95, 0.80);
  vec3 ph_coolCol = vec3(0.85, 0.45, 0.10);
  vec3 col = mix(ph_coolCol, ph_hotCol, ph_granBright);

  // Supergranulation: large-scale fbm3 mottling (K=12, slow drift, scale 4.0)
  float ph_timeB = 6.2831853 * uTime * (12.0 / 1.0e6);
  vec3 ph_superDrift = vec3(cos(ph_timeB), sin(ph_timeB), 0.0) * 0.3;
  float ph_super = fbm3(ph_dir * 4.0 + ph_superDrift);
  float ph_superMix = clamp((ph_super + 1.0) * 0.5, 0.0, 1.0) * uSuperAmp;
  col = mix(col, ph_hotCol, ph_superMix);

  // Activity: faint bright faculae patches (confined to |lat| < 35°, high activity)
  float ph_latGate = 1.0 - smoothstep(0.0, radians(35.0), abs(ph_lat));
  float ph_fac = fbm3(ph_dir * 8.0);
  // Threshold the BRIGHT tops of the noise field — sparse patches (the
  // review finding: 1-smoothstep(0,...) selected the dark half, ~50% cover).
  float ph_facThresh = smoothstep(0.45, 0.8, ph_fac);
  col = col + ph_facThresh * ph_latGate * 0.10 * uActivity;

  // Sunspot darkening — contract with sun-spots.glsl (Worker 3).
  col = sse_spotShade(objDir, col);

  gl_FragColor = vec4(col * limb * 1.35, 1.0);
}
