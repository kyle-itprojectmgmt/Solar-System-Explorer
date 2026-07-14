// ---------------------------------------------------------------------------
// Neptune system configuration (V8 skeleton — Worker 4 completes primary
// detail fields + moons; schema mirrors saturn.js).
//
// Triton is the second showpiece: RETROGRADE orbit expressed through
// inclinationDeg 156.885 (the engine's Phoebe convention — inclinations
// > 90 deg genuinely circle backwards, no special casing), nitrogen
// geysers via the config-driven plume system, cantaloupe terrain in its
// own detail style.
//
// TEXTURES (in /public/textures/): SSS 2K Neptune (CC BY 4.0);
// triton/diffuse.jpg is the real Voyager 2 cylindrical map (Steve Albers
// SOS, 4096x2048 — non-commercial by permission, attribution required,
// same source as the Galilean/Saturnian moons).
// ---------------------------------------------------------------------------

export default {
  name: 'Neptune System',
  slug: 'neptune',

  // Simulation epoch: Voyager 2 closest approach — the most distant
  // planetary flyby in history (house pattern epochs).
  epoch: '1989-08-25T03:56:36Z',

  // 0.1% of Earth's sunlight — the dimmest, bluest night in the simulator.
  nightAmbient: { color: 0x1e2a45, intensity: 0.05 },

  star: {
    name: 'Sun',
    distanceAU: 30.07,
    color: 0xffeedd,
    intensity: 2.0,           // house-pattern readability scale
    // Sun direction at the EPOCH in Neptune's equatorial frame (v8cal.mjs,
    // verified through sunDirectionAt()): lambda0 = -34.81 deg, anchored
    // to the ~2005-08 southern solstice (lambda = 0, dec = -28.3 deg).
    // Reproduces the Voyager epoch (dec -22.9 deg, southern summer — what
    // Voyager photographed) and today's LIVE dec -19.3 deg (real ~-18.7).
    // e = 0.009 — the circular model is near-exact.
    // Vector form (cos l0 * cos tilt, -cos l0 * sin tilt, -sin l0).
    direction: [0.7228, -0.3895, 0.5708],
  },

  primary: {
    name: 'Neptune',
    slug: 'neptune',
    type: 'Ice Giant',
    radiusKm: 24622,
    polarRadiusKm: 24341,
    massKg: 1.024e26,
    rotationPeriodHours: 16.11,
    rotationPhaseAtEpochDeg: 0,  // decorative — banded texture
    orbitalPeriodDays: 60190,    // 164.8 years
    axialTiltDeg: 28.32,
    surfaceGravity: 11.15,       // m/s² at cloud tops
    surfaceTempRange: [-218, -218], // °C

    textures: { diffuse: 'diffuse.jpg' },

    normalScale: 1.5,
    detailFloor: { softKm: 5000, hardKm: 1000 },
    minInsertionAltKm: 5000,

    atmosphere: {
      // 3-stop vertical gradient (v10.0.3): bright blue at the cloud tops,
      // vivid cobalt mid, deep navy fading out at the top of the haze.
      colorLow:  [0.40, 0.60, 1.00],
      colorMid:  [0.15, 0.35, 0.90],
      colorHigh: [0.05, 0.15, 0.60],
      thickness: 0.015,      // thin methane haze shell
      fresnelPower: 3.5,
      opacity: 0.50,
    },

    features: { atmosphericGlow: true, equatorialBulge: true },

    // Unified shader convention (V7 1b): Neptune's terminator is crisp
    // (thin atmosphere compared to Jupiter), but the methane haze rounds
    // the limb slightly.
    shaderParams: {
      dayFadeSoft0: -0.20, dayFadeSoft1: 0.18,
      grazeFade0: 0.12, grazeFade1: 0.45,
    },

    // Poseidon detail style: Worker 4's cloud chunk + procedural weather.
    // Activation is deliberate: cobalt base + banding reads well from NAV
    // approach distance; cloud layers stage in via their own altitude gates.
    detail: { style: 'poseidon', activationKm: 120000, fullKm: 5000 },

    radiationWarning: {
      zones: [
        { minKm: 0, maxKm: 4000, label: '⚠️ Upper atmosphere — 2,100 km/h winds below' },
      ],
    },

    navPresets: [
      {
        label: '🌀 Great Dark Spot',
        altitudeKm: 25000,
        uv: [0.5, 0.39],
        message: 'Approaching Neptune\'s Great Dark Spot — an Earth-sized storm that drifts with time',
      },
      {
        label: '❄️ South Pole',
        altitudeKm: 30000,
        uv: [0.5, 0.06],
        message: 'Descending toward Neptune\'s warm south pole, venting methane into the vacuum',
      },
    ],

    surfaceFeatures: [
      { name: 'Great Dark Spot', latDeg: -20, lonDeg: 0 },
      { name: 'Scooter cloud band', latDeg: -42, lonDeg: 0 },
    ],

    notableFeatures: [
      'Neptune has the strongest winds in the solar system — 2,100 km/h',
      'The Great Dark Spot is an Earth-sized storm observed by Voyager 2 in 1989',
      'Neptune was discovered mathematically in 1846, predicted before it was seen',
      'A deep-blue methane atmosphere creates the most vivid ice giant in the solar system',
    ],

    moreInfo: {
      winds: 'Neptune\'s winds reach 2,100 km/h at the equator — faster than the speed of sound on Earth',
      prediction: 'In 1846, Le Verrier predicted Neptune\'s location from gravitational perturbations of Uranus; Galle observed it that same year',
      voyager: 'Voyager 2 (1989) remains the only spacecraft to visit Neptune, discovering its Great Dark Spot and six new moons',
      heat: 'Neptune radiates 2.6 times the energy it receives from the Sun — a mysterious internal heat source drives the storms',
    },

    facts: [
      'Neptune is an ice giant with the strongest winds in the solar system',
      'The Great Dark Spot storm is as large as Earth but drifts and changes over time',
      'Neptune was predicted mathematically before it was ever observed through a telescope',
    ],
  },

  bodies: [
    {
      name: 'Triton', slug: 'triton',
      radiusKm: 1353.4, massKg: 2.139e22,
      semiMajorAxisKm: 354759, periodDays: 5.877, phaseDeg: 0, inclinationDeg: 156.885,
      // NOTE: Triton's inclination > 90° means it orbits genuinely retrograde
      // (backwards relative to Neptune's rotation). This is the Phoebe convention
      // — the engine handles it at face value, no special-case flag needed.
      physics: 'kepler', tidallyLocked: true,
      textures: { diffuse: 'diffuse.jpg' },
      normalScale: 1.0,  // calibrated down: dimple relief saturated at 1.5
      detailFloor: { softKm: 200, hardKm: 50 },
      color: 0xd9a89a,
      type: 'Captured Moon',
      surfaceGravity: 0.779,
      surfaceTempRange: [-235, -235],
      orbitalDistanceKm: { min: 354753, max: 354765 },
      detail: { style: 'triton', activationKm: 6000, fullKm: 200 },
      atmosphereLimb: {
        color: 0xe8c8d8,    // faint pink nitrogen haze
        thickness: 0.005,
        intensity: 0.10,
        fresnelPower: 7.0,
      },
      geysers: {
        enabled: true,
        heightKm: 40,  // real plumes are 8 km tall — rendered at 40 km (5x) or sub-pixel at usable altitudes
        locations: [
          { name: 'Hili', latDeg: -57, lonDeg: 35 },
          { name: 'Mahilani', latDeg: -50.5, lonDeg: -0.5 },
          { name: 'South Fan A', latDeg: -62, lonDeg: 120 },
          { name: 'South Fan B', latDeg: -55, lonDeg: -140 },
        ],
        tint: {
          spriteColor: 'rgba(95,80,65,1)',
          pointColor: 0x4a3a2c,
          hotspotSprite: 'rgba(130,110,90,1)',
          hotspotColor: 0x6a5646,
          opacity: 0.5,
          spreadFrac: 0.25,
        },
      },
      surfaceFeatures: [
        { name: 'Tuonela Planitia', latDeg: 34, lonDeg: 14 },
        { name: 'Hili Plume', latDeg: -57, lonDeg: 35 },
        { name: 'Mahilani Plume', latDeg: -50.5, lonDeg: -0.5 },
        { name: 'Cantaloupe Terrain', latDeg: 10, lonDeg: -30 },
      ],
      notableFeatures: [
        'Coldest measured surface in the solar system — -235°C',
        'A retrograde captured Kuiper Belt Object, destined for tidal disruption',
        'Active nitrogen geysers erupt from a subsurface ocean of liquid nitrogen',
        'Unique cantaloupe terrain — cellular dimples cover the equatorial zone',
      ],
      moreInfo: {
        capture: 'Triton was captured from the Kuiper Belt, likely billions of years ago, settling into a retrograde orbit',
        geysers: 'Nitrogen geysers reach 8 km high, powered by subsurface nitrogen ice volatilization',
        doom: 'Triton is spiraling inward due to tidal forces — it will be torn apart by Roche limit in approximately 3.6 billion years',
      },
      facts: [
        'Triton is the coldest world ever measured — -235°C at the surface',
        'It orbits backwards (retrograde), captured from the Kuiper Belt eons ago',
        'Active nitrogen geysers erupt from Triton\'s icy surface, unique in the solar system',
      ],
    },
    {
      name: 'Proteus', slug: 'proteus',
      radiusKm: 210, massKg: 4.4e19,
      radii: { x: 220, y: 208, z: 194 },
      semiMajorAxisKm: 117647, periodDays: 1.1223, phaseDeg: 180, inclinationDeg: 0.075,
      physics: 'kepler', tidallyLocked: true,
      color: 0x565248,
      normalScale: 2.0,
      detailFloor: { softKm: 50, hardKm: 10 },
      geometrySegments: 64,
      detail: { style: 'cratered', activationKm: 2000, fullKm: 30 },
      type: 'Irregular Moon',
      surfaceGravity: 0.07,
      surfaceTempRange: [-222, -222],
      orbitalDistanceKm: { min: 115890, max: 119404 },
      notableFeatures: [
        'Largest irregularly-shaped moon of Neptune — as large as a moon can be without becoming spherical',
        'Pharos crater spans nearly half the moon\'s width, dominating one hemisphere',
        'Dark, cratered surface pocked by impacts across billions of years',
        'Prograde orbit (inclinationDeg 0.075°) — proof of Triton\'s retrograde oddity at a glance',
      ],
      moreInfo: {
        shape: 'Proteus\'s irregular ellipsoid (220×208×194 km) is held together by gravity just barely — slightly larger and it would be round',
        pharos: 'Pharos crater, ~300 km across, is so large relative to Proteus that the impact should have shattered it',
        darkness: 'Proteus is one of the darkest moons in the solar system, suggesting ancient regolith and minimal frost coverage',
      },
      facts: [
        'Proteus is the largest irregularly-shaped moon in the solar system',
        'The Pharos crater is so enormous that it dominates the entire moonscape',
        'Despite being the second-largest moon of Neptune, Proteus orbits prograde while Triton orbits backward',
      ],
    },
  ],

  loadingFacts: [
    'Neptune has the strongest winds in the solar system — 2,100 km/h',
    'Triton orbits backwards and will one day be torn apart by Neptune',
    'Neptune was predicted mathematically before it was ever seen',
    'A year on Neptune is 165 Earth years',
    'Voyager 2 is the only spacecraft to have visited Neptune (1989)',
    'Triton is the coldest measured surface in the solar system (-235°C)',
  ],
};
