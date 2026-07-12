// Mars procedural surface detail — dichotomy, Olympus Mons, Valles Marineris, dust.
// Activation: uDetailBlend gates on altitude (0 above 20,000 km).
// Injected into the 'ares' detail style; the style provides the preamble
// (dBase/detail) and final mix. Extra uniforms: uSunObj.

// Olympus Mons center: lat 18.65N, lon 226.2E = -133.8 east-convention.
// Precomputed numerically — (cos la cos lo, sin la, -cos la sin lo); GLSL ES
// const initializers can't call builtins, and the original double-converted
// degrees. Orchestrator-verified against the body-frame convention.
const vec3 ms_olympusDir = vec3(-0.6558, 0.3198, 0.6839);

// Valles Marineris spine: lat roughly -12 + 4*sin(meander), lon from 265E to 330E.
// Returns the depth (negative height) from the canyon axis (0 = on axis, 1 = far away).
float ms_vallesMarin(vec3 p, out float depth) {
  // Extract latitude and longitude from vObjPos.
  float lat = asin(p.y);
  float lon = atan(-p.z, p.x);

  // Meander the center latitude with longitude.
  float latCenter = -12.0 * 3.14159 / 180.0 + 4.0 * 3.14159 / 180.0 * sin((lon + 1.1) * 1.5);

  // Canyon spans 265E..330E = -95..-30 in atan2's -180..180 range (the
  // original tested against 265..330, which atan2 can never produce —
  // the canyon never rendered).
  float lonDeg = lon * 180.0 / 3.14159;
  float inLonRange = smoothstep(-105.0, -95.0, lonDeg) * (1.0 - smoothstep(-30.0, -20.0, lonDeg));

  // Distance from center latitude, width ~0.035 rad.
  float latDist = abs(lat - latCenter);
  float canyonMask = (1.0 - smoothstep(0.035, 0.055, latDist)) * inLonRange;

  // Depth modulation: fbm-warped floor, stronger at center. Fixed 3 octaves —
  // dOct is a local of the injected apply block and doesn't exist at
  // function scope.
  float floorNoise = fbm3(p * 50.0) * 0.4;
  depth = -0.3 * (1.0 - smoothstep(0.0, 0.035, latDist)) * (1.0 + floorNoise);

  return canyonMask;
}

// === APPLY ===

float ms_polar = smoothstep(0.94, 0.88, abs(vObjPos.y)); // fade above ±70°

// Mars dichotomy: darker in the south (volcanic/highland), lighter in the north (dusty).
float ms_lum = dot(dBase, vec3(0.299, 0.587, 0.114));
float ms_southWeight = smoothstep(0.1, -0.1, vObjPos.y); // stronger in southern hemisphere
float ms_isHighland = smoothstep(0.35, 0.50, mix(ms_lum, 0.3, ms_southWeight));

// Olympus shield: real proportions — ~300 km basal radius ≈ 0.09 rad. The
// young volcanic surface suppresses the crater field inside the shield.
float ms_olympusD = acos(clamp(dot(vObjPos, ms_olympusDir), -1.0, 1.0));
float ms_olympusMask = 1.0 - smoothstep(0.10, 0.13, ms_olympusD);

