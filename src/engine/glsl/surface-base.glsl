// surface-base.glsl — unified surface-shader convention (V7 1b).
//
// Injected into EVERY detail-style fragment shader (see detailShaders.js),
// right after the simplex library. Detail shaders read the sun through the
// shared object-space uniforms and fade through these helpers instead of
// hardcoding smoothstep constants; the thresholds are per-body config
// (body.shaderParams in /src/data/systems/*.js) exposed as uniforms:
//
//   uDayFade0 / uDayFade1     terminator blend band (shaderParams
//                             dayFadeSoft0 / dayFadeSoft1). Detail height
//                             and color deltas fade to zero through it so
//                             relief never catches sun below the local
//                             horizon (the Mars bug #55 class).
//   uGrazeFade0 / uGrazeFade1 high-frequency detail fade at low sun
//                             elevation (shaderParams grazeFade0/1) —
//                             tall sub-pixel bumps sparkle under ANY
//                             grazing light, not just past the terminator.
//
// sunDot is per-fragment: dot(vObjPos, uSunObj) for surface chunks (both
// object-space, tracked by the renderer every frame).
//
// Deliberate exemptions stay exempt (mars-dust's veil keeps its own wider
// fade so a storm remains faintly visible against the night sky).

float sse_dayFade(float sunDot, float soft0, float soft1) {
  return smoothstep(soft0, soft1, sunDot);
}

float sse_grazeFade(float sunDot, float graze0, float graze1) {
  return smoothstep(graze0, graze1, sunDot);
}

float sse_detailBlend(float altitude, float softKm, float hardKm) {
  return smoothstep(softKm, hardKm, altitude);
}
