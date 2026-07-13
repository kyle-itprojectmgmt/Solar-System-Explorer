// Neptune procedural clouds — vivid cobalt banding with Great Dark Spot + cirrus.
// Activation: uDetailBlend gates on altitude.
// Injected into the 'poseidon' detail style; the style provides the preamble
// (dBase/detail) and final mix. Extra uniforms: uSunObj.

// === APPLY ===

// Capture baseline for night fade.
float np_h0 = gDetailHeight;
vec3 np_c0 = detail;

// Simulation time for drifting features (scaled to radians/s).
float np_t = uTime * 0.000012;

// LAYER 1 — cobalt discipline: nudge base toward deep blue.
// Neptune's visual depth comes from methane absorption in a thick atmosphere —
// the procedural detail keeps the low-res 2K texture consistent under layers.
{
  vec3 np_cobalt = vec3(0.10, 0.22, 0.62);
  detail = mix(detail, np_cobalt, 0.30);
}

// LAYER 2 — zonal banding: latitude-stretched fbm with slight drift.
// ±8% brightness modulation, slightly darker subtropical band south of equator.
{
  float np_lat = asin(clamp(vObjPos.y, -1.0, 1.0));

  // Latitude-stretched noise: compress y-axis by factor 5 to create bands.
  // Drift slowly in time (uTime * 5e-6 rad/s).
  vec3 np_bandPos = vObjPos;
  np_bandPos.y *= 5.0;  // stretch latitude axis
  np_bandPos.z += np_t * 5.0;  // rotate in longitude with drift

  float np_bandNoise = fbmN(np_bandPos, dOct) * 0.08;

  // Darker band south of equator: smoothly transition around -30 deg latitude.
  float np_darkBand = smoothstep(-0.6, -0.3, np_lat) * (1.0 - smoothstep(-0.2, 0.1, np_lat));
  np_bandNoise -= np_darkBand * 0.03;

  detail = mix(detail, detail * (1.0 + np_bandNoise), 0.6);
}

// LAYER 3 — GREAT DARK SPOT (below ~120,000 km).
// Oval storm at latitude -20 deg, drifting in longitude. Real feature observed
// by Voyager 2; here rendered from synthetic geometry. Period: ~6.5 sim-days
// (uTime * 1.2e-5 rad/s covers ~360 deg in one simulated week).
{
  float np_altGate = 1.0 - smoothstep(80000.0, 120000.0, uAltitude);
  if (np_altGate > 0.001) {
    // Latitude and longitude of the spot center.
    float np_lat = asin(clamp(vObjPos.y, -1.0, 1.0));
    float np_lon = atan(vObjPos.z, vObjPos.x);

    // Spot drifts in longitude at 1.2e-5 rad/s.
    float np_gdsLon = np_t * 1.2;  // scaled time in radians

    // Normalize longitude delta to -PI..PI.
    float np_dLon = np_lon - np_gdsLon;
    np_dLon = mod(np_dLon + 3.14159265, 6.2831853) - 3.14159265;

    // Elliptical distance: latitude 2.6x tighter (the real GDS is a tall oval).
    float np_latDelta = np_lat - (-0.349);  // -20 deg ≈ -0.349 rad
    float np_ellDist = sqrt(np_dLon * np_dLon + (np_latDelta * 2.6) * (np_latDelta * 2.6));

    // Core: soft edge, darkens toward deep purple-grey.
    float np_gdsMask = 1.0 - smoothstep(0.06, 0.16, np_ellDist);
    vec3 np_gdsDark = vec3(0.03, 0.08, 0.30);
    detail = mix(detail, np_gdsDark, np_gdsMask * 0.55 * np_altGate);

    // Companion cirrus on the POLEWARD (southern) flank — Voyager's bright
    // companion clouds hovered south of the GDS. (orchestrator fix: the
    // first cut used reversed smoothstep edges — UB — and put the rim on
    // the northern flank.)
    float np_rimMask = smoothstep(0.10, 0.14, np_ellDist) * (1.0 - smoothstep(0.18, 0.26, np_ellDist));
    float np_rimLat = 1.0 - smoothstep(-0.36, -0.30, np_lat);  // south of the spot core
    float np_rimTex = 0.6 + 0.4 * snoise(vec3(dUv * 60.0, np_t * 3.0));
    detail = mix(detail, vec3(0.95, 0.93, 0.88), np_rimMask * np_rimLat * np_rimTex * 0.40 * np_altGate);
  }
}

