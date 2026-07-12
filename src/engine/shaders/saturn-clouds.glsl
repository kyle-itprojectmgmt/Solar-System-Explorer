// Saturn procedural clouds — pale serene banding with polar hexagon (v6.0+).
// The subtle palette and gentle turbulence read as Saturn's soft, ammonia-ice deck.
// Latitude-dependent zonal flow creates the faint belt structure; the north polar
// hexagon is a real atmospheric feature. Activation: uDetailBlend gates on altitude.
// Injected into the 'kronos' detail style; the style provides the preamble
// (dBase/detail) and the final mix. Extra uniforms: uSunObj.

// Zonal flow: rotate object-space position about the spin axis by a
// latitude-dependent angle — gentler than Earth or Jupiter. Equator moves ~1.0,
// poles slow to ~0.75 (Saturn's differentially rotating cloud deck).
vec3 sc_zonal(vec3 p, float t) {
  float ay = abs(p.y);
  float speed = mix(0.75, 1.0, smoothstep(0.0, 0.8, 1.0 - ay));
  float ang = t * speed;
  float c = cos(ang), s = sin(ang);
  return vec3(p.x * c - p.z * s, p.y, p.x * s + p.z * c);
}

// === APPLY ===
float sc_cloud = 0.0;    // combined coverage
float sc_t = uTime * 0.000012;

float sc_ay = abs(vObjPos.y);
float sc_lon = atan(vObjPos.z, vObjPos.x);
vec3 sc_flow = sc_zonal(vObjPos, sc_t * 0.5);

// Zone weights: Saturn's belts are faint compared to Jupiter.
// y = sin(latitude): ~17 deg = 0.29, ~35 deg = 0.57, ~50 deg = 0.77
float sc_subtrop = smoothstep(0.15, 0.35, sc_ay) * (1.0 - smoothstep(0.40, 0.60, sc_ay));
float sc_midlat  = smoothstep(0.45, 0.62, sc_ay) * (1.0 - smoothstep(0.82, 0.92, sc_ay));
float sc_polar   = smoothstep(0.85, 0.94, sc_ay);

// Capture baseline for night fade
float sc_h0 = gDetailHeight;
vec3 sc_c0 = detail;

// LAYER 1 — base coverage: Saturn is hazier and less contrasty than Jupiter.
// Thresholds gentler so more sky shows through even at high latitudes.
{
  float cover = 0.25                  // baseline haze
              - 0.20 * sc_subtrop     // subtropical clear belt
              + 0.22 * sc_midlat      // storm zones (rarer)
              + 0.18 * sc_polar;      // polar stratus
  // Two scales: large systems at freq 7, mid detail at freq 22.
  float weather = fbmN(sc_flow * 7.0, dOct) * 0.68
                + fbmN(sc_flow * 22.0 + vec3(19.5), dOct) * 0.32;
  float thr = 0.60 - cover;
  sc_cloud = smoothstep(thr, thr + 0.28, weather) * 0.80;
}

// LAYER 2 — per-latitude band palette (post-v7 hardware fix: the
// texture-luminance version read as one uniform tan — measured 4%
// zone/belt contrast). Distinct cream zones / warm brown belts /
// blue-grey poles, with crisp transitions (blend width halved vs the
// first cut) and fbm meander so band edges aren't machined circles.
// The base texture's real storm features survive as a brightness
// modulation on top of the palette.
{
  float sc_lat = abs(asin(clamp(vObjPos.y, -1.0, 1.0)));
  vec3 sc_zoneColor = vec3(0.96, 0.93, 0.82);   // bright cream
  vec3 sc_beltColor = vec3(0.72, 0.52, 0.30);   // warm brown
  vec3 sc_polarColor = vec3(0.48, 0.56, 0.62);  // blue-grey

  // ~5 alternating bands per hemisphere, edges meandered by fbm.
  float sc_bandPos = fract(sc_lat * 3.5 + fbm3(vObjPos * 4.0) * 0.15);
  float sc_isBelt = smoothstep(0.35, 0.45, sc_bandPos)
                  * (1.0 - smoothstep(0.85, 0.95, sc_bandPos));
  float sc_isPolar = smoothstep(1.05, 1.22, sc_lat);

  vec3 sc_bandColor = mix(sc_zoneColor, sc_beltColor, sc_isBelt);
  sc_bandColor = mix(sc_bandColor, sc_polarColor, sc_isPolar);

  // North polar hexagon REGION tint (Fix D): the whole cap above ~69°N
  // shifts blue-grey — the hexagon boundary layer below adds the shape.
  float sc_hexRegion = smoothstep(1.20, 1.35, sc_lat) * step(0.0, vObjPos.y);
  sc_bandColor = mix(sc_bandColor, vec3(0.40, 0.52, 0.65), sc_hexRegion * 0.6);

  // Palette leads; texture luminance carries the real storm detail.
  float sc_texLum = dot(detail, vec3(0.299, 0.587, 0.114));
  detail = mix(detail, sc_bandColor * (0.55 + 0.6 * sc_texLum), 0.62);
}

