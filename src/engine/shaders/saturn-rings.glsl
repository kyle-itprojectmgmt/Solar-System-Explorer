// Saturn's main ring system — flat disc spanning D through F rings.
// Rendered as THREE.RingGeometry, transparent, NORMAL blending, depthWrite: false.
// UNIFORMS: uRingTex (8192×500 radial strip, rgba), uHasTex (1.0 if loaded),
//           uCamPos (world-space camera), uSunW (world-space unit sun dir),
//           uPlanetR (Saturn radius), uInner/uOuter (scene units),
//           uOpacityScale (global multiplier), uTime (seconds)

// === VERTEX ===
varying vec3 vWorld;
varying float vR;
varying vec3 vNormalW;

void main() {
  vWorld = (modelMatrix * vec4(position, 1.0)).xyz;
  vR = length(position.xy);
  vNormalW = normalize(mat3(modelMatrix) * vec3(0.0, 0.0, 1.0));
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}

// === FRAGMENT ===
uniform sampler2D uRingTex;
uniform float uHasTex;
uniform vec3 uCamPos;
uniform vec3 uSunW;
uniform float uPlanetR;
uniform float uInner;
uniform float uOuter;
uniform float uOpacityScale;
uniform float uTime;

varying vec3 vWorld;
varying float vR;
varying vec3 vNormalW;

void main() {
  // Normalize radial position across the ring system.
  float t = clamp((vR - uInner) / (uOuter - uInner), 0.0, 1.0);

  // Sample texture if available, else procedural fallback.
  vec3 color;
  float opacity;

  if (uHasTex > 0.5) {
    // Texture path: 8192×500 strip, x-axis = t, y = center.
    vec4 tex = texture2D(uRingTex, vec2(t, 0.5));
    color = tex.rgb;
    opacity = tex.a;
  } else {
    // Procedural fallback: landmark bands for the CALIBRATED mesh span
    // 69,075–140,715 km (measured from the SSS strip's alpha profile —
    // Cassini Division dip at t ≈ 0.71, B onset at t ≈ 0.32).
    // Base warm grey-white color.
    vec3 baseColor = vec3(0.88, 0.84, 0.78);

    // C ring (t 0.076–0.320): translucent grey
    if (t < 0.076) {
      color = vec3(0.70, 0.68, 0.65);
      opacity = 0.03;
    }
    else if (t < 0.320) {
      float ct = (t - 0.076) / (0.320 - 0.076);
      color = mix(vec3(0.55, 0.52, 0.47), baseColor, ct);
      opacity = 0.18;
    }
    // B ring (t 0.320–0.677): dense, brightest
    else if (t < 0.677) {
      color = baseColor;
      opacity = 0.90;
    }
    // Cassini Division (t 0.677–0.741): near-transparent THROUGHOUT —
    // the gap is the signature feature; soft edges only at its walls.
    // (Review fix: first cut ramped opacity back to 0.90 across the gap.)
    else if (t < 0.741) {
      color = baseColor;
      float wall = smoothstep(0.677, 0.683, t) * (1.0 - smoothstep(0.735, 0.741, t));
      opacity = mix(0.65, 0.02, wall);
    }
    // A ring (t 0.741–0.945): dense, with the Encke gap at FULL-SPAN
    // t ≈ 0.900 (review fix: was compared in A-ring-relative coords).
    else if (t < 0.945) {
      color = baseColor;
      opacity = 0.65;
      float enckeGap = smoothstep(0.004, 0.0, abs(t - 0.900));
      opacity = mix(opacity, 0.05, enckeGap);
    }
    // Beyond the A ring: faint sheen out to the mesh edge.
    else {
      color = baseColor;
      opacity = 0.02;
    }
  }

  // Subtle radial fine structure: sin-based ripple (no noise library).
  float ripple = 0.92 + 0.08 * sin(t * 700.0) * sin(t * 173.0);
  opacity *= ripple;

  // Sun-elevation lighting: rings dim edge-on, but add forward scattering.
  float sunElev = abs(dot(uSunW, vNormalW));
  float litFace = mix(0.08, 1.0, smoothstep(0.0, 0.35, sunElev));

  // Forward scattering: backlit rings glow.
  vec3 toCam = normalize(uCamPos - vWorld);
  float back = pow(max(dot(-toCam, uSunW), 0.0), 6.0);
  float brightness = (0.25 + 0.75 * litFace) * (1.0 + back * 4.0);
  color *= (1.0 + back * 1.5);

  // Saturn's shadow on the rings: planet at world origin of its local frame.
  float along = dot(vWorld, uSunW);
  float perp = length(vWorld - along * uSunW);
  float lit = along > 0.0 ? 1.0 : smoothstep(uPlanetR * 0.98, uPlanetR * 1.08, perp);

  // Shadowed ring material goes very dark (×0.05), not transparent.
  color *= mix(0.05, 1.0, lit);

  gl_FragColor = vec4(color * brightness, opacity * uOpacityScale);
}
