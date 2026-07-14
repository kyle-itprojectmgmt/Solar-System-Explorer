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
uniform float uThickness;   // shell height as fraction of radius (cfg.atmosphere.thickness)
uniform float uHorizonGlow; // cfg.atmosphere.horizonGlow — Earth-only ISS line

varying vec3 vWPos;
varying vec3 vWNormal;

void main() {
  vec3 n = normalize(vWNormal);
  vec3 viewDir = normalize(uCamPos - vWPos);

  // Grazing-angle fresnel: pow 4.0 (v10.0.3 — slightly wider than the
  // post-v7 5.0 so the vertical gradient below has room to read).
  float fresnel = pow(1.0 - abs(dot(viewDir, n)), 4.0);

  // Lit-side gating, tight cutoff (was -0.25..0.15 — the wide bleed plus
  // the night-scatter term wrapped the halo around the night side).
  float sunDot = dot(n, normalize(uSunW));
  float lit = smoothstep(-0.05, 0.20, sunDot);

  // Vertical gradient (v10.0.3): height of this sightline's closest
  // approach inside the shell — impact parameter (house rule: never
  // fragment radius; raw fresnel only spans ~0.85-1.0 over the annulus).
  // 0 = surface at the disc edge, 1 = top of the atmosphere.
  float dv = abs(dot(viewDir, n));
  float sinv = sqrt(max(0.0, 1.0 - dv * dv));
  float atmHeight = clamp(((1.0 + uThickness) * sinv - 1.0) / uThickness, 0.0, 1.0);

  // Rayleigh gradient: white-blue near the surface, vivid blue mid,
  // deep blue fading to black at the top edge.
  vec3 colorLow  = vec3(0.85, 0.88, 1.00);
  vec3 colorMid  = vec3(0.20, 0.55, 1.00);
  vec3 colorHigh = vec3(0.10, 0.25, 0.70);
  vec3 rayleighColor = atmHeight < 0.45
    ? mix(colorLow, colorMid, atmHeight / 0.45)
    : mix(colorMid, colorHigh, (atmHeight - 0.45) / 0.55);

  // Terminator sunset band: where |sunDot| is near 0, add warm orange-red refraction.
  float terminatorBand = 1.0 - smoothstep(0.0, 0.12, abs(sunDot));
  vec3 sunsetColor = vec3(1.0, 0.478, 0.267); // #FF7A45 warm orange-red
  rayleighColor = mix(rayleighColor, sunsetColor, terminatorBand * 0.6);

  // Low-altitude horizon line (uHorizonGlow bodies only — Earth): below
  // 2000 km, a sharp thin bright arc at the limb, ISS-style.
  float horizonBoost = (1.0 - smoothstep(200.0, 2000.0, uAltitude)) * uHorizonGlow;
  float sharpFresnel = pow(1.0 - abs(dot(viewDir, n)), 6.5);
  float horizonLine = sharpFresnel * horizonBoost;
  rayleighColor = mix(rayleighColor, colorLow, horizonLine * 0.4);

  // Brightest where the atmosphere catches sunlight edge-on at the terminator.
  float terminatorGlow = 1.0 + 0.8 * pow(1.0 - abs(sunDot), 3.5);

  // Alpha: thin lit-limb crescent only — no night-side term.
  float alpha = fresnel * lit * terminatorGlow;
  alpha += horizonLine * lit * 0.5; // the ISS arc rides the same gate
  alpha = clamp(alpha, 0.0, 0.85) * uIntensity;

  gl_FragColor = vec4(rayleighColor, alpha);
}
