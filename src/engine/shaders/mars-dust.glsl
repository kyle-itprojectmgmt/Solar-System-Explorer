// Mars procedural dust and regional storms — suspended atmosphere layer.
// Dust is the signature Mars atmospheric feature: regional patches, seasonal
// dust storms (global opacity driven by uDustStorm), and small dust devils.
// Rendered as a semi-transparent overlay, it FADES INTO NIGHT so sunlit dust
// is visible but the planet doesn't glow in darkness.

// Regional dust patch noise: slow continental-scale drifting field.
// Thresholded so most latitudes stay CLEAR at default (uDustStorm = 0.2).
float ms2_dustField(vec3 p, float t, int octaves) {
  float dustT = t * 0.00002;
  vec3 fieldPos = p * 3.0 + vec3(dustT, 0.0, -dustT * 0.7);
  return fbmN(fieldPos, octaves);
}

// Small dust vortex: anchored on-sphere at (latDeg, lonDeg), slowly drifting westward.
// Angular radius ~0.006 rad; spiral texture with fbm bend to avoid machine-like appearance.
float ms2_dustDevil(vec3 p, float latDeg, float lonDeg, float t) {
  float hemi = sign(latDeg);
  float la = radians(latDeg), lo = radians(lonDeg) - t * 0.08; // westward drift
  vec3 vc = vec3(cos(la) * cos(lo), sin(la), -cos(la) * sin(lo));
  float d = acos(clamp(dot(p, vc), -1.0, 1.0)) / 0.006; // angular radius ~0.006 rad
  if (d > 1.6) return 0.0;

  // Orthonormal frame around the vortex center
  vec3 e1 = normalize(cross(vec3(0.0, 1.0, 0.0), vc));
  vec3 e2 = cross(vc, e1);
  vec2 rel = vec2(dot(p - vc, e1), dot(p - vc, e2));

  // Spiral with fbm phase noise to break up the pattern. rel spans only
  // ±0.01 — scale it up hard or the fbm is a constant and does nothing.
  float bearing = atan(rel.y, rel.x);
  float fbmPhase = fbm3(vec3(rel * 400.0, 2.7 + t)) * 0.8;
  float spiral = sin(bearing * 2.0 + fbmPhase - d * 12.0) * 0.5 + 0.5;
  float eye = smoothstep(0.08, 0.20, d);

  return spiral * eye * (1.0 - smoothstep(0.75, 1.4, d)) * 0.25;
}

// === APPLY ===

float ms2_t = uTime * 0.00003;
float ms2_coverage = 0.0;
vec3 ms2_dustColor = vec3(0.0);

// LAYER 1 — regional dust patches
{
  float patch = ms2_dustField(vObjPos, uTime, dOct);
  float patchOp = smoothstep(0.5, 0.8, patch);

  // Southern hemisphere spring/summer bias: dust season when uSunObj.y < 0
  float seasonBias = 0.6 + 0.4 * smoothstep(0.1, 0.4, -uSunObj.y);
  patchOp *= seasonBias;

  ms2_coverage = patchOp;

  // Tan-orange dust color, slightly warmer at higher opacity
  vec3 dustWarm = vec3(0.83, 0.58, 0.42);
  vec3 dustHot = vec3(0.91, 0.69, 0.50);
  ms2_dustColor = mix(dustWarm, dustHot, patchOp);
}

// LAYER 2 — storm intensity overlay (uDustStorm 0..1)
{
  float cover = mix(ms2_coverage, 0.92, smoothstep(0.15, 0.95, uDustStorm));

  // At full storm, keep subtle swirl texture in the dust (mid-freq fbm, slow drift)
  float swirl = fbmN(vObjPos * 8.0 + vec3(0.0, ms2_t * 0.3, 0.0), dOct) * 0.06;
  float stormSwirl = mix(0.0, swirl, smoothstep(0.8, 1.0, uDustStorm));
  ms2_dustColor = mix(ms2_dustColor, ms2_dustColor * 0.97, stormSwirl);

  ms2_coverage = cover;
}

// LAYER 3 — dust devils in the equatorial band (below 2000 km altitude)
{
  float lowAlt = 1.0 - smoothstep(500.0, 2000.0, uAltitude);
  if (lowAlt > 0.001) {
    float lat = asin(clamp(vObjPos.y, -1.0, 1.0));
    float tropicMask = 1.0 - smoothstep(0.45, 0.52, abs(lat)); // |lat| < 30°

    if (tropicMask > 0.001) {
      // 4-6 anchored vortices, gradually drifting westward with time
      // Equatorial-band anchors over classic dust-devil country.
      float devils = 0.0;
      devils = max(devils, ms2_dustDevil(vObjPos,  18.0,  -65.0, ms2_t)); // Chryse / Xanthe
      devils = max(devils, ms2_dustDevil(vObjPos,  12.0,   35.0, ms2_t)); // Syrtis approaches
      devils = max(devils, ms2_dustDevil(vObjPos,  -8.0,  155.0, ms2_t)); // Elysium plains
      devils = max(devils, ms2_dustDevil(vObjPos,  24.0, -120.0, ms2_t)); // Tharsis slopes

      ms2_coverage = max(ms2_coverage, devils * lowAlt * tropicMask);
    }
  }
}

// LAYER 4 — night fade: dust is sunlit haze
{
  float sunDot = dot(vObjPos, uSunObj);
  float nightFade = smoothstep(-0.25, 0.1, sunDot);

  float lit = max(sunDot, 0.08); // minimal ambient for horizon glow
  vec3 litDust = ms2_dustColor * lit;
  float op = clamp(ms2_coverage, 0.0, 0.92) * nightFade;

  detail = mix(detail, litDust, op);
  gDetailHeight += op * 0.05;
}
