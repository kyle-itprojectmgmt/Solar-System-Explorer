// ---------------------------------------------------------------------------
// Jupiter system configuration — the single source of truth for v1.
// All values from NASA JPL. The engine is fully data-driven: nothing in
// /src/engine knows this is Jupiter. Drop in a saturn.js with the same
// schema and the engine renders it unchanged.
//
// Units: km, kg, days, hours, degrees — the engine converts to scene units.
// ---------------------------------------------------------------------------

export default {
  name: 'Jupiter System',
  slug: 'jupiter',

  // Simulation epoch: Voyager 1 Jupiter flyby.
  epoch: '1979-03-05T12:00:00Z',

  star: {
    name: 'Sun',
    distanceAU: 5.2,          // distance from primary
    color: 0xfff5e8,
    intensity: 2.6,
    // Fixed direction the sunlight arrives from, in the primary's
    // equatorial frame (unit-ish vector, engine normalizes).
    direction: [1, 0.06, 0.35],
  },

  primary: {
    name: 'Jupiter',
    slug: 'jupiter',
    radiusKm: 71492,          // equatorial
    polarRadiusKm: 66854,     // oblate — rendered as ellipsoid
    massKg: 1.898e27,
    rotationPeriodHours: 9.925,
    axialTiltDeg: 3.13,
    textures: { diffuse: 'diffuse.jpg', diffuseHigh: 'diffuse_8k.jpg' },
    atmosphere: {
      glowColor: 0xffb877,    // warm orange-tan limb scattering
      thickness: 0.045,       // fraction of radius
      intensity: 1.25,
    },
    features: { greatRedSpot: true, atmosphericGlow: true, equatorialBulge: true },
    facts: [
      'Jupiter is so large that 1,300 Earths could fit inside it',
      "Jupiter's Great Red Spot is a storm that has raged for over 350 years",
      'Jupiter completes a full rotation in under 10 hours — the fastest in the solar system',
    ],
    stats: {
      'Radius': '71,492 km',
      'Mass': '1.898 × 10²⁷ kg',
      'Rotation period': '9.925 hours',
      'Axial tilt': '3.13°',
    },
  },

  // Jupiter's four ring components. Nearly invisible face-on, dramatically
  // backlit when the Sun is behind the planet (forward scattering).
  rings: [
    { name: 'Halo Ring',            type: 'torus', innerKm: 92000,  outerKm: 122500, color: 0x8899bb, opacity: 0.08, thicknessKm: 12500 },
    { name: 'Main Ring',            type: 'flat',  innerKm: 122500, outerKm: 129000, color: 0xcc7755, opacity: 0.15, thicknessKm: 300 },
    { name: 'Amalthea Gossamer',    type: 'flat',  innerKm: 129000, outerKm: 182000, color: 0xcc8844, opacity: 0.04, thicknessKm: 2000 },
    { name: 'Thebe Gossamer',       type: 'flat',  innerKm: 129000, outerKm: 226000, color: 0x99a088, opacity: 0.02, thicknessKm: 4000 },
  ],

  // Orbiting bodies. `physics: 'nbody'` bodies are integrated with Verlet;
  // `physics: 'kepler'` bodies ride simple circular orbits (cheap).
  // Phase angles (deg) chosen so the 1:2:4 Laplace resonance of Io, Europa
  // and Ganymede reads correctly under time acceleration.
  bodies: [
    {
      name: 'Io', slug: 'io',
      radiusKm: 1821, massKg: 8.93e22,
      semiMajorAxisKm: 421700, periodDays: 1.769, phaseDeg: 0,
      physics: 'nbody', tidallyLocked: true,
      textures: { diffuse: 'diffuse.jpg' },
      color: 0xd8c060,
      features: {
        volcanicPlumes: true,
        volcanoes: [
          { name: 'Pele',       latDeg: -18.7, lonDeg: 255.3 },
          { name: 'Loki',       latDeg: 12.6,  lonDeg: 308.8 },
          { name: 'Prometheus', latDeg: -1.5,  lonDeg: 153.0 },
        ],
      },
      facts: [
        'Io is the most volcanically active body in the solar system',
        'Its volcanoes are driven by tidal heating from Jupiter\'s immense gravity',
        'Io\'s plumes reach 300 km above the surface',
      ],
      stats: { 'Radius': '1,821 km', 'Orbital period': '1.77 days', 'Distance': '421,700 km' },
    },
    {
      name: 'Europa', slug: 'europa',
      radiusKm: 1560, massKg: 4.8e22,
      semiMajorAxisKm: 671100, periodDays: 3.551, phaseDeg: 105,
      physics: 'nbody', tidallyLocked: true,
      textures: { diffuse: 'diffuse.jpg' },
      color: 0xc8d0d8,
      features: { iceCracks: true, subsurfaceGlow: true },
      facts: [
        'Europa may harbor a liquid water ocean beneath its icy surface',
        'Its ice shell is criss-crossed by reddish fractures called lineae',
        'Europa\'s ocean may contain twice the water of all Earth\'s oceans',
      ],
      stats: { 'Radius': '1,560 km', 'Orbital period': '3.55 days', 'Distance': '671,100 km' },
    },
    {
      name: 'Ganymede', slug: 'ganymede',
      radiusKm: 2634, massKg: 1.48e23,
      semiMajorAxisKm: 1070400, periodDays: 7.155, phaseDeg: 210,
      physics: 'nbody', tidallyLocked: true,
      textures: { diffuse: 'diffuse.jpg' },
      color: 0x9a8f80,
      features: { magnetosphereGlow: true },
      facts: [
        'Ganymede is larger than the planet Mercury',
        'It is the only moon in the solar system with its own magnetic field',
        'Its surface mixes ancient dark terrain with younger grooved ice',
      ],
      stats: { 'Radius': '2,634 km', 'Orbital period': '7.15 days', 'Distance': '1,070,400 km' },
    },
    {
      name: 'Callisto', slug: 'callisto',
      radiusKm: 2410, massKg: 1.08e23,
      semiMajorAxisKm: 1882700, periodDays: 16.689, phaseDeg: 320,
      physics: 'nbody', tidallyLocked: true,
      textures: { diffuse: 'diffuse.jpg' },
      color: 0x6b6258,
      features: {},
      facts: [
        'Callisto has the most heavily cratered surface in the solar system',
        'Its Valhalla impact basin is nearly 4,000 km across',
        'Callisto\'s ancient surface is about 4 billion years old',
      ],
      stats: { 'Radius': '2,410 km', 'Orbital period': '16.69 days', 'Distance': '1,882,700 km' },
    },

    // Inner moons — ring sources, simplified Keplerian orbits.
    { name: 'Metis',    slug: 'metis',    radiusKm: 22,  massKg: 3.6e16, semiMajorAxisKm: 127969, periodDays: 0.295, phaseDeg: 40,  physics: 'kepler', color: 0x8a8078,
      facts: ['Metis orbits inside Jupiter\'s main ring and supplies it with dust'], stats: { 'Radius': '~22 km', 'Orbital period': '7.1 hours' } },
    { name: 'Adrastea', slug: 'adrastea', radiusKm: 8,   massKg: 2.0e15, semiMajorAxisKm: 128980, periodDays: 0.298, phaseDeg: 160, physics: 'kepler', color: 0x87837c,
      facts: ['Adrastea is one of the smallest known moons, discovered by Voyager 2'], stats: { 'Radius': '~8 km', 'Orbital period': '7.2 hours' } },
    { name: 'Amalthea', slug: 'amalthea', radiusKm: 84,  massKg: 2.1e18, semiMajorAxisKm: 181366, periodDays: 0.498, phaseDeg: 250, physics: 'kepler', color: 0xa05540, elongated: true,
      facts: ['Amalthea is the reddest object in the solar system', 'It sheds the dust that forms the Amalthea gossamer ring'], stats: { 'Radius': '~84 km', 'Orbital period': '12 hours' } },
    { name: 'Thebe',    slug: 'thebe',    radiusKm: 49,  massKg: 4.3e17, semiMajorAxisKm: 221900, periodDays: 0.675, phaseDeg: 15,  physics: 'kepler', color: 0x8f7a6a,
      facts: ['Thebe feeds the outermost, faintest gossamer ring'], stats: { 'Radius': '~49 km', 'Orbital period': '16.2 hours' } },
  ],

  loadingFacts: [
    'Jupiter is so large that 1,300 Earths could fit inside it',
    "Jupiter's Great Red Spot is a storm that has raged for over 350 years",
    'Io is the most volcanically active body in the solar system',
    'Europa may harbor a liquid water ocean beneath its icy surface',
    "Jupiter's rings were discovered by Voyager 1 in 1979",
    'Ganymede is larger than the planet Mercury',
    'Jupiter completes a full rotation in under 10 hours',
    'The Galilean moons were discovered by Galileo in 1610',
  ],
};
