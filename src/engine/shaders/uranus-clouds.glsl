// Uranus procedural clouds — pale cyan-green haze with subtle zonal banding,
// polar hood brightening, limb methane darkening, rare storm speck, and dawn/dusk
// limb effects. The planet is nearly featureless — restraint is the realism.
// Activation: uDetailBlend gates on altitude.
// Injected into the 'ouranos' detail style; the style provides the preamble
// (dBase/detail) and final mix. Extra uniforms: uSunObj, uCamObj, uDayFade0, uDayFade1,
// uGrazeFade0, uGrazeFade1.

// Degree constants converted once.
const float ur_deg2rad = 0.017453292519943;
const float ur_rad2deg = 57.295779513082321;

// Convert lat/lon (degrees) to unit sphere position (east-positive).
vec3 ur_latLonToUnit(float latDeg, float lonDeg) {
  float latRad = latDeg * ur_deg2rad;
  float lonRad = lonDeg * ur_deg2rad;
  float coLat = cos(latRad);
  return vec3(coLat * cos(lonRad), sin(latRad), coLat * sin(lonRad));
}

// === APPLY ===

// Capture baseline for night fade.
float ur_h0 = gDetailHeight;
vec3 ur_c0 = detail;

// Day and graze fades for night-side suppression.
float ur_sunDot = dot(vObjPos, uSunObj);
float ur_dayFade = sse_dayFade(ur_sunDot, uDayFade0, uDayFade1);
float ur_grazeFade = sse_grazeFade(ur_sunDot, uGrazeFade0, uGrazeFade1);

// LAYER 1 — base tint discipline: nudge detail toward pale cyan-green.
// The 2K texture is low-res; this keeps color consistent as procedural layers come in.
{
  vec3 ur_targetTint = vec3(0.55, 0.80, 0.81);  // pale cyan-green
  detail = mix(detail, ur_targetTint, 0.25);
}

// LAYER 2 — extremely subtle zonal banding: fbmN at lat-stretched frequency,
// drifting very slowly (uTime * 3e-6), amplitude ±4% brightness.
// Bands run along LATITUDE (constant vObjPos.y) — with the near-polar sun
// they appear face-on like a bullseye.
{
  // Latitude-stretched noise: y-coordinate amplified by 6.0 to compress bands
  vec3 ur_bandPos = vObjPos;
  ur_bandPos.y *= 6.0;
  ur_bandPos = ur_bandPos + vec3(uTime * 3e-6, 0.0, 0.0);

  float ur_bandNoise = fbmN(ur_bandPos, dOct);
  float ur_bandAmp = ur_bandNoise * 0.04;  // ±4%

  detail = detail * (1.0 + ur_bandAmp * ur_dayFade);
}

// LAYER 3 — polar hood: sunlit pole carries brighter, warmer haze.
// Use the SUN's pole (uSunObj), not a hardcoded one.
{
  // Polar alignment: clamp to [0,1] so the pole on the sun's side brightens.
  float ur_poleAlign = clamp(normalize(vObjPos).y * sign(uSunObj.y), 0.0, 1.0);

  // Brighten by up to 6% * smoothstep with cream tint.
  float ur_hoodPower = smoothstep(0.55, 0.9, ur_poleAlign);
  vec3 ur_creamTint = vec3(0.95, 0.92, 0.85);  // cream

  detail = mix(detail, ur_creamTint, ur_hoodPower * 0.06 * ur_dayFade);

  // Height from hood: subtle relief.
  gDetailHeight += ur_hoodPower * 0.03 * ur_dayFade;
}

// LAYER 4 — methane limb deepening: at grazing view angles darken slightly.
// Gate below 60,000 km.
{
  // (orchestrator fix: reversed smoothstep edges are GLSL UB)
  float ur_cameraAltGate = 1.0 - smoothstep(0.0, 60000.0, uAltitude);
  if (ur_cameraAltGate > 0.001) {
    // Grazing factor: 1.0 at face-on, 0.0 at limb.
    float ur_limb = 1.0 - abs(dot(normalize(vObjPos), normalize(uCamObj)));

    // Darken toward darker cyan-blue at grazing angles.
    vec3 ur_limbDark = vec3(0.35, 0.62, 0.66);
    float ur_limbDarken = ur_limb * 0.12;  // cap at 12%

    detail = mix(detail, ur_limbDark, ur_limbDarken * ur_cameraAltGate);
  }
}

// LAYER 5 — rare bright storm speck: ONE small white cloud patch anchored
// by a slow cellular hash (uTime * 1e-6), mid-northern latitudes.
// Gate below 30,000 km.
{
  // (orchestrator rewrite: the first cut derived the storm center from
  // vObjPos, so every FRAGMENT computed its own center — the v5 hurricane
  // per-pixel-anchor bug. The center must be a function of TIME ONLY.)
  float ur_stormAltGate = 1.0 - smoothstep(0.0, 30000.0, uAltitude);
  if (ur_stormAltGate > 0.001) {
    // One storm epoch every ~23 sim-days; each epoch hashes its own anchor.
    float ur_stormTime = uTime * 5.0e-7;
    float ur_epoch = floor(ur_stormTime);
    float ur_phase = fract(ur_stormTime);
    float ur_hashA = fract(sin(ur_epoch * 12.9898) * 43758.5453);
    float ur_hashB = fract(sin(ur_epoch * 78.2330) * 43758.5453);

    // Storm exists for the middle of each epoch — fades in and out.
    float ur_stormAppear = smoothstep(0.10, 0.30, ur_phase)
                         * (1.0 - smoothstep(0.70, 0.90, ur_phase));
    if (ur_stormAppear > 0.001) {
      // Anchor: mid-northern latitudes (15..45 deg N), hashed longitude
      // with a slow prograde drift within the epoch.
      float ur_stormLatDeg = 15.0 + 30.0 * ur_hashA;
      float ur_stormLonDeg = -180.0 + 360.0 * fract(ur_hashB + ur_phase * 0.15);
      vec3 ur_stormCenter = ur_latLonToUnit(ur_stormLatDeg, ur_stormLonDeg);
      float ur_stormDist = acos(clamp(dot(vObjPos, ur_stormCenter), -1.0, 1.0));

      // Small bright methane cloud, ~5 deg across, softly textured.
      float ur_stormPatch = 1.0 - smoothstep(0.05, 0.12, ur_stormDist);
      float ur_stormTex = 0.8 + 0.2 * snoise(vObjPos * 40.0 + vec3(uTime * 2e-5));
      detail = mix(detail, vec3(1.0), ur_stormPatch * ur_stormTex * 0.08
        * ur_stormAppear * ur_stormAltGate * ur_dayFade);
      gDetailHeight += ur_stormPatch * 0.02 * ur_stormAppear * ur_stormAltGate * ur_dayFade;
    }
  }
}

// gDetailHeight stays near zero (±0.05 max from LAYER 2) — a haze ball has no cloud relief.
// Cap relief from all sources.
gDetailHeight = clamp(gDetailHeight - ur_h0, -0.05, 0.05) + ur_h0;

// Night fade: all relief and color deltas vanish through the terminator.
gDetailHeight = ur_h0 + (gDetailHeight - ur_h0) * ur_dayFade;
detail = mix(ur_c0, detail, ur_dayFade);
