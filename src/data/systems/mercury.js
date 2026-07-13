// ---------------------------------------------------------------------------
// Mercury system configuration (V8 skeleton — Worker 1 completes primary
// detail fields; schema mirrors mars.js). No moons, no atmosphere: the
// simplest system in the simulator.
//
// TEXTURES (in /public/textures/mercury/): Solar System Scope 8K Mercury
// (CC BY 4.0, fetched with Referer header) as diffuse_8k.jpg, local GDI+
// 2K downscale as the fast-loading base (house pattern).
// ---------------------------------------------------------------------------

export default {
  name: 'Mercury System',
  slug: 'mercury',

  // Simulation epoch: MESSENGER orbit insertion — the first spacecraft to
  // orbit Mercury (house pattern: historic-mission epochs).
  epoch: '2011-03-18T00:45:00Z',

  // No atmosphere to scatter light: the night side is nearly black, with
  // only a starlight hint so the silhouette stays readable.
  nightAmbient: { color: 0x222230, intensity: 0.03 },

  star: {
    name: 'Sun',
    distanceAU: 0.387,
    color: 0xfff5e8,          // harsh, un-filtered sunlight
    intensity: 2.6,           // 6.7x Earth's flux in reality; house-pattern
                              // readability scale (Jupiter 2.6 @ 5.2 AU)
    // Sun direction at the EPOCH in Mercury's equatorial frame, calibrated
    // by scratch v8cal.mjs through the engine's own sunDirectionAt():
    //   lambda0 = -95.65 deg — MEAN-longitude anchor. Mercury e = 0.206 is
    //   the circular ephemeris model's worst case: the true subsolar
    //   longitude oscillates +-23 deg (equation of center) around this
    //   zero-mean anchor every 88-day year. Accepted and documented; the
    //   surface is longitude-anchored only via craters, and LIVE lighting
    //   stays right on average.
    //   Vector form (cos l0 * cos tilt, -cos l0 * sin tilt, -sin l0).
    direction: [-0.0985, 0.0001, 0.9951],
  },

  primary: {
    name: 'Mercury',
    slug: 'mercury',
    type: 'Terrestrial Planet',
    radiusKm: 2439.7,
    massKg: 3.301e23,
    // True sidereal rotation: 58.6462 days (3:2 spin-orbit resonance —
    // exactly 3 rotations per 2 orbits; a solar day lasts 2 Mercury years).
    rotationPeriodHours: 1407.51,
    // Epoch frame azimuth of the sun (-95.7 deg) minus the epoch subsolar
    // longitude. MESSENGER OI came 1.7 days after perihelion, when a hot
    // pole (0 deg / 180 deg alternate each orbit) faces the sun; anchored
    // to the 0 deg pole (the 3:2 resonance makes the two indistinguishable
    // in a circular model).
    rotationPhaseAtEpochDeg: -95.7,
    orbitalPeriodDays: 87.969,
    axialTiltDeg: 0.034,      // smallest tilt of any planet — no seasons
    surfaceGravity: 3.7,      // m/s²
    surfaceTempRange: [-180, 430], // °C — largest swing in the solar system

    textures: { diffuse: 'diffuse.jpg', diffuseHigh: 'diffuse_8k.jpg' },

    normalScale: 2.0,
    detailFloor: { softKm: 400, hardKm: 100 },
    minInsertionAltKm: 200,

    // Mercury has no magnetosphere and no atmosphere; warn on high-radiation
    // zones and direct surface impact trajectories.
    radiationWarning: {
      zones: [
        { minKm: 0, maxKm: 150, label: '⚠️ Surface impact trajectory' },
        { minKm: 150, maxKm: 2000, label: '⚠️ Unshielded solar radiation — 6.7x Earth flux' },
      ],
    },

    // Razor-sharp terminator (no atmosphere): dayFadeSoft thresholds
    // narrow the blend band; grazeFade gate fine details at low sun angle
    // to prevent grazing-light sparkle on the night-facing slopes.
    // v8.0.1 (Kyle hardware pass): tightened further — no atmosphere,
    // sharpest terminator in the sim.
    shaderParams: {
      dayFadeSoft0: -0.01, dayFadeSoft1: 0.03,
      grazeFade0: 0.10, grazeFade1: 0.40,
    },

    // Hermes detail shader: cratered regolith with Caloris Basin signature.
    // High activation altitude (20,000 km) to reveal basin and crater structure
    // from orbit; full effect by 400 km.
    detail: {
      style: 'hermes',
      activationKm: 20000,
      fullKm: 400,
    },

    // UI navigation shortcuts to texture-anchored surface features.
    navPresets: [
      {
        label: '🌌 Caloris Basin',
        altitudeKm: 2500,
        uv: [0.027, 0.669],
        message: 'Descending to Caloris Basin — a 1,550 km impact basin scarred across Mercury\'s day side',
      },
      {
        label: '🌗 Terminator Line',
        altitudeKm: 1200,
        uv: [0.5, 0.5],
        message: 'Skirting the terminator — the 600°C day-night divide, the steepest thermal gradient in the solar system',
      },
    ],

    // Surface feature landmarks visible from orbit (east-positive longitude).
    surfaceFeatures: [
      { name: 'Caloris Basin',   latDeg: 30.5,  lonDeg: -170.2 },
      { name: 'Rachmaninoff Crater', latDeg: 27.6,  lonDeg: 57.6 },
      { name: 'Rembrandt Basin', latDeg: -32.9, lonDeg: 87.9 },
      { name: 'Tolstoj Basin',   latDeg: -16.3, lonDeg: -163.5 },
      { name: 'Discovery Rupes', latDeg: -56.3, lonDeg: -38.3 },
      { name: 'Hokusai Crater',  latDeg: 57.8,  lonDeg: 16.8 },
    ],

    notableFeatures: [
      'Caloris Basin — a 1,550 km impact basin the size of the entire continental United States',
      'A 600°C temperature swing between day and night — the largest in the solar system',
      'A 3:2 spin-orbit resonance — Mercury rotates exactly 3 times per 2 orbits',
      'An iron core so massive it comprises 85% of the planet\'s radius',
    ],

    moreInfo: {
      resonance: 'Mercury is locked in a 3:2 spin-orbit resonance with the Sun — exactly 3 rotations per 2 orbits. A solar day lasts 2 Mercury years',
      sun: 'The Sun appears almost 3 times larger from Mercury than from Earth; at perihelion the solar flux reaches 9.7× Earth\'s',
      core: 'Mercury\'s core comprises 85% of the planet\'s radius — the highest core-to-radius ratio of any terrestrial planet',
      exploration: 'MESSENGER orbited Mercury from 2011 to 2015; BepiColombo began its orbital mission in 2026',
    },

    facts: [
      'A year on Mercury is shorter than its day — 88 Earth days to orbit vs. 59 Earth days to rotate once',
      'Mercury has enormous tidal heating from the Sun despite being the smallest terrestrial planet',
      'The thin, transient exosphere escapes to space; there is no atmosphere to hold it',
    ],
  },

  bodies: [],   // Mercury has no moons

  loadingFacts: [
    'Mercury has no atmosphere — temperatures swing 600°C between day and night',
    'A year on Mercury is shorter than its day',
    "Mercury's core makes up 85% of the planet's radius",
    'The Sun appears almost 3x larger from Mercury than from Earth',
    'MESSENGER orbited Mercury from 2011 to 2015',
    'Mercury rotates exactly 3 times for every 2 trips around the Sun',
  ],
};
