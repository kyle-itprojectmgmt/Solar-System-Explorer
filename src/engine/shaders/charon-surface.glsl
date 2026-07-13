// Charon procedural surface detail — cratered plains, Mordor Macula, Serenity Chasma, Plutoshine.
// New Horizons mosaic (northern ~2/3); flat dark-grey unmapped fill below v ≈ 0.33.
// Charon is geologically dead: no time-varying features, static relief only.
// Injected into a detail style; the style provides dBase/detail preamble and final mix.
// Extra uniforms: uSunObj, uDayFade0, uDayFade1, uGrazeFade0, uGrazeFade1.

// === APPLY ===

// Capture baseline for night fade.
float ch_h0 = gDetailHeight;
vec3 ch_c0 = detail;

// Day and graze fades for night-side and grazing suppression.
float ch_sunDot = dot(vObjPos, uSunObj);
float ch_dayFade = sse_dayFade(ch_sunDot, uDayFade0, uDayFade1);
float ch_grazeFade = sse_grazeFade(ch_sunDot, uGrazeFade0, uGrazeFade1);

// Gate for mapped region (north ~2/3); unmapped fill below v ≈ 0.33.
float ch_mapped = smoothstep(0.30, 0.36, dUv.y);

// LAYER 1 — CRATERED PLAINS: warm-grey discipline + sparse two-scale crater field.
// Most of the surface; deepens in close-range thermal imaging at craters.
{
  // Warm-grey nudge toward New Horizons real color.
  vec3 ch_greyWarm = vec3(0.58, 0.55, 0.52);
  detail = mix(detail, ch_greyWarm, ch_mapped * 0.12);

  // Two-scale crater field; confined to mapped region.
  float ch_alt1 = 1.0 - smoothstep(600.0, 2500.0, uAltitude);
  if (ch_alt1 > 0.001) {
    // First tier: freq 200 Hz, keep ~25% of cells via step(0.75, ...).
    {
      float ch_crId1;
      float ch_c1 = craterProfile(dUv * 200.0 + 11.2, ch_crId1);
      float ch_sparse1 = step(0.75, fract(ch_crId1 * 6.1));  // ~25%
      float ch_bowl1 = clamp(-min(ch_c1, 0.0), 0.0, 1.0);
      float ch_fade1 = dtlFreqFade2(dUv, 200.0);

      // Darken bowls by ≤ 6%.
      detail = mix(detail, detail * 0.94, ch_bowl1 * 0.15 * ch_alt1 * ch_fade1 * ch_sparse1 * ch_mapped);

      // Height relief with grazing boost.
      gDetailHeight += min(ch_c1, 0.0) * 0.05 * ch_alt1 * ch_fade1 * ch_sparse1 * ch_mapped * ch_grazeFade;
    }

    // Second tier: freq 340 Hz, keep ~20% of cells.
    {
      float ch_crId2;
      float ch_c2 = craterProfile(dUv * 340.0 + 18.7, ch_crId2);
      float ch_sparse2 = step(0.80, fract(ch_crId2 * 7.3));  // ~20%
      float ch_bowl2 = clamp(-min(ch_c2, 0.0), 0.0, 1.0);
      float ch_fade2 = dtlFreqFade2(dUv, 340.0);

      detail = mix(detail, detail * 0.95, ch_bowl2 * 0.10 * ch_alt1 * ch_fade2 * ch_sparse2 * ch_mapped);
      gDetailHeight += min(ch_c2, 0.0) * 0.04 * ch_alt1 * ch_fade2 * ch_sparse2 * ch_mapped * ch_grazeFade;
    }
  }
}

