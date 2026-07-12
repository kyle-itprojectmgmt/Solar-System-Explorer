// Mars procedural surface detail — dichotomy, Olympus Mons, Valles Marineris, dust.
// Activation: uDetailBlend gates on altitude (0 above 20,000 km).
// Injected into the 'ares' detail style; the style provides the preamble
// (dBase/detail) and final mix. Extra uniforms: uSunObj.

// Olympus Mons center: lat 18.65N, lon 226.2E = -133.8 east-convention.
// Precomputed numerically — (cos la cos lo, sin la, -cos la sin lo); GLSL ES
// const initializers can't call builtins, and the original double-converted
// degrees. Orchestrator-verified against the body-frame convention.
const vec3 ms_olympusDir = vec3(-0.6558, 0.3198, 0.6839);

// Valles Marineris spine: lat roughly -12 + 4*sin(meander), lon from 265E to 330E.
// Returns the depth (negative height) from the canyon axis (0 = on axis, 1 = far away).
float ms_vallesMarin(vec3 p, out float depth) {
  // Extract latitude and longitude from vObjPos.
  float lat = asin(p.y);
  float lon = atan(-p.z, p.x);

  // Meander the center latitude with longitude.
  float latCenter = -12.0 * 3.14159 / 180.0 + 4.0 * 3.14159 / 180.0 * sin((lon + 1.1) * 1.5);

  // Canyon spans 265E..330E = -95..-30 in atan2's -180..180 range (the
  // original tested against 265..330, which atan2 can never produce —
  // the canyon never rendered).
  float lonDeg = lon * 180.0 / 3.14159;
  float inLonRange = smoothstep(-105.0, -95.0, lonDeg) * (1.0 - smoothstep(-30.0, -20.0, lonDeg));

  // Distance from center latitude, width ~0.035 rad.
  float latDist = abs(lat - latCenter);
  float canyonMask = (1.0 - smoothstep(0.035, 0.055, latDist)) * inLonRange;

  // Depth modulation: fbm-warped floor, stronger at center.
  float floorNoise = fbmN(p * 50.0, dOct) * 0.4;
  depth = -0.3 * (1.0 - smoothstep(0.0, 0.035, latDist)) * (1.0 + floorNoise);

  return canyonMask;
}

// === APPLY ===

float ms_polar = smoothstep(0.94, 0.88, abs(vObjPos.y)); // fade above ±70°

// Mars dichotomy: darker in the south (volcanic/highland), lighter in the north (dusty).
float ms_lum = dot(dBase, vec3(0.299, 0.587, 0.114));
float ms_southWeight = smoothstep(0.1, -0.1, vObjPos.y); // stronger in southern hemisphere
float ms_isHighland = smoothstep(0.35, 0.50, mix(ms_lum, 0.3, ms_southWeight));

// HIGHLANDS: ancient cratered terrain with wind ripples
{
  if (ms_isHighland > 0.001) {
    // Craters at 2-3 scales, finest gated below 3,000 km
    float crt = 0.0;
    float crtAltFade = 1.0 - smoothstep(0.0, 3000.0, uAltitude);

    // Coarse craters: always visible
    {
      vec2 p = vObjPos.xz * 15.0;
      float cellId;
      float crater = craterProfile(p, cellId);
      crt = max(crt, crater * 0.6); // softened rims (eroded)
    }

    // Medium craters: visible down to 8 km
    {
      float medAlt = 1.0 - smoothstep(0.0, 8000.0, uAltitude);
      if (medAlt > 0.001) {
        vec2 p = vObjPos.xz * 35.0;
        float cellId;
        float crater = craterProfile(p, cellId);
        crt = max(crt, crater * 0.45 * medAlt);
      }
    }

    // Fine craters: visible only below 3 km, faded by freq
    if (crtAltFade > 0.001) {
      vec2 p = vObjPos.xz * 80.0;
      float cellId;
      float crater = craterProfile(p, cellId);
      crt = max(crt, crater * 0.35 * crtAltFade * dtlFreqFade(vObjPos, 80.0));
    }

    // Wind ripples: elongated noise x4 along longitude (east-west).
    float wind = fbmN(vObjPos * vec3(60.0, 14.0, 60.0), dOct) * 0.15;
    wind *= ms_polar; // fade out at poles

    // Highland palette: rust to ochre
    vec3 darkRust = vec3(0.545, 0.145, 0.0);
    vec3 lightOchre = vec3(0.784, 0.471, 0.235);
    vec3 hlPal = mix(darkRust, lightOchre, ms_lum);

    detail = mix(detail, hlPal, (crt * 0.25 + wind * 0.15) * ms_isHighland * ms_polar);
    gDetailHeight += crt * 0.15 * ms_isHighland * ms_polar;
  }
}

// LOWLANDS: smooth northern plains with sparse small craters, east-west streaks
{
  if (ms_isHighland < 0.999) {
    float lowlandMask = 1.0 - ms_isHighland;

    // Sparse small craters: thinned by hash threshold
    {
      vec2 p = vObjPos.xz * 25.0;
      float cellId;
      float crater = craterProfile(p, cellId);
      float sparseMask = fract(cellId * 12.345) > 0.6 ? 1.0 : 0.0; // gate by hash
      crater *= sparseMask;
      gDetailHeight += crater * 0.08 * lowlandMask * ms_polar;
    }

    // East-west wind streaks: very elongated (x8), faint
    float streaks = fbmN(vObjPos * vec3(40.0, 8.0, 40.0), dOct) * 0.08;
    streaks *= ms_polar;

    // Subtle lowland tint shift
    detail = mix(detail, detail * vec3(1.05, 1.0, 0.98), streaks * lowlandMask * 0.1);
  }
}

