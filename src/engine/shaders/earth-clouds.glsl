// Earth procedural clouds — atmospheric circulation model (v5a rewrite).
// The zone STRUCTURE is the point: Earth reads as Earth because of the
// alternating pattern ITCZ white band -> clear subtropical desert belt ->
// mid-latitude comma swirls -> polar grey. Coverage is deliberately modest
// outside the storm tracks so the Sahara and open ocean show through.
// Activation: uDetailBlend gates on altitude (0 above 50,000 km).
// Injected into the 'terra' detail style; the style provides the preamble
// (dBase/detail) and the final mix. Extra uniforms: uSunObj.

float ec_spiral(vec2 pos, float rate, float rot) {
  float r = length(pos);
  float ang = atan(pos.y, pos.x);
  float ang_spiral = ang - rate / max(r, 0.01) + rot;
  return sin(ang_spiral * 3.5) * 0.5 + 0.5;
}

// Zonal flow: rotate object-space position about the spin axis by a
// latitude-dependent angle — easterly trades in the tropics, faster
// westerlies at mid-latitudes. Gives real shear between the belts.
vec3 ec_zonal(vec3 p, float t) {
  float ay = abs(p.y);
  float speed = mix(-0.7, 1.6, smoothstep(0.28, 0.62, ay));
  float ang = t * speed;
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
  float spiral = ec_spiral(rel * 40.0, 2.0 / (d + 0.35), t * 8.0);
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
// edges erode into puffs instead of smooth blobs (footprint-faded so the
// extra octave never shimmers at distance).
{
  float lowAlt = 1.0 - smoothstep(3000.0, 8000.0, uAltitude);
  if (lowAlt > 0.001 && ec_cloud > 0.001) {
    float puff = snoise(ec_flow * 140.0) * dtlFreqFade(ec_flow, 140.0);
    ec_cloud = clamp(ec_cloud + puff * 0.18 * lowAlt * smoothstep(0.05, 0.4, ec_cloud), 0.0, 1.0);
  }
}

// Clouds catch sunlight; they FADE OUT into deep night (V5.1.2) — unlit
// clouds aren't visible in reality, and killing the layer in darkness also
// removes the relief-shading streaks the dark ambient exposed. Near the
// terminator they still catch the last light.
{
  float sunDot = dot(vObjPos, uSunObj);
  float nightFade = smoothstep(-0.3, 0.1, sunDot);
  float lit = max(sunDot, 0.06);
  vec3 cloudCol = mix(vec3(0.973, 0.973, 1.0), vec3(0.80, 0.82, 0.86), ec_grey) * lit;
  float op = clamp(ec_cloud, 0.0, 0.92) * nightFade;
  detail = mix(detail, cloudCol, op);
  // Height kept subtle: at low altitude + grazing sun the relief shading
  // turned cloud decks into big black lumps (V5b, measured at 382 km).
  // nightFade zeroes it in darkness with op.
  gDetailHeight += op * 0.10;
}
