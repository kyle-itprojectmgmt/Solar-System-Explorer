// ---------------------------------------------------------------------------
// Saturn system configuration — STUB for future expansion.
// Fill in this template with NASA JPL data and set SYSTEM_CONFIG = 'saturn'
// in /src/config.js. No engine changes required.
// ---------------------------------------------------------------------------

export default {
  name: 'Saturn System',
  slug: 'saturn',
  epoch: '1980-11-12T12:00:00Z', // Voyager 1 Saturn flyby

  star: {
    name: 'Sun',
    distanceAU: 9.5,
    color: 0xfff5e8,
    intensity: 1.1,
    direction: [1, 0.05, 0.3],
  },

  primary: {
    name: 'Saturn',
    slug: 'saturn',
    radiusKm: 60268,
    polarRadiusKm: 54364,
    massKg: 5.683e26,
    rotationPeriodHours: 10.7,
    axialTiltDeg: 26.73,
    textures: { diffuse: 'diffuse.jpg' },
    atmosphere: { glowColor: 0xf5e0b0, thickness: 0.04, intensity: 1.0 },
    features: { atmosphericGlow: true, equatorialBulge: true },
    facts: [],
    stats: {},
  },

  rings: [
    // TODO: C, B, Cassini Division, A, F rings…
  ],

  bodies: [
    // TODO: Mimas, Enceladus, Tethys, Dione, Rhea, Titan, Iapetus…
  ],

  loadingFacts: [],
};