// LAYER 2 — MORDOR MACULA ENHANCEMENT: dark red-brown polar cap (north ~55°–68°).
// Photochemical stain — color only, no relief change. Subtle mottling at close range.
{
  // Latitude mask: smoothly fade in north of ~55°N (vObjPos.y sin-space).
  // sin(55°) ≈ 0.819, sin(68°) ≈ 0.927.
  float ch_mordor = smoothstep(0.82, 0.93, vObjPos.y);

  if (ch_mordor > 0.001) {
    // Dark red-brown stain.
    vec3 ch_mordorTint = vec3(0.20, 0.10, 0.05);
    detail = mix(detail, ch_mordorTint, ch_mordor * 0.35);

    // Subtle static fbm3 mottling (±5%) for texture at close range.
    {
      float ch_alt2 = 1.0 - smoothstep(400.0, 2000.0, uAltitude);
      if (ch_alt2 > 0.001) {
        float ch_mottleFade = dtlFreqFade(vObjPos, 180.0);
        float ch_mottle = fbmN(vObjPos * 6.5, dOct) * 0.05 * ch_mottleFade;
        detail = mix(detail, detail * (1.0 + ch_mottle), ch_mordor * 0.30 * ch_alt2);
      }
    }
  }
}

// LAYER 3 — SERENITY CHASMA: equatorial canyon belt relief groove.
// Relief band at lat ~0.56 (equator); segmented via fbm3 modulation.
{
  float ch_alt3 = 1.0 - smoothstep(800.0, 3000.0, uAltitude);
  if (ch_alt3 > 0.001) {
    // Latitude band: sharp at center (v = 0.56 ≈ equator), soft ±0.08 (≈ ±14° lat).
    // Ascending smoothstep edges: lo=0.04, hi=0.14 distance from center.
    float ch_latDist = abs(dUv.y - 0.56);
    float ch_bandMask = 1.0 - smoothstep(0.04, 0.14, ch_latDist);

    // Longitude gate: u in 0.02–0.38, soft edges.
    float ch_lonMask = smoothstep(0.00, 0.02, dUv.x) * (1.0 - smoothstep(0.36, 0.40, dUv.x));

    if (ch_bandMask > 0.001 && ch_lonMask > 0.001) {
      // Segmented canyon via fbm3 modulation (±40%).
      float ch_freqFade = dtlFreqFade2(dUv, 120.0);
      float ch_segment = fbm3(vObjPos * 3.5 + vec3(dUv.x * 4.0, 0.0, 0.0)) * 0.40 + 0.60;

      // Relief groove: gDetailHeight -= band * depth.
      gDetailHeight -= ch_bandMask * ch_lonMask * 0.08 * ch_segment * ch_alt3 * ch_freqFade;

      // Dust-floor darkening (≤ 8%): subtle noise variation prevents uniform black.
      float ch_dustFloor = fbmN(vObjPos * 4.2, dOct) * 0.04 + 0.96;
      detail = mix(detail, detail * ch_dustFloor, ch_bandMask * ch_lonMask * 0.08 * ch_alt3 * ch_freqFade);
    }
  }
}

// Grazing relief boost (airless-class: multiply height up to 1.4x at sunDot 0.0..0.25).
{
  // Ascending ramp: multiply factor starts at 1.0, climbs to 1.4 as sunDot falls 0.25→0.0.
  float ch_grazeBoost = 1.0 - smoothstep(0.0, 0.25, ch_sunDot);
  gDetailHeight *= 1.0 + ch_grazeBoost * 0.4;
}

// Night discipline: all relief and color vanish through the terminator (airless body).
gDetailHeight = ch_h0 + (gDetailHeight - ch_h0) * ch_dayFade;
detail = mix(ch_c0, detail, ch_dayFade);

// LAYER 4 — PLUTOSHINE: tidally-locked reflected light from Pluto (night side).
// Applied AFTER night-fade tail to remain barely perceptible (8%-luminance-class).
// Charon's Pluto-facing hemisphere is at +X in object space (lon 0).
{
  float ch_plutoFacing = smoothstep(0.0, 0.6, vObjPos.x);
  float ch_shine = ch_plutoFacing * (1.0 - ch_dayFade) * 0.035;
  detail += vec3(0.95, 0.90, 0.88) * ch_shine;
}
