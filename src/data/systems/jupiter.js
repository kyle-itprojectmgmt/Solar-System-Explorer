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
    normalScale: 2.0,   // cloud band depth (drives procedural relief lighting)
    detailFloor: { softKm: 3000, hardKm: 1500 }, // zoom resistance / hard stop
    atmosphere: {
      glowColor: 0xffb877,    // warm orange-tan limb scattering
      thickness: 0.045,       // fraction of radius
      intensity: 1.25,
    },
    features: { greatRedSpot: true, atmosphericGlow: true, equatorialBulge: true },
    detail: {
      style: 'gasGiant',
      activationKm: 50000,
      fullKm: 5000,
      // GRS position differs between the 2K and 4K maps (scanned).
      params: { grsUV: [0.375, 0.388], grsUVHigh: [0.881, 0.419] },
    },
    // UI navigation shortcuts to texture-anchored surface features.
    // uniformUV names a live detail-shader uniform, so the anchor stays
    // correct when the hi-res texture (different GRS position) swaps in.
    navPresets: [{
      label: '🔴 Great Red Spot',
      altitudeKm: 20000,
      uniformUV: 'uGrsUV',
      message: 'Navigating to Great Red Spot…',
    }],
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
      normalScale: 3.0, // extreme volcanic relief
      detailFloor: { softKm: 300, hardKm: 150 },
      color: 0xd8c060,
      features: {
        volcanicPlumes: true,
        volcanoes: [
          { name: 'Pele',       latDeg: -18.7, lonDeg: 255.3 },
          { name: 'Loki',       latDeg: 12.6,  lonDeg: 308.8 },
          { name: 'Prometheus', latDeg: -1.5,  lonDeg: 153.0 },
        ],
        // Io's tenuous SO2 atmosphere — faint yellow-white haze at low altitude.
        thinAtmosphere: { color: 0xfff4d0, intensity: 0.55 },
      },
      surfaceFeatures: [
        { name: 'Pele Volcano',      latDeg: -18.7, lonDeg: 255.3 },
        { name: 'Loki Patera',       latDeg: 12.6,  lonDeg: 308.8 },
        { name: 'Prometheus Volcano', latDeg: -1.5, lonDeg: 153.0 },
      ],
      detail: { style: 'volcanic', activationKm: 10000, fullKm: 500 },
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
      normalScale: 2.5, // ice crack depth
      detailFloor: { softKm: 300, hardKm: 150 },
      color: 0xc8d0d8,
      features: { iceCracks: true, subsurfaceGlow: true },
      surfaceFeatures: [
        { name: 'Conamara Chaos', latDeg: 9.7,   lonDeg: 87.5 },
        { name: 'Thera Macula',   latDeg: -46.7, lonDeg: 178.9 },
        { name: 'Pwyll Crater',   latDeg: -25.2, lonDeg: 271.4 },
      ],
      detail: { style: 'ice', activationKm: 10000, fullKm: 500 },
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
      normalScale: 2.5, // grooved terrain relief
      detailFloor: { softKm: 400, hardKm: 200 },
      color: 0x9a8f80,
      features: { magnetosphereGlow: true },
      surfaceFeatures: [
        { name: 'Galileo Regio',   latDeg: 35,   lonDeg: 133 },
        { name: 'Nicholson Regio', latDeg: -20,  lonDeg: 356 },
        { name: 'Uruk Sulcus',     latDeg: 0.8,  lonDeg: 160.3 },
        { name: 'Osiris Crater',   latDeg: -38,  lonDeg: 166 },
        { name: 'Gilgamesh Basin', latDeg: -62,  lonDeg: 125 },
      ],
      detail: { style: 'grooved', activationKm: 10000, fullKm: 500 },
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
      normalScale: 2.0, // ancient crater depth
      detailFloor: { softKm: 600, hardKm: 300 },
      color: 0x6b6258,
      features: {},
      surfaceFeatures: [
        { name: 'Valhalla Impact Basin', latDeg: 14.7, lonDeg: 55.4 },
        { name: 'Asgard Basin',          latDeg: 30,   lonDeg: 140 },
        { name: 'Heimdall Crater',       latDeg: -62,  lonDeg: 356 },
        { name: 'Lofn Crater',           latDeg: -56,  lonDeg: 23 },
        { name: 'Burr Crater',           latDeg: 43,   lonDeg: 135 },
      ],
      detail: {
        style: 'cratered', activationKm: 10000, fullKm: 500,
        params: { basinUV: [0.833, 0.6] }, // Valhalla, scanned from the map
      },
      facts: [
        'Callisto has the most heavily cratered surface in the solar system',
        'Its Valhalla impact basin is nearly 4,000 km across',
        'Callisto\'s ancient surface is about 4 billion years old',
      ],
      stats: { 'Radius': '2,410 km', 'Orbital period': '16.69 days', 'Distance': '1,882,700 km' },
    },

    // Inner moons — ring sources, simplified Keplerian orbits.
    { name: 'Metis',    slug: 'metis',    radiusKm: 22,  massKg: 3.6e16, semiMajorAxisKm: 127969, periodDays: 0.295, phaseDeg: 40,  physics: 'kepler', color: 0x8a8078, normalScale: 1.5, detailFloor: { softKm: 50, hardKm: 20 },
      facts: ['Metis orbits inside Jupiter\'s main ring and supplies it with dust'], stats: { 'Radius': '~22 km', 'Orbital period': '7.1 hours' } },
    { name: 'Adrastea', slug: 'adrastea', radiusKm: 8,   massKg: 2.0e15, semiMajorAxisKm: 128980, periodDays: 0.298, phaseDeg: 160, physics: 'kepler', color: 0x87837c, normalScale: 1.5, detailFloor: { softKm: 50, hardKm: 20 },
      facts: ['Adrastea is one of the smallest known moons, discovered by Voyager 2'], stats: { 'Radius': '~8 km', 'Orbital period': '7.2 hours' } },
    { name: 'Amalthea', slug: 'amalthea', radiusKm: 84,  massKg: 2.1e18, semiMajorAxisKm: 181366, periodDays: 0.498, phaseDeg: 250, physics: 'kepler', color: 0xa05540, normalScale: 1.5, detailFloor: { softKm: 100, hardKm: 50 },
      radii: { x: 125, y: 73, z: 64 }, // real irregular body: 250 x 146 x 128 km
      facts: ['Amalthea is the reddest object in the solar system', 'It sheds the dust that forms the Amalthea gossamer ring'], stats: { 'Dimensions': '250 × 146 × 128 km', 'Orbital period': '12 hours' } },
    { name: 'Thebe',    slug: 'thebe',    radiusKm: 49,  massKg: 4.3e17, semiMajorAxisKm: 221900, periodDays: 0.675, phaseDeg: 15,  physics: 'kepler', color: 0x8f7a6a, normalScale: 1.5, detailFloor: { softKm: 100, hardKm: 50 },
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