// HIGHLANDS: ancient cratered terrain with wind ripples. Craters follow
// Callisto's dUv pattern (the original xz projection stretched cells into
// lattice-aligned ellipse columns near the equatorial limbs — measured at
// 3,000 km) with the signed profile driving RELIEF, color only subtly.
// Erosion character: soft rims, dust-filled floors slightly LIGHTER.
{
  if (ms_isHighland > 0.001) {
    // Continent-scale basins live in the 8K TEXTURE — procedural craters
    // are the below-texture-resolution "infinite detail" only, so they
    // stage in at LOW altitude (the freq-30 layer painted 1,300 km donut
    // stamps over the whole disc at 3,000 km — measured).
    float hl = ms_isHighland * ms_polar * (1.0 - ms_olympusMask);

    // Craters are a WHISPER: the 8K texture already carries every basin
    // the eye expects at orbit altitudes (measured — the bare texture at
    // 1,200 km beats every stamped-donut procedural version). Procedural
    // bowls only add sub-texture roughness on final approach.
    float crAct = 1.0 - smoothstep(600.0, 1500.0, uAltitude);
    if (crAct > 0.001) {
      float cFade = dtlFreqFade2(dUv, 300.0);
      float id1; float c = craterProfile(dUv * 300.0 + 7.3, id1);
      c *= 0.5 * step(0.4, fract(id1 * 7.77)); // eroded + hash-thinned
      detail = mix(detail, detail * vec3(1.05, 1.03, 1.00),
        clamp(-c, 0.0, 1.0) * 0.10 * crAct * cFade * hl);
      gDetailHeight += clamp(c, -1.0, 1.0) * 0.06 * crAct * cFade * hl;

      // Powdery regolith grain on final approach.
      gDetailHeight += snoise(vObjPos * 900.0) * 0.03
        * dtlFreqFade(vObjPos, 900.0) * crAct * hl;
    }

    // Wind ripples: long east-west streaks = LOW frequency along the
    // horizontal axes, high along y (the original had it inverted and
    // painted north-south verticals).
    float wind = fbmN(vObjPos * vec3(14.0, 60.0, 14.0), dOct);
    detail = mix(detail, detail * vec3(1.05, 1.02, 0.99), (0.5 + 0.5 * wind) * 0.10 * hl);
  }
}

// LOWLANDS: smooth northern plains with sparse small craters, east-west streaks
{
  if (ms_isHighland < 0.999) {
    float lowlandMask = (1.0 - ms_isHighland) * ms_polar;

    // Sparse small craters (dUv like the highlands): hash-thinned cells,
    // staged in below texture resolution like the highland field.
    float lowCrAct = 1.0 - smoothstep(600.0, 1500.0, uAltitude);
    if (lowCrAct > 0.001) {
      float cellId;
      float crater = craterProfile(dUv * 380.0 + 3.1, cellId);
      float sparseMask = step(0.65, fract(cellId * 12.345));
      gDetailHeight += clamp(crater, -1.0, 1.0) * 0.05 * sparseMask
        * dtlFreqFade2(dUv, 380.0) * lowlandMask * lowCrAct;
    }

    // East-west wind streaks: very elongated, faint.
    float streaks = fbmN(vObjPos * vec3(8.0, 40.0, 8.0), dOct) * 0.08;

    // Subtle lowland tint shift
    detail = mix(detail, detail * vec3(1.05, 1.0, 0.98), streaks * lowlandMask * 1.2);
  }
}

// OLYMPUS MONS: lat 18.65N, lon 226.2E, active below 8,000 km.
// Real proportions: ~600 km across (0.09 rad basal radius), 80 km caldera.
{
  float olympusAltFade = 1.0 - smoothstep(0.0, 8000.0, uAltitude);
  if (olympusAltFade > 0.001) {
    float d = ms_olympusD;

    // Shield rise: the whole edifice is gently raised toward the summit.
    if (d < 0.10) {
      gDetailHeight += (1.0 - smoothstep(0.0, 0.10, d)) * 0.25 * olympusAltFade;
    }

    // Caldera depression (~80 km across ≈ 0.012 rad, centered at summit)
    if (d < 0.012) {
      gDetailHeight += -0.25 * (1.0 - smoothstep(0.004, 0.012, d)) * olympusAltFade;
      detail = mix(detail, detail * 0.85, 0.3 * olympusAltFade);
    }

    // Basal scarp: Olympus's 8 km cliff at the shield edge — a smooth thin
    // annulus with gentle brightness variation (ridged-noise blobs read as
    // a "stone circle" of lumps, measured at 3,000 km).
    float scarp = smoothstep(0.070, 0.085, d) * (1.0 - smoothstep(0.095, 0.115, d));
    if (scarp > 0.001) {
      float cliff = 0.85 + 0.15 * snoise(vObjPos * 60.0);
      gDetailHeight += cliff * 0.20 * scarp * olympusAltFade;
      detail = mix(detail, detail * 1.08, scarp * 0.22 * olympusAltFade);
    }

    // Radial lava-flow texture across the shield flanks.
    if (d < 0.11) {
      vec3 e1 = normalize(cross(vec3(0.0, 1.0, 0.0), ms_olympusDir));
      vec3 e2 = cross(ms_olympusDir, e1);
      vec2 lavaUv = vec2(dot(vObjPos - ms_olympusDir, e1), dot(vObjPos - ms_olympusDir, e2)) * 60.0;
      float ang = atan(lavaUv.y, lavaUv.x);
      // Flows elongate RADIALLY: vary with angle, slowly with distance.
      float lavaFlow = fbmN(vec3(ang * 3.0, d * 25.0, 4.4), dOct) * 0.4;
      float lavaFade = 1.0 - smoothstep(0.02, 0.11, d);
      detail = mix(detail, detail * (1.0 + lavaFlow * 0.25), lavaFade * olympusAltFade);
    }
  }
}

