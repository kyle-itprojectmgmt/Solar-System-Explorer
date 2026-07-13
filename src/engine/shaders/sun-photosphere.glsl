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

void main() {
  #include <logdepthbuf_fragment>
  vec3 objDir = normalize(vObjPos);

  // Limb darkening — Eddington approximation, mu = cos(angle from disc
  // center as seen by the camera). I(mu)/I(1) = 1 - u(1 - mu).
  vec3 viewDir = normalize(uCamPos - vWPos);
  float mu = max(0.0, dot(normalize(vWNormal), viewDir));
  float limb = 1.0 - uLimbCoeff * (1.0 - mu);

  // Phase-1 stub: flat 5,778 K photosphere. Worker 1 replaces this block
  // with granulation (worley2 cells, bright rising centers / dark sinking
  // lanes), supergranulation, and residual differential rotation.
  vec3 col = vec3(1.0, 0.93, 0.78);

  // Sunspot darkening — contract with sun-spots.glsl (Worker 3).
  col = sse_spotShade(objDir, col);

  gl_FragColor = vec4(col * limb * 1.6, 1.0);
}
