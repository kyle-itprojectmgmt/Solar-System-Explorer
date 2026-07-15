// Earth procedural clouds — atmospheric circulation model (v5a rewrite).
// The zone STRUCTURE is the point: Earth reads as Earth because of the
// alternating pattern ITCZ white band -> clear subtropical desert belt ->
// mid-latitude comma swirls -> polar grey. Coverage is deliberately modest
// outside the storm tracks so the Sahara and open ocean show through.
// Activation: uDetailBlend gates on altitude (earth.js detail block —
// full through 100,000 km, easing off toward 2,000,000 km: the Blue
// Marble reads by its cloud systems, so they must survive high altitude).
// Injected into the 'terra' detail style; the style provides the preamble
// (dBase/detail) and the final mix. Extra uniforms: uSunObj.

// Spiral bands, fbm-broken (V5c bug #41): the pure sin(ang_spiral * 3.5)
// read as a machined spiral rose once terminator relief shading picked it
// up. Angle noise bends the arms out of register, radial noise de-centers
// the rings, and band contrast fades outward so the outer bands soften
// into the surrounding cloud field. d = angular distance / 0.055 (0..1.6).
float ec_spiral(vec2 pos, float rate, float rot, float d, float t) {
  float r = length(pos);
  float ang = atan(pos.y, pos.x);
  float angNoise = fbm3(vec3(pos * 1.5, 7.3 + t * 1.5)) * 1.2;
  float radNoise = snoise(vec3(r * 2.4, ang * 1.5, 3.1 + t)) * 0.35;
  float ang_spiral = ang - rate / max(r, 0.01) + rot;
  float s = sin(ang_spiral * 3.5 + angNoise) * 0.5 + 0.5 + radNoise;
  float contrast = mix(0.30, 1.0, smoothstep(1.1, 0.25, d));
  return clamp(mix(0.5, s, contrast), 0.0, 1.0);
}

// Zonal flow: rotate object-space position about the spin axis by a
// latitude-dependent angle — easterly trades in the tropics, faster
// westerlies at mid-latitudes. Gives real shear between the belts.
vec3 ec_zonal(vec3 p, float t) {
  float ay = abs(p.y);
  float speed = mix(-0.7, 1.6, smoothstep(0.28, 0.62, ay));
  // Bounded shear (v10.0.12, bug #90): ang = t*speed accumulated
  // UNBOUNDED differential rotation — by late wrap (uTime→1e6, t→24)
  // adjacent latitudes had rotated apart by dozens of radians and the
  // noise field sheared into pencil-thin zonal streaks along the
  // subtropical transition belts (reported as "cloud streaks after
  // time changes": a date jump lands anywhere in the 0..1e6 wrap).
  // Split the motion: the RIGID mean rotation may grow freely (rotating
  // the sampling frame never distorts the pattern); the DIFFERENTIAL
  // part oscillates, capped at ±1.15/0.8 rad — the clean early-wrap
  // look at every uTime. sin(0.8t)/0.8 ≈ t for small t, so the launch
  // state and all early-wrap rendering are unchanged.
  float ang = t * 0.45 + (speed - 0.45) * sin(t * 0.8) / 0.8;
  float c = cos(ang), s = sin(ang);
  return vec3(p.x * c - p.z * s, p.y, p.x * s + p.z * c);
}

// One hurricane: spiral vortex at a fixed basin anchor (lat/lon degrees,
// chosen over open warm ocean), active only in that hemisphere's summer
// (sunY = object-space solar declination). Returns cloud opacity.
float ec_hurricane(vec3 p, float latDeg, float lonDeg, float sunY, float t) {
  float hemi = sign(latDeg);
  float season = smoothstep(0.05, 0.25, sunY * hemi);
  if (season < 0.001) return 0.0;
  float la = radians(latDeg), lo = radians(lonDeg) - t * 0.15; // slow westward track
  vec3 hc = vec3(cos(la) * cos(lo), sin(la), -cos(la) * sin(lo));
  float d = acos(clamp(dot(p, hc), -1.0, 1.0)) / 0.055; // ~700 km radius
  if (d > 1.6) return 0.0;
  vec3 e1 = normalize(cross(vec3(0.0, 1.0, 0.0), hc));
  vec3 e2 = cross(hc, e1);
  vec2 rel = vec2(dot(p - hc, e1), dot(p - hc, e2)) * hemi; // CCW north, CW south
  float spiral = ec_spiral(rel * 40.0, 2.0 / (d + 0.35), t * 8.0, d, t);
  float eye = smoothstep(0.06, 0.16, d);                 // clear eye at the center
  return spiral * eye * (1.0 - smoothstep(0.75, 1.5, d)) * season;
}

