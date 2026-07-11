// Earth atmospheric limb scattering — Rayleigh scattering glow at horizon.
// Rendered on a BackSide sphere at Earth radius × 1.025, transparent, additive.
// UNIFORMS: uSunW (world-space unit sun dir), uCamPos (world-space camera),
//           uAltitude (km), uIntensity (default 1.0)

// === VERTEX ===
varying vec3 vWPos;
varying vec3 vWNormal;

void main() {
  vWPos = (modelMatrix * vec4(position, 1.0)).xyz;
  vWNormal = normalize(mat3(modelMatrix) * normal);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}

// === FRAGMENT ===
uniform vec3 uSunW;
uniform vec3 uCamPos;
uniform float uAltitude;
uniform float uIntensity;

varying vec3 vWPos;
varying vec3 vWNormal;

void main() {
  vec3 n = normalize(vWNormal);
  vec3 viewDir = normalize(uCamPos - vWPos);

  // Grazing-angle fresnel: sharp exponential falloff, pow ~2.8 for thin limb.
  float fresnel = pow(1.0 - abs(dot(viewDir, n)), 2.8);

  // Lit-side gating with a wide terminator bleed (V5b: was -0.18..0.2 —
  // widened so the limb glow fades gradually over ~300 km instead of
  // cutting off at the geometric shadow line).
  float sunDot = dot(n, normalize(uSunW));
  float lit = smoothstep(-0.25, 0.15, sunDot);

  // Faint blue-grey scatter keeps the night limb from going pure black —
  // earthglow / residual atmospheric scattering (V5b).
  float nightAmbient = (1.0 - lit) * 0.08;
  vec3 nightColor = vec3(0.05, 0.08, 0.15);

  // Rayleigh scattering color: deep vivid blue (#3D7EFF) to bright cyan-white (#BFE3FF).
  // Edge is more saturated blue, inner falloff is bright white-cyan.
  vec3 colorEdge = vec3(0.239, 0.494, 1.0);   // #3D7EFF
  vec3 colorMid = vec3(0.749, 0.890, 1.0);    // #BFE3FF
  vec3 rayleighColor = mix(colorMid, colorEdge, fresnel);

  // Terminator sunset band: where |sunDot| is near 0, add warm orange-red refraction.
  float terminatorBand = 1.0 - smoothstep(0.0, 0.12, abs(sunDot));
  vec3 sunsetColor = vec3(1.0, 0.478, 0.267); // #FF7A45 warm orange-red
  rayleighColor = mix(rayleighColor, sunsetColor, terminatorBand * 0.6);

  // Low-altitude horizon line: below 2000 km, boost a sharp bright line at the limb.
  // ISS-style thin arc effect when camera is close.
  float horizonBoost = 1.0 - smoothstep(200.0, 2000.0, uAltitude);
  float sharpFresnel = pow(1.0 - abs(dot(viewDir, n)), 3.2); // sharper for thin line
  float horizonLine = sharpFresnel * horizonBoost;
  rayleighColor = mix(rayleighColor, colorMid, horizonLine * 0.4);

  // Brightest where the atmosphere catches sunlight edge-on at the terminator.
  float terminatorGlow = 1.0 + 0.8 * pow(1.0 - abs(sunDot), 3.5);

  // Alpha: balanced for additive blending, brighter near terminator, stronger at low altitude.
  float alpha = fresnel * lit * terminatorGlow;
  alpha = mix(alpha, alpha * 1.2, horizonBoost); // boost alpha when close
  alpha = clamp(alpha, 0.0, 0.85) * uIntensity;

  // Blend toward the night scatter color where the day glow has faded.
  rayleighColor = mix(nightColor, rayleighColor, clamp(lit, 0.0, 1.0));
  alpha = max(alpha, fresnel * nightAmbient * uIntensity);

  gl_FragColor = vec4(rayleighColor, alpha);
}
