// ---------------------------------------------------------------------------
// Shared GLSL noise library — injected into every body detail shader.
// 2D + 3D Simplex noise (Ashima Arts / Stefan Gustavson, MIT), plus the
// ridged / fBm / cellular helpers the body shaders build on.
//
// Define DETAIL_QUALITY_LOW before this file to drop one fBm octave
// (mobile tier).
// ---------------------------------------------------------------------------

vec3 dtl_mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec2 dtl_mod289(vec2 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec4 dtl_mod289(vec4 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec3 dtl_permute(vec3 x) { return dtl_mod289(((x * 34.0) + 10.0) * x); }
vec4 dtl_permute(vec4 x) { return dtl_mod289(((x * 34.0) + 10.0) * x); }
vec4 dtl_taylorInvSqrt(vec4 r) { return 1.79284291400159 - 0.85373472095314 * r; }

// -- 2D simplex noise ---------------------------------------------------------

float snoise2(vec2 v) {
  const vec4 C = vec4(0.211324865405187, 0.366025403784439,
                      -0.577350269189626, 0.024390243902439);
  vec2 i = floor(v + dot(v, C.yy));
  vec2 x0 = v - i + dot(i, C.xx);
  vec2 i1 = (x0.x > x0.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
  vec4 x12 = x0.xyxy + C.xxzz;
  x12.xy -= i1;
  i = dtl_mod289(i);
  vec3 p = dtl_permute(dtl_permute(i.y + vec3(0.0, i1.y, 1.0)) + i.x + vec3(0.0, i1.x, 1.0));
  vec3 m = max(0.5 - vec3(dot(x0, x0), dot(x12.xy, x12.xy), dot(x12.zw, x12.zw)), 0.0);
  m = m * m; m = m * m;
  vec3 x = 2.0 * fract(p * C.www) - 1.0;
  vec3 h = abs(x) - 0.5;
  vec3 ox = floor(x + 0.5);
  vec3 a0 = x - ox;
  m *= 1.79284291400159 - 0.85373472095314 * (a0 * a0 + h * h);
  vec3 g;
  g.x = a0.x * x0.x + h.x * x0.y;
  g.yz = a0.yz * x12.xz + h.yz * x12.yw;
  return 130.0 * dot(m, g);
}

// -- 3D simplex noise ---------------------------------------------------------

float snoise(vec3 v) {
  const vec2 C = vec2(1.0 / 6.0, 1.0 / 3.0);
  const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);
  vec3 i = floor(v + dot(v, C.yyy));
  vec3 x0 = v - i + dot(i, C.xxx);
  vec3 g = step(x0.yzx, x0.xyz);
  vec3 l = 1.0 - g;
  vec3 i1 = min(g.xyz, l.zxy);
  vec3 i2 = max(g.xyz, l.zxy);
  vec3 x1 = x0 - i1 + C.xxx;
  vec3 x2 = x0 - i2 + C.yyy;
  vec3 x3 = x0 - D.yyy;
  i = dtl_mod289(vec3(i));
  vec4 p = dtl_permute(dtl_permute(dtl_permute(
    i.z + vec4(0.0, i1.z, i2.z, 1.0))
    + i.y + vec4(0.0, i1.y, i2.y, 1.0))
    + i.x + vec4(0.0, i1.x, i2.x, 1.0));
  float n_ = 0.142857142857;
  vec3 ns = n_ * D.wyz - D.xzx;
  vec4 j = p - 49.0 * floor(p * ns.z * ns.z);
  vec4 x_ = floor(j * ns.z);
  vec4 y_ = floor(j - 7.0 * x_);
  vec4 x = x_ * ns.x + ns.yyyy;
  vec4 y = y_ * ns.x + ns.yyyy;
  vec4 h = 1.0 - abs(x) - abs(y);
  vec4 b0 = vec4(x.xy, y.xy);
  vec4 b1 = vec4(x.zw, y.zw);
  vec4 s0 = floor(b0) * 2.0 + 1.0;
  vec4 s1 = floor(b1) * 2.0 + 1.0;
  vec4 sh = -step(h, vec4(0.0));
  vec4 a0 = b0.xzyw + s0.xzyw * sh.xxyy;
  vec4 a1 = b1.xzyw + s1.xzyw * sh.zzww;
  vec3 p0 = vec3(a0.xy, h.x);
  vec3 p1 = vec3(a0.zw, h.y);
  vec3 p2 = vec3(a1.xy, h.z);
  vec3 p3 = vec3(a1.zw, h.w);
  vec4 norm = dtl_taylorInvSqrt(vec4(dot(p0, p0), dot(p1, p1), dot(p2, p2), dot(p3, p3)));
  p0 *= norm.x; p1 *= norm.y; p2 *= norm.z; p3 *= norm.w;
  vec4 m = max(0.5 - vec4(dot(x0, x0), dot(x1, x1), dot(x2, x2), dot(x3, x3)), 0.0);
  m = m * m;
  return 105.0 * dot(m * m, vec4(dot(p0, x0), dot(p1, x1), dot(p2, x2), dot(p3, x3)));
}

// -- Ridged variant (cracks, ridges) --------------------------------------------

float ridged(vec3 p) { return 1.0 - abs(snoise(p)); }
float ridged2(vec2 p) { return 1.0 - abs(snoise2(p)); }

// -- Fractal Brownian motion -------------------------------------------------------

float fbm2(vec3 p) {
  float f = 0.5 * snoise(p);
  f += 0.25 * snoise(p * 2.0);
  return f / 0.75;
}

float fbm3(vec3 p) {
  float f = 0.5 * snoise(p);
  f += 0.25 * snoise(p * 2.0);
#ifndef DETAIL_QUALITY_LOW
  f += 0.125 * snoise(p * 4.0);
  return f / 0.875;
#else
  return f / 0.75;
#endif
}

float fbm4(vec3 p) {
  float f = 0.5 * snoise(p);
  f += 0.25 * snoise(p * 2.0);
  f += 0.125 * snoise(p * 4.0);
#ifndef DETAIL_QUALITY_LOW
  f += 0.0625 * snoise(p * 8.0);
  return f / 0.9375;
#else
  return f / 0.875;
#endif
}

// Dynamic-octave fBm — octave count chosen per fragment from altitude, so
// each zoom level reveals genuinely new detail (SpaceEngine-style staging).
// WebGL2 / GLSL ES 3.00 permits the non-constant loop exit; 9 is the cap.
float fbmN(vec3 p, int octaves) {
  float f = 0.0, a = 0.5, norm = 0.0;
  for (int i = 0; i < 9; i++) {
    if (i >= octaves) break;
    f += a * snoise(p);
    norm += a;
    a *= 0.5;
    p *= 2.0;
  }
  return f / max(norm, 1e-4);
}

float ridgedFbm3(vec3 p) {
  float f = 0.5 * ridged(p);
  f += 0.25 * ridged(p * 2.1);
#ifndef DETAIL_QUALITY_LOW
  f += 0.125 * ridged(p * 4.3);
  return f / 0.875;
#else
  return f / 0.75;
#endif
}

// -- Cellular (Worley) noise: returns (F1 distance, cell hash) --------------------
// Used for chaos-terrain blocks and crater fields.

vec2 dtl_hash22(vec2 p) {
  vec3 a = fract(p.xyx * vec3(123.34, 234.34, 345.65));
  a += dot(a, a + 34.45);
  return fract(vec2(a.x * a.y, a.y * a.z));
}

vec2 worley2(vec2 p) {
  vec2 n = floor(p);
  vec2 f = fract(p);
  float f1 = 8.0;
  float id = 0.0;
  for (int j = -1; j <= 1; j++) {
    for (int i = -1; i <= 1; i++) {
      vec2 g = vec2(float(i), float(j));
      vec2 o = dtl_hash22(n + g);
      float d = length(g + o - f);
      if (d < f1) { f1 = d; id = o.x; }
    }
  }
  return vec2(f1, id);
}

// Screen-space bump perturbation (Blinn / Three.js perturbNormalArb form):
// tilts the shading normal from the screen-space derivatives of a procedural
// height value, so noise-driven relief also drives the lighting.
vec3 dtlPerturbNormal(vec3 surfPos, vec3 surfNorm, float dHdx, float dHdy, float scale) {
  vec3 sigmaX = dFdx(surfPos);
  vec3 sigmaY = dFdy(surfPos);
  vec3 r1 = cross(sigmaY, surfNorm);
  vec3 r2 = cross(surfNorm, sigmaX);
  float det = dot(sigmaX, r1);
  vec3 grad = sign(det) * (dHdx * r1 + dHdy * r2);
  return normalize(abs(det) * surfNorm - scale * grad);
}

// Circular crater profile from a cellular field: 0 = untouched surface,
// negative = floor, positive = rim. `sharp` controls rim tightness.
float craterProfile(vec2 p, out float cellId) {
  vec2 w = worley2(p);
  cellId = w.y;
  float r = w.x;                    // distance to crater center
  float rim = 1.0 - smoothstep(0.28, 0.42, r);   // inside-crater mask
  float floorMask = 1.0 - smoothstep(0.0, 0.26, r);
  float rimRing = rim - floorMask;  // ring band around the floor
  return rimRing * 0.9 - floorMask; // + rim, - floor
}
