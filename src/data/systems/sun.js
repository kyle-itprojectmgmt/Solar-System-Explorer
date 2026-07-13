// ---------------------------------------------------------------------------
// The Sun — V9 skeleton (Worker 4 completes the primary detail fields;
// schema mirrors mercury.js, the other no-moon system).
//
// The Sun is the first STAR system: isStar flags the renderer into the
// self-luminous build path (photosphere / chromosphere / corona shaders,
// no directional sun light, no lens flare — the body IS the light).
// Scale is the house convention: true radiusKm, 1 world unit = 1,000 km.
// No textures — the surface is fully procedural.
// ---------------------------------------------------------------------------

export default {
  name: 'The Sun',
  slug: 'sun',
  isStar: true,

  // J2000 — the standard solar reference epoch (no mission epoch applies;
  // the IAU solar prime meridian is defined against J2000).
  epoch: '2000-01-01T12:00:00Z',

  // The star block normally describes the EXTERNAL sun. Here it exists for
  // engine compatibility only (physics/ephemeris read star.direction; the
  // HUD signal-delay formula reads distanceAU — 0 makes it compute the true
  // 1 AU Sun→Earth distance, ~8 min 20 s). The renderer's isStar path
  // builds no directional light, sprite, or flare from it.
  star: {
    name: 'Sun',
    distanceAU: 0,
    color: 0xfff5e0,
    intensity: 0,
    direction: [1, 0, 0],
  },

  primary: {
    name: 'Sun',
    slug: 'sun',
    type: 'G2V Main-Sequence Star',

    radiusKm: 696000,
    massKg: 1.989e30,

    // Equatorial sidereal rotation: 25.38 days (Carrington). Differential
    // rotation (slower toward the poles, Snodgrass 1983) is applied in the
    // photosphere shader as a RESIDUAL drift on top of this base rate —
    // the mesh rotation carries the equatorial term.
    rotationPeriodHours: 609.12,
    axialTiltDeg: 7.25,          // vs the ecliptic
    // IAU 2015 solar prime meridian at J2000: W0 = 84.176°.
    rotationPhaseAtEpochDeg: 84.176,

    surfaceGravity: 274.0,             // m/s²
    surfaceTempRange: [5500, 5778],    // K — photosphere (body card)

    // No textures — fully procedural surface.
    textures: {},

    // -- Star rendering blocks (renderer isStar path) ------------------------
    // Worker specs: sun-photosphere.glsl (W1), sun-corona.glsl +
    // sun-chromosphere.glsl (W2), sun-spots.glsl (W3).
    photosphere: {
      granulationScale: 28.0,
      limbDarkeningCoeff: 0.6,
      supergranulationAmp: 0.08,
    },
    chromosphere: {
      color: [0.95, 0.15, 0.20],   // H-alpha red
      thickness: 1.005,            // radius multiplier
      intensity: 0.6,
    },
    corona: {
      radius: 8.0,                 // radius multiplier for the corona shell
      baseOpacity: 0.4,
      activityScale: 0.8,
    },
    sunspots: {
      maxCount: 12,
      activityBeltDeg: 30.0,       // spots live within ±30° latitude
      defaultActivity: 0.75,       // Solar Cycle 25 near maximum (2026)
    },

    // Below ~50,000 km is optically thick plasma — the camera floor.
    detailFloor: { softKm: 100000, hardKm: 50000 },
    minInsertionAltKm: 50000,
    // Config-driven insertion/ALT ceiling (V9): the 500,000 km house
    // default is less than one solar radius above the photosphere.
    maxInsertionAltKm: 5000000,

    radiationWarning: {
      zones: [
        { minKm: 0, maxKm: 100000, label: '⚠️ Chromospheric plasma — instant vaporization' },
        { minKm: 100000, maxKm: 2000000, label: '⚠️ Inner corona — extreme radiation and heat flux' },
      ],
    },

    // Worker 4 fills: navPresets, surfaceFeatures, notableFeatures,
    // moreInfo, facts.
  },

  bodies: [],   // the Sun has no moons here — planets are the other systems

  loadingFacts: [
    'The Sun contains 99.86% of all mass in the solar system',
    'Light from the Sun takes 8 minutes 20 seconds to reach Earth',
    "The Sun's core reaches 15 million degrees Celsius",
    'Solar flares can release energy equivalent to billions of nuclear bombs',
    'The Sun has been burning for 4.6 billion years — halfway through its life',
    'One million Earths could fit inside the Sun',
    "The Sun's corona is hotter than its surface — a mystery still unsolved",
    'Solar wind from the Sun reaches all the way to interstellar space',
  ],
};
