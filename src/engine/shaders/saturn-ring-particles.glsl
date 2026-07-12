// Saturn ring particles — ice crystals the camera flies through.
// Rendered as THREE.Points cloud, each particle a soft sprite.
// UNIFORMS: uTime (seconds), uPointScale (pixels-at-unit-distance)
// ATTRIBUTES: aSeed (0..1 per particle)

// === VERTEX ===
attribute float aSeed;

uniform float uTime;
uniform float uPointScale;

varying float vSeed;

void main() {
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_PointSize = clamp(uPointScale * (2.0 + 6.0 * fract(aSeed * 7.31)) / -mv.z, 1.0, 24.0);
  vSeed = aSeed;
  gl_Position = projectionMatrix * mv;
}

// === FRAGMENT ===
varying float vSeed;

void main() {
  // Circular soft sprite.
  vec2 d = gl_PointCoord - 0.5;
  float r = length(d);

  if (r > 0.5) discard;

  float alpha = smoothstep(0.5, 0.28, r) * 0.7;

  // Ice color with per-particle variation.
  vec3 ice = mix(vec3(0.82, 0.81, 0.78), vec3(1.0), fract(sin(vSeed * 127.1) * 43758.5453));

  gl_FragColor = vec4(ice, alpha);
}
