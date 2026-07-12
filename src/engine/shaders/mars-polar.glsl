// Mars polar ice caps — seasonally breathing CO₂ and water ice.
// The north cap is predominantly water ice with seasonal CO₂ layer; the south cap
// is almost entirely CO₂ and swings dramatically with season. Both caps show the
// day/night terminator naturally (NO emissive glow). Pole-local coordinates use
// an azimuthal projection: proj = vObjPos.xz * inversesqrt(sin_lat²), numerically
// stable at the pole because we clamp the denominator minimum.

// True azimuthal-equidistant projection from the nearer pole: unit azimuth
// direction × colatitude (angular distance from the pole, radians). The
// naive p.xz * inversesqrt(1-y²) NORMALIZES onto the unit circle — radius
// becomes constant and every radial pattern collapses to angular lobes.
vec2 mp_poleProj(vec3 p) {
  vec2 az = p.xz * inversesqrt(max(1.0 - p.y * p.y, 1e-6));
  return az * acos(clamp(abs(p.y), 0.0, 1.0));
}

// Spiral troughs around the north pole: real Mars north cap shows spiral
// ridges winding out from the pole. Brightness modulation, angle + radius.
float mp_northSpiral(vec3 p, float intensity) {
  vec2 proj = mp_poleProj(p);
  float angle = atan(proj.y, proj.x);
  float radius = length(proj);           // colatitude, ~0..0.35 over the cap

  // ~3 arms winding a couple of turns across the cap, fbm-bent.
  float angleNoise = snoise(vec3(proj * 20.0, 4.2)) * 0.8;
  float spiral = sin(angle * 3.0 + radius * 45.0 + angleNoise) * 0.5 + 0.5;

  // Fade the troughs toward the cap edge.
  float radialDecay = exp(-radius * radius * 8.0);

  return mix(0.5, spiral, intensity) * radialDecay;
}

// Swiss cheese pits: worley cellular noise on the south residual cap.
// Only active in the innermost cap region (very high latitude) and only below 3000 km.
float mp_swissCheese(vec3 p) {
  vec2 proj = mp_poleProj(p);
  vec2 pits = worley2(proj * 90.0);
  float f1 = pits.x;  // distance to nearest pit center

  // Pits are dark where F1 is small; modulate between pit floors and the surface
  float pitMask = smoothstep(0.12, 0.3, f1);
  return mix(0.35, 1.0, pitMask);
}

// === APPLY ===

// Seasonal declination: uSunObj.y = sin(solar declination), live from ephemeris.
// Northern summer: uSunObj.y ≈ +0.42
// Southern summer: uSunObj.y ≈ -0.42

// Night fade (V6.0.2): caps must not glow in the dark — same per-chunk
// delta fade as the surface chunk (the dust chunk stays exempt).
float mp_dayFade = smoothstep(-0.08, 0.15, dot(vObjPos, uSunObj));
float mp_height0 = gDetailHeight;
vec3 mp_color0 = detail;

float mp_capMask = 0.0;
vec3 mp_capColor = vec3(0.94);

// LAYER 1 — north polar cap (water ice + seasonal CO₂)
{
  // Cap edge shrinks in northern summer (uSunObj.y > 0), expands in winter (uSunObj.y < 0)
  float nEdge = mix(0.90, 0.965, smoothstep(-0.45, 0.45, uSunObj.y));

  // Noise-warped edge for raggedness (±0.015 variation in sin-lat).
  float edgeShift = snoise(vObjPos * 4.0 + vec3(0.5, uTime * 0.0001, 0.0)) * 0.015;

  float northMask = smoothstep(nEdge - 0.02 + edgeShift, nEdge + 0.015 + edgeShift, vObjPos.y);

  if (northMask > 0.001) {
    // Bright white base with spiral trough modulation
    vec3 northWhite = vec3(0.94, 0.94, 0.94);
    float spiralBright = mp_northSpiral(vObjPos, 0.12);
    vec3 northWithSpiral = northWhite * mix(0.90, 1.0, spiralBright);

    mp_capMask = northMask;
    mp_capColor = northWithSpiral;
  }
}

