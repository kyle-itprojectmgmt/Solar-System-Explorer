// Enceladus procedural surface detail — fresh ice, tiger stripes, cratering.
// Activation: uDetailBlend gates on altitude.
// Injected into a detail style; the style provides the preamble (dBase/detail)
// and final mix. Extra uniforms: uSunObj, uDayFade0, uDayFade1, uGrazeFade0, uGrazeFade1.

// Tiger stripe projection helper: gnomonic-ish at the south pole.
vec2 en_tigerStriPole(vec3 p) {
  // Project around south pole: only valid where p.y < 0.
  return vec2(p.x, p.z) / max(0.05, -p.y);
}

// === APPLY ===

// Capture baseline for night fade.
float en_h0 = gDetailHeight;
vec3 en_c0 = detail;

// Day and graze fades for night-side suppression.
float en_dayFade = sse_dayFade(dot(vObjPos, uSunObj), uDayFade0, uDayFade1);
float en_grazeFade = sse_grazeFade(dot(vObjPos, uSunObj), uGrazeFade0, uGrazeFade1);

// GLOBAL ICE BRIGHTENING: Enceladus is the most reflective body in the solar system.
// Nudge detail toward pale cyan-white with large-scale fbmN variation.
{
  float en_iceBright = clamp(fbmN(vObjPos * 3.0, dOct), 0.0, 1.0) * 0.12; // signed noise clamped — no color extrapolation
  vec3 en_iceTarget = vec3(0.973, 0.973, 1.0);
  detail = mix(detail, en_iceTarget, en_iceBright * 0.08);
}

// TIGER STRIPES (south pole, vObjPos.y < -0.866 ≈ latitude < -60°)
{
  // 1 at the south pole, fading out by −60° latitude. (Review fix: the
  // first cut had this inverted — 0 AT the pole and 1 across the whole
  // rest of the moon, painting stripes globally.)
  float en_southPole = 1.0 - smoothstep(-0.90, -0.86, vObjPos.y);
  if (en_southPole > 0.001) {
    vec2 en_sp = en_tigerStriPole(vObjPos);

    // Stripe ridges: sub-parallel fracture lines from ridged noise.
    float en_stripe = dtlAAstep(0.93, 0.985, ridged(vec3(en_sp * 3.5, 2.7)));

    // Blue-grey tint along stripes: #88AACC.
    vec3 en_stripeTint = vec3(0.533, 0.667, 0.8);
    detail = mix(detail, en_stripeTint, en_stripe * 0.5 * en_southPole);

    // Trough depth: cut the relief into the surface.
    gDetailHeight -= en_stripe * 0.35 * en_southPole;

    // Faint blue-green emissive glow along stripes, below 2000 km.
    float en_glowAltFade = 1.0 - smoothstep(500.0, 2000.0, uAltitude);
    gDetailEmissive += vec3(0.2, 0.45, 0.5) * en_stripe * 0.02 * en_glowAltFade * uDetailBlend * en_southPole;
  }
}

// NORTHERN CRATERING (vObjPos.y > 0.0, northern hemisphere)
{
  float en_northWeight = smoothstep(-0.1, 0.1, vObjPos.y);
  if (en_northWeight > 0.001) {
    float en_crAltFade = 1.0 - smoothstep(600.0, 3000.0, uAltitude);
    if (en_crAltFade > 0.001) {
      // Two-scale crater field.
      float en_cFade1 = dtlFreqFade2(dUv, 250.0);
      float en_id1;
      float en_c1 = craterProfile(dUv * 250.0 + 5.1, en_id1);
      en_c1 *= step(0.55, fract(en_id1 * 8.3)); // hash-thin to ~45% of cells

      float en_cFade2 = dtlFreqFade2(dUv, 450.0);
      float en_id2;
      float en_c2 = craterProfile(dUv * 450.0 + 11.7, en_id2);
      en_c2 *= step(0.55, fract(en_id2 * 9.1));

      // Only depression bowls, no rims.
      float en_bowl1 = clamp(-min(en_c1, 0.0), 0.0, 1.0);
      float en_bowl2 = clamp(-min(en_c2, 0.0), 0.0, 1.0);

      // Subtle darkening in crater bowls.
      detail = mix(detail, detail * 0.94, en_bowl1 * 0.4 * en_crAltFade * en_cFade1 * en_northWeight);
      detail = mix(detail, detail * 0.95, en_bowl2 * 0.3 * en_crAltFade * en_cFade2 * en_northWeight);

      // Height relief: modest amplitudes, fading with grazing angle.
      gDetailHeight += min(en_c1, 0.0) * 0.08 * en_crAltFade * en_cFade1 * en_northWeight * en_grazeFade;
      gDetailHeight += min(en_c2, 0.0) * 0.06 * en_crAltFade * en_cFade2 * en_northWeight * en_grazeFade;
    }
  }
}

// SOUTHERN SMOOTH PLAINS: south of -30° (vObjPos.y < -0.5), suppress cratering.
// The south is geologically young and smooth.
{
  float en_youngSouth = smoothstep(-0.5, -0.2, vObjPos.y);
  // This naturally fades northern cratering contributions in the south.
  // No additional suppression needed — the en_northWeight already handles it.
}

// Night fade: all of this chunk's relief and color vanishes through the terminator.
gDetailHeight = en_h0 + (gDetailHeight - en_h0) * en_dayFade;
detail = mix(en_c0, detail, en_dayFade);
