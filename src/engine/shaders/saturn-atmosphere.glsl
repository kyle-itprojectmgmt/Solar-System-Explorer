// Saturn atmospheric limb scattering — warm golden upper-atmosphere glow.
// Rendered on a BackSide sphere at Saturn radius × 1.020, transparent, additive.
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

  // Grazing-angle fresnel: sharp pow 3.0 for thin limb.
  float fresnel = pow(1.0 - abs(dot(viewDir, n)), 3.0);

  // Lit-side gating: smooth blend from night to day side.
  float sunDot = dot(n, normalize(uSunW));
  float lit = smoothstep(-0.12, 0.10, sunDot);

  // Saturn limb color: warm gold at the bright limb fading to pale cream inward.
  vec3 limbGold = vec3(0.910, 0.785, 0.377);     // warm gold #E8C860
  vec3 limbCream = vec3(0.961, 0.925, 0.816);    // pale cream #F5ECD0
  vec3 limbColor = mix(limbCream, limbGold, fresnel);

  // Terminator boost: brighten near the shadow boundary.
  float terminatorBoost = 1.0 + 0.5 * pow(1.0 - abs(sunDot), 4.0);

  // Low-altitude horizon-line boost below 3,000 km (weaker than Earth).
  float lowAltBoost = smoothstep(3000.0, 500.0, uAltitude);
  float horizonFresnel = pow(1.0 - abs(dot(viewDir, n)), 3.2);
  float horizonLine = horizonFresnel * lowAltBoost * 0.25;

  limbColor = mix(limbColor, limbCream, horizonLine * 0.3);

  // Alpha: additive blending, thinner than Jupiter (×0.5 scale).
  float alpha = fresnel * lit * terminatorBoost;
  alpha = clamp(alpha, 0.0, 0.70) * uIntensity * 0.5;
  alpha = mix(alpha, alpha * 1.1, lowAltBoost * 0.15);

  gl_FragColor = vec4(limbColor, alpha);
}
