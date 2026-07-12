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
    // Procedural fallback: build from landmark bands.
    // Base warm grey-white color.
    vec3 baseColor = vec3(0.88, 0.84, 0.78);

    // D ring (t 0.0–0.104): very faint
    if (t < 0.104) {
      color = mix(vec3(0.70, 0.68, 0.65), baseColor, t / 0.104);
      opacity = 0.04;
    }
    // C ring (t 0.104–0.341): translucent grey
    else if (t < 0.341) {
      float ct = (t - 0.104) / (0.341 - 0.104);
      color = mix(vec3(0.55, 0.52, 0.47), baseColor, ct);
      opacity = 0.18;
    }
    // B ring (t 0.341–0.689): dense, brightest
    else if (t < 0.689) {
      color = baseColor;
      opacity = 0.90;
    }
    // Cassini Division (t 0.689–0.752): near-transparent THROUGHOUT —
    // the gap is the signature feature; soft edges only at its walls.
    // (Review fix: first cut ramped opacity back to 0.90 across the gap.)
    else if (t < 0.752) {
      color = baseColor;
      float wall = smoothstep(0.689, 0.694, t) * (1.0 - smoothstep(0.747, 0.752, t));
      opacity = mix(0.65, 0.02, wall);
    }
    // A ring (t 0.752–0.950): dense, with the Encke gap at FULL-SPAN
    // t ≈ 0.915 (review fix: was compared in A-ring-relative coords).
    else if (t < 0.950) {
      color = baseColor;
      opacity = 0.65;
      float enckeGap = smoothstep(0.004, 0.0, abs(t - 0.915));
      opacity = mix(opacity, 0.05, enckeGap);
    }
    // gap (t 0.950–0.993): transparent
    else if (t < 0.993) {
      color = baseColor;
      opacity = 0.0;
    }
    // F ring (t 0.993–1.0): thin, kinked
    else {
      float ft = (t - 0.993) / (1.0 - 0.993);
      color = mix(vec3(0.72, 0.70, 0.66), baseColor, 1.0 - ft);
      opacity = 0.25;
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
