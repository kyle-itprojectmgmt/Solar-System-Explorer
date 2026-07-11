// Earth procedural clouds: animated weather systems, hurricanes, fronts.
// Activation: uDetailBlend gates on altitude (0 above 50,000 km).
// Injected into the 'terra' detail style; the style provides the preamble
// (dBase/detail) and the final mix. Extra uniforms: uSunObj.
// (Worker 1 draft, orchestrator integration pass: fns split out, scope
// fixes, hurricanes placed on the sphere's tropics band.)

float ec_spiral(vec2 pos, float rate, float rot) {
  float r = length(pos);
  float ang = atan(pos.y, pos.x);
  float ang_spiral = ang - rate / max(r, 0.01) + rot;
  return sin(ang_spiral * 3.5) * 0.5 + 0.5;
}

// === APPLY ===
float ec_cloud = 0.0; // combined cloud coverage

// LAYER 1 — large weather systems (altitude-staged fbm, slow drift, and a
// slight eastward drift relative to the surface — jet stream feel).
{
  vec3 cloudPos = vObjPos * 32.0;
  cloudPos.x += uTime * 0.00003 * 1.3;
  float weather = fbmN(cloudPos, dOct);
  ec_cloud = smoothstep(0.30, 0.80, weather) * 0.8; // thin edges, dense cores
}

// LAYER 2 — hurricane vortices in the tropics (|lat| < ~23°), spiral arms
// tightening toward the eye (same technique as the Jupiter GRS vortex).
// Counterclockwise north / clockwise south via sign(vObjPos.y).
{
  float tropo = 1.0 - smoothstep(0.35, 0.42, abs(vObjPos.y));
  if (tropo > 0.001) {
    for (int i = 0; i < 3; i++) {
      float h = fract(float(i) * 0.618 + 0.137);
      // Center ON the sphere: longitude from hash (+ slow westward drift),
      // latitude inside the band, alternating hemispheres.
      float cLon = h * 6.2832 - uTime * 0.000004;
      float cLat = (0.12 + 0.18 * fract(h * 7.31)) * (mod(float(i), 2.0) < 1.0 ? 1.0 : -1.0);
      vec3 hc = vec3(cos(cLat) * cos(cLon), sin(cLat), -cos(cLat) * sin(cLon));
      float d = acos(clamp(dot(vObjPos, hc), -1.0, 1.0)) / 0.06; // ~750 km radius
      if (d < 1.6) {
        // Local 2D frame around the eye for the spiral.
        vec3 e1 = normalize(cross(vec3(0.0, 1.0, 0.0), hc));
        vec3 e2 = cross(hc, e1);
        vec2 rel = vec2(dot(vObjPos - hc, e1), dot(vObjPos - hc, e2)) * sign(vObjPos.y);
        float spiral = ec_spiral(rel * 40.0, 2.0 / (d + 0.35), uTime * 0.00002);
        float vortex = spiral * (1.0 - smoothstep(0.8, 1.5, d));
        ec_cloud = max(ec_cloud, vortex * 0.85 * tropo);
      }
    }
  }
}

// LAYER 3 — weather front streaks at mid-latitudes, stretched east-west.
{
  float midLat = smoothstep(0.5, 0.55, abs(vObjPos.y)) * (1.0 - smoothstep(0.82, 0.87, abs(vObjPos.y)));
  if (midLat > 0.001) {
    vec3 frontPos = vec3(vObjPos.x * 10.0, vObjPos.y * 60.0, vObjPos.z * 10.0);
    frontPos.x += uTime * 0.000045;
    float fronts = smoothstep(0.25, 0.65, snoise(frontPos)) * dtlFreqFade(vObjPos, 60.0);
    ec_cloud = max(ec_cloud, fronts * 0.6 * midLat);
  }
}

// Clouds catch sunlight; on the night side they read as dim grey.
{
  float lit = max(dot(vObjPos, uSunObj), 0.06);
  vec3 cloudCol = vec3(0.973, 0.973, 1.0) * lit; // #F8F8FF
  float op = clamp(ec_cloud, 0.0, 0.9);
  detail = mix(detail, cloudCol, op);
  gDetailHeight += op * 0.3;
}
