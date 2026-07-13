// Mercury procedural surface detail — cratered regolith with Caloris Basin and hollows.
// No atmosphere: Mercury's airless night side must zero all procedural height and color deltas;
// relief and character emerge only on the day side through the terminator.
// Injected into the 'hermes' detail style; the style provides uDetailBlend framing and mix.

// Caloris Basin center: lat 30.5N, lon 170.2W, anchored in texture UV space [0.027, 0.669].
const vec2 mc_calorisUv = vec2(0.027, 0.669);
const vec2 mc_aspectRatio = vec2(2.0, 1.0);

// Mid-latitude mask threshold for hollows (50° latitude).
// sin(50°) ≈ 0.766, so use a smooth transition band around that value.
const float mc_lat50 = 0.766;

// Degree-to-radian constants (pre-computed once).
const float mc_pi = 3.14159265;
const float mc_lat50Rad = 50.0 * mc_pi / 180.0;

// === APPLY ===

// Precompute night-fade values once to avoid redundant dot products.
float mc_dayFade = sse_dayFade(dot(vObjPos, uSunObj), uDayFade0, uDayFade1);
float mc_grazeFade = sse_grazeFade(dot(vObjPos, uSunObj), uGrazeFade0, uGrazeFade1);
float mc_sunDot = dot(normalize(vObjPos), normalize(uSunObj));

// Store the base height and color to apply night fade at the end.
float mc_height0 = gDetailHeight;
vec3 mc_color0 = detail;

// LAYER 1: Regolith tone variation — low-freq fbmN modulating brightness ±8%
// Models subtle albedo variation between intercrater plains and cratered terrain.
{
  float mc_regolith = fbmN(vObjPos * 8.0, dOct) * 0.08;
  detail = mix(detail, detail * (1.0 + mc_regolith), 0.5);
}

// LAYER 2: Multi-scale craters (below ~3,000 km)
// Two frequency tiers of cellular bowl-depressions, hash-thinned (35% / 25%).
// Craters follow Callisto's dUv cellular pattern; bowls (min(c, 0)) only — rims
// are dropped entirely (V6.0.1 precedent). Sharp Mercury terrain over the Moon.
{
  float mc_crAlt = 1.0 - smoothstep(600.0, 3000.0, uAltitude);
  if (mc_crAlt > 0.001) {
    // First tier: freq 250, keep 35% of cells via step(0.65, ...).
    {
      float mc_id1;
      float mc_c1 = craterProfile(dUv * 250.0 + 2.1, mc_id1);
      float mc_sparse1 = step(0.80, fract(mc_id1 * 7.77));  // ~20% of cells
      float mc_bowl1 = clamp(-min(mc_c1, 0.0), 0.0, 1.0);
      float mc_fade1 = dtlFreqFade2(dUv, 250.0);

      // Calibrated by screenshot (v6 lesson — LESS): the 8K MESSENGER map
      // already carries the craters; this tier is whisper roughness only.
      detail = mix(detail, detail * 0.96, mc_bowl1 * 0.25 * mc_crAlt * mc_fade1 * mc_sparse1);
      gDetailHeight += min(mc_c1, 0.0) * 0.035 * mc_crAlt * mc_fade1 * mc_sparse1 * mc_grazeFade;
    }

    // Second tier: freq 380, keep 25% of cells via step(0.75, ...).
    {
      float mc_id2;
      float mc_c2 = craterProfile(dUv * 380.0 + 4.7, mc_id2);
      float mc_sparse2 = step(0.85, fract(mc_id2 * 12.34));  // ~15% of cells
      float mc_bowl2 = clamp(-min(mc_c2, 0.0), 0.0, 1.0);
      float mc_fade2 = dtlFreqFade2(dUv, 380.0);

      detail = mix(detail, detail * 0.95, mc_bowl2 * 0.2 * mc_crAlt * mc_fade2 * mc_sparse2);
      gDetailHeight += min(mc_c2, 0.0) * 0.025 * mc_crAlt * mc_fade2 * mc_sparse2 * mc_grazeFade;
    }
  }
}

