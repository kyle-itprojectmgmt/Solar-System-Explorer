// Earth ocean detail: sun glint, wave perturbation, whitecaps.
// Fragment chunk injected into planet surface material.
// Extra uniforms used: uSunObj (object-space sun dir), uCamObj (object-space camera pos).

// Identify ocean regions: deep blue channel dominates land in Earth texture.
float oceanMask = smoothstep(0.02, 0.12, dBase.b - max(dBase.r, dBase.g) + 0.04);

if (oceanMask > 0.001 && uDetailBlend > 0.001) {
  // Object-space camera direction (already normalized in detailShaders).
  vec3 viewDirObj = normalize(uCamObj);

  // Dayside check: only show glint on sunlit hemisphere.
  float dayside = max(dot(vObjPos, uSunObj), 0.0);

  // ========== SUN GLINT ==========
  // Specular reflection of sunlight off the ocean surface.
  vec3 nBase = vObjPos;

  // Wave perturbation below 5000 km: high-frequency noise perturbs the normal.
  float waveScale = 1.0 - smoothstep(500.0, 5000.0, uAltitude);
  if (waveScale > 0.001) {
    // Small high-frequency noise (freq ~300-800 Hz in screen space).
    vec3 wavePos = vObjPos * 500.0;
    float wavePert = snoise(wavePos + uTime * 0.0005) * dtlFreqFade(vObjPos, 500.0);
    // Additional octave for finer detail, faded at sub-pixel frequencies.
    wavePert += 0.5 * snoise(wavePos * 2.0 + uTime * 0.0008) * dtlFreqFade(vObjPos, 1000.0);
    wavePert *= 0.02 * waveScale; // amplitude ~0.02

    // Perturb the normal with a small tangent offset. (Do NOT normalize the
    // offset alone — normalize(v * k) == normalize(v) cancels the amplitude.)
    nBase = normalize(nBase + vec3(0.3, 0.5, 0.2) * wavePert);
  }

  // Glint calculation: reflected sun direction aligned with camera view.
  vec3 R = reflect(-uSunObj, nBase);
  float align = max(dot(R, viewDirObj), 0.0);
  // V5c bug #42: a fixed pow(400) rendered a ~450 km undithered white disc
  // at 2,000 km (normal rotation and view rotation nearly cancel at that
  // altitude, so the lobe decays very slowly across the surface). Sharpness
  // now scales with altitude — very tight point close, softer wide sparkle
  // far — and a screen-space dither feathers the rim.
  float sharpness = mix(6000.0, 150.0, smoothstep(2000.0, 20000.0, uAltitude));
  float glint = pow(align, sharpness) * oceanMask * dayside;
  float dither = (fract(gl_FragCoord.x * 0.5 + gl_FragCoord.y) - 0.5) * 0.15;
  glint = clamp(glint + dither * glint, 0.0, 1.0);

  // Bright white-gold glint, additive into emissive. The 2.5 rise + cap
  // keeps a hot tight core without a blinding saturated plateau.
  vec3 glintColor = vec3(1.0, 0.95, 0.8); // white-gold
  gDetailEmissive += glintColor * min(glint * 2.5, 1.5) * uDetailBlend;

  // ========== WHITECAPS ==========
  // Faint white flecks at mid-latitudes, indicating wave action.
  float midLatMask = smoothstep(0.5, 0.52, abs(vObjPos.y)) *
                     (1.0 - smoothstep(0.85, 0.87, abs(vObjPos.y)));

  if (midLatMask > 0.001 && dayside > 0.3) {
    // High-frequency noise (freq ~600 Hz), thresholded for speckles.
    vec3 whitecapPos = vObjPos * 600.0 + uTime * vec3(0.0001, 0.0, 0.0002);
    float whitecapNoise = snoise(whitecapPos);
    whitecapNoise = dtlAAstep(0.55, 0.75, whitecapNoise); // sharp threshold

    // Fade sub-pixel frequencies to prevent shimmer (fade takes the
    // UNSCALED position plus the layer frequency).
    whitecapNoise *= dtlFreqFade(vObjPos, 600.0);

    // Apply faint white over ocean at mid-latitudes.
    float whitecapOpacity = whitecapNoise * midLatMask * 0.12; // opacity ≤ 0.15
    vec3 whitecapColor = vec3(0.95, 0.98, 1.0); // near-white
    detail = mix(detail, whitecapColor, whitecapOpacity);
  }
}
