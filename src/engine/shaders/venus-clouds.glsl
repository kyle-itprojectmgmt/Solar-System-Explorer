// Venus procedural clouds — super-rotation + polar vortices + subtle morphing.
// The thick CO₂ atmosphere shows only the cloud deck, faint pale yellow-white.
// Signature: the cloud deck circles Venus in ~3.9 days while the planet takes
// 243 days to rotate — a real phenomenon driven by upper-atmosphere zonal winds.
// Activation: uDetailBlend gates on altitude.
// Injected into the 'aphrodite' detail style; the style provides the preamble
// (dBase/detail) and the final mix.

// === APPLY ===

// Baseline: capture the de-tinted texture for night-side fade.
float vn_h0 = gDetailHeight;
vec3 vn_c0 = detail;

// LAYER 1 — SUPER-ROTATION: time-drifting longitude.
// The cloud deck revolves once every ~3.9 days; the simulation time scale
// (uTime in SIM seconds) wraps at 1e6. To advance exactly 3 revolutions
// per wrap without popping, use drift = fract(uTime * 3.0e-6).
{
  float vn_drift = fract(uTime * 3.0e-6);   // 3 revolutions per 1e6-s wrap
  vec2 vn_cuv = vec2(fract(dUv.x + vn_drift), dUv.y);
  vec3 vn_cloud = texture2D(map, vn_cuv).rgb;
  // De-tint the resampled texture using the same tint as dBase.
  detail = vn_cloud / max(dTint, vec3(0.001));
}

// LAYER 2 — SLOW MORPHING: two fbmN fields modulate brightness ±5% max.
// The y/latitude coordinate is stretched 3:1 to suggest chevron/streak pattern.
{
  vec3 vn_pos1 = vObjPos;
  vn_pos1.y *= 3.0;   // 3:1 stretch along latitude

  // Two noise frequencies (5 and 11), morphing by DRIFTING THE FIELD
  // through noise space (orchestrator fix: the first cut scaled the whole
  // field by sin(uTime), which periodically flattened the planet to a
  // uniform ball — amplitude must never be globally modulated).
  vec3 vn_drift2 = vec3(uTime * 2.0e-6, 0.0, uTime * 1.1e-6);
  float vn_fbm5 = fbmN(vn_pos1 * 5.0 + vn_drift2, dOct);
  float vn_fbm11 = fbmN(vn_pos1 * 11.0 - vn_drift2 * 1.7, dOct);
  float vn_morph = (vn_fbm5 * 0.6 + vn_fbm11 * 0.4) * 0.05;

  // Modulate brightness ±5% max.
  detail = detail * (1.0 + vn_morph);
}

// LAYER 3 — POLAR VORTICES: both poles, active above |lat| ~68 deg.
// Below ~40,000 km altitude (per config). Slowly-rotating dark grey-green swirl.
{
  float vn_altGate = 1.0 - smoothstep(20000.0, 40000.0, uAltitude);
  if (vn_altGate > 0.001) {
    // Latitude threshold for vortex activation: |y| > sin(68°) ≈ 0.927.
    float vn_latAbs = abs(vObjPos.y);
    float vn_vortexMask = smoothstep(0.900, 0.945, vn_latAbs);

    if (vn_vortexMask > 0.001) {
      // Polar coordinates: use polar-projected distance (not radial sphere distance).
      // atan-based: lon = atan(z, x); radial = acos(|y|) / (π/2) maps [0, π/2] -> [0, 1].
      float vn_lon = atan(vObjPos.z, vObjPos.x);
      float vn_radial = acos(clamp(abs(vObjPos.y), 0.0, 1.0)) / 1.57079632679;

      // Slowly-rotating spiral: angle = uTime*2e-5 + 2.2/(radial+0.35).
      float vn_spiralAngle = uTime * 2.0e-5 + 2.2 / (vn_radial + 0.35);
      float vn_swirlLon = vn_lon + vn_spiralAngle;

      // Construct local polar coordinates for fbm sampling.
      vec3 vn_swirlPos = vec3(
        vn_radial * cos(vn_swirlLon),
        vn_radial * sin(vn_swirlLon),
        abs(vObjPos.y)
      );

      // fbmN texture for the swirl.
      float vn_swirlNoise = fbmN(vn_swirlPos * 8.0, dOct);

      // Target color: dark grey-green (0.62, 0.64, 0.55).
      vec3 vn_vortexColor = vec3(0.62, 0.64, 0.55);

      // Fade: full strength at the pole, zero at 68-deg edge.
      // Use radial distance to fade: 0 at edge (radial~0.7 for 68 deg), 1 at pole (radial~0).
      float vn_vortexFade = 1.0 - smoothstep(0.60, 0.75, vn_radial);

      // Mix in the vortex color, max 0.35 intensity at pole.
      detail = mix(detail, vn_vortexColor * (1.0 + vn_swirlNoise * 0.2),
                   vn_vortexMask * vn_vortexFade * 0.35 * vn_altGate);
    }
  }
}

// LAYER 4 — CLOUD-TOP RELIEF: gDetailHeight modulated by LAYER 2 morphing.
// Soft relief — Venus clouds are a haze deck, not cauliflower.
{
  vec3 vn_pos2 = vObjPos;
  vn_pos2.y *= 3.0;
  float vn_relief = fbmN(vn_pos2 * 5.0, dOct) * 0.15;
  gDetailHeight += vn_relief * sse_dayFade(dot(vObjPos, uSunObj), uDayFade0, uDayFade1);
}

// LAYER 5 — NIGHT-SIDE LIGHTNING: rare flashes, below 20,000 km altitude.
// On the NIGHT side only. Whisper-subtle.
{
  float vn_sunDot = dot(vObjPos, uSunObj);
  float vn_dayFade = sse_dayFade(vn_sunDot, uDayFade0, uDayFade1);
  float vn_nightFade = 1.0 - vn_dayFade;

  float vn_altGate2 = 1.0 - smoothstep(10000.0, 20000.0, uAltitude);

  if (vn_nightFade > 0.001 && vn_altGate2 > 0.001) {
    // CELL-QUANTIZED hash (orchestrator fix: a per-pixel fract(snoise*43758)
    // phase made 2% of PIXELS sparkle as white-noise static — every
    // fragment in a storm cell must share one flash phase).
    // Calibrated by screenshot: 2% duty across a 24-cell grid lit several
    // dots at once and read as stuck pixels — rarer (0.6%), larger, softer,
    // dimmer flashes read as distant storm glow.
    vec3 vn_cell = floor(vObjPos * 14.0);
    float vn_cellHash = fract(sin(dot(vn_cell, vec3(12.9898, 78.233, 37.719))) * 43758.5453);
    float vn_flash = step(fract(uTime * 0.7 + vn_cellHash), 0.006);

    // Soft wide blob: a flash reads as diffuse glow lighting the clouds
    // from below, never a point or a square.
    vec3 vn_cellLocal = fract(vObjPos * 14.0) - 0.5;
    float vn_blob = 1.0 - smoothstep(0.05, 0.48, length(vn_cellLocal));

    gDetailEmissive += vec3(0.30, 0.33, 0.45)
      * vn_flash * vn_blob * 0.10 * vn_nightFade * vn_altGate2;
  }
}

// Fade detail height and color deltas through the terminator (night discipline).
{
  float vn_sunDot = dot(vObjPos, uSunObj);
  float vn_dayFade = sse_dayFade(vn_sunDot, uDayFade0, uDayFade1);
  gDetailHeight = vn_h0 + (gDetailHeight - vn_h0) * vn_dayFade;
  detail = mix(vn_c0, detail, vn_dayFade);
}
