// Triton procedural surface detail — cantaloupe terrain, polar cap, geysers, craters.
// Voyager 2 captured only ~40% of the surface; this chunk adds character and hides
// the seam. Activation: uDetailBlend gates on altitude.
// Injected into a detail style; the style provides the preamble (dBase/detail)
// and final mix. Extra uniforms: uSunObj, uDayFade0, uDayFade1, uGrazeFade0, uGrazeFade1.

// === APPLY ===

// Capture baseline for night fade.
float tr_h0 = gDetailHeight;
vec3 tr_c0 = detail;

// Day and graze fades for night-side and grazing suppression.
float tr_dayFade = sse_dayFade(dot(vObjPos, uSunObj), uDayFade0, uDayFade1);
float tr_grazeFade = sse_grazeFade(dot(vObjPos, uSunObj), uGrazeFade0, uGrazeFade1);

// LAYER 1 — pinkish-grey discipline: nudge toward Triton's real color.
// Voyager images show a pale pinkish-grey; this grounds the procedural layers.
{
  vec3 tr_pinkGrey = vec3(0.78, 0.72, 0.68);
  detail = mix(detail, tr_pinkGrey, 0.15);
}

// LAYER 2 — CANTALOUPE TERRAIN (below ~3,000 km, north of -10° latitude).
// Signature feature of Triton: inverse bowls (dimples) with raised septa walls.
// Two-scale cellular field: coarse dimples + fine septa structure.
{
  float tr_alt2 = 1.0 - smoothstep(1500.0, 3000.0, uAltitude);
  if (tr_alt2 > 0.001) {
    float tr_lat = asin(clamp(vObjPos.y, -1.0, 1.0));

    // North-only gate: smoothly fade south of -10 deg latitude.
    float tr_latGate = 1.0 - smoothstep(-0.175, -0.087, tr_lat);  // -10° to -5°
    if (tr_latGate > 0.001) {
      // Two-scale cellular dimples. Calibrated by screenshot: the first
      // cut's 0.25 uniform-depth dimples read as bubble wrap — depth is
      // now per-cell hashed (worley2's .y is the cell id) and much lower,
      // so the cells vary like real cantaloupe terrain.
      // Soft-edged (falloff to 0.5 Worley units), ~70% of cells kept,
      // per-cell depth hash — second calibration round: hard edges +
      // full coverage still read as droplets.
      float tr_cFade1 = dtlFreqFade2(dUv, 150.0);
      vec2 tr_w1 = worley2(dUv * 150.0 + 7.1);
      float tr_keep1 = step(0.30, fract(tr_w1.y * 9.31));
      float tr_var1 = (0.35 + 0.65 * fract(tr_w1.y * 5.13)) * tr_keep1;
      float tr_dimple1 = (1.0 - smoothstep(0.0, 0.50, tr_w1.x)) * tr_var1;

      float tr_cFade2 = dtlFreqFade2(dUv, 280.0);
      vec2 tr_w2 = worley2(dUv * 280.0 + 13.5);
      float tr_keep2 = step(0.35, fract(tr_w2.y * 11.7));
      float tr_var2 = (0.35 + 0.65 * fract(tr_w2.y * 6.29)) * tr_keep2;
      float tr_dimple2 = (1.0 - smoothstep(0.0, 0.40, tr_w2.x)) * tr_var2;

      float tr_dimpledepth = tr_dimple1 * 0.05 * tr_cFade1 + tr_dimple2 * 0.02 * tr_cFade2;
      gDetailHeight -= tr_dimpledepth * tr_alt2 * tr_latGate * (0.7 + 0.3 * tr_grazeFade);

      // Septa walls live at HIGH Worley distance (equidistant from two
      // feature points) — the first cut's annulus around each cell CENTER
      // was exactly the banned donut-rim pattern.
      float tr_septuaMask = smoothstep(0.30, 0.45, tr_w1.x);
      gDetailHeight += tr_septuaMask * 0.03 * tr_alt2 * tr_latGate * tr_cFade1;

      // Subtle tone: ±6% brightness in the dimples and septa.
      float tr_cellTone = fbmN(vObjPos * 5.0, dOct) * 0.06;
      detail = mix(detail, detail * (1.0 + tr_cellTone), tr_dimpledepth * tr_latGate * 0.4);
    }
  }
}

// LAYER 3 — SOUTH POLAR NITROGEN CAP (below ~8,000 km, south of -15° latitude).
// Pale pink-white nitrogen ice (Voyager observed bright frost at the pole).
// Craters suppressed, relief flattened (ice fills depressions).
{
  float tr_alt3 = 1.0 - smoothstep(4000.0, 8000.0, uAltitude);
  if (tr_alt3 > 0.001) {
    float tr_lat3 = asin(clamp(vObjPos.y, -1.0, 1.0));

    // South polar region: smooth gate over ~12° (from -15° to -27°).
    float tr_capGate = 1.0 - smoothstep(-0.47, -0.26, tr_lat3);  // -27° to -15°
    if (tr_capGate > 0.001) {
      // Bright pale pink nitrogen ice.
      vec3 tr_nitCap = vec3(0.93, 0.89, 0.90);
      detail = mix(detail, tr_nitCap, tr_capGate * 0.55 * tr_alt3);

      // Frost streaks at the cap MARGIN: a band peaking near -16 deg lat.
      // (orchestrator fix: reversed smoothstep edges.)
      float tr_marginMask = smoothstep(-0.36, -0.28, tr_lat3)
                          * (1.0 - smoothstep(-0.28, -0.20, tr_lat3));
      vec3 tr_frostTint = vec3(0.82, 0.88, 0.85);  // pale blue-green
      detail = mix(detail, tr_frostTint, tr_marginMask * 0.25 * tr_alt3);

      // Flatten relief inside the cap (nitrogen ice fills craters).
      // (orchestrator fix: the altitude gate must blend the FACTOR toward
      // 1, not scale the whole relief delta — the first cut deleted all
      // relief whenever the gate was partial.)
      gDetailHeight = tr_h0 + (gDetailHeight - tr_h0) * (1.0 - tr_capGate * 0.70 * tr_alt3);
    }
  }
}