// === APPLY ===
float ec_cloud = 0.0;   // combined coverage
float ec_grey = 0.0;    // 0 = bright convective white, 1 = flat stratus grey
float ec_t = uTime * 0.00003;

float ec_ay = abs(vObjPos.y);
float ec_lon = atan(-vObjPos.z, vObjPos.x);
vec3 ec_flow = ec_zonal(vObjPos, ec_t * 0.8);

// ZONE WEIGHTS (y = sin latitude: 15deg=0.26, 35deg=0.57, 65deg=0.91)
float ec_subtrop = smoothstep(0.20, 0.40, ec_ay) * (1.0 - smoothstep(0.44, 0.62, ec_ay));
float ec_midlat  = smoothstep(0.50, 0.66, ec_ay) * (1.0 - smoothstep(0.88, 0.94, ec_ay));
float ec_polar   = smoothstep(0.88, 0.96, ec_ay);

// LAYER 1 — base coverage, thresholded by zone. The subtropical highs
// push the threshold up hard: only the strongest noise peaks survive,
// leaving the desert belt and subtropical oceans CLEAR.
{
  float cover = 0.30                  // scattered trade-wind cumulus baseline
              - 0.27 * ec_subtrop     // clear belt (~15-35 deg)
              + 0.30 * ec_midlat      // storm tracks
              + 0.24 * ec_polar;      // persistent stratus caps
  // Two scales: continent-sized systems (freq 9) carry the shape, a mid
  // scale (freq 26) breaks up their interiors. A single high frequency
  // here reads as uniform confetti — the systems must be LARGE.
  float weather = fbmN(ec_flow * 9.0, dOct) * 0.72
                + fbmN(ec_flow * 26.0 + vec3(31.7), dOct) * 0.28;
  float thr = 0.55 - cover;
  ec_cloud = smoothstep(thr, thr + 0.30, weather) * 0.85;
  ec_grey = ec_polar * 0.8;           // polar decks are flat and grey
}

// LAYER 2 — ITCZ: narrow broken band of deep convection hugging the
// equator, meandering with longitude and following the sun into the
// summer hemisphere (uSunObj.y is the seasonal declination).
{
  float yc = 0.30 * clamp(uSunObj.y, -0.45, 0.45)
           + 0.045 * snoise(vec3(cos(ec_lon), sin(ec_lon), 3.7) * 2.0 + ec_t);
  float band = exp(-pow((vObjPos.y - yc) / 0.055, 2.0));
  if (band > 0.001) {
    float convect = smoothstep(0.05, 0.55, fbmN(ec_flow * 18.0 + vec3(0.0, 17.1, 0.0), dOct));
    ec_cloud = max(ec_cloud, band * convect * 0.92);
  }
}

// LAYER 3 — mid-latitude comma swirls: domain-warped fbm so the fronts
// curl around lows instead of reading as straight streaks.
{
  if (ec_midlat > 0.001) {
    vec3 w = vec3(
      snoise(ec_flow * 5.0 + vec3(ec_t, 0.0, 0.0)),
      snoise(ec_flow * 5.0 + vec3(19.7, ec_t, 0.0)),
      snoise(ec_flow * 5.0 - vec3(0.0, 0.0, 7.3)));
    vec3 swirlPos = ec_flow * 8.0 + w * 2.0;
    swirlPos.y *= 1.6;                // stretch systems east-west
    float swirl = smoothstep(0.15, 0.62, fbmN(swirlPos, dOct));
    ec_cloud = max(ec_cloud, swirl * 0.72 * ec_midlat);
  }
}

