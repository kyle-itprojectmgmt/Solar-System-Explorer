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

  // Radial falloff: 1/b² times limb onset
  float co_rimFall = clamp(1.0 / (b * b), 0.0, 1.0) * smoothstep(0.98, 1.05, b);

  // Sample 3D noise over the closest-approach direction
  vec3 co_dir = normalize(pCa);

  // Streamers: radial rays with equatorial elongation
  float co_a = 6.2831853 * uTime * (8.0 / 1.0e6);
  vec3 co_drift = vec3(cos(co_a), sin(co_a), 0.0) * 0.5;
  float co_streamer = fbm3(co_dir * vec3(6.0, 2.5, 6.0) + co_drift) * 0.6 + 0.4;

  // Equatorial brightening: enhance brightness toward the equator
  float co_equat = 0.5 + 0.5 * (1.0 - abs(co_dir.y));

  // Polar plumes: faint ray fans at solar minimum (high uActivity suppresses)
  float co_plumeRegion = smoothstep(0.70, 0.92, abs(co_dir.y));
  float co_a_plume = 6.2831853 * uTime * (12.0 / 1.0e6);
  vec3 co_drift_plume = vec3(cos(co_a_plume), sin(co_a_plume), 0.0) * 0.5;
  float co_plume = co_plumeRegion * (fbm3(co_dir * 9.0 + co_drift_plume) * 0.5 + 0.5) * (1.0 - uActivity) * 0.35;

  // Activity boost: brighter corona during active periods
  float co_boost = 0.5 + uActivity * uActivityScale;

  // Color ramp: white near limb, grading to warm far out
  float co_whiteBlend = 1.0 - smoothstep(1.0, 4.0, b);
  vec3 col = mix(vec3(1.0, 0.93, 0.72), vec3(1.0), co_whiteBlend);

  // Composite opacity. Plumes ride the same radial falloff as the main
  // corona (review finding: an unattenuated plume term painted a constant
  // fan out to the shell edge with a hard cut at b = 8).
  float opacity = co_rimFall
    * (co_streamer * co_equat * co_boost * uBaseOpacity + co_plume);
  opacity = clamp(opacity, 0.0, 0.65);

  gl_FragColor = vec4(col, opacity);
}
