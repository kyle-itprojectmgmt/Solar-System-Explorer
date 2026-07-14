// Earth city lights — hardcoded population-density regions (v5a rewrite).
// From high altitude the night side must read like the real Black Marble:
// Western Europe, Japan, and the US East Coast clearly dominant, the other
// regions present but secondary, and near-darkness over the Sahara, the
// Amazon, Siberia, Australia's interior, and the oceans. The old uniform
// noise lit every landmass equally. Cluster/speckle noise now only adds
// texture WITHIN a region.

// Gaussian population blob on the sphere. (latDeg, lonDeg) center,
// radDeg angular radius, w peak weight.
float el_pop(vec3 p, float latDeg, float lonDeg, float radDeg, float w) {
  float la = radians(latDeg), lo = radians(lonDeg);
  vec3 c = vec3(cos(la) * cos(lo), sin(la), -cos(la) * sin(lo));
  float d = acos(clamp(dot(p, c), -1.0, 1.0)) / radians(radDeg);
  return w * exp(-d * d * 3.0);
}

// Sum of the major population centers, Black Marble calibrated.
float el_population(vec3 p) {
  float pop = 0.0;
  // Dominant three (+20% V5.1.2 — must read clearly over the dark ambient)
  pop += el_pop(p,  40.5,  -74.5,  9.0, 1.20);  // US East Coast (BosWash)
  pop += el_pop(p,  48.5,    6.0, 11.0, 1.20);  // Western Europe
  pop += el_pop(p,  35.8,  137.8,  5.5, 1.20);  // Japan
  // Secondary
  pop += el_pop(p,  52.5,   -1.5,  4.0, 0.80);  // UK
  pop += el_pop(p,  41.8,  -87.7,  7.0, 0.70);  // US Midwest / Great Lakes
  pop += el_pop(p,  35.0, -117.5,  6.0, 0.60);  // US West Coast
  pop += el_pop(p,  37.4,  127.2,  3.5, 0.85);  // South Korea
  pop += el_pop(p,  32.5,  117.5,  9.0, 0.80);  // eastern China
  pop += el_pop(p,  23.0,  113.5,  3.5, 0.85);  // Pearl River Delta
  pop += el_pop(p,  25.5,   82.0,  9.0, 0.75);  // Ganges plain
  pop += el_pop(p,  28.6,   77.0,  4.0, 0.70);  // NW India (Delhi)
  pop += el_pop(p,  30.1,   31.3,  3.0, 0.70);  // Nile delta
  pop += el_pop(p,  28.5,   48.5,  6.0, 0.50);  // Persian Gulf
  pop += el_pop(p,  14.0,  100.8,  5.0, 0.50);  // SE Asia (Bangkok)
  pop += el_pop(p,  -6.9,  108.5,  5.0, 0.55);  // Java
  pop += el_pop(p, -23.3,  -45.8,  6.0, 0.60);  // SE Brazil
  pop += el_pop(p, -34.6,  -58.5,  4.0, 0.50);  // Rio de la Plata
  pop += el_pop(p,  19.4,  -99.1,  4.0, 0.50);  // Mexico City
  pop += el_pop(p,   6.5,    3.5,  4.0, 0.40);  // Lagos / Gulf of Guinea
  pop += el_pop(p, -26.2,   28.0,  3.5, 0.55);  // Gauteng (Johannesburg–Pretoria)
  pop += el_pop(p, -33.9,   18.5,  2.0, 0.35);  // Cape Town
  pop += el_pop(p,  55.8,   37.6,  3.0, 0.45);  // Moscow
  return pop;
}

