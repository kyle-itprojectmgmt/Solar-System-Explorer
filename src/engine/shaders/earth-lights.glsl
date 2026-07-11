// Earth city lights: procedural night-side luminescence via procedural population.
// Activation: gated by night-side smoothstep; active everywhere below ~50,000 km.
// UNIFORMS: none

if (uDetailBlend > 0.001) {
  float dLum = dot(dBase, vec3(0.299, 0.587, 0.114));

  // Night side: 0 on day, 1 in deep night (note reversed smoothstep edges)
  float night = smoothstep(0.1, -0.1, dot(vObjPos, uSunObj));

  if (night > 0.001) {
    // Land mask: lights only where blue does NOT dominate (oceans are blue)
    float landMask = step(dBase.b, dBase.r + dBase.g);

    // CONTINENT-SCALE mask: low-frequency noise on object space, raised to power
    float continentBase = fbmN(vObjPos * 4.0, 3);  // 3-4 octaves only, coarse
    float continentMask = pow(abs(continentBase), 1.5);  // concentrate at highs

    // MID-FREQUENCY CLUSTERS: worley2 on UV-space for city cluster cores
    vec2 clusterUv = dUv * 80.0;
    vec2 worleyCell = worley2(clusterUv);
    float clusterF1 = worleyCell.x;
    float clusterIntensity = 1.0 - clusterF1 * 0.8;  // cells GLOW at centers
    clusterIntensity *= dtlFreqFade2(clusterUv, 80.0);  // anti-shimmer

    // HIGH-FREQUENCY SPECKLE: individual cities as thresholded noise
    float citySpeckle = snoise(vObjPos * 250.0);
    float cityMask = dtlAAstep(0.55, 0.95, citySpeckle) * dtlFreqFade(vObjPos, 250.0);

    // Bias toward northern mid-latitudes (0.1 < vObjPos.y < 0.75)
    float latBias = smoothstep(0.1, 0.4, vObjPos.y) * smoothstep(0.75, 0.5, vObjPos.y);
    latBias = mix(0.4, 1.0, latBias);  // 0.4 outside band, 1.0 inside

    // Combine population layers
    float popDensity = continentMask * (0.3 + 0.7 * clusterIntensity)
                     + cityMask * 0.4;
    popDensity *= landMask * latBias;
    popDensity = clamp(popDensity, 0.0, 1.0);

    // Color base: warm #FFD080 (warm yellow-orange for city lights)
    vec3 lightWarm = vec3(1.0, 0.816, 0.502);  // #FFD080
    // Mix toward cooler #E8F0FF at high cluster intensity (downtown cores)
    vec3 lightCool = vec3(0.910, 0.941, 1.0);  // #E8F0FF
    vec3 lightColor = mix(lightWarm, lightCool, clusterIntensity * 0.5);

    // Add base city glow
    gDetailEmissive += lightColor * popDensity * night * uDetailBlend * 0.35;

    // RARE LIGHTNING: subtle blue-white flashes in high-cloud regions
    // Use low-freq storm mask reused from earlier
    float stormMask = smoothstep(0.4, 0.7, fbmN(vObjPos * 12.0, 3));
    // Flash gate: very brief (fract-based), high threshold so extremely rare
    float cellHashFlash = fract(snoise(vec3(floor(uTime * 8.0) * 0.13, sin(vObjPos.y) * 7.7, 13.3)));
    float flashGate = step(0.998, cellHashFlash);  // ~0.2% of frames per region
    vec3 lightningColor = vec3(0.8, 0.9, 1.0);  // #CCE6FF pale blue-white
    gDetailEmissive += lightningColor * flashGate * stormMask * night * uDetailBlend * 0.15;
  }
}
