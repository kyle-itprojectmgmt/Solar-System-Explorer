// ---------------------------------------------------------------------------
// Pluto system configuration (V10 skeleton — Worker 3 completes primary
// detail fields + Charon; schema mirrors neptune.js).
//
// Pluto + Charon is the solar system's only true binary: Charon is half
// Pluto's diameter and both are tidally locked to EACH OTHER — Charon
// hangs stationary in Pluto's sky over the anti-heart hemisphere
// (Sputnik Planitia sits near the anti-Charon point). The engine models
// Charon as a Keplerian moon of Pluto (the ~2,110 km barycenter wobble
// of Pluto itself is not modeled — bug #65 note).
//
// Pluto ROTATION is retrograde: axialTiltDeg 122.53 with a POSITIVE
// rotation period (the house >90° tilt convention — never negative
// periods; same class as Venus 177.36° and Uranus 97.77°).
//
// TEXTURES (in /public/textures/): New Horizons LORRI+MVIC color
// mosaics via Steve Albers SOS (stevealbers.net/albers/sos/) —
// pluto_rgb_cyl_8k.png (shipped as 2K diffuse.jpg + 8K diffuse_8k.jpg
// progressive swap) and pluto/charon/charon_rgb_cyl.jpg (4K).
// Non-commercial by permission, attribution required (backlog #10).
// The southern winter hemispheres are smooth fill — New Horizons flew
// by during northern summer; the south was in decades-long darkness.
// ---------------------------------------------------------------------------

export default {
  name: 'Pluto System',
  slug: 'pluto',

  // Simulation epoch: New Horizons closest approach — humanity's first
  // (and only) Pluto encounter, after a 9.5-year cruise (house pattern
  // epochs: Voyager for Jupiter/Uranus/Neptune, Apollo 11 for Earth).
  epoch: '2015-07-14T11:49:00Z',

  // 1/1,560th of Earth's sunlight — dimmer than Neptune, but the Sun
  // still lights Pluto's day side ~250x brighter than full moonlight.
  nightAmbient: { color: 0x1c2438, intensity: 0.04 },

  star: {
    name: 'Sun',
    distanceAU: 39.48,        // semi-major axis; Pluto was 32.9 AU at the flyby (e = 0.249)
    color: 0xffeedd,
    intensity: 1.9,           // house-pattern readability scale
    // Sun direction at the EPOCH in Pluto's equatorial frame (v10cal.mjs,
    // verified through sunDirectionAt()): lambda0 = +158.1 deg. Reproduces
    // the flyby geometry (subsolar latitude +51.5 deg N — Tombaugh Regio
    // and the north polar region sunlit, the south pole in decades-long
    // darkness) AND the LIVE era (2026 dec ~+57.0 deg, approaching the
    // ~2029-30 northern solstice max of 57.47 deg = 180 - axialTilt).
    // Vector form (cos l0 * cos tilt, -cos l0 * sin tilt, -sin l0).
    direction: [0.4989, 0.7822, -0.3733],
  },

  primary: {
    name: 'Pluto',
    slug: 'pluto',
    type: 'Dwarf Planet',
    radiusKm: 1188.3,
    massKg: 1.303e22,
    // Sidereal day = Charon's orbital period (mutually tidally locked).
    // POSITIVE period + tilt > 90 deg = retrograde rotation (house rule).
    rotationPeriodHours: 153.2935,
    rotationPhaseAtEpochDeg: 0,  // Phase 3: calibrate so Tombaugh Regio faces the sunlit entry at epoch
    orbitalPeriodDays: 90560,    // 248 years
    axialTiltDeg: 122.53,
    surfaceGravity: 0.62,        // m/s² — you'd weigh 6% of Earth weight
    surfaceTempRange: [-233, -223], // °C

    textures: { diffuse: 'diffuse.jpg', diffuseHigh: 'diffuse_8k.jpg' },

    normalScale: 2.5,
    detailFloor: { softKm: 500, hardKm: 50 },
    minInsertionAltKm: 100,

    // Worker 3 fills: detail style, atmosphere (thin blue nitrogen haze),
    // shaderParams, navPresets, surfaceFeatures, body-card fields.

    notableFeatures: [
      'Tombaugh Regio — the iconic heart-shaped nitrogen ice plain',
      'Discovered in 1930, reclassified as a dwarf planet in 2006',
      'New Horizons revealed a geologically active world in 2015',
      'A surprising blue atmospheric haze — Rayleigh scattering like Earth\'s',
    ],

    facts: [
      'Pluto\'s heart, Sputnik Planitia, is a nitrogen ice glacier 1,000 km wide',
      'Water ice mountains on Pluto stand as tall as the Rockies',
      'Pluto\'s atmosphere freezes and falls as snow over its 248-year orbit',
    ],
  },

  bodies: [
    {
      name: 'Charon', slug: 'charon',
      radiusKm: 606.0, massKg: 1.586e21,
      // Same period as Pluto's rotation — the mutual tidal lock. phaseDeg
      // calibrated in Phase 3 so Charon hangs over the anti-heart point.
      semiMajorAxisKm: 19596, periodDays: 6.387229, phaseDeg: 0, inclinationDeg: 0.001,
      physics: 'kepler', tidallyLocked: true,
      textures: { diffuse: 'diffuse.jpg' },
      normalScale: 2.0,
      detailFloor: { softKm: 200, hardKm: 30 },
      geometrySegments: 64,
      color: 0x9a938c,
      type: 'Binary Companion',
      surfaceGravity: 0.288,
      surfaceTempRange: [-220, -220],
      // Worker 3 fills: detail style, surfaceFeatures, body-card fields.
      notableFeatures: [
        'Half the size of Pluto — the largest moon-to-body ratio known',
        'Mordor Macula: a dark red polar cap of radiation-processed tholins',
        'Pluto and Charon are tidally locked to each other — they face each other forever',
      ],
      facts: [
        'Charon is so large that Pluto and Charon orbit a point between them',
        'Its north pole is stained dark red by methane escaped from Pluto',
      ],
    },
  ],

  loadingFacts: [
    'New Horizons revealed Pluto\'s heart in 2015 after a 9-year journey',
    'Pluto was discovered in 1930 by 24-year-old Clyde Tombaugh',
    'The heart is named Tombaugh Regio after Pluto\'s discoverer',
    'Charon is so large that Pluto and Charon orbit each other',
    'Pluto\'s atmosphere freezes and falls as snow every 248 years',
    'Water ice mountains on Pluto are as tall as the Rockies',
    'From Pluto, the Sun looks like a very bright star',
    'Pluto was reclassified as a dwarf planet in 2006',
  ],
};
