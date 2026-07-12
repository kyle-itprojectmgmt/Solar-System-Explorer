// Titan atmospheric limb scattering — orange-brown haze shell.
// Rendered on a BackSide sphere at Titan radius × 1.015, transparent, normal alpha blending.
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

  // Fresnel: broad soft limb for atmospheric glow.
  float fresnel = 1.0 - abs(dot(viewDir, n));

  // Sun-facing lighting: smooth terminator blend.
  float sunDot = dot(n, normalize(uSunW));
  float litFactor = smoothstep(-0.2, 0.3, sunDot);

  // Haze color: deep brown-orange in shadow, bright orange-yellow when lit.
  vec3 hazeColor = mix(vec3(0.345, 0.157, 0.031), vec3(0.851, 0.502, 0.102), litFactor);

  // Rim: broad soft edge glow characteristic of Titan's thick atmosphere.
  float rim = pow(fresnel, 1.8);

  // Disc fill: the haze fills the planet disc, obscuring the surface from orbit.
  float discFill = (1.0 - fresnel) * 0.75;

  // Below 1000 km, thin the disc so the surface ghosts through.
  discFill *= mix(0.55, 1.0, smoothstep(300.0, 1000.0, uAltitude));

  // Detached upper haze layer: faint second rim ring slightly inside the limb.
  float haze2 = smoothstep(0.55, 0.75, fresnel) * (1.0 - smoothstep(0.75, 0.92, fresnel)) * 0.25 * litFactor;

  // Tint haze2 more red-brown.
  vec3 haze2Color = mix(hazeColor, vec3(0.8, 0.3, 0.1), 0.3);

  // Combine rim and disc for base opacity.
  float opacity = clamp(rim * 0.85 + discFill, 0.0, 0.96) * uIntensity;
  opacity = max(opacity, haze2);

  // Night side: whisper of visibility keeps the limb from going pure black.
  vec3 color = hazeColor * max(litFactor, 0.03);

  // Blend haze2 region in with slightly more red-brown tint.
  color = mix(color, haze2Color, haze2 * 0.4);

  gl_FragColor = vec4(color, opacity);
}
