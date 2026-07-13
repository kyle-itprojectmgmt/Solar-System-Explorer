// Solar chromosphere — thin H-alpha emission layer (V9, Worker 2).
// A deep red-pink rim hugging the limb (hydrogen alpha, 656 nm), textured
// by spicules (thousands of fine plasma jets).
//
// RENDER SETUP (renderer.js — do not change here): BackSide sphere at
// 1.005x photosphere radius, transparent, ADDITIVE blending, depthWrite
// off. simplex.glsl is prepended to the FRAGMENT stage.
// BackSide + depth test: the disc occludes the far shell, so the rim only
// shows just outside the silhouette — exactly where a chromosphere lives.
//
// UNIFORM CONTRACT (frozen): uTime (wrapped 1e6 — integer cycles only),
// uDays, uActivity, uCamPos (world), uColor (H-alpha red from config),
// uIntensity (config).

// === VERTEX ===
#include <common>
#include <logdepthbuf_pars_vertex>
varying vec3 vWPos;
varying vec3 vWNormal;
varying vec3 vObjPos;

void main() {
  vObjPos = position;
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
uniform vec3  uColor;
uniform float uIntensity;
varying vec3 vWPos;
varying vec3 vWNormal;
varying vec3 vObjPos;

void main() {
  #include <logdepthbuf_fragment>
  vec3 n = normalize(vWNormal);
  vec3 viewDir = normalize(uCamPos - vWPos);

  // Very tight limb-only rim
  float rim = pow(1.0 - abs(dot(viewDir, n)), 8.0);

  // Spicule texture: fine jets from high-frequency noise over surface position
  float sp_a = 6.2831853 * uTime * (10.0 / 1.0e6);
  vec3 sp_drift = vec3(cos(sp_a), sin(sp_a), 0.0) * 0.5;
  float sp_spic = fbm3(normalize(vObjPos) * 40.0 + sp_drift) * 0.3 + 0.7;

  // Prominence-scale unevenness: larger features on the rim
  float sp_unevenness = fbm3(normalize(vObjPos) * 6.0) * 0.15 + 0.925;

  // Activity lift: chromosphere brightens during high activity
  float sp_activityLift = 0.85 + 0.3 * uActivity;

  // Opacity: rim modulated by spicules, unevenness, activity, and configured intensity
  float opacity = rim * sp_spic * sp_unevenness * sp_activityLift * uIntensity;
  opacity = clamp(opacity, 0.0, 1.0);

  gl_FragColor = vec4(uColor, opacity);
}