// === APPLY ===
if (uDetailBlend > 0.001) {
  // Night side: 0 on day, 1 in deep night (note reversed smoothstep edges)
  float night = smoothstep(0.1, -0.1, dot(vObjPos, uSunObj));

  if (night > 0.001) {
    if (uUseNightMap > 0.5) {
    // REAL BLACK MARBLE (v10.0.6, SSS 8K night map): geographic truth
    // replaces the 22-gaussian model. The sampler is sRGB-tagged so this
    // returns linear. The map carries a faint dark-blue ocean/terrain
    // cast (~13/255) — subtract a linear black floor BEFORE the contrast
    // boost, or the Sahara/Congo re-light at ~8% (the exact false-glow
    // class the v10.0.4 rural gate killed; nightlights.mjs caps dark
    // land at 13/255).
    vec3 bm = max(texture2D(uNightMap, dUv).rgb - 0.02, 0.0);
    bm = pow(bm, vec3(0.8)) * 1.4;
    gDetailEmissive += bm * night * uDetailBlend;
    } else {
    // PROCEDURAL FALLBACK — the v5a..v10.0.4 gaussian model, used until
    // the night map streams in (and by any future terra body without one).
    // Land mask: lights only where blue does NOT dominate (oceans are blue).
    // Trims region gaussians that spill over coastlines.
    float landMask = step(dBase.b, dBase.r + dBase.g);

    // REGION LAYER — the hardcoded density map. Dominates at all altitudes;
    // everything below only shapes light within it.
    float region = clamp(el_population(vObjPos), 0.0, 1.35); // ceiling above the boosted peaks

    // MID-FREQUENCY CLUSTERS: worley cells give metro-area structure.
    vec2 clusterUv = dUv * 80.0;
    vec2 worleyCell = worley2(clusterUv);
    float clusterIntensity = (1.0 - worleyCell.x * 0.8) * dtlFreqFade2(clusterUv, 80.0);

    // HIGH-FREQUENCY SPECKLE: individual cities (fades out at distance,
    // leaving the region glow — exactly how Black Marble reads from high up).
    // Domain-warped (V5.1.2): raw simplex peaks align along the noise
    // lattice and read as uniform DOTS IN ROWS from ~2,000 km — reported
    // as "stars rendering on the surface" (measured: identical dot field
    // with the star Points hidden). The warp breaks the row alignment and
    // a second noise varies each dot's brightness so they read as cities.
    vec3 spWarp = vec3(
      snoise(vObjPos * 37.0), snoise(vObjPos * 37.0 + 11.3),
      snoise(vObjPos * 37.0 - 5.9)) * 0.012;
    float citySpeckle = snoise((vObjPos + spWarp) * 250.0);
    float cityMask = dtlAAstep(0.55, 0.95, citySpeckle) * dtlFreqFade(vObjPos, 250.0)
                   * (0.35 + 0.65 * (snoise(vObjPos * 91.0 + 3.1) * 0.5 + 0.5));

    // FAINT RURAL BACKGROUND: sparse dim glow around the metro regions.
    // Gated by region density — ungated, this term lit every landmass and
    // read as false light pollution over the Sahara, the Congo basin, and
    // the Kalahari (Black Marble shows those as dark as open ocean).
    float rural = pow(abs(fbmN(vObjPos * 4.0, 3)), 1.5) * 0.06
                * smoothstep(0.05, 0.30, region);

    float popDensity = region * (0.30 + 0.70 * clusterIntensity)
                     + region * cityMask * 0.5
                     + rural;
    popDensity *= landMask;
    popDensity = clamp(popDensity, 0.0, 1.0);

    // Warm sodium base -> cooler downtown cores at cluster centers.
    vec3 lightWarm = vec3(1.0, 0.816, 0.502);   // #FFD080
    vec3 lightCool = vec3(0.910, 0.941, 1.0);   // #E8F0FF
    vec3 lightColor = mix(lightWarm, lightCool, clusterIntensity * 0.5);

    // 0.7: paired with nightAmbient 0x445566 × 0.08 (terrain ~3-5%
    // silhouettes) — lights must clearly dominate the night side.
    gDetailEmissive += lightColor * popDensity * night * uDetailBlend * 0.7;
    }

    // RARE LIGHTNING: subtle blue-white flashes in storm regions.
    float stormMask = smoothstep(0.4, 0.7, fbmN(vObjPos * 12.0, 3));
    float cellHashFlash = fract(snoise(vec3(floor(uTime * 8.0) * 0.13, sin(vObjPos.y) * 7.7, 13.3)));
    float flashGate = step(0.998, cellHashFlash);  // ~0.2% of frames per region
    gDetailEmissive += vec3(0.8, 0.9, 1.0) * flashGate * stormMask * night * uDetailBlend * 0.15;
  }
}
