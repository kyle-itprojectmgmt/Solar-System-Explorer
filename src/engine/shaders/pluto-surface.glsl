// Pluto procedural surface detail — nitrogen ice plains, cratered terrain, mountain rims, bladed ridges.
// New Horizons 8K mosaic base with Tombaugh Regio (bright heart), Cthulhu Macula (dark equatorial band),
// and water-ice mountains framing the heart. Southern hemisphere unmapped (smooth white fill, v < 0.28).
// Airless body: relief and color vanish through the terminator. All terrain is STATIC (no time drift).
// Injected into a detail style; the style provides dBase/detail and final mix.
// Extra uniforms: uSunObj, uDayFade0, uDayFade1, uGrazeFade0, uGrazeFade1.

// === APPLY ===

// Capture baseline for night fade and grazing boost calculations.
float pl_h0 = gDetailHeight;
vec3 pl_c0 = detail;

// Day and graze fades for night-side and grazing suppression (shared across all layers).
float pl_sunDot = dot(vObjPos, uSunObj);
float pl_dayFade = sse_dayFade(pl_sunDot, uDayFade0, uDayFade1);
float pl_grazeFade = sse_grazeFade(pl_sunDot, uGrazeFade0, uGrazeFade1);

// Mapped region gate: everything south of v ≈ 0.28 is unmapped smooth fill (New Horizons southern winter).
// Apply soft edge so procedural detail vanishes cleanly.
float pl_mapped = smoothstep(0.24, 0.30, dUv.y);

// LAYER 1 — TOMBAUGH REGIO (nitrogen ice plain, bright heart).
// Mask: ellipse around (0.489, 0.62) AND high luminance (> 0.6).
// Visual: bright white-pink with subtle convection-cell texture (worley2), glacier-smooth surface.
{
  // Ellipse mask (smooth soft edge). The map is rolled to the engine's
  // center-origin convention (0degE at u 0.5, Earth precedent), which puts
  // the heart (176degE) at u 0.989 ACROSS THE WRAP SEAM — the u-distance
  // must wrap (fract(d + 0.5) - 0.5 maps into [-0.5, 0.5]).
  vec2 pl_t_center = vec2(0.989, 0.62);
  float pl_t_du = fract(dUv.x - pl_t_center.x + 0.5) - 0.5;
  vec2 pl_t_delta = vec2(pl_t_du, (dUv.y - pl_t_center.y) * 0.833);  // aspect ratio ~1.2:1
  float pl_t_ellipse = 1.0 - smoothstep(0.08, 0.12, length(pl_t_delta));

  // Luminance mask.
  float pl_t_lum = dot(dBase, vec3(0.299, 0.587, 0.114));
  float pl_t_brightMask = smoothstep(0.55, 0.65, pl_t_lum);

  float pl_t_alt = 1.0 - smoothstep(1000.0, 3500.0, uAltitude);
  if (pl_t_alt > 0.001 && pl_t_ellipse > 0.001) {
    // Convection-cell mosaic (cells ~50 km ≈ freq 150 in dUv). Screenshot
    // calibration, TWO failed relief cuts: any height signal derived from
    // worley F1 renders as stamped rings (high-F1 regions circle each
    // feature point — true cell BOUNDARIES need F2−F1, which the library
    // does not provide). The real NH appearance is a mosaic of subtly
    // different-toned polygonal tiles anyway — per-cell tone from the cell
    // id hash, COLOR ONLY, zero relief. The ring pathology cannot exist.
    float pl_t_cFade = dtlFreqFade2(dUv, 150.0);
    vec2 pl_t_w = worley2(dUv * 150.0 + 11.2);
    float pl_t_tone = (fract(pl_t_w.y * 7.73) - 0.5) * 0.04;
    detail *= 1.0 + pl_t_tone * pl_t_alt * pl_t_cFade * pl_t_ellipse * pl_t_brightMask;

    // Color nudge toward bright white-pink (glacier smooth).
    vec3 pl_t_tonePink = vec3(0.96, 0.92, 0.90);
    detail = mix(detail, pl_t_tonePink, pl_t_ellipse * pl_t_brightMask * pl_t_alt * 0.25 * pl_mapped);
  }
}

