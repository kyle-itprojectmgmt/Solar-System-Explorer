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

    // Worker 4 fills: atmosphere (limb glow — vivid blue,
    // features.atmosphericGlow true), shaderParams, detail (style
    // 'poseidon': deep cobalt base, banding between Uranus and Jupiter in
    // strength, white cirrus streaks at mid-latitudes, drifting Great
    // Dark Spot), radiationWarning, navPresets, notableFeatures,
    // moreInfo, facts.
  },

  // Worker 4 fills: Triton (detail style 'triton' — cantaloupe terrain,
  // south polar nitrogen cap; retrograde inclinationDeg 156.885; geysers
  // block with color 0x4a3828 — dark dust-laden nitrogen, ~8 km tall)
  // and Proteus (color-only irregular, cratered style) in the saturn.js
  // body schema.
  bodies: [],

  loadingFacts: [
    'Neptune has the strongest winds in the solar system — 2,100 km/h',
    'Triton orbits backwards and will one day be torn apart by Neptune',
    'Neptune was predicted mathematically before it was ever seen',
    'A year on Neptune is 165 Earth years',
    'Voyager 2 is the only spacecraft to have visited Neptune (1989)',
    'Triton is the coldest measured surface in the solar system (-235°C)',
  ],
};
