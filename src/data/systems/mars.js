// ---------------------------------------------------------------------------
// Mars system configuration (V6). Schema mirrors earth.js — the engine is
// fully data-driven and nothing in /src/engine knows this is Mars.
//
// Units: km, kg, days, hours, degrees — the engine converts to scene units.
//
// TEXTURE SOURCES (noted per file in /public/textures/mars|phobos|deimos):
// Mars diffuse: Solar System Scope 2K/4K Mars (CC BY 4.0) — needs a Referer
//   header past hotlink protection (v5a gotcha), else NASA Viking mosaic.
// Mars normal: derived from MOLA topography (USGS Astrogeology, public
//   domain) if obtainable; procedural relief in the detail shader otherwise.
// Phobos / Deimos: NASA/JPL Viking imagery mosaics, public domain.
// ---------------------------------------------------------------------------

export default {
  name: 'Mars System',
  slug: 'mars',

  // Simulation epoch: Viking 1 touchdown at Chryse Planitia — the first
  // successful Mars landing, seven years to the day after Apollo 11.
  // (Historic-mission epochs are the house pattern: Voyager 1 for Jupiter,
  // Apollo 11 for Earth.)
  epoch: '1976-07-20T11:53:06Z',

  // Night side: faint rusty terrain silhouettes, no city lights to compete
  // with — slightly dimmer than Earth's ambient.
  nightAmbient: { color: 0x554433, intensity: 0.06 },

  star: {
    name: 'Sun',
    distanceAU: 1.524,
    color: 0xfff0dd,          // marginally warmer through suspended dust
    intensity: 2.4,           // Mars gets 43% of Earth's sunlight; kept
                              // brighter than physical for readability
                              // (house pattern — Jupiter uses 2.6 at 5.2 AU)
    // Sun direction at the EPOCH in Mars's equatorial frame. Calibration
    // (verified by tests/marscal.mjs, same method as Earth's suncal):
    //   Viking 1 landed at Ls ≈ 97° — just past northern summer solstice —
    //   so solar declination = asin(sin 25.19° · sin 97°) ≈ +25.0°.
    //   Landing was 16:13 local mean solar time at 49.97°W: the sun sat
    //   ~4.22 h past local noon → subsolar longitude ≈ 111.5°W.
    // PIPELINE GOTCHA (measured): sunDirectionAt() FLATTENS this vector's
    // declination and rebuilds it from the tilt — the seasonal phase lives
    // in the ecliptic longitude λ0, not in the y component. So this vector
    // must be the model's own equatorial form
    //   (cos λ0·cos tilt, −cos λ0·sin tilt, −sin λ0)
    // with λ0 = −173.2° chosen so declination = +25.0° AND decreasing
    // (post-solstice). The epoch longitude offset is carried by
    // rotationPhaseAtEpochDeg below.
    // NOTE the ephemeris is a circular-orbit model; Mars e = 0.093 means
    // the subsolar longitude can lead/lag by up to ~10° across the year.
    // Fine for lighting; refine when the ephemeris gains eccentricity.
    direction: [-0.8986, 0.4226, 0.1184],
  },

  primary: {
    name: 'Mars',
    slug: 'mars',
    type: 'Terrestrial Planet',
    radiusKm: 3396.2,         // equatorial
    polarRadiusKm: 3376.2,    // oblate — rendered as ellipsoid
    massKg: 6.417e23,
    // True sidereal day (24h 37m 22.66s). The SOLAR day (sol) is 24.6597 h —
    // do not confuse them; the terminator calibration needs sidereal.
    rotationPeriodHours: 24.6229,
    // frame azimuth of the epoch sun (−172.5°) minus the Viking subsolar
    // longitude (−111.5°) — measured convention: frame_lon = body_lon + phase.
    rotationPhaseAtEpochDeg: -61.0,
    orbitalPeriodDays: 686.98,
    axialTiltDeg: 25.19,
    surfaceGravity: 3.72,          // m/s²
    surfaceTempRange: [-125, 20],  // °C

    // 2K base loads fast; desktop silently upgrades to the 8K SSS map
    // (same progressive diffuseHigh path Earth uses).
    textures: { diffuse: 'diffuse.jpg', diffuseHigh: 'diffuse_8k.jpg' },

    // Detail floor: zoom resistance and hard-stop altitudes for procedural relief.
    normalScale: 2.0,
    detailFloor: { softKm: 400, hardKm: 100 },
    minInsertionAltKm: 200,

    // Mars has no magnetosphere — warn only on reentry/direct impact.
    radiationWarning: {
      zones: [
        { minKm: 0, maxKm: 300, label: '⚠️ Reentry altitude' },
      ],
    },

    // Thin CO₂ atmosphere with salmon dust scattering via custom shader.
    // Post-v7 hardware fix: shell 0.015→0.012, fresnel pow 4.5 + tight
    // night cutoff in the shader. Intensity stays 0.9 — the shader bakes
    // a ×0.35 scale, so effective opacity ≈ 0.32 (already at spec).
    atmosphere: {
      limbEdge: 0xc86448,     // salmon-rust at the very limb
      limbMid: 0xe8a878,      // pale tan mid-falloff
      thickness: 0.012,
      intensity: 0.9,
      style: 'dust',          // signature rusty scattering
    },

    features: { atmosphericGlow: true, equatorialBulge: true },

    // Unified shader convention (V7 1b, surface-base.glsl). These are the
    // v6.0.2 night-fade values (bug #55) verbatim: sharp terminator (thin
    // atmosphere) + high-frequency graze fade for the sparkle-prone layers.
    shaderParams: {
      dayFadeSoft0: -0.08, dayFadeSoft1: 0.15,
      grazeFade0: 0.20, grazeFade1: 0.55,
    },

    // Ares detail shader: procedural relief for dust-eroded terrain.
    // Activation is deliberately HIGH (Earth-like) because the style also
    // carries the dust-storm veil — a 2018-style global storm is visible
    // from any distance, not just low orbit. Surface layers stage
    // themselves in far lower via their own altitude gates.
    detail: {
      style: 'ares',
      activationKm: 50000,
      fullKm: 400,
      params: { dustIntensity: 0.2 },
    },

    // UI navigation shortcuts to texture-anchored surface features.
    navPresets: [
      {
        label: '🌋 Olympus Mons',
        altitudeKm: 2000,
        uv: [0.1283, 0.6036],
        message: 'Descending to Olympus Mons — 21 km above the plains',
      },
      {
        label: '🏔️ Valles Marineris',
        altitudeKm: 1500,
        uv: [0.3333, 0.4333],
        message: 'Soaring over Valles Marineris — 4,000 km of canyon',
      },
    ],

    // Surface feature landmarks visible from orbit (east-positive longitude).
    surfaceFeatures: [
      { name: 'Olympus Mons',   latDeg: 18.65,  lonDeg: -133.8 },
      { name: 'Valles Marineris', latDeg: -12.0, lonDeg: -60.0 },
      { name: 'Hellas Basin',   latDeg: -42.4,  lonDeg: 70.5 },
      { name: 'Jezero Crater',  latDeg: 18.4,   lonDeg: 77.7 },
      { name: 'Gale Crater',    latDeg: -5.4,   lonDeg: 137.8 },
      { name: 'Syrtis Major',   latDeg: 8.4,    lonDeg: 69.5 },
      { name: 'Tharsis Plateau', latDeg: 2.0,   lonDeg: -113.0 },
      { name: 'Argyre Basin',   latDeg: -49.7,  lonDeg: -44.0 },
      { name: 'Elysium Mons',   latDeg: 25.0,   lonDeg: 147.2 },
      { name: 'Utopia Planitia', latDeg: 46.7,  lonDeg: 117.5 },
    ],

    notableFeatures: [
      'Olympus Mons — the largest volcano in the solar system, 21 km above the plains',
      'Valles Marineris — a 4,000 km canyon system dwarfing Earth\'s Grand Canyon',
      'Planet-engulfing dust storms visible from Earth when they occur',
      'Ancient river valleys and deltas hint at a warmer, wetter past',
      'Two tiny captured-asteroid moons, Phobos and Deimos',
    ],

    moreInfo: {
      atmosphere: 'CO₂ 95%, nitrogen 2.8%, argon 2% — 0.6% of Earth\'s pressure',
      day: 'A sol is 24 h 37 m — Mars time is the closest to Earth\'s of any planet',
      missions: 'Perseverance and Curiosity rovers active; Viking 1 landed July 20, 1976',
      water: 'Polar caps hold enough water ice to flood the planet 35 m deep',
    },

    facts: [
      'Mars is named after the Roman god of war for its blood-red color',
      'Dust storms on Mars can last months and encircle the entire planet',
      'A Martian year is 687 Earth days — missions endure long mission cycles',
    ],
  },

  // Phobos and Deimos — two tiny captured-asteroid moons (Kepler orbits).
  // Neither has public cylindrical maps (JPL/Stooke maps exist but require
  // manual fetch). Rendered as ellipsoids via radii with procedural detail.
  bodies: [
    {
      name: 'Phobos', slug: 'phobos',
      radiusKm: 11.1,           // mean
      radii: { x: 13.5, y: 11.0, z: 9.0 }, // real irregular: ~27 × 22 × 18 km
      massKg: 1.0659e16,
      semiMajorAxisKm: 9376, periodDays: 0.31891, phaseDeg: 0,
      physics: 'kepler', tidallyLocked: true,
      color: 0x4a423c,          // one of the darkest objects in the solar system
      normalScale: 2.0,
      detailFloor: { softKm: 20, hardKm: 5 },
      geometrySegments: 64,
      type: 'Irregular Moon',
      discoveredYear: 1877,
      discoveredBy: 'Asaph Hall',
      surfaceGravity: 0.0057,   // m/s²
      surfaceTempRange: [-40, -4], // °C
      orbitalDistanceKm: { min: 9234, max: 9518 },
      // Detail shader: cratered style (matches Callisto pattern).
      detail: { style: 'cratered', activationKm: 2000, fullKm: 20 },
      notableFeatures: [
        'Orbits faster than Mars rotates — rises in the west, sets in the east',
        'Doomed: tidal decay will crash or shred it within ~50 million years',
        'Stickney crater spans nearly half its width',
        'One of the darkest objects in the solar system',
      ],
      facts: [
        'Phobos orbits Mars in just 7.5 hours — faster than Mars spins',
        'Its tidal forces gradually slowing it into the planet over ~50 million years',
      ],
    },
    {
      name: 'Deimos', slug: 'deimos',
      radiusKm: 6.2,            // mean
      radii: { x: 7.5, y: 6.0, z: 5.5 }, // real irregular: ~15 × 12 × 11 km
      massKg: 1.4762e15,
      semiMajorAxisKm: 23463, periodDays: 1.26244, phaseDeg: 180,
      physics: 'kepler', tidallyLocked: true,
      color: 0x5a5248,          // slightly lighter, dust-blanketed
      normalScale: 1.5,
      detailFloor: { softKm: 10, hardKm: 3 },
      geometrySegments: 64,
      type: 'Irregular Moon',
      discoveredYear: 1877,
      discoveredBy: 'Asaph Hall',
      surfaceGravity: 0.003,    // m/s²
      surfaceTempRange: [-40, -4], // °C
      orbitalDistanceKm: { min: 23456, max: 23471 },
      // Detail shader: cratered style (matches Callisto pattern).
      detail: { style: 'cratered', activationKm: 2000, fullKm: 20 },
      notableFeatures: [
        'Only 15 km across — escape velocity is a brisk walking pace',
        'Smoother than Phobos — blanketed in thick regolith dust',
        'From Mars it looks like a bright star, barely a disc',
      ],
      facts: [
        'Deimos is so small that you could almost jump off it',
        'Its low gravity means loose dust stays on the surface despite impacts',
      ],
    },
  ],

  loadingFacts: [
    'Olympus Mons is three times the height of Mount Everest',
    'Valles Marineris would stretch across the entire United States',
    'A Martian day is only 40 minutes longer than Earth\'s',
    'Mars has the largest dust storms in the solar system',
    'Liquid water once flowed on Mars billions of years ago',
    'Viking 1 made the first successful Mars landing on July 20, 1976',
    'Perseverance rover has explored Jezero Crater since 2021',
    'Phobos orbits Mars faster than Mars rotates — it rises in the west',
  ],
};
