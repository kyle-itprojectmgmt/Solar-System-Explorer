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

    // Worker 1 fills: radiationWarning, shaderParams, detail (style
    // 'hermes'), navPresets, surfaceFeatures, notableFeatures, moreInfo,
    // facts. NO atmosphere block and NO features.atmosphericGlow —
    // Mercury's exosphere is invisible.
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
