// Sunspots — umbra/penumbra darkening for the photosphere (V9, Worker 3).
//
// This file is a GLSL LIBRARY, not a standalone shader: the renderer
// prepends it (after simplex.glsl) to the sun-photosphere FRAGMENT stage.
// No VERTEX/FRAGMENT markers, no main(), no varyings.
//
// UNIFORM CONTRACT (frozen — renderer.js owns the CPU-side spot lifecycle
// and writes these per frame; spots drift with differential rotation and
// age over sim-days on the JS side):
//   uSpotPos[12]  (lat, lon) in RADIANS, object frame — already drifted.
//   uSpotRad[12]  angular radius in radians (~0.02..0.08).
//   uSpotAge[12]  0..1 normalized age — fade spots in and out smoothly.
//   uSpotCount    active spot count (0..12).
//
// API CONTRACT (frozen — called by sun-photosphere.glsl):
//   vec3 sse_spotShade(vec3 objDir, vec3 baseColor)
//     objDir is the unit object-space surface direction. Returns baseColor
//     darkened/tinted by any overlapping spots. Umbra ~0.85 dark
//     (vec3(0.25,0.08,0.02) tint), penumbra ~0.45 dark with radial
//     filaments (vec3(0.65,0.35,0.10) tint).
//
// Spot placement note (Worker 3): compare ANGULAR distance on the sphere
// (acos of dot products or great-circle approximation), never raw UV
// deltas — UV distance stretches with latitude.

uniform vec2  uSpotPos[12];
uniform float uSpotRad[12];
uniform float uSpotAge[12];
uniform int   uSpotCount;

vec3 sse_spotShade(vec3 objDir, vec3 baseColor) {
  // Phase-1 stub: no spots. Worker 3 implements umbra core, penumbra with
  // radial filaments, and age fade, looping i < uSpotCount.
  return baseColor;
}
