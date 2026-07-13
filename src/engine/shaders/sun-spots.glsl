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
  // Accumulate umbra and penumbra across all active spots.
  float ss_U = 0.0;  // umbra darkening (max across spots)
  float ss_P = 0.0;  // penumbra darkening (max across spots)

  for (int i = 0; i < 12; i++) {
    if (i >= uSpotCount) break;

    // Spot center direction (HOUSE lat/lon convention).
    float ss_lat = uSpotPos[i].x;
    float ss_lon = uSpotPos[i].y;
    vec3 ss_ctr = vec3(cos(ss_lat) * cos(ss_lon), sin(ss_lat), -cos(ss_lat) * sin(ss_lon));

    // Angular distance on the sphere.
    float ss_ang = acos(clamp(dot(objDir, ss_ctr), -1.0, 1.0));

    // Skip cheaply when far.
    if (ss_ang > uSpotRad[i] * 1.3) continue;

    // Umbra (dark core): full inside 0.35·R, gone by 0.5·R.
    float ss_umbra = 1.0 - smoothstep(uSpotRad[i] * 0.35, uSpotRad[i] * 0.5, ss_ang);

    // Penumbra (annulus): rises from the umbra edge, gone at R.
    float ss_pen = (1.0 - smoothstep(uSpotRad[i] * 0.8, uSpotRad[i], ss_ang)) * (1.0 - ss_umbra);

    // Penumbra radial filaments: azimuth around the spot. Guard the
    // tangential projection at the exact spot center (review finding:
    // normalize(≈0) is NaN and 0 * NaN still propagates).
    vec3 ss_t1 = normalize(cross(vec3(0.0, 1.0, 0.0), ss_ctr));
    vec3 ss_t2 = cross(ss_ctr, ss_t1);
    vec3 ss_offRaw = objDir - ss_ctr * dot(objDir, ss_ctr);
    float ss_offLen = length(ss_offRaw);
    vec3 ss_off = ss_offLen > 1e-5 ? ss_offRaw / ss_offLen : ss_t1;
    float ss_az = atan(dot(ss_off, ss_t2), dot(ss_off, ss_t1));
    float ss_fil = 0.75 + 0.25 * sin(ss_az * 14.0 + fbm3(objDir * 30.0) * 3.0);

    // Age fade (spots grow and decay).
    float ss_fade = smoothstep(0.0, 0.15, uSpotAge[i]) * (1.0 - smoothstep(0.75, 1.0, uSpotAge[i]));

    // Accumulate across spots (max, not sum).
    ss_U = max(ss_U, ss_umbra * ss_fade);
    ss_P = max(ss_P, ss_pen * ss_fil * ss_fade);
  }

  // Final color composition.
  vec3 ss_umbraCol = vec3(0.25, 0.08, 0.02);   // ~3,700 K
  vec3 ss_penCol   = vec3(0.65, 0.35, 0.10);   // ~4,500 K
  vec3 col = mix(baseColor, ss_penCol, clamp(ss_P, 0.0, 1.0) * 0.45);
  col = mix(col, ss_umbraCol, clamp(ss_U, 0.0, 1.0) * 0.85);
  return col;
}
