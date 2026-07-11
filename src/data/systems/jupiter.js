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
    type: 'Gas Giant',
    radiusKm: 71492,          // equatorial
    polarRadiusKm: 66854,     // oblate — rendered as ellipsoid
    massKg: 1.898e27,
    rotationPeriodHours: 9.925,
    orbitalPeriodDays: 4332.59, // around the Sun
    surfaceGravity: 24.79,      // m/s² at cloud tops
    surfaceTempRange: [-108, -108], // °C, cloud tops
    axialTiltDeg: 3.13,
    textures: { diffuse: 'diffuse.jpg', diffuseHigh: 'diffuse_8k.jpg' },
    normalScale: 2.0,   // cloud band depth (drives procedural relief lighting)
    detailFloor: { softKm: 3000, hardKm: 1500 }, // zoom resistance / hard stop
    atmosphere: {
      limbEdge: 0xc8824a,     // warm orange-tan at the very limb
      limbMid: 0xe8d4a0,      // pale yellow-white mid falloff
      thickness: 0.025,       // fraction of radius — thin feathered edge
      intensity: 1.0,
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
    notableFeatures: [
      'Great Red Spot — storm raging 350+ years',
      'Strongest magnetic field of any planet',
      'More than twice the mass of all other planets combined',
      '4 large Galilean moons + 91 smaller moons',
    ],
    moreInfo: {
      grsSize: '16,000 km wide — larger than Earth',
      magneticField: "20,000x stronger than Earth's",
      rings: '4-component faint ring system discovered 1979',
      radiation: 'Radiation belts lethal to unshielded spacecraft',
    },
    facts: [
      'Jupiter is so large that 1,300 Earths could fit inside it',
      "Jupiter's Great Red Spot is a storm that has raged for over 350 years",
      'Jupiter completes a full rotation in under 10 hours — the fastest in the solar system',
    ],
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
      },
      // Tenuous SO2 exosphere from volcanic outgassing — faint yellow-white
      // directional limb glow, lit side only.
      atmosphereLimb: { color: 0xffffcc, intensity: 0.35, thickness: 0.02 },
      surfaceFeatures: [
        { name: 'Pele Volcano',      latDeg: -18.7, lonDeg: 255.3 },
        { name: 'Loki Patera',       latDeg: 12.6,  lonDeg: 308.8 },
        { name: 'Prometheus Volcano', latDeg: -1.5, lonDeg: 153.0 },
      ],
      detail: { style: 'volcanic', activationKm: 10000, fullKm: 500 },
      type: 'Volcanic Moon',
      surfaceGravity: 1.796,
      surfaceTempRange: [-143, 1600], // °C — surface vs volcanic vents
      orbitalDistanceKm: { min: 420000, max: 423000 },
      notableFeatures: [
        'Most volcanically active body in the solar system',
        "Tidal heating from Jupiter's gravity drives volcanism",
        'Surface resurfaced by lava every few thousand years',
        'Over 400 active volcanoes',
      ],
      moreInfo: {
        tidalHeating: "Jupiter's tidal forces generate ~100TW of heat",
        atmosphere: 'Thin SO₂ atmosphere from volcanic outgassing',
        plumes: 'Volcanic plumes reach 500km into space',
      },
      facts: [
        'Io is the most volcanically active body in the solar system',
        'Its volcanoes are driven by tidal heating from Jupiter\'s immense gravity',
        'Io\'s plumes reach 300 km above the surface',
      ],
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
      // Trace O2/O3 atmosphere — extremely thin blue-white limb glow.
      atmosphereLimb: { color: 0xaaddff, intensity: 0.22, thickness: 0.015 },
      surfaceFeatures: [
        { name: 'Conamara Chaos', latDeg: 9.7,   lonDeg: 87.5 },
        { name: 'Thera Macula',   latDeg: -46.7, lonDeg: 178.9 },
        { name: 'Pwyll Crater',   latDeg: -25.2, lonDeg: 271.4 },
      ],
      detail: { style: 'ice', activationKm: 10000, fullKm: 500 },
      type: 'Ice Moon',
      surfaceGravity: 1.315,
      surfaceTempRange: [-220, -160],
      orbitalDistanceKm: { min: 664000, max: 678000 },
      notableFeatures: [
        'Subsurface ocean 100km deep beneath ice shell',
        'Best candidate for extraterrestrial life in solar system',
        'Surface ice cracks reveal tidal flexing activity',
        'Europa Clipper mission currently en route (arrives 2030)',
      ],
      moreInfo: {
        ocean: "More liquid water than all of Earth's oceans combined",
        iceShell: 'Ice shell 10-30km thick over liquid ocean',
        habitability: 'Hydrothermal vents likely on ocean floor',
      },
      facts: [
        'Europa may harbor a liquid water ocean beneath its icy surface',
        'Its ice shell is criss-crossed by reddish fractures called lineae',
        'Europa\'s ocean may contain twice the water of all Earth\'s oceans',
      ],
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
      features: {},
      // Thin O2 atmosphere + magnetosphere — very faint blue-green limb glow
      // (replaces the old uniform magnetosphere halo shell).
      atmosphereLimb: { color: 0x88ccff, intensity: 0.3, thickness: 0.02 },
      surfaceFeatures: [
        { name: 'Galileo Regio',   latDeg: 35,   lonDeg: 133 },
        { name: 'Nicholson Regio', latDeg: -20,  lonDeg: 356 },
        { name: 'Uruk Sulcus',     latDeg: 0.8,  lonDeg: 160.3 },
        { name: 'Osiris Crater',   latDeg: -38,  lonDeg: 166 },
        { name: 'Gilgamesh Basin', latDeg: -62,  lonDeg: 125 },
      ],
      detail: { style: 'grooved', activationKm: 10000, fullKm: 500 },
      type: 'Giant Moon',
      surfaceGravity: 1.428,
      surfaceTempRange: [-203, -121],
      orbitalDistanceKm: { min: 1069000, max: 1071000 },
      notableFeatures: [
        'Largest moon in the solar system — bigger than Mercury',
        'Only moon with its own magnetic field and auroras',
        'Ancient dark terrain and younger grooved terrain',
        'JUICE mission en route, arrives 2034',
      ],
      moreInfo: {
        magnetosphere: 'Aurora ovals visible from orbit at poles',
        terrain: 'Two terrain types separated by sharp geological boundary',
        size: "Diameter 5,268km — exceeds Mercury's 4,879km",
      },
      facts: [
        'Ganymede is larger than the planet Mercury',
        'It is the only moon in the solar system with its own magnetic field',
        'Its surface mixes ancient dark terrain with younger grooved ice',
      ],
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
      type: 'Ancient Moon',
      surfaceGravity: 1.235,
      surfaceTempRange: [-193, -108],
      orbitalDistanceKm: { min: 1869000, max: 1897000 },
      notableFeatures: [
        'Most heavily cratered object in the solar system',
        'Surface unchanged for ~4 billion years',
        'Valhalla impact basin — rings spread 1,900km from center',
        'Lowest radiation of any Galilean moon — best for crewed base',
      ],
      moreInfo: {
        age: 'Surface is a record of 4 billion years of impacts',
        valhalla: 'Largest multi-ring impact structure in solar system',
        future: 'Proposed site for human outpost due to low radiation',
      },
      facts: [
        'Callisto has the most heavily cratered surface in the solar system',
        'Its Valhalla impact basin is nearly 4,000 km across',
        'Callisto\'s ancient surface is about 4 billion years old',
      ],
    },

    // Inner moons — ring sources, simplified Keplerian orbits.
    { name: 'Metis',    slug: 'metis',    radiusKm: 22,  massKg: 3.6e16, semiMajorAxisKm: 127969, periodDays: 0.295, phaseDeg: 40,  physics: 'kepler', color: 0x8a8078, normalScale: 1.5, detailFloor: { softKm: 50, hardKm: 20 }, geometrySegments: 64,
      type: 'Ring Moon', discoveredYear: 1979, discoveredBy: 'Voyager 1',
      notableFeatures: ['Orbits inside Jupiter\'s main ring', 'Supplies the main ring with dust', 'Orbits faster than Jupiter rotates'],
      facts: ['Metis orbits inside Jupiter\'s main ring and supplies it with dust'] },
    { name: 'Adrastea', slug: 'adrastea', radiusKm: 8,   massKg: 2.0e15, semiMajorAxisKm: 128980, periodDays: 0.298, phaseDeg: 160, physics: 'kepler', color: 0x87837c, normalScale: 1.5, detailFloor: { softKm: 50, hardKm: 20 }, geometrySegments: 64,
      type: 'Ring Moon', discoveredYear: 1979, discoveredBy: 'Voyager 2',
      notableFeatures: ['One of the smallest known moons', 'Shepherds the outer edge of the main ring'],
      facts: ['Adrastea is one of the smallest known moons, discovered by Voyager 2'] },
    { name: 'Amalthea', slug: 'amalthea', radiusKm: 84,  massKg: 2.1e18, semiMajorAxisKm: 181366, periodDays: 0.498, phaseDeg: 250, physics: 'kepler', color: 0xa05540, normalScale: 1.5, detailFloor: { softKm: 100, hardKm: 50 }, geometrySegments: 64,
      radii: { x: 125, y: 73, z: 64 }, // real irregular body: 250 x 146 x 128 km
      type: 'Irregular Moon', discoveredYear: 1892, discoveredBy: 'E. E. Barnard',
      notableFeatures: ['Reddest object in the solar system', 'Irregular 250 × 146 × 128 km ellipsoid', 'Sheds the dust of the Amalthea gossamer ring'],
      facts: ['Amalthea is the reddest object in the solar system', 'It sheds the dust that forms the Amalthea gossamer ring'] },
    { name: 'Thebe',    slug: 'thebe',    radiusKm: 49,  massKg: 4.3e17, semiMajorAxisKm: 221900, periodDays: 0.675, phaseDeg: 15,  physics: 'kepler', color: 0x8f7a6a, normalScale: 1.5, detailFloor: { softKm: 100, hardKm: 50 }, geometrySegments: 64,
      type: 'Ring Moon', discoveredYear: 1979, discoveredBy: 'Voyager 1',
      notableFeatures: ['Feeds the outermost, faintest gossamer ring', 'Heavily cratered despite its small size'],
      facts: ['Thebe feeds the outermost, faintest gossamer ring'] },
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
