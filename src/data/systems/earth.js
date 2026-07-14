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

  // Night-side fill: terrain reads as faint silhouettes (~3-5%), dark
  // enough that city lights are the dominant night-side light source.
  // (V5b's 0x8899bb × 0.18 overcorrected to ~10%+ twilight.)
  nightAmbient: { color: 0x445566, intensity: 0.08 },

  star: {
    name: 'Sun',
    distanceAU: 1.0,          // distance from primary
    color: 0xfff5e8,
    intensity: 2.8,
    // Sun direction at the EPOCH in Earth's equatorial frame — calibrated
    // to the real sky (tests/suncal.mjs): 1969-07-20 20:17 UTC, solar
    // declination +20.4° (mid-July), ecliptic longitude 29.3 days past the
    // June solstice. The ephemeris rotates this with the orbital period, so
    // getting the epoch value right phases the seasons for ALL dates. (The
    // pre-hotfix [1, 0.05, 0.25] was an uncalibrated aesthetic pick — it
    // put the July sun at declination +2.8° and anti-phased the seasons.)
    direction: [-0.8037, 0.3484, 0.4823],
  },

  primary: {
    name: 'Earth',
    slug: 'earth',
    type: 'Terrestrial Planet',
    radiusKm: 6371,           // equatorial mean radius
    polarRadiusKm: 6357,      // oblate — rendered as ellipsoid
    massKg: 5.972e24,
    // True sidereal day. Full precision matters: 23.934 loses 1.7 s/day,
    // which is ~150° of longitude drift between the 1969 epoch and today —
    // the UTC↔terminator calibration below only holds with this value.
    rotationPeriodHours: 23.93446959,
    // Rotation angle at the epoch, calibrated (tests/suncal.mjs) so that
    // geographic longitude matches real UTC: subsolar point at the epoch
    // (1969-07-20 20:17 UTC) = 124.25°W (mean sun).
    rotationPhaseAtEpochDeg: -24.8,
    orbitalPeriodDays: 365.256, // around the Sun
    surfaceGravity: 9.81,       // m/s² at sea level
    surfaceTempRange: [-88, 58], // °C, coldest to hottest recorded
    axialTiltDeg: 23.44,
    // diffuse: NASA Blue Marble (world.topo.bathy 5400×2700), upgraded
    // progressively to the 8K SSS daymap (CC BY 4.0) after load. Also on
    // disk, not yet wired: night.jpg (Black Marble 8K — lights stay
    // procedural for now, see earth-lights.glsl), clouds.jpg (8K layer),
    // specular.jpg (8K ocean mask, converted from the SSS .tif).
    // Land hue note (V5b, measured): midwest olive-green comes from the
    // SOURCE texture (Wisconsin samples rgb(79,97,49)) — July Blue Marble
    // greens, faithfully rendered. For tan/brown farmland swap a different
    // BMNG monthly variant (e.g. world.topo.bathy.200409 = September).
    textures: { diffuse: 'diffuse.jpg', diffuseHigh: 'diffuse_8k.jpg' },
    // On Earth this drives ONLY the procedural cloud relief (no normal map;
    // ocean/lights/aurora add no height). 2.0 turned cloud-system flanks
    // into black lumps at grazing sun from 382 km (V5b, measured).
    normalScale: 0.8,
    // Phong specular OFF (haze fix, diff-render measured): the engine's
    // gas-giant default (0x332211, shininess 8) added a broad warm sheen
    // over land and ocean at EVERY altitude — read as blue-white surface
    // haze. Ocean reflection comes from the procedural sun glint in
    // earth-ocean.glsl; land is Lambertian.
    specular: 0x000000,
    detailFloor: { softKm: 400, hardKm: 200 }, // ISS altitude experience — 408 km reference
    // Van Allen belts + reentry band (V5b) — unlike Jupiter, most of
    // Earth's orbital space is benign; warn only inside real zones.
    radiationWarning: {
      zones: [
        { minKm: 1000, maxKm: 6000, label: '⚠️ Inner Van Allen belt' },
        { minKm: 13000, maxKm: 60000, label: '⚠️ Outer Van Allen belt' },
        { minKm: 0, maxKm: 400, label: '⚠️ Reentry altitude' },
      ],
    },
    // Post-v7 hardware fix: shell 0.025→0.010 of radius, intensity
    // 1.2→0.5, fresnel pow 5.0 in the shader — the halo read as a thick
    // ring from ~3,000 km and wrapped the night side (the v5b night-
    // scatter term is removed; NIGHT terrain visibility still comes from
    // nightAmbient above). horizonGlow keeps the ISS thin-arc pass.
    atmosphere: {
      // Gradient colors live in earth-atmosphere.glsl (v10.0.3, 3-stop
      // vertical gradient: white-blue base -> vivid Rayleigh blue -> deep
      // blue top; fresnel pow 5.0 -> 4.0 there too).
      thickness: 0.010,
      intensity: 0.65,
      style: 'rayleigh',      // signature blue from nitrogen/oxygen
      horizonGlow: true,      // Earth-only low-altitude horizon line
    },
    features: { atmosphericGlow: true, equatorialBulge: true },
    // Unified shader convention (V7 1b, surface-base.glsl). dayFadeSoft
    // matches the cloud night fade shipped in V5.1.2 (bug #48) exactly —
    // wide band, the atmosphere scatters light past the terminator.
    shaderParams: {
      dayFadeSoft0: -0.30, dayFadeSoft1: 0.10,
      grazeFade0: 0.10, grazeFade1: 0.45,
    },
    // Blue Marble rule (cloud-fade fix): Earth's identity from high
    // altitude IS its cloud systems, so the terra detail (clouds, lights,
    // glint) stays at full strength through 100,000 km and only eases off
    // toward system-framing distances. (The old 50,000/500 killed clouds
    // above 50,000 km and left an 11%-blend milky ghost at 40,000 km.)
    detail: {
      style: 'terra',
      activationKm: 2000000,
      fullKm: 100000,
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
      // v8.0.1 (Kyle hardware pass): airless body — razor terminator, and
      // the graze band gates the crater relief so nothing sparkles past it
      // (Mars bug #55 class; measured night mean 14% before the fix).
      shaderParams: {
        dayFadeSoft0: -0.02, dayFadeSoft1: 0.06,
        grazeFade0: 0.15, grazeFade1: 0.50,
      },
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
