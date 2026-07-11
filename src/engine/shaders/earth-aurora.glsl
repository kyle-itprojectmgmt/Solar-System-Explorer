// Earth auroral ovals: high-altitude luminescent curtains around magnetic poles.
// Activation: visible 1,000-3,000 km altitude; very subtle at edge altitudes.
// UNIFORMS: none

if (uDetailBlend > 0.001) {
  // Aurora activation ramps from 0 at 1,000 km to full at 3,000 km
  float auroraAct = smoothstep(1000.0, 3000.0, uAltitude) * uDetailBlend;

  if (auroraAct > 0.001) {
    // Approximate magnetic pole directions (unit vectors)
    // North: ~82°N, 111°W
    vec3 poleNorth = normalize(vec3(-0.05, 0.99, 0.13));
    // South: ~74°S, 127°E
    vec3 poleSouth = normalize(vec3(-0.17, -0.96, -0.22));

    // Compute angle from each pole (in radians; 8° ≈ 0.14 rad, 16° ≈ 0.28 rad)
    float angleN = acos(clamp(dot(vObjPos, poleNorth), -1.0, 1.0));
    float angleS = acos(clamp(dot(vObjPos, poleSouth), -1.0, 1.0));

    // Oval band: 8°-16° from pole (smoothstep "box" pattern)
    float bandN = smoothstep(0.14, 0.24, angleN) * smoothstep(0.28, 0.20, angleN);
    float bandS = smoothstep(0.14, 0.24, angleS) * smoothstep(0.28, 0.20, angleS);
    float ovalMask = max(bandN, bandS);

    if (ovalMask > 0.001) {
      // Curtain structure: stretched noise (10:1 longitude > latitude) + shimmer + drift
      vec3 curtainPos = vObjPos * vec3(80.0, 30.0, 80.0);  // longitude stretched
      curtainPos.x += uTime * 0.02;  // slow westward drift
      float shimmer = sin(uTime * 0.1) * 0.3 + 0.5;  // oscillates [0.2, 0.8]

      float curtainNoise = snoise(curtainPos) * shimmer;
      curtainNoise *= dtlFreqFade(vObjPos, 80.0);  // anti-shimmer
      curtainNoise = smoothstep(0.2, 0.8, curtainNoise);

      // Global solar activity modulation (slow breathing, ~0.5 ± 0.5)
      float activity = 0.5 + 0.5 * snoise(vec3(uTime * 0.001));

      // Color palette: green base, purple at intensity peaks, pink at fringes
      vec3 auroraGreen = vec3(0.0, 1.0, 0.533);    // #00FF88
      vec3 auroraPurple = vec3(0.533, 0.267, 1.0); // #8844FF
      vec3 auroraPink = vec3(1.0, 0.4, 0.533);     // #FF6688

      // Mix: green -> purple as curtain value rises, pink at low values
      vec3 auroraColor = mix(auroraGreen, auroraPurple, curtainNoise);
      auroraColor = mix(auroraPink, auroraColor, smoothstep(0.0, 0.3, curtainNoise));

      // Brighter on night side (0.35 min, 1.0 on full night)
      float nightMod = 0.35 + 0.65 * smoothstep(0.2, -0.3, dot(vObjPos, uSunObj));

      gDetailEmissive += auroraColor * ovalMask * curtainNoise * activity * nightMod * auroraAct;
    }
  }
}
