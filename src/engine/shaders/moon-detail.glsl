// ---------------------------------------------------------------------------
// MOON DETAIL SHADER — Lunar surface with mare/highland terrain split,
// multi-scale cratering, fresh crater rays (Tycho & Copernicus),
// opposition surge, terminator shadowing, and nightside earthshine.
//
// Activation: uDetailBlend ramps from 0 (far) to 1 (near) with full detail
// at 10,000 km and above (per detailBlend() and OCTAVES_MOON staging).
//
// Extra uniforms: uSunObj (object-space sun direction, unit),
// uCamObj (object-space camera position).
// ---------------------------------------------------------------------------

vec3 dTint = max(diffuse, vec3(0.001));
vec3 dBase = diffuseColor.rgb / dTint;
vec3 detail = dBase;
float t1 = uTime * 0.00001;

float dLum = dot(dBase, vec3(0.299, 0.587, 0.114));

// ===== LAYER 1: TERRAIN SPLIT — Mare vs Highland =====
float split = smoothstep(0.3, 0.5, dLum);  // 0 = mare, 1 = highland
vec3 mareDetail = detail, highlandDetail = detail;
float mareCH = 0.0, highlandCH = 0.0; // gDetailHeight per terrain

// ===== LAYER 2: MARE — Dark Basalt, Undulation, Fresh Craters, Wrinkles =====
{
  // Basalt tint and undulation
  vec3 basaltDark = vec3(0.102, 0.102, 0.157);  // #1A1A28 (base)
  vec3 basaltTint = vec3(0.106, 0.106, 0.165);  // #1A1A2A (requested tint)
  float undulation = fbmN(vObjPos * 8.0 + vec3(t1), dOct);
  mareDetail = mix(mareDetail, basaltTint, 0.5 + 0.1 * undulation);

  // Sparse small fresh craters
  float mId; float mc = craterProfile(dUv * 90.0 + 41.3, mId);
  float mSparsity = step(0.7, mId);  // thin out by cell hash
  mareDetail = mix(mareDetail, vec3(0.98, 0.98, 1.0), mSparsity * clamp(mc, 0.0, 1.0) * 0.6);  // white ejecta

  // Wrinkle ridges: sparse, subtle elongated ridges — regional patches only
  // (the first pass striped the entire mare with them).
  float wAng = snoise(vObjPos * 1.2) * 1.8;
  vec2 wUv = mat2(cos(wAng), -sin(wAng), sin(wAng), cos(wAng)) * dUv;
  float wRegion = smoothstep(0.35, 0.7, snoise(vObjPos * 5.0 + 11.3)); // sparse patches
  float wrinkles = dtlAAstep(0.955, 0.99, ridged(vec3(wUv.x * 60.0, wUv.y * 20.0, 2.1)))
    * dtlFreqFade2(wUv, 60.0) * wRegion;
  mareDetail = mix(mareDetail, mareDetail * 1.12, wrinkles * 0.5);  // brighter ridges
  mareCH = wrinkles * 0.05 + mSparsity * clamp(mc, -1.0, 1.0) * 0.12;
}

// ===== LAYER 3: HIGHLAND — Dense Multi-Scale Cratering =====
{
  // Four scales of craters: freqs ~14, 40, 130, 400
  // Weights: 0.45, 0.30, 0.15, (skip finest for gDetailHeight)
  float crAct = 1.0 - smoothstep(500.0, 3500.0, uAltitude);  // ramp in with altitude

  // Scale 1: freq ~14
  float id1; float c1 = craterProfile(dUv * 14.0, id1);
  highlandDetail = mix(highlandDetail, vec3(0.15, 0.12, 0.08), clamp(-c1, 0.0, 1.0) * 0.45);  // dark floors
  highlandDetail = mix(highlandDetail, vec3(0.28, 0.22, 0.16), clamp(c1, 0.0, 1.0) * 0.35);   // lit rims

  // Scale 2: freq ~40
  float id2; float c2 = craterProfile(dUv * 40.0 + 7.1, id2);
  highlandDetail = mix(highlandDetail, vec3(0.13, 0.10, 0.065), clamp(-c2, 0.0, 1.0) * 0.40 * (0.4 + 0.6 * crAct));
  highlandDetail = mix(highlandDetail, vec3(0.24, 0.19, 0.14), clamp(c2, 0.0, 1.0) * 0.30 * (0.4 + 0.6 * crAct));

  // Scale 3: freq ~130 (moderate amplitude — heavier reads as cobblestone)
  float id3; float c3 = craterProfile(dUv * 130.0 + 19.7, id3);
  float c3Fade = dtlFreqFade2(dUv, 130.0);
  highlandDetail = mix(highlandDetail, vec3(0.11, 0.085, 0.055), clamp(-c3, 0.0, 1.0) * 0.28 * crAct * c3Fade);
  highlandDetail = mix(highlandDetail, vec3(0.22, 0.18, 0.13), clamp(c3, 0.0, 1.0) * 0.20 * crAct * c3Fade);

  // Scale 4: freq ~400 (color only, no height, kept faint)
  float id4; float c4 = craterProfile(dUv * 400.0 + 3.9, id4);
  float c4Fade = dtlFreqFade2(dUv, 400.0);
  highlandDetail *= 1.0 + (clamp(c4, -1.0, 1.0) * 0.07 * c4Fade) * crAct;

  // Relief: rims lit, floors shadowed
  highlandCH = clamp(c1, -1.0, 1.0) * 0.45
    + clamp(c2, -1.0, 1.0) * 0.30 * (0.4 + 0.6 * crAct)
    + clamp(c3, -1.0, 1.0) * 0.15 * crAct;

  // Bright fresh crater floors (high cell IDs)
  float fresh = step(0.84, id2) * clamp(-c2, 0.0, 1.0);
  highlandDetail = mix(highlandDetail, vec3(0.95, 0.96, 1.0), fresh * 0.65);  // bright floor
}