// LAYER 2 — CTHULHU MACULA (dark cratered terrain, tholin-dark equatorial band).
// Mask: low luminance (< 0.30) AND reddish (dBase.r > dBase.b * 1.25).
// Visual: sparse two-scale crater bowls, slight darkening toward tholin red-brown.
{
  float pl_c_lum = dot(dBase, vec3(0.299, 0.587, 0.114));
  float pl_c_darkMask = 1.0 - smoothstep(0.25, 0.35, pl_c_lum);
  float pl_c_redMask = step(1.25 * dBase.b, dBase.r);

  if (pl_c_darkMask > 0.001 && pl_c_redMask > 0.001) {
    // Color tint toward tholin: deep red-brown (mix <= 0.3).
    vec3 pl_c_tholin = vec3(0.24, 0.12, 0.06);
    detail = mix(detail, mix(detail, pl_c_tholin, 0.3), pl_c_darkMask * pl_c_redMask * pl_mapped);

    // Two-scale crater field (sparse, hash-thinned ~25%).
    float pl_c_alt = 1.0 - smoothstep(500.0, 2500.0, uAltitude);
    if (pl_c_alt > 0.001) {
      // First tier: freq 220, keep 25% via hash.
      {
        float pl_c_id1;
        float pl_c_cr1 = craterProfile(dUv * 220.0 + 8.3, pl_c_id1);
        float pl_c_sparse1 = step(0.75, fract(pl_c_id1 * 6.1));  // ~25% of cells
        float pl_c_bowl1 = clamp(-min(pl_c_cr1, 0.0), 0.0, 1.0);
        float pl_c_fade1 = dtlFreqFade2(dUv, 220.0);

        detail = mix(detail, detail * 0.92, pl_c_bowl1 * 0.4 * pl_c_alt * pl_c_fade1 * pl_c_sparse1 * pl_c_darkMask * pl_mapped);
        gDetailHeight += min(pl_c_cr1, 0.0) * 0.05 * pl_c_alt * pl_c_fade1 * pl_c_sparse1 * pl_c_darkMask * pl_mapped * pl_grazeFade;
      }

      // Second tier: freq 380, keep 25% via hash.
      {
        float pl_c_id2;
        float pl_c_cr2 = craterProfile(dUv * 380.0 + 16.7, pl_c_id2);
        float pl_c_sparse2 = step(0.75, fract(pl_c_id2 * 7.8));
        float pl_c_bowl2 = clamp(-min(pl_c_cr2, 0.0), 0.0, 1.0);
        float pl_c_fade2 = dtlFreqFade2(dUv, 380.0);

        detail = mix(detail, detail * 0.94, pl_c_bowl2 * 0.35 * pl_c_alt * pl_c_fade2 * pl_c_sparse2 * pl_c_darkMask * pl_mapped);
        gDetailHeight += min(pl_c_cr2, 0.0) * 0.04 * pl_c_alt * pl_c_fade2 * pl_c_sparse2 * pl_c_darkMask * pl_mapped * pl_grazeFade;
      }
    }
  }
}