// LAYER 3: Caloris Basin character (below ~8,000 km)
// Anchor at uv [0.027, 0.669]; wrapped-x distance with aspect correction.
// Interior: slightly brighter smooth plains tint, craters suppressed to ~40% density.
// Exterior: faint darker rim annulus (0.12..0.18 radius).
{
  float mc_calorisAlt = 1.0 - smoothstep(0.0, 8000.0, uAltitude);
  if (mc_calorisAlt > 0.001) {
    // Wrapped-x distance calculation (x wraps; y does not).
    float mc_dx = abs(dUv.x - mc_calorisUv.x);
    mc_dx = min(mc_dx, 1.0 - mc_dx);
    float mc_dy = abs(dUv.y - mc_calorisUv.y);

    // Aspect-corrected radius in UV space.
    float mc_r = length(vec2(mc_dx, mc_dy) * mc_aspectRatio);

    // Basin interior (radius ~0.12 uv units): brighter SMOOTH volcanic
    // plains — the relief field is damped here rather than adding more
    // craters (orchestrator fix: the first cut layered a third crater
    // field inside the basin, the opposite of Caloris's real floor).
    float mc_interior = 1.0 - smoothstep(0.10, 0.12, mc_r);
    if (mc_interior > 0.001) {
      detail = mix(detail, detail * 1.04, mc_interior * 0.06 * mc_calorisAlt);
      gDetailHeight *= 1.0 - 0.6 * mc_interior * mc_calorisAlt;
    }

    // Faint darker rim annulus (outer ring, radius 0.12..0.18).
    float mc_rimMask = smoothstep(0.10, 0.12, mc_r) * (1.0 - smoothstep(0.16, 0.20, mc_r));
    detail = mix(detail, detail * 0.96, mc_rimMask * 0.08 * mc_calorisAlt);
  }
}

// LAYER 4: Hollows — Mercury's unique bright blue-white pits (below ~800 km)
// Very sparse high-freq cellular hash (< 3% of cells); color-only (no relief).
// Restricted to mid-latitudes (abs(lat) < 50°); day-side only; faded by sse_grazeFade
// and dtlFreqFade to suppress sub-pixel shimmer.
{
  // (No hard mc_dayFade branch — the graze fade inside the mix and the
  // final captured-baseline fade keep the night side clean without a
  // visible on/off contour at the terminator.)
  float mc_hollowsAlt = 1.0 - smoothstep(200.0, 800.0, uAltitude);
  if (mc_hollowsAlt > 0.001) {
    // Mid-latitude gate: abs(vObjPos.y) < sin(50°) ≈ 0.766.
    // Use smooth transition: ~1 from -44° to +44°, ~0 by ±60°.
    float mc_latMask = 1.0 - smoothstep(0.74, 0.79, abs(vObjPos.y));

    if (mc_latMask > 0.001) {
      // High-frequency cellular hash at 600 Hz, very sparse (< 3% of cells).
      vec2 mc_w = worley2(vObjPos.xz * 600.0);
      float mc_hollowMask = step(0.97, fract(mc_w.y * 15.555)); // ~3% threshold

      // Tiny bright spots: Mercury's bright blue-white hollow tint.
      vec3 mc_hollowTint = vec3(0.75, 0.82, 0.90);
      detail = mix(detail, mc_hollowTint, mc_hollowMask * 0.15 * mc_hollowsAlt * mc_latMask
        * dtlFreqFade(vObjPos, 600.0) * mc_grazeFade);
    }
  }
}

// LAYER 5: Grazing-light relief boost — airless bodies live by terminator shadows
// Near the terminator (sunDot 0.0..0.25), multiply gDetailHeight by up to 1.6x.
// This is day-side only; night still zeros via the final fade.
{
  float mc_grazeMult = 1.0 - smoothstep(0.0, 0.25, mc_sunDot);
  gDetailHeight = gDetailHeight * mix(1.0, 1.6, mc_grazeMult);
}

// Night fade discipline (Mercury: no atmosphere, airless).
// All height deltas and color shifts vanish through the terminator; night side
// reverts to base texture. Craters remain invisible in deep night despite the
// relief — the terminator creates the visual, not sub-surface detail.
gDetailHeight = mc_height0 + (gDetailHeight - mc_height0) * mc_dayFade;
detail = mix(mc_color0, detail, mc_dayFade);

// Mercury has no emissive features; gDetailEmissive remains vec3(0.0).
