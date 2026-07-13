// Miranda procedural surface detail — the solar system's patchwork moon:
// three angular coronae inset in ancient cratered terrain, plus Verona Rupes
// (a 20 km cliff). Untextured detail chunk (flat config color base).
// Injected into the 'miranda' detail style. Extra uniforms: uSunObj, uCamObj,
// uDayFade0, uDayFade1, uGrazeFade0, uGrazeFade1.

// Degree constants converted once.
const float mi_deg2rad = 0.017453292519943;

// Convert lat/lon (degrees, east-positive) to unit sphere position.
vec3 mi_latLonToUnit(float latDeg, float lonDeg) {
  float latRad = latDeg * mi_deg2rad;
  float lonRad = lonDeg * mi_deg2rad;
  float coLat = cos(latRad);
  return vec3(coLat * cos(lonRad), sin(latRad), coLat * sin(lonRad));
}

// === APPLY ===

// Capture baseline for night fade.
float mi_h0 = gDetailHeight;
vec3 mi_c0 = detail;

// Day and graze fades for night-side suppression.
float mi_sunDot = dot(vObjPos, uSunObj);
float mi_dayFade = sse_dayFade(mi_sunDot, uDayFade0, uDayFade1);
float mi_grazeFade = sse_grazeFade(mi_sunDot, uGrazeFade0, uGrazeFade1);

// Grazing boost: taller sub-pixel bumps under low sun elevation.
// Multiply gDetailHeight up to 1.5x when sunDot in 0.0..0.25.
float mi_grazeMult = mix(1.5, 1.0, smoothstep(0.0, 0.25, mi_sunDot));

// Pre-compute corona anchor vectors (one-time conversion).
vec3 mi_inverness = mi_latLonToUnit(-66.0, 0.0);      // (-66, 0)
vec3 mi_arden = mi_latLonToUnit(-29.0, -70.0);        // (-29, -70)
vec3 mi_elsinore = mi_latLonToUnit(-18.0, 145.0);     // (-18, 145)

// Pre-compute Verona Rupes anchor and scarp side vector.
// Verona Rupes at (-18.3, -12.2 east-positive).
vec3 mi_scarpAnchor = mi_latLonToUnit(-18.3, -12.2);
// Perpendicular to scarp direction (roughly SW-NE oriented at that latitude).
// Scarp side vector: perpendicular in the local plane, pointing along the cliff edge.
// Use a vector perpendicular to the tangent at the anchor — construct via cross product.
vec3 mi_scarpTangent = normalize(cross(vec3(0.0, 1.0, 0.0), mi_scarpAnchor));
vec3 mi_scarpSide = normalize(cross(mi_scarpAnchor, mi_scarpTangent));

// LAYER 1 — ancient cratered base: two-tier cellular min(c,0) craters
// (hash-thinned 35%/25%), grey-brown tone variation ±10%, gDetailHeight from bowls.
{
  // Determine altitude gate.
  float mi_crAltFade = 1.0 - smoothstep(600.0, 3000.0, uAltitude);
  if (mi_crAltFade > 0.001) {
    // Two-scale crater field.
    float mi_cFade1 = dtlFreqFade2(dUv, 200.0);
    float mi_id1;
    float mi_c1 = craterProfile(dUv * 200.0 + 3.1, mi_id1);
    mi_c1 *= step(0.65, fract(mi_id1 * 7.2));  // hash-thin to ~35% of cells

    float mi_cFade2 = dtlFreqFade2(dUv, 350.0);
    float mi_id2;
    float mi_c2 = craterProfile(dUv * 350.0 + 9.3, mi_id2);
    mi_c2 *= step(0.75, fract(mi_id2 * 8.1));  // hash-thin to ~25% of cells

    // Only depression bowls, no rims.
    float mi_bowl1 = clamp(-min(mi_c1, 0.0), 0.0, 1.0);
    float mi_bowl2 = clamp(-min(mi_c2, 0.0), 0.0, 1.0);

    // Grey-brown tone variation ±10% from fbmN.
    float mi_tonVar = fbmN(vObjPos * 6.0, dOct) * 0.10;
    detail = detail * (1.0 + mi_tonVar);

    // Darkening in crater bowls (calibrated down — the first cut read as
    // pepper speckle from orbit).
    detail = mix(detail, detail * 0.96, mi_bowl1 * 0.2 * mi_crAltFade * mi_cFade1);
    detail = mix(detail, detail * 0.97, mi_bowl2 * 0.15 * mi_crAltFade * mi_cFade2);

    // Height relief: modest amplitudes, fading with grazing angle.
    gDetailHeight += min(mi_c1, 0.0) * 0.10 * mi_crAltFade * mi_cFade1 * mi_grazeFade * mi_grazeMult;
    gDetailHeight += min(mi_c2, 0.0) * 0.07 * mi_crAltFade * mi_cFade2 * mi_grazeFade * mi_grazeMult;
  }
}

