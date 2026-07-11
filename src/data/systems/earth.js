// ---------------------------------------------------------------------------
// Earth + Moon system configuration — the single source of truth for v1.
// All values from NASA JPL, USGS, and LRO data. The engine is fully data-driven:
// nothing in /src/engine knows this is Earth. Drop in a mars.js with the same
// schema and the engine renders it unchanged.
//
// Units: km, kg, days, hours, degrees — the engine converts to scene units.
//
// TEXTURE SOURCES (all NASA public domain):
// Earth day diffuse: Blue Marble Next Generation
//   https://visibleearth.nasa.gov/images/74117
// Earth clouds: separate rotating cloud layer
//   https://visibleearth.nasa.gov/images/57747
// Earth night lights: Black Marble city lights
//   https://earthobservatory.nasa.gov/features/NightLights
// Moon color, normal, displacement: NASA CGI Moon Kit 8K
//   https://svs.gsfc.nasa.gov/4720
//   (v5a download failed — svs.gsfc.nasa.gov served an expired TLS
//   certificate; retrieve manually once NASA fixes it. Shipped moon
//   diffuse remains SSS 8k_moon, CC BY 4.0.)
// ---------------------------------------------------------------------------

export default {
  name: 'Earth System',
  slug: 'earth',

  // Simulation epoch: Apollo 11 lunar landing — humanity's greatest reach.
  epoch: '1969-07-20T20:17:00Z',

  star: {
    name: 'Sun',
    distanceAU: 1.0,          // distance from primary
    color: 0xfff5e8,
    intensity: 2.8,
    // Fixed direction the sunlight arrives from, in the primary's
    // equatorial frame (unit-ish vector, engine normalizes).
    direction: [1, 0.05, 0.25],
  },

  primary: {
    name: 'Earth',
    slug: 'earth',
    type: 'Terrestrial Planet',
    radiusKm: 6371,           // equatorial mean radius
    polarRadiusKm: 6357,      // oblate — rendered as ellipsoid
    massKg: 5.972e24,
    rotationPeriodHours: 23.934,
    orbitalPeriodDays: 365.256, // around the Sun
    surfaceGravity: 9.81,       // m/s² at sea level
    surfaceTempRange: [-88, 58], // °C, coldest to hottest recorded
    axialTiltDeg: 23.44,
    // diffuse: NASA Blue Marble (world.topo.bathy 5400×2700), upgraded
    // progressively to the 8K SSS daymap (CC BY 4.0) after load. Also on
    // disk, not yet wired: night.jpg (Black Marble 8K — lights stay
    // procedural for now, see earth-lights.glsl), clouds.jpg (8K layer),
    // specular.jpg (8K ocean mask, converted from the SSS .tif).
    textures: { diffuse: 'diffuse.jpg', diffuseHigh: 'diffuse_8k.jpg' },
    normalScale: 2.0,   // terrain relief depth (drives procedural detail)
    detailFloor: { softKm: 400, hardKm: 200 }, // ISS altitude experience — 408 km reference
    atmosphere: {
      limbEdge: 0x3d7eff,     // vivid blue at the very limb (Rayleigh scattering)
      limbMid: 0xbfe3ff,      // pale cyan mid-falloff
      thickness: 0.025,       // fraction of radius — thin feathered edge
      intensity: 1.2,
      style: 'rayleigh',      // signature blue from nitrogen/oxygen
    },
    features: { atmosphericGlow: true, equatorialBulge: true },
    detail: {
      style: 'terra',
      activationKm: 50000,
      fullKm: 500,
    },
    // UI navigation shortcuts to texture-anchored surface features.
    navPresets: [{
      label: '🌍 ISS Altitude',
      altitudeKm: 408,
      uv: [0.5, 0.5],
      message: 'Descending to ISS altitude — 408 km',
    }],
    notableFeatures: [
      'Only known world with life — 8.7 million species',
      '71% ocean coverage regulates global climate',
      'International Space Station orbits every 92 minutes at 408 km',
      'Moon stabilizes axial tilt, making seasons predictable',
    ],
    moreInfo: {
      atmosphere: 'Nitrogen 78%, oxygen 21%, argon 0.9%, CO₂ 0.04%',
      magnetosphere: 'Protects from solar wind; auroras at poles above 100 km',
      water: '1.386 billion km³ — 97% saltwater oceans, 3% fresh',
    },
    facts: [
      'Earth is the only planet known to harbor life',
      'The Moon formed 4.5 billion years ago from a giant impact',
      'Plate tectonics constantly reshape Earth\'s surface',
    ],
  },

  // Earth\'s single natural satellite. Orbits every 27.3 days.
  bodies: [
    {
      name: 'Moon', slug: 'moon',
      radiusKm: 1737.4, massKg: 7.342e22,
      semiMajorAxisKm: 384400, periodDays: 27.322, phaseDeg: 0,
      physics: 'nbody', tidallyLocked: true,
      textures: { diffuse: 'diffuse.jpg' },
      normalScale: 2.5, // ancient cratered relief
      detailFloor: { softKm: 20, hardKm: 1 }, // LRO data supports 1 km floor
      color: 0x9a9a94,
      type: 'Rocky Moon',
      surfaceGravity: 1.62,
      surfaceTempRange: [-173, 127], // °C — poles to daylit equator
      orbitalDistanceKm: { min: 363300, max: 405500 },
      // Surface feature landmarks visible from orbit.
      surfaceFeatures: [
        { name: 'Tycho Crater', latDeg: -43.3, lonDeg: -11.2 },
        { name: 'Copernicus Crater', latDeg: 9.7, lonDeg: -20.1 },
        { name: 'Mare Tranquillitatis', latDeg: 8.5, lonDeg: 31.4 },
        { name: 'Oceanus Procellarum', latDeg: 18.0, lonDeg: -57.0 },
        { name: 'Montes Apenninus', latDeg: 19.9, lonDeg: -3.7 },
      ],
      // Six human landing sites (1969–1972). Coordinates from LRO geodesy.
      apolloSites: [
        {
          name: 'Apollo 11',
          latDeg: 0.67, lonDeg: 23.47,
          date: 'Jul 20 1969',
          crew: 'Armstrong, Aldrin, Collins',
          note: 'First crewed landing — Mare Tranquillitatis',
        },
        {
          name: 'Apollo 12',
          latDeg: -3.01, lonDeg: -23.42,
          date: 'Nov 19 1969',
          crew: 'Conrad, Bean, Gordon',
          note: 'Landed 600m from Surveyor 3 probe',
        },
        {
          name: 'Apollo 14',
          latDeg: -3.65, lonDeg: -17.47,
          date: 'Feb 5 1971',
          crew: 'Shepard, Mitchell, Roosa',
          note: 'Carried makeshift golf club to lunar surface',
        },
        {
          name: 'Apollo 15',
          latDeg: 26.13, lonDeg: 3.63,
          date: 'Jul 30 1971',
          crew: 'Scott, Irwin, Worden',
          note: 'First lunar rover; explored Hadley-Apennine range',
        },
        {
          name: 'Apollo 16',
          latDeg: -8.97, lonDeg: 15.50,
          date: 'Apr 21 1972',
          crew: 'Young, Duke, Mattingly',
          note: 'Most geologically diverse samples from Descartes highlands',
        },
        {
          name: 'Apollo 17',
          latDeg: 20.19, lonDeg: 30.77,
          date: 'Dec 11 1972',
          crew: 'Cernan, Schmitt, Evans',
          note: 'Final Apollo mission; geologist Schmitt collected orange soil',
        },
      ],
      detail: { style: 'luna', activationKm: 10000, fullKm: 500 },
      notableFeatures: [
        'Only world humans have walked on — 12 astronauts (Apollo 11–17)',
        'Tidally locked — same face always points to Earth (tidal locking)',
        'Tycho crater rays extend 1,500 km — brightest feature when full',
        'Receding from Earth at 3.8 cm per year (laser retroreflectors track it)',
      ],
      moreInfo: {
        apollo: '382 kg of Moon rock returned; youngest sample 3.1 billion years old',
        farside: 'Far side heavily cratered, never visible from Earth before 1959',
        ice: 'Water ice confirmed at poles in permanently shadowed craters',
      },
      facts: [
        'The Moon is the only world beyond Earth visited by humans',
        'Its orbit is slowly increasing — when dinosaurs lived, it orbited closer',
        'The Moon causes tides and stabilizes Earth\'s axial tilt',
      ],
    },
  ],

  loadingFacts: [
    'Apollo 11 put humans on the Moon for the first time on July 20, 1969',
    'The International Space Station orbits Earth every 92 minutes at 408 km altitude',
    'Earth\'s oceans cover 71% of the surface and contain 97% of all water',
    'Earthshine — light reflecting off Earth illuminates the Moon\'s night side',
    'The Moon creates Earth\'s tides and stabilizes our planet\'s 23.4° axial tilt',
    'Aurora borealis and australis are caused by solar wind hitting Earth\'s magnetosphere',
    'The Moon is currently 384,400 km away — light from Earth takes 1.3 seconds to arrive',
    'Earth is the only known world harboring life — 8.7 million species',
  ],
};
