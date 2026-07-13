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

  // Very tight limb-only rim.
  float rim = pow(1.0 - abs(dot(viewDir, n)), 8.0);

  // Phase-1 stub: clean rim. Worker 2 adds spicule texture (fine
  // high-frequency noise over vObjPos) and prominence-scale unevenness.
  float opacity = rim * uIntensity;

  gl_FragColor = vec4(uColor, opacity);
}