// LAYER 3 — altitude-staged fine structure below 15,000 km
{
  float altStaged = 1.0 - smoothstep(8000.0, 15000.0, uAltitude);
  if (altStaged > 0.001 && sc_cloud > 0.001) {
    float fineNoise = fbm3(sc_flow * 35.0 + vec3(11.2)) * 0.12;
    sc_cloud = clamp(sc_cloud + fineNoise * altStaged * 0.15, 0.0, 1.0);
  }
}

// LAYER 4 — color-only fine layer below 4,000 km (faded by dtlFreqFade)
{
  float lowAlt = 1.0 - smoothstep(1500.0, 4000.0, uAltitude);
  if (lowAlt > 0.001) {
    vec3 fineWarp = sc_flow * 140.0 + snoise(sc_flow * 40.0) * 1.2;
    float fineColor = snoise(fineWarp) * dtlFreqFade(sc_flow, 140.0) * 0.08;
    detail = mix(detail, detail * (1.0 + fineColor * 0.3), lowAlt * 0.12);
  }
}

// LAYER 5 — 4:1 latitude-stretched wisps (faint cloud streaks)
{
  float wispNoise = snoise(vec3(dUv.x * 80.0, dUv.y * 320.0, 5.5 + sc_t * 2.0)) * 0.05
    * dtlFreqFade2(dUv, 320.0); // fade before the wisps go sub-pixel (house rule)
  float wispMask = abs(snoise(vec3(dUv.x * 40.0, sc_t, 7.1)));
  detail = mix(detail, detail * (1.0 + wispNoise * 0.4), wispMask * 0.08);
}

// LAYER 6 — NORTH POLAR HEXAGON (real atmospheric feature at ~75°N)
{
  float sc_polMask = smoothstep(0.962, 0.985, vObjPos.y);  // active > ~75°N
  if (sc_polMask > 0.001) {
    // Hexagonal boundary: oscillates with 6-fold symmetry in longitude
    float sc_hexEdge = 0.966 + 0.006 * cos(6.0 * sc_lon + sc_t * 0.3);
    float sc_inside = smoothstep(sc_hexEdge - 0.002, sc_hexEdge, vObjPos.y);

    // Inside the hexagon: tint toward blue-grey and add swirl
    vec3 sc_hexColor = vec3(0.533, 0.592, 0.667);  // blue-grey #8898AA
    vec3 sc_swirl = vec3(
      snoise(sc_flow * 8.0 + vec3(sc_t * 0.2, 0.0, 0.0)),
      snoise(sc_flow * 8.0 + vec3(19.5, sc_t * 0.2, 0.0)),
      snoise(sc_flow * 8.0 - vec3(0.0, 0.0, 11.1))
    ) * 0.8;
    vec3 sc_swirledPos = sc_flow * 20.0 + sc_swirl;
    float sc_hexSwirl = fbm3(sc_swirledPos) * 0.15;

    detail = mix(detail, sc_hexColor * (1.0 + sc_hexSwirl * 0.2), sc_inside * sc_polMask * 0.45);

    // Hexagonal wall brightness line right at the edge. (Review fix:
    // smoothstep(hi, lo, x) with hi > lo is UNDEFINED per the GLSL spec —
    // use 1.0 - smoothstep(lo, hi, x) for the downhill side.)
    float sc_wallLine = smoothstep(sc_hexEdge - 0.003, sc_hexEdge - 0.001, vObjPos.y) *
                        (1.0 - smoothstep(sc_hexEdge + 0.001, sc_hexEdge + 0.003, vObjPos.y));
    detail = mix(detail, detail * 1.15, sc_wallLine * sc_polMask * 0.08);

    gDetailHeight += sc_inside * sc_polMask * 0.08;
  }
}

// Height: band turbulence relief, ~0.25 scale
{
  float bandHeight = fbmN(sc_flow * 18.0, dOct) * 0.18;
  float hMask = clamp(1.0 - abs(sc_cloud - 0.5) * 2.5, 0.0, 1.0);
  gDetailHeight += bandHeight * hMask * 0.25 * (1.0 - smoothstep(0.0, 12000.0, uAltitude));
}

// Clouds fade out into night (like Mars pattern) — no visible relief on dark side.
{
  float sc_sunDot = dot(vObjPos, uSunObj);
  float sc_dayFade = sse_dayFade(sc_sunDot, uDayFade0, uDayFade1);
  float sc_lit = max(sc_sunDot, 0.05);

  // Pale Saturn cloud color
  vec3 sc_cloudCol = mix(vec3(0.96, 0.94, 0.88), vec3(0.90, 0.85, 0.76), 1.0 - sc_cloud);
  float sc_op = clamp(sc_cloud, 0.0, 0.88) * sc_dayFade * sc_lit;

  detail = mix(detail, sc_cloudCol, sc_op * 0.6);
  gDetailHeight = sc_h0 + (gDetailHeight - sc_h0) * sc_dayFade;
  detail = mix(sc_c0, detail, sc_dayFade);
}
