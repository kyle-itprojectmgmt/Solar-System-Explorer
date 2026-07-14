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
uniform float uThickness;  // shell height as fraction of radius (cfg.atmosphere.thickness)

varying vec3 vWPos;
varying vec3 vWNormal;

void main() {
  vec3 n = normalize(vWNormal);
  vec3 viewDir = normalize(uCamPos - vWPos);

  // Grazing-angle fresnel: pow 3.5 (v10.0.3, was 3.0 — slightly tighter
  // opacity falloff now that the color gradient carries the vertical read).
  float fresnel = pow(1.0 - abs(dot(viewDir, n)), 3.5);

  // Lit-side gating: smooth blend from night to day side.
  float sunDot = dot(n, normalize(uSunW));
  float lit = smoothstep(-0.12, 0.10, sunDot);

  // Vertical gradient (v10.0.3): sightline closest-approach height inside
  // the shell via impact parameter — 0 = cloud tops, 1 = top of the haze.
  float dv = abs(dot(viewDir, n));
  float sinv = sqrt(max(0.0, 1.0 - dv * dv));
  float atmHeight = clamp(((1.0 + uThickness) * sinv - 1.0) / uThickness, 0.0, 1.0);

  // Saturn gradient: warm cream near the clouds, golden mid, darker gold
  // fading to black at the top edge.
  vec3 limbLow  = vec3(1.00, 0.90, 0.65);
  vec3 limbMid  = vec3(0.85, 0.72, 0.45);
  vec3 limbHigh = vec3(0.55, 0.42, 0.22);
  vec3 limbColor = atmHeight < 0.45
    ? mix(limbLow, limbMid, atmHeight / 0.45)
    : mix(limbMid, limbHigh, (atmHeight - 0.45) / 0.55);
  vec3 limbCream = limbLow; // ISS-style horizon arc tint below

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