// LAYER 4 — basin-aware hurricanes: anchors sit over the real warm-water
// nurseries (NW Pacific, NE Pacific, N Atlantic, S Indian), never over
// land, and only spin up in that hemisphere's summer.
{
  float tropo = 1.0 - smoothstep(0.38, 0.46, ec_ay);
  if (tropo > 0.001) {
    float h = 0.0;
    h = max(h, ec_hurricane(vObjPos,  16.0,  138.0, uSunObj.y, ec_t)); // NW Pacific
    h = max(h, ec_hurricane(vObjPos,  14.0, -118.0, uSunObj.y, ec_t)); // NE Pacific
    h = max(h, ec_hurricane(vObjPos,  18.0,  -55.0, uSunObj.y, ec_t)); // N Atlantic
    h = max(h, ec_hurricane(vObjPos, -14.0,   78.0, uSunObj.y, ec_t)); // S Indian
    ec_cloud = max(ec_cloud, h * 0.9 * tropo);
  }
}

// LAYER 5 — altitude-staged fine structure: below ~8,000 km the cloud
// EDGES erode into ragged puffs (footprint-faded so the extra octave never
// shimmers at distance). V5c bug #42: the old ±0.18 ADDITIVE term speckled
// entire decks with wall-to-wall dots at low altitude — the puff now only
// eats where coverage is mid-range (edges); dense centers and clear sky
// are untouched. Domain warp breaks the simplex-lattice dots-in-rows.
{
  float lowAlt = 1.0 - smoothstep(3000.0, 8000.0, uAltitude);
  if (lowAlt > 0.001 && ec_cloud > 0.001) {
    vec3 warp = ec_flow * 140.0 + snoise(ec_flow * 35.0) * 1.7;
    float puff = snoise(warp) * dtlFreqFade(ec_flow, 140.0) * 0.09;
    float edgeMask = clamp(1.0 - abs(ec_cloud - 0.5) * 2.5, 0.0, 1.0);
    ec_cloud = clamp(ec_cloud - puff * edgeMask * lowAlt, 0.0, 1.0);
  }
}

// Clouds catch sunlight; they FADE OUT into deep night (V5.1.2) — unlit
// clouds aren't visible in reality, and killing the layer in darkness also
// removes the relief-shading streaks the dark ambient exposed. Near the
// terminator they still catch the last light.
{
  float sunDot = dot(vObjPos, uSunObj);
  // V7 1b: thresholds come from earth.js shaderParams (dayFadeSoft0/1 =
  // -0.30/0.10, wide — the atmosphere scatters light past the terminator).
  float nightFade = sse_dayFade(sunDot, uDayFade0, uDayFade1);
  float lit = max(sunDot, 0.06);
  vec3 cloudCol = mix(vec3(0.973, 0.973, 1.0), vec3(0.80, 0.82, 0.86), ec_grey) * lit;
  float op = clamp(ec_cloud, 0.0, 0.92) * nightFade;
  detail = mix(detail, cloudCol, op);
  // Export the PRE-nightFade coverage for the lights chunk (v10.0.7):
  // the visual layer fades to nothing in darkness, but the cloud deck
  // is still there — city lights beneath must dim by it.
  gCloudCover = clamp(ec_cloud, 0.0, 0.92);
  // FAINT NIGHT CLOUDS (v10.0.10): earthshine/moonlight silhouettes.
  // COLOR-ONLY emissive — the diffuse path renders to 0/255 under the
  // night ambient (measured: whole night ocean grid at 0.0), and any
  // height term would resurrect the bug #48/#55 relief streaks. Gain
  // 0.085 is ACES-calibrated (the toe crushes ~6× harder than linear
  // estimates: 0.02 rendered 1.5/255 peak) — dense decks read ~5-11/255,
  // under the nightlights DARK_CAP (13) so cloud-covered Sahara/ocean
  // dark refs stay legal; clear gaps stay 0. (1.0 - nightFade) is
  // EXACTLY 0 on the day side — hazeprobe day pixels stay byte-identical.
  // Guard: tests/nightclouds.mjs (NC_TAG=after).
  gDetailEmissive += vec3(0.55, 0.62, 0.75) * 0.085
    * gCloudCover * (1.0 - nightFade) * uDetailBlend;
  // Height kept subtle: at low altitude + grazing sun the relief shading
  // turned cloud decks into big black lumps (V5b, measured at 382 km).
  // nightFade zeroes it in darkness with op.
  gDetailHeight += op * 0.10;
}
