// Mars atmospheric limb scattering — thin salmon-pink dust haze at horizon.
// Rendered on a BackSide sphere at Mars radius × 1.015, transparent, additive.
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

  // Grazing-angle fresnel: pow 4.5 (post-v7 hardware fix — thin pink
  // sliver at the lit limb, not a band).
  float fresnel = pow(1.0 - abs(dot(viewDir, n)), 4.5);

  // Lit-side gating, tight cutoff (universal thin-atmosphere values).
  float sunDot = dot(n, normalize(uSunW));
  float lit = smoothstep(-0.05, 0.20, sunDot);

  // Vertical gradient (v10.0.3): sightline closest-approach height inside
  // the shell via impact parameter — 0 = surface, 1 = top of the haze.
  float dv = abs(dot(viewDir, n));
  float sinv = sqrt(max(0.0, 1.0 - dv * dv));
  float atmHeight = clamp(((1.0 + uThickness) * sinv - 1.0) / uThickness, 0.0, 1.0);

  // CO2 dust gradient: warm salmon near the surface, pink-red mid,
  // dark rust fading to black at the top edge.
  vec3 dustLow  = vec3(0.90, 0.70, 0.55);
  vec3 dustMid  = vec3(0.70, 0.42, 0.30);
  vec3 dustHigh = vec3(0.45, 0.22, 0.12);
  vec3 dustColor = atmHeight < 0.45
    ? mix(dustLow, dustMid, atmHeight / 0.45)
    : mix(dustMid, dustHigh, (atmHeight - 0.45) / 0.55);

  // Faint warm forward-scatter boost when looking toward the sun (glory-like effect).
  float forwardScatter = smoothstep(-0.2, 0.3, sunDot) * pow(max(0.0, dot(viewDir, normalize(uSunW))), 1.5);
  dustColor = mix(dustColor, vec3(1.0, 0.75, 0.55), forwardScatter * 0.15);

  // Below ~3,000 km altitude, the dust haze thickens: widen the rim slightly.
  float lowAltBoost = smoothstep(3000.0, 0.0, uAltitude);
  float rimWidth = mix(fresnel, pow(1.0 - abs(dot(viewDir, n)), 3.8), lowAltBoost * 0.3);

  // Alpha: balanced for additive blending, fainter than Earth (×0.35 scale).
  float alpha = rimWidth * lit * (1.0 + 0.3 * forwardScatter);
  alpha = clamp(alpha, 0.0, 0.65) * uIntensity * 0.35;

  // No night-side glow: Mars is airless in our model, no earthglow-like effect.
  alpha *= lit;

  gl_FragColor = vec4(dustColor, alpha);
}