// LAYER 4 — white cirrus streaks ('scooter' class, below ~80,000 km).
// Fast-moving, elongated 6:1 along longitude, at mid-latitudes 30–55 deg
// (both hemispheres). Neptune's winds dominate the point — 2,100 km/h is the story.
{
  float np_altGate4 = 1.0 - smoothstep(50000.0, 80000.0, uAltitude);
  if (np_altGate4 > 0.001) {
    float np_lat4 = asin(clamp(vObjPos.y, -1.0, 1.0));
    float np_absLat = abs(np_lat4);

    // Band mask: active at |lat| 30–55 deg (0.5 to 0.82 in sin space).
    float np_bandMask = smoothstep(0.48, 0.52, np_absLat) * (1.0 - smoothstep(0.80, 0.84, np_absLat));

    if (np_bandMask > 0.001) {
      // ANISOTROPIC noise: 6:1 stretch along longitude comes from sampling
      // latitude 6x finer than longitude. (orchestrator fix: the first cut
      // used isotropic noise plus a reversed-smoothstep "elongation" gate —
      // UB and no actual streaking.) Streaks drift FASTER than the banding:
      // Neptune's 2,100 km/h winds are the story.
      float np_streakNoise = snoise(vec3(dUv.x * 8.0 + np_t * 1.7, dUv.y * 48.0, np_t * 0.4)) * 0.6
                           + snoise(vec3(dUv.x * 20.0 + np_t * 2.4, dUv.y * 110.0, np_t * 0.4 + 3.3))
                             * 0.4 * dtlFreqFade2(dUv, 110.0);
      // High threshold: sparse coverage (< ~20% of the band).
      float np_streakMask = smoothstep(0.55, 0.75, np_streakNoise);

      vec3 np_cirrus = vec3(0.88, 0.91, 0.97);
      detail = mix(detail, np_cirrus, np_streakMask * np_bandMask * 0.70 * np_altGate4);

      // Subtle height from streaks (catch light — cirrus rides above the deck).
      gDetailHeight += np_streakMask * np_bandMask * 0.2 * np_altGate4;
    }
  }
}

// LAYER 5 — methane limb deepening (haze-giant style, below ~60,000 km).
// Camera-dependent (uCamObj): darken limb edges toward deep methane blue.
{
  float np_altGate5 = 1.0 - smoothstep(30000.0, 60000.0, uAltitude);
  if (np_altGate5 > 0.001) {
    // Grazing angle: measure how far the fragment is from the camera's line of sight.
    float np_towardCam = dot(vObjPos, normalize(uCamObj));
    float np_limbMask = 1.0 - smoothstep(-0.2, 0.3, np_towardCam);  // 1 at limb edges

    // Deep methane blue, caps at 15% overall strength.
    vec3 np_limbDeep = vec3(0.05, 0.12, 0.40);
    detail = mix(detail, np_limbDeep, np_limbMask * 0.15 * np_altGate5);
  }
}

// Night fade: all relief and color vanish through the terminator.
{
  float np_sunDot = dot(vObjPos, uSunObj);
  float np_dayFade = sse_dayFade(np_sunDot, uDayFade0, uDayFade1);

  gDetailHeight = np_h0 + (gDetailHeight - np_h0) * np_dayFade;
  detail = mix(np_c0, detail, np_dayFade);
}
