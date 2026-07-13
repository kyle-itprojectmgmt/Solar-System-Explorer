// Solar corona — the Sun's outer atmosphere (V9, Worker 2).
// Million-degree plasma halo: brightest just off the limb, streamers along
// the equatorial belt, polar plumes at solar minimum.
//
// RENDER SETUP (renderer.js — do not change here): BackSide sphere at
// 8x photosphere radius, transparent, ADDITIVE blending, depthWrite off.
// The renderer prepends simplex.glsl to the FRAGMENT stage (fbm3 etc.).
// BackSide + depth test means the photosphere disc occludes the far shell
// — the corona correctly appears only OUTSIDE the disc silhouette.
//
// GEOMETRY — CRITICAL: every fragment of this shell sits at r = 8R, so
// length(vWPos) is CONSTANT and useless for radial falloff. The correct
// "distance from the sun" for a glow shell is the view ray's IMPACT
// PARAMETER b: the closest approach of the camera→fragment ray to the sun
// center (origin). b varies smoothly across the shell — b ≈ R at the limb,
// growing outward. All falloff, streamer, and plume terms must be
// functions of b and of the closest-approach DIRECTION, not of vWPos.
//
// UNIFORM CONTRACT (frozen): uTime (wrapped 1e6 — integer cycles only),
// uDays (unwrapped sim days), uActivity (0..1), uCamPos (world),
// uSurfaceR (photosphere radius, world units), uBaseOpacity,
// uActivityScale (config knobs from sun.js corona block).

// === VERTEX ===
#include <common>
#include <logdepthbuf_pars_vertex>
varying vec3 vWPos;

void main() {
  vWPos = (modelMatrix * vec4(position, 1.0)).xyz;
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
uniform float uSurfaceR;
uniform float uBaseOpacity;
uniform float uActivityScale;
varying vec3 vWPos;

void main() {
  #include <logdepthbuf_fragment>
  // Impact parameter of the view ray vs the sun center at the origin.
  vec3 rayDir = normalize(vWPos - uCamPos);
  float tCa = -dot(uCamPos, rayDir);          // distance to closest approach
  vec3 pCa = uCamPos + rayDir * max(tCa, 0.0); // closest-approach point
  float b = length(pCa) / uSurfaceR;           // 1.0 = grazing the limb

  // Phase-1 stub: smooth 1/b² glow off the limb. Worker 2 replaces from
  // here down: streamer structure (noise over the closest-approach
  // direction pCa/|pCa|), equatorial brightening, polar plumes at low
  // uActivity, white-inner → warm-outer color ramp.
  float fall = clamp(1.0 / (b * b), 0.0, 1.0) * smoothstep(0.98, 1.05, b);
  float activityBoost = 0.5 + uActivity * uActivityScale;
  vec3 col = mix(vec3(1.0, 0.95, 0.75), vec3(1.0), fall);
  float opacity = fall * activityBoost * uBaseOpacity;

  gl_FragColor = vec4(col, clamp(opacity, 0.0, 0.6));
}
