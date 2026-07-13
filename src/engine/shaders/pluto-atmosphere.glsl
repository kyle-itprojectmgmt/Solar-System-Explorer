// Pluto atmospheric limb scattering — thin blue nitrogen haze shell.
// New Horizons observed a faint blue crescent haze with ~20 stratified layers,
// most dramatic when backlit (blue rim effect). Nitrogen atmosphere at ~1/100,000
// Earth's density exhibits Rayleigh scattering with dramatic limb glow.
// Rendered on a BackSide sphere at Pluto radius × 1.015, transparent, additive blending.
// Uniforms: uSunW (world-space unit sun dir), uCamPos (world-space camera),
//           uAltitude (km), uIntensity (config scale), uHorizonGlow (declare but ignore).

// === VERTEX ===
#include <common>
#include <logdepthbuf_pars_vertex>
varying vec3 vWPos;
varying vec3 vWNormal;

void main() {
  vWPos = (modelMatrix * vec4(position, 1.0)).xyz;
  vWNormal = normalize(mat3(modelMatrix) * normal);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  #include <logdepthbuf_vertex>
}

// === FRAGMENT ===
#include <common>
#include <logdepthbuf_pars_fragment>
uniform vec3 uSunW;
uniform vec3 uCamPos;
uniform float uAltitude;
uniform float uIntensity;
uniform float uHorizonGlow;

varying vec3 vWPos;
varying vec3 vWNormal;

void main() {
  #include <logdepthbuf_fragment>
  vec3 n = normalize(vWNormal);
  vec3 viewDir = normalize(uCamPos - vWPos);

  // Tight Rayleigh-class fresnel: power 6.0 for very thin rim (not atmospheric glow).
  float fresnel = pow(1.0 - abs(dot(viewDir, n)), 6.0);

  // Lit-side gate: tight cutoff (universal thin-atmosphere values).
  // Smoothstep edges ascending: dim at sunDot -0.05, bright at 0.20.
  float sunDot = dot(n, normalize(uSunW));
  float lit = smoothstep(-0.05, 0.20, sunDot);

  // Haze color: pale blue, shifting deeper at strongest rim.
  vec3 hazeColorPale = vec3(0.50, 0.70, 1.00);
  vec3 hazeColorDeep = vec3(0.35, 0.55, 0.95);
  vec3 hazeColor = mix(hazeColorPale, hazeColorDeep, fresnel * 0.6);

  // Layer banding: subtle stratification (20 faint layers) via sine modulation.
  // Multiply alpha by (0.85 + 0.15 * sin(...)) for vertical striping effect.
  float layerBand = 0.85 + 0.15 * sin(fresnel * 28.0);

  // Backlit boost (orchestrator fix: forward-scattered light EXITS along the
  // propagation direction -uSunW, so the camera catches it when viewDir is
  // ANTI-sunward — the worker's +dot peaked on the day side instead. Viewed
  // anti-solar the whole limb is the terminator ring, so this term paints
  // the full blue ring New Horizons made famous).
  float forwardScatter = pow(max(0.0, -dot(viewDir, uSunW)), 3.0);

  // Gate backlit boost to the lit/terminator limb (ascending edges: zero in
  // deep night below sunDot -0.15 — no night-ring alpha floor, v7 lesson).
  float backitGate = smoothstep(-0.15, 0.05, sunDot);
  forwardScatter *= backitGate;

  // Brighten haze color under backlit boost.
  vec3 backitColor = vec3(0.6, 0.8, 1.0);
  hazeColor = mix(hazeColor, backitColor, forwardScatter * 0.4);

  // Base alpha from fresnel and lit gate, clamped conservative.
  float alpha = fresnel * lit * layerBand;
  alpha = clamp(alpha, 0.0, 0.6) * uIntensity * 0.30;

  // Backlit ring: its own WIDER fresnel (pow 2.5 vs the day-side 6.0 — the
  // pow-6 annulus is 2 px and reads as nothing; NH's ring is thin but
  // unmistakable) and stronger gain. Still zero in deep night via backitGate.
  float ringFresnel = pow(1.0 - abs(dot(viewDir, n)), 2.5);
  alpha += ringFresnel * forwardScatter * uIntensity * 0.30 * 4.0;
  alpha = clamp(alpha, 0.0, 0.8);

  gl_FragColor = vec4(hazeColor, alpha);
}