// LAYER 3 — WATER-ICE MOUNTAINS (rim of Tombaugh Regio, mid-tone aureole).
// Mask: soft edge band of heart ellipse AND mid luminance (0.40–0.70).
// Visual: ridgedFbm3 relief (positive ridges = mountains), grey-white tint.
{
  // Ellipse mask (inner soft edge out, outer soft edge in). Same wrap-aware
  // u-distance as LAYER 1 — the heart straddles the texture seam.
  vec2 pl_m_center = vec2(0.989, 0.62);
  float pl_m_du = fract(dUv.x - pl_m_center.x + 0.5) - 0.5;
  vec2 pl_m_delta = vec2(pl_m_du, (dUv.y - pl_m_center.y) * 0.833);
  float pl_m_r = length(pl_m_delta);
  float pl_m_rimMask = smoothstep(0.11, 0.14, pl_m_r) * (1.0 - smoothstep(0.17, 0.21, pl_m_r));

  // Luminance gate: 0.40–0.70.
  float pl_m_lum = dot(dBase, vec3(0.299, 0.587, 0.114));
  float pl_m_midToneMask = smoothstep(0.35, 0.45, pl_m_lum) * (1.0 - smoothstep(0.68, 0.78, pl_m_lum));

  float pl_m_alt = 1.0 - smoothstep(1500.0, 4500.0, uAltitude);
  if (pl_m_alt > 0.001 && pl_m_rimMask > 0.001) {
    // Fade at the ridged fbm's FINEST octave (~40 * 4), not its base freq —
    // sub-pixel ridge octaves shimmer (the v4b class).
    float pl_m_fade = dtlFreqFade(vObjPos, 120.0);

    // ridgedFbm3 for mountain relief (positive ridges).
    float pl_m_ridge = ridgedFbm3(vObjPos * 40.0);
    gDetailHeight += pl_m_ridge * 0.10 * pl_m_alt * pl_m_rimMask * pl_m_midToneMask * pl_m_fade * pl_mapped;

    // Grey-white tint (mix <= 0.25).
    vec3 pl_m_greyWhite = vec3(0.78, 0.75, 0.72);
    detail = mix(detail, mix(detail, pl_m_greyWhite, 0.25), pl_m_rimMask * pl_m_midToneMask * pl_m_alt * 0.2 * pl_mapped);
  }
}

// LAYER 4 — BLADED TERRAIN (Tartarus Dorsa, anisotropic N-S ridges east of heart).
// Mask: u ∈ [0.10, 0.26] on the ROLLED map (was 0.60–0.76 pre-roll), v ∈ [0.50, 0.66].
// Visual: anisotropic fbm3 (stretched u axis), pale yellow-white ridges.
{
  // Soft bounding box for Tartarus Dorsa region.
  float pl_b_uMask = smoothstep(0.08, 0.12, dUv.x) * (1.0 - smoothstep(0.24, 0.28, dUv.x));
  float pl_b_vMask = smoothstep(0.48, 0.52, dUv.y) * (1.0 - smoothstep(0.64, 0.68, dUv.y));

  float pl_b_alt = 1.0 - smoothstep(1200.0, 3500.0, uAltitude);
  if (pl_b_alt > 0.001 && pl_b_uMask > 0.001 && pl_b_vMask > 0.001) {
    // Anisotropic ridges: stretch u 6x faster than v to run N-S (ridges vary faster in longitude).
    vec3 pl_b_aniso = vObjPos * vec3(240.0, 40.0, 240.0);  // 6x u stretch
    // Orchestrator fix: fade at the ACTUAL stretched frequency (240), not
    // the slow axis — a 40-fade leaves 240-cycle ridges shimmering sub-pixel.
    float pl_b_fade = dtlFreqFade(vObjPos, 240.0);

    float pl_b_blade = ridgedFbm3(pl_b_aniso);
    gDetailHeight += pl_b_blade * 0.05 * pl_b_alt * pl_b_uMask * pl_b_vMask * pl_b_fade * pl_mapped;

    // Pale yellow-white tint (mix <= 0.20).
    vec3 pl_b_paleYellow = vec3(0.91, 0.89, 0.81);
    detail = mix(detail, mix(detail, pl_b_paleYellow, 0.2), pl_b_uMask * pl_b_vMask * pl_b_alt * 0.15 * pl_mapped);
  }
}

// Grazing relief boost (airless-class: multiply gDetailHeight by up to ~1.4x as sunDot goes 0.25→0.0).
// Catches tangential light at the terminator, emphasizes airless void.
{
  float pl_grazeBoost = 1.0 - smoothstep(0.0, 0.25, pl_sunDot);
  gDetailHeight *= 1.0 + pl_grazeBoost * 0.4;
}

// Night discipline: all relief and color deltas vanish through the terminator.
// Pluto is effectively airless at 39 AU; night side reverts to pure base texture.
gDetailHeight = pl_h0 + (gDetailHeight - pl_h0) * pl_dayFade;
detail = mix(pl_c0, detail, pl_dayFade);