// VALLES MARINERIS: elongated canyon, active below 12,000 km
{
  float vmAltFade = 1.0 - smoothstep(0.0, 12000.0, uAltitude);
  if (vmAltFade > 0.001) {
    float vmDepth;
    float vmMask = ms_vallesMarin(vObjPos, vmDepth);

    if (vmMask > 0.001) {
      gDetailHeight += vmDepth * vmAltFade;

      // Wall strata: banded noise along depth gradient
      float strataFreq = snoise(vObjPos * 100.0 + vec3(vmDepth * 5.0)) * 0.5 + 0.5;
      float strataPattern = step(0.4, fract(strataFreq * 3.0)); // sharp bands

      // Canyon floor slightly lighter (dust-filled)
      float floorLight = smoothstep(-0.3, -0.05, vmDepth);
      vec3 canyonFloor = mix(detail * 1.1, detail * 0.9, floorLight);

      detail = mix(detail, mix(canyonFloor, detail * vec3(0.7, 0.5, 0.4), strataPattern), vmMask * vmAltFade * 0.3);
    }
  }
}

// GLOBAL: fine dust-grain speckle below 2,000 km (edge-erosion style, not additive)
{
  float speckleAltFade = 1.0 - smoothstep(0.0, 2000.0, uAltitude);
  if (speckleAltFade > 0.001) {
    vec3 speckleSeed = vObjPos * 200.0 + snoise(vObjPos * 50.0) * 2.0;
    float speckle = (snoise(speckleSeed) * 0.5 + 0.5);
    // freq fade takes the UNSCALED position + the layer frequency.
    speckle *= dtlFreqFade(vObjPos, 200.0);

    // Edge erosion: only eat where coverage would be mid-range
    float edgeMask = clamp(1.0 - abs(speckle - 0.5) * 3.0, 0.0, 1.0);
    speckle = clamp(speckle - speckle * edgeMask * speckleAltFade * 0.08, 0.0, 1.0);
    detail = mix(detail, detail * vec3(0.95, 0.94, 0.92), speckle * speckleAltFade * 0.05);
  }
}

// EQUATORIAL HAZE: subtle low-altitude tint shift below 3,000 km
{
  float hazeFade = smoothstep(3000.0, 500.0, uAltitude);
  if (hazeFade > 0.001) {
    vec3 hazeTint = vec3(0.75, 0.55, 0.40);
    detail = mix(detail, hazeTint, hazeFade * 0.06 * smoothstep(-0.3, 0.3, vObjPos.y));
  }
}

// Apply polar fade to all layers
detail = mix(dBase, detail, ms_polar);

// Mars surface: no city lights or emissive effects on the night side.
// gDetailEmissive stays at vec3(0.0) — relief shading works automatically.
