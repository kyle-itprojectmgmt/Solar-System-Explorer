// Iapetus procedural surface detail — yin-yang two-tone moon, equatorial ridge.
// Activation: uDetailBlend gates on altitude.
// Injected into a detail style; the style provides the preamble (dBase/detail)
// and final mix. Extra uniforms: uSunObj, uDayFade0, uDayFade1, uGrazeFade0, uGrazeFade1.

// === APPLY ===

// Capture baseline for night fade.
float ia_h0 = gDetailHeight;
vec3 ia_c0 = detail;

// Day and graze fades for night-side suppression.
float ia_dayFade = sse_dayFade(dot(vObjPos, uSunObj), uDayFade0, uDayFade1);
float ia_grazeFade = sse_grazeFade(dot(vObjPos, uSunObj), uGrazeFade0, uGrazeFade1);

// Derive hemisphere from base texture luminance (Cassini data is real).
float ia_lum = dot(detail, vec3(0.299, 0.587, 0.114));

// DARK TERRAIN (Cassini Regio): ia_lum < 0.2
// Deepen toward charcoal-black #1A0A00, very subtle dust mottling.
{
  float ia_darkMask = 1.0 - smoothstep(0.2, 0.35, ia_lum);
  if (ia_darkMask > 0.001) {
    // Deepen the color.
    vec3 ia_darkTarget = vec3(0.102, 0.039, 0.0);
    detail = mix(detail, ia_darkTarget, ia_darkMask * 0.4);

    // Very subtle dust-deposit mottling: fbmN with low amplitude.
    float ia_dustMot = fbmN(vObjPos * 6.0, dOct) * 0.06;
    detail = mix(detail, detail * (1.0 + ia_dustMot * 0.3), ia_darkMask * 0.08);
  }
}

// BRIGHT TERRAIN: ia_lum > 0.6
// Nudge toward cream-white #F5F0E8, heavy ancient cratering.
{
  float ia_brightMask = smoothstep(0.6, 0.75, ia_lum);
  if (ia_brightMask > 0.001) {
    // Brighten toward cream.
    vec3 ia_brightTarget = vec3(0.961, 0.941, 0.910);
    detail = mix(detail, ia_brightTarget, ia_brightMask * 0.15);

    // Heavy cratering: two scales, depressions only, hash-thinned.
    float ia_crAltFade = 1.0 - smoothstep(800.0, 4000.0, uAltitude);
    if (ia_crAltFade > 0.001) {
      // First crater scale.
      float ia_cFade1 = dtlFreqFade2(dUv, 280.0);
      float ia_id1;
      float ia_c1 = craterProfile(dUv * 280.0 + 7.9, ia_id1);
      ia_c1 *= step(0.55, fract(ia_id1 * 7.1)); // hash-thin

      // Second crater scale.
      float ia_cFade2 = dtlFreqFade2(dUv, 520.0);
      float ia_id2;
      float ia_c2 = craterProfile(dUv * 520.0 + 13.2, ia_id2);
      ia_c2 *= step(0.55, fract(ia_id2 * 8.9));

      // Depressions only.
      float ia_bowl1 = clamp(-min(ia_c1, 0.0), 0.0, 1.0);
      float ia_bowl2 = clamp(-min(ia_c2, 0.0), 0.0, 1.0);

      // Warm shadow tint in bowls.
      vec3 ia_shadowTint = vec3(0.85, 0.70, 0.55);
      detail = mix(detail, mix(detail, ia_shadowTint, 0.3), ia_bowl1 * 0.5 * ia_crAltFade * ia_cFade1 * ia_brightMask);
      detail = mix(detail, mix(detail, ia_shadowTint, 0.2), ia_bowl2 * 0.4 * ia_crAltFade * ia_cFade2 * ia_brightMask);

      // Height relief: amplitude ≤ 0.18, gated by grazing angle.
      gDetailHeight += min(ia_c1, 0.0) * 0.10 * ia_crAltFade * ia_cFade1 * ia_brightMask * ia_grazeFade;
      gDetailHeight += min(ia_c2, 0.0) * 0.08 * ia_crAltFade * ia_cFade2 * ia_brightMask * ia_grazeFade;
    }
  }
}

// TRANSITION ZONE (0.2 < ia_lum < 0.6): smooth blend of dark and bright treatments.
// This is handled implicitly by the masks above (they cross-fade).

// EQUATORIAL RIDGE (the walnut seam): |latitude| < 5° (abs(vObjPos.y) < 0.087)
// ONE place where positive relief is allowed — this is a real 20 km mountain range.
{
  float ia_ridgeSpan = 1.0 - smoothstep(0.0, 0.087, abs(vObjPos.y));
  if (ia_ridgeSpan > 0.001) {
    // Ridge height: fbm3 variation modulates the mountain. The dark-
    // hemisphere gate scales THE RIDGE ONLY — the first cut multiplied the
    // whole accumulated height field, warping crater relief and stepping
    // discontinuously at the ±5° boundary (review fix).
    float ia_ridgeDarkGate = 1.0 - smoothstep(0.3, 0.5, ia_lum) * 0.5;
    float ia_ridge = ia_ridgeSpan * (0.55 + 0.45 * fbm3(vObjPos * 14.0)) * ia_ridgeDarkGate;

    // Add positive relief (allowed here only — a real mountain range).
    gDetailHeight += ia_ridge * 0.5;

    // Brighten sun-facing paint slightly (×1.06).
    detail = mix(detail, detail * 1.06, ia_ridgeSpan * 0.4);
  }
}

// Night fade: all relief and color deltas from this chunk vanish through the terminator.
gDetailHeight = ia_h0 + (gDetailHeight - ia_h0) * ia_dayFade;
detail = mix(ia_c0, detail, ia_dayFade);