// LAYER 2 — three CORONAE: angular distance to anchor, sharp edge, concentric
// ridge-and-groove banding, suppress craters to 15%, regional color tints.
{
  // (orchestrator fixes: the first cut used REVERSED smoothstep edges —
  // GLSL UB — and multiplied gDetailHeight by 0.15 AFTER adding grooves,
  // deleting the coronae's own ridge relief. Crater suppression now runs
  // BEFORE the grooves are added.)

  // INVERNESS CORONA: anchor (-66, 0), radius ~0.55 rad
  {
    float mi_dI = acos(clamp(dot(vObjPos, mi_inverness), -1.0, 1.0));
    float mi_insideI = 1.0 - smoothstep(0.49, 0.61, mi_dI);  // sharp edge, width ~0.06

    if (mi_insideI > 0.001) {
      // Suppress the LAYER 1 craters to 15% FIRST — coronae are young.
      gDetailHeight = mi_h0 + (gDetailHeight - mi_h0) * mix(1.0, 0.15, mi_insideI);

      // Concentric ridge-and-groove banding. Calibrated by screenshot:
      // 0.20 height saturated the derivative shading into zebra rings —
      // 0.06 with fbm amplitude variation reads as terrain.
      float mi_warpI = fbmN(vObjPos * 3.0, dOct);
      float mi_groovesI = sin(mi_dI * 55.0 + mi_warpI * 3.0) * (0.6 + 0.4 * mi_warpI);
      gDetailHeight += mi_groovesI * 0.025 * mi_insideI;

      // Darken grooves / brighten ridges — gentle.
      detail = mix(detail, detail * (1.0 + mi_groovesI * 0.12), mi_insideI * 0.5);

      // Tint: Inverness darker chevron grey.
      detail = mix(detail, vec3(0.29, 0.27, 0.25), mi_insideI * 0.15);
    }
  }

  // ARDEN CORONA: anchor (-29, -70), radius ~0.5 rad
  {
    float mi_dA = acos(clamp(dot(vObjPos, mi_arden), -1.0, 1.0));
    float mi_insideA = 1.0 - smoothstep(0.44, 0.56, mi_dA);

    if (mi_insideA > 0.001) {
      gDetailHeight = mi_h0 + (gDetailHeight - mi_h0) * mix(1.0, 0.15, mi_insideA);

      float mi_warpA = fbmN(vObjPos * 3.0 + vec3(4.2), dOct);
      float mi_groovesA = sin(mi_dA * 55.0 + mi_warpA * 3.0) * (0.6 + 0.4 * mi_warpA);
      gDetailHeight += mi_groovesA * 0.025 * mi_insideA;

      detail = mix(detail, detail * (1.0 + mi_groovesA * 0.12), mi_insideA * 0.5);
      detail = mix(detail, vec3(0.35, 0.31, 0.27), mi_insideA * 0.15);
    }
  }

  // ELSINORE CORONA: anchor (-18, 145), radius ~0.45 rad
  {
    float mi_dE = acos(clamp(dot(vObjPos, mi_elsinore), -1.0, 1.0));
    float mi_insideE = 1.0 - smoothstep(0.39, 0.51, mi_dE);

    if (mi_insideE > 0.001) {
      gDetailHeight = mi_h0 + (gDetailHeight - mi_h0) * mix(1.0, 0.15, mi_insideE);

      float mi_warpE = fbmN(vObjPos * 3.0 + vec3(9.7), dOct);
      float mi_groovesE = sin(mi_dE * 55.0 + mi_warpE * 3.0) * (0.6 + 0.4 * mi_warpE);
      gDetailHeight += mi_groovesE * 0.025 * mi_insideE;

      detail = mix(detail, detail * (1.0 + mi_groovesE * 0.12), mi_insideE * 0.5);
      detail = mix(detail, vec3(0.33, 0.33, 0.33), mi_insideE * 0.15);
    }
  }
}

// LAYER 3 — VERONA RUPES: one-sided cliff at (-18.3, -12.2).
// Gate below 800 km.
{
  // (orchestrator fix: reversed smoothstep edges are GLSL UB)
  float mi_scarAltGate = 1.0 - smoothstep(0.0, 800.0, uAltitude);
  if (mi_scarAltGate > 0.001) {
    // Angular distance to the scarp anchor.
    float mi_dV = acos(clamp(dot(vObjPos, mi_scarpAnchor), -1.0, 1.0));

    // One-sided cliff: distance to a perpendicular line (the scarp runs along mi_scarpSide).
    // Test which side of the scarp we're on via dot product.
    float mi_sideTest = dot(vObjPos, mi_scarpSide);

    // Bright exposed cliff face on one side only.
    float mi_scarMask = smoothstep(0.10, 0.02, mi_dV) * smoothstep(-0.02, 0.03, mi_sideTest);

    vec3 mi_scarColor = vec3(0.75, 0.78, 0.82);  // 0xc0c8d0 bright exposed face
    detail = mix(detail, mi_scarColor, mi_scarMask * mi_scarAltGate * mi_dayFade);

    // Strong one-sided gDetailHeight step (amplitude ~3x craters).
    gDetailHeight += mi_scarMask * 0.30 * mi_scarAltGate * mi_grazeFade * mi_grazeMult;
  }
}

// LAYER 4 — nitrogen frost brightening on upper latitudes facing the sun pole.
// +6% brightness.
{
  // Upper latitudes: vObjPos.y > 0.5 (~30 degrees north and up).
  float mi_northLat = smoothstep(0.30, 0.80, vObjPos.y);

  // Facing the sun pole direction: align with positive sun y-component.
  float mi_sunPoleAlign = clamp(vObjPos.y * sign(uSunObj.y), 0.0, 1.0);
  mi_sunPoleAlign = smoothstep(0.3, 0.9, mi_sunPoleAlign);

  float mi_frostMask = mi_northLat * mi_sunPoleAlign;
  detail = detail * (1.0 + 0.06 * mi_frostMask * mi_dayFade);
}

// Night fade: all relief and color deltas vanish through the terminator.
gDetailHeight = mi_h0 + (gDetailHeight - mi_h0) * mi_dayFade;
detail = mix(mi_c0, detail, mi_dayFade);