// LAYER 4 — dark geyser fan streaks (below ~2,000 km, inside polar cap).
// ~8 short wind-blown streaks all pointing northeast (real Voyager feature).
// Dark dust-laden nitrogen, anchored to cellular hash.
{
  float tr_alt4 = 1.0 - smoothstep(1000.0, 2000.0, uAltitude);
  if (tr_alt4 > 0.001) {
    float tr_lat4 = asin(clamp(vObjPos.y, -1.0, 1.0));

    // Geyser streaks confined to lat -31° to -57°. (orchestrator fixes:
    // the first cut compared RADIANS against sin-space constants — the
    // zone landed as a 1-degree sliver near -49° — and used reversed
    // smoothstep edges.)
    float tr_geyserZone = smoothstep(-1.10, -1.00, tr_lat4)
                        * (1.0 - smoothstep(-0.55, -0.45, tr_lat4));
    if (tr_geyserZone > 0.001) {
      // Sparse cell gate: ~1 in 8 cells hosts a fan.
      vec2 tr_cellHash = worley2(dUv * 40.0 + 19.3);
      float tr_streakCell = step(0.88, fract(tr_cellHash.y * 7.1));
      if (tr_streakCell > 0.001) {
        // DIAGONALLY-STRETCHED noise: streaks run along the uv (1,1)
        // diagonal — the "all fans point the same way" Voyager look.
        float tr_streakField = snoise(vec3((dUv.x + dUv.y) * 12.0,
                                           (dUv.x - dUv.y) * 90.0, 3.7));
        float tr_elongMask = smoothstep(0.35, 0.65, tr_streakField);

        // Dark dust-laden nitrogen.
        vec3 tr_geyserDust = vec3(0.35, 0.30, 0.28);
        detail = mix(detail, tr_geyserDust, tr_elongMask * tr_streakCell * tr_geyserZone * 0.20 * tr_alt4);
      }
    }
  }
}

// LAYER 5 — sparse fresh craters outside the polar cap.
// Triton's surface is young — sparse cratering (only ~20% density).
// Min(c, 0) depressions only, no rims.
{
  float tr_lat5 = asin(clamp(vObjPos.y, -1.0, 1.0));

  // Suppress craters inside the polar cap (south of -15°).
  float tr_noCraterCap = smoothstep(-0.26, -0.2, tr_lat5);
  if (tr_noCraterCap > 0.001) {
    float tr_alt5 = 1.0 - smoothstep(500.0, 2000.0, uAltitude);
    if (tr_alt5 > 0.001) {
      // Two-scale crater field, sparse.
      float tr_crFade1 = dtlFreqFade2(dUv, 200.0);
      float tr_crId1;
      float tr_cr1 = craterProfile(dUv * 200.0 + 9.7, tr_crId1);
      tr_cr1 *= step(0.80, fract(tr_crId1 * 6.2));  // hash-thin to 20%

      float tr_crFade2 = dtlFreqFade2(dUv, 380.0);
      float tr_crId2;
      float tr_cr2 = craterProfile(dUv * 380.0 + 15.3, tr_crId2);
      tr_cr2 *= step(0.80, fract(tr_crId2 * 7.8));

      // Depression bowls only.
      float tr_bowl1 = clamp(-min(tr_cr1, 0.0), 0.0, 1.0);
      float tr_bowl2 = clamp(-min(tr_cr2, 0.0), 0.0, 1.0);

      // Subtle darkening in crater bowls.
      detail = mix(detail, detail * 0.94, tr_bowl1 * 0.3 * tr_alt5 * tr_crFade1 * tr_noCraterCap);
      detail = mix(detail, detail * 0.95, tr_bowl2 * 0.25 * tr_alt5 * tr_crFade2 * tr_noCraterCap);

      // Height relief with grazing boost.
      gDetailHeight += min(tr_cr1, 0.0) * 0.06 * tr_alt5 * tr_crFade1 * tr_noCraterCap * tr_grazeFade;
      gDetailHeight += min(tr_cr2, 0.0) * 0.05 * tr_alt5 * tr_crFade2 * tr_noCraterCap * tr_grazeFade;
    }
  }
}

// Grazing relief boost (airless-class: multiply height up to 1.4x at sunDot 0.0..0.25).
// Catches tangential light, sells the airless void.
{
  float tr_sunDot = dot(vObjPos, uSunObj);
  // (orchestrator fix: reversed smoothstep edges are GLSL UB)
  float tr_grazeBoost = 1.0 - smoothstep(0.0, 0.25, tr_sunDot);
  gDetailHeight *= 1.0 + tr_grazeBoost * 0.4;
}

// Night discipline: all relief and color vanish through the terminator.
gDetailHeight = tr_h0 + (gDetailHeight - tr_h0) * tr_dayFade;
detail = mix(tr_c0, detail, tr_dayFade);