// Blend mare and highland
detail = mix(mareDetail, highlandDetail, split);
gDetailHeight = mix(mareCH, highlandCH, split);

// ===== LAYER 4: CRATER RAYS — Tycho & Copernicus =====
{
  // Pre-computed crater positions (lat, lon -> unit vectors)
  // Tycho: lat -43.3°, lon -11.2°
  float tLat = radians(-43.3), tLon = radians(-11.2);
  vec3 tychoPt = vec3(cos(tLat) * cos(tLon), sin(tLat), -cos(tLat) * sin(tLon));

  // Copernicus: lat 9.7°, lon -20.1°
  float cLat = radians(9.7), cLon = radians(-20.1);
  vec3 copernicusPt = vec3(cos(cLat) * cos(cLon), sin(cLat), -cos(cLat) * sin(cLon));

  // Tycho rays (scale 0.86 rad, falloff 0.28)
  float tyAngle = acos(clamp(dot(vObjPos, tychoPt), -1.0, 1.0));
  if (tyAngle < 1.0) {
    vec3 tyOffset = normalize(vObjPos - tychoPt * dot(vObjPos, tychoPt));
    float tyAngular = atan(length(vObjPos - tychoPt * dot(vObjPos, tychoPt)), dot(vObjPos, tychoPt));
    float tyRay = snoise(vec3(tyAngular * 24.0, tychoPt * 3.0 + t1))
      * dtlFreqFade(tychoPt + tyOffset * 0.5, 24.0);
    tyRay = dtlAAstep(0.55, 0.90, tyRay);
    float tyFalloff = 1.0 / (1.0 + pow(tyAngle / 0.28, 2.0));
    detail = mix(detail, vec3(1.0, 1.0, 0.98), tyRay * tyFalloff * 0.30);
  }

  // Copernicus rays (scale 0.15, smaller and brighter nearby)
  float coAngle = acos(clamp(dot(vObjPos, copernicusPt), -1.0, 1.0));
  if (coAngle < 0.5) {
    vec3 coOffset = normalize(vObjPos - copernicusPt * dot(vObjPos, copernicusPt));
    float coAngular = atan(length(vObjPos - copernicusPt * dot(vObjPos, copernicusPt)), dot(vObjPos, copernicusPt));
    float coRay = snoise(vec3(coAngular * 24.0, copernicusPt * 3.0 - t1))
      * dtlFreqFade(copernicusPt + coOffset * 0.5, 24.0);
    coRay = dtlAAstep(0.60, 0.92, coRay);
    float coFalloff = 1.0 / (1.0 + pow(coAngle / 0.15, 2.0));
    detail = mix(detail, vec3(0.99, 0.99, 1.0), coRay * coFalloff * 0.35);
  }
}

// ===== LAYER 5: LOW ALTITUDE — Opposition Surge & Regolith Sparkle =====
{
  float lowAltAct = 1.0 - smoothstep(80.0, 200.0, uAltitude);
  if (lowAltAct > 0.001) {
    // Opposition surge: brightness boost when sun behind camera
    float opp = pow(max(dot(normalize(uCamObj), uSunObj), 0.0), 8.0) * 0.25;
    detail += vec3(opp * lowAltAct * 0.15);

    // Regolith sparkle: highest-freq speckle
    float sparkle = snoise(vObjPos * 280.0 + t1 * 40.0);
    detail += vec3(sparkle * 0.02 * lowAltAct * dtlFreqFade(vObjPos, 280.0));
  }
}

// ===== LAYER 6: TERMINATOR DRAMA — Shadow Amplification =====
{
  float terminatorFactor = 1.0 - smoothstep(0.0, 0.15, abs(dot(vObjPos, uSunObj)));
  if (terminatorFactor > 0.001) {
    // Amplify height relief in terminator zone
    gDetailHeight *= mix(1.0, 2.0, terminatorFactor);
    // Darken crater floors further
    detail *= mix(1.0, 0.85, terminatorFactor * 0.5);
  }
}

// ===== LAYER 7: EARTHSHINE — Nightside Blue Glow =====
{
  float sunDot = dot(vObjPos, uSunObj);
  float nightsideFactor = smoothstep(-0.05, -0.5, sunDot);  // fade across terminator
  if (nightsideFactor > 0.001) {
    vec3 earthshineTint = vec3(0.600, 0.667, 0.733);  // #9AAABB
    gDetailEmissive += earthshineTint * 0.06 * nightsideFactor * uDetailBlend;
  }
}

// ===== FINAL: Blend detail back into diffuseColor =====
diffuseColor.rgb = mix(diffuseColor.rgb, detail * dTint, uDetailBlend);