// OLYMPUS MONS: lat 18.65N, lon 226.2E, active below 8,000 km
{
  float olympusAltFade = 1.0 - smoothstep(0.0, 8000.0, uAltitude);
  if (olympusAltFade > 0.001) {
    float d = acos(clamp(dot(vObjPos, ms_olympusDir), -1.0, 1.0));

    // Caldera depression within d < 0.012
    if (d < 0.012) {
      gDetailHeight += -0.2 * (1.0 - smoothstep(0.0, 0.012, d)) * olympusAltFade;
      detail = mix(detail, detail * 0.85, 0.3 * olympusAltFade);
    }

    // Scarp ring near d ≈ 0.16: a true annulus (the original's two-smoothstep
    // product degenerated into a filled disc) — Olympus's 8 km basal cliff.
    float scarp = smoothstep(0.13, 0.155, d) * (1.0 - smoothstep(0.165, 0.19, d));
    if (scarp > 0.001) {
      vec3 lavaRidge = ms_olympusDir;
      vec3 e1 = normalize(cross(vec3(0.0, 1.0, 0.0), lavaRidge));
      vec3 e2 = cross(lavaRidge, e1);
      float radialNoise = snoise(vec3(dot(vObjPos - lavaRidge, e1), dot(vObjPos - lavaRidge, e2), 7.3)) * 0.4;
      float ridgeLine = ridged(vObjPos * 30.0) * 0.7;
      gDetailHeight += (ridgeLine + radialNoise) * 0.25 * scarp * olympusAltFade;
      detail = mix(detail, detail * 1.1, scarp * 0.2 * olympusAltFade);
    }

    // Radial lava-flow texture: noise elongated from center
    if (d < 0.18) {
      vec3 lavaCenter = ms_olympusDir;
      vec3 e1 = normalize(cross(vec3(0.0, 1.0, 0.0), lavaCenter));
      vec3 e2 = cross(lavaCenter, e1);
      vec2 lavaUv = vec2(dot(vObjPos - lavaCenter, e1), dot(vObjPos - lavaCenter, e2)) * 20.0;
      lavaUv.x *= 3.0; // radial stretch
      float lavaFlow = fbmN(vec3(lavaUv, d * 50.0), dOct) * 0.4;
      float lavaFade = 1.0 - smoothstep(0.0, 0.18, d);
      vec3 lavaTint = vec3(0.50, 0.30, 0.15) * lavaFlow;
      detail = mix(detail, detail + lavaTint, lavaFade * 0.15 * olympusAltFade);
    }
  }
}

// VALLES MARINERIS: elongated canyon, active below 12,000 km
{
  float vmAltFade = 1.0 - smoothstep(0.0, 12000.0, uAltitude);
  if (vmAltFade > 0.001) {
    float vmDepth;
    float vmMask = ms_vallesMarin(vObjPos, vmDepth);

    if (vmMask > 0.001) {
      gDetailHeight += vmDepth * vmAltFade;

      // Wall strata: banded noise along depth gradient
      float strataFreq = snoise(vObjPos * 100.0 + vec3(vmDepth * 5.0)) * 0.5 + 0.5;
      float strataPattern = step(0.4, fract(strataFreq * 3.0)); // sharp bands

      // Canyon floor slightly lighter (dust-filled)
      float floorLight = smoothstep(-0.3, -0.05, vmDepth);
      vec3 canyonFloor = mix(detail * 1.1, detail * 0.9, floorLight);

      detail = mix(detail, mix(canyonFloor, detail * vec3(0.7, 0.5, 0.4), strataPattern), vmMask * vmAltFade * 0.3);
    }
  }
}

// GLOBAL: fine dust-grain speckle below 2,000 km (edge-erosion style, not additive)
{
  float speckleAltFade = 1.0 - smoothstep(0.0, 2000.0, uAltitude);
  if (speckleAltFade > 0.001) {
    vec3 speckleSeed = vObjPos * 200.0 + snoise(vObjPos * 50.0) * 2.0;
    float speckle = (snoise(speckleSeed) * 0.5 + 0.5);
    // freq fade takes the UNSCALED position + the layer frequency.
    speckle *= dtlFreqFade(vObjPos, 200.0);

    // Edge erosion: only eat where coverage would be mid-range
    float edgeMask = clamp(1.0 - abs(speckle - 0.5) * 3.0, 0.0, 1.0);
    speckle = clamp(speckle - speckle * edgeMask * speckleAltFade * 0.08, 0.0, 1.0);
    detail = mix(detail, detail * vec3(0.95, 0.94, 0.92), speckle * speckleAltFade * 0.05);
  }
}

// EQUATORIAL HAZE: subtle low-altitude tint shift below 3,000 km
{
  float hazeFade = smoothstep(3000.0, 500.0, uAltitude);
  if (hazeFade > 0.001) {
    vec3 hazeTint = vec3(0.75, 0.55, 0.40);
    detail = mix(detail, hazeTint, hazeFade * 0.06 * smoothstep(-0.3, 0.3, vObjPos.y));
  }
}

// Apply polar fade to all layers
detail = mix(dBase, detail, ms_polar);

// Mars surface: no city lights or emissive effects on the night side.
// gDetailEmissive stays at vec3(0.0) — relief shading works automatically.