// LAYER 2 — south polar cap (CO₂, dramatic seasonal swing)
{
  // Cap edge is LARGE in southern winter (uSunObj.y > 0 = northern summer),
  // SMALL in southern summer (uSunObj.y < 0 = northern winter).
  float sEdge = mix(0.965, 0.88, smoothstep(0.45, -0.45, uSunObj.y));

  // Noise-warped edge for raggedness.
  float edgeShift2 = snoise(vObjPos * 4.5 + vec3(1.3, uTime * 0.00009, 0.0)) * 0.015;

  float southMask = smoothstep(sEdge - 0.02 + edgeShift2, sEdge + 0.015 + edgeShift2, -vObjPos.y);

  if (southMask > 0.001) {
    vec3 southWhite = vec3(0.96, 0.96, 0.96); // slightly brighter CO₂ frost

    // Swiss-cheese texture below 3000 km: only in the residual innermost cap (sin-lat > 0.985)
    float lowAlt = 1.0 - smoothstep(1000.0, 3000.0, uAltitude);
    float residualCapInner = smoothstep(0.982, 0.995, -vObjPos.y);
    if (lowAlt > 0.001 && residualCapInner > 0.001) {
      float cheeseTexture = mp_swissCheese(vObjPos);
      float cheeseFade = dtlFreqFade(vObjPos, 90.0);
      southWhite = mix(southWhite, southWhite * cheeseTexture, cheeseFade * lowAlt * residualCapInner);
    }

    // South cap overwrites if it's more poleward than north
    if (southMask > mp_capMask) {
      mp_capMask = southMask;
      mp_capColor = southWhite;
    }
  }
}

// LAYER 3 — layered terrain: concentric bands around both cap edges
// 2-3 light/dark bands in a collar ±0.03 sin-lat outside the cap boundary
{
  float nEdge = mix(0.90, 0.965, smoothstep(-0.45, 0.45, uSunObj.y));
  float sEdge = mix(0.965, 0.88, smoothstep(0.45, -0.45, uSunObj.y));

  // North collars: bands ±0.03 below the north edge
  float northCollarMask = smoothstep(nEdge - 0.06, nEdge - 0.02, vObjPos.y)
                        * (1.0 - smoothstep(nEdge - 0.01, nEdge, vObjPos.y));
  if (northCollarMask > 0.001) {
    float bandingNorth = fbmN(vObjPos * 5.0 + vec3(0.0, 8.3, 0.0), dOct) * 0.06;
    float bandMask = mix(1.0, 1.0 + bandingNorth, 0.5);
    vec3 bandedNorth = mp_capColor * bandMask;
    mp_capColor = mix(mp_capColor, bandedNorth, northCollarMask * 0.4);
  }

  // South collar: y ∈ [-sEdge, -sEdge + 0.06] — equatorward of the cap edge.
  // (The original pair of smoothsteps multiplied to zero everywhere.)
  float southCollarMask = smoothstep(-sEdge - 0.01, -sEdge + 0.01, vObjPos.y)
                        * (1.0 - smoothstep(-sEdge + 0.04, -sEdge + 0.06, vObjPos.y));
  if (southCollarMask > 0.001) {
    float bandingSouth = fbmN(vObjPos * 5.2 + vec3(0.0, 7.1, 0.0), dOct) * 0.06;
    float bandMask2 = mix(1.0, 1.0 + bandingSouth, 0.5);
    vec3 bandedSouth = vec3(0.88, 0.88, 0.88) * bandMask2;
    mp_capColor = mix(mp_capColor, bandedSouth, southCollarMask * 0.4);
  }
}

// APPLY: blend the cap into the surface, then fade the whole chunk's
// contribution into darkness.
{
  if (mp_capMask > 0.001) {
    detail = mix(detail, mp_capColor, mp_capMask * 0.92);
    gDetailHeight += mp_capMask * 0.08;
  }
  gDetailHeight = mp_height0 + (gDetailHeight - mp_height0) * mp_dayFade;
  detail = mix(mp_color0, detail, mp_dayFade);
}
