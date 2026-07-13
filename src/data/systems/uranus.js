// ---------------------------------------------------------------------------
// Uranus system configuration (V8 skeleton — Worker 3 completes primary
// detail fields + moons; schema mirrors saturn.js).
//
// THE GEOMETRY IS THE FEATURE. The engine works in the primary's
// equatorial frame (root.rotation.z carries the tilt), so with
// axialTiltDeg 97.77 everything falls out automatically:
//   * moons + rings live in the equatorial (XZ) plane — which is nearly
//     perpendicular to the ecliptic, so they genuinely orbit "over the
//     poles" relative to the starfield;
//   * the calibrated sun direction is near-POLAR today (declination +77
//     deg in 2026 — sun almost straight over the north pole; LIVE mode
//     opens on the signature sideways-planet lighting).
// No physics changes are needed for any of this (the V8 prompt's
// polarOrbitingMoons flag is superfluous in this engine).
//
// TEXTURES (in /public/textures/uranus/): SSS 2K Uranus (CC BY 4.0 —
// SSS's max; the real planet is nearly featureless). rings.png is a
// GENERATED 2048x32 radial strip: the 9 main narrow rings + epsilon at
// their true radii (41,837–51,149 km), widths padded ~5x so 1-px rings
// survive minification, alpha 0.25–0.85 (dark charcoal — nothing like
// Saturn's bright ice).
// ---------------------------------------------------------------------------

export default {
  name: 'Uranus System',
  slug: 'uranus',

  // Simulation epoch: Voyager 2 closest approach — still the only
  // spacecraft to visit Uranus (house pattern epochs).
  epoch: '1986-01-24T17:59:47Z',

  // Dim, cold: 0.27% of Earth's sunlight, no warm tones at all.
  nightAmbient: { color: 0x2a3540, intensity: 0.05 },

  star: {
    name: 'Sun',
    distanceAU: 19.19,
    color: 0xffeedd,
    intensity: 2.0,           // house-pattern readability scale
    // Sun direction at the EPOCH in Uranus's equatorial frame (v8cal.mjs,
    // verified through sunDirectionAt()): lambda0 = -3.69 deg, anchored to
    // the 2007-12-07 equinox (declination 0 rising north). Reproduces the
    // Voyager epoch (dec -81.4 deg: SOUTH pole sunward, exactly what
    // Voyager saw) AND today's LIVE geometry (dec +77.1 deg in mid-2026 —
    // the north pole points almost straight at the sun until the ~2028
    // solstice). e = 0.046; circular-model error a few degrees.
    // Vector form (cos l0 * cos tilt, -cos l0 * sin tilt, -sin l0).
    direction: [-0.1349, -0.9888, 0.0644],
  },

  primary: {
    name: 'Uranus',
    slug: 'uranus',
    type: 'Ice Giant',
    radiusKm: 25362,
    polarRadiusKm: 24973,
    massKg: 8.681e25,
    // Sidereal rotation 17.24 h. Retrograde in the IAU ecliptic sense —
    // expressed through the >90 deg tilt (Venus/Phoebe convention);
    // positive period, do NOT negate.
    rotationPeriodHours: 17.24,
    rotationPhaseAtEpochDeg: 0,  // decorative — no longitude-anchored feature
    orbitalPeriodDays: 30685.4,  // 84.02 years
    axialTiltDeg: 97.77,         // rotates on its side
    surfaceGravity: 8.69,        // m/s² at cloud tops
    surfaceTempRange: [-224, -224], // °C — coldest atmosphere of any planet

    textures: { diffuse: 'diffuse.jpg' },

    normalScale: 1.2,
    detailFloor: { softKm: 5000, hardKm: 1000 },
    // Above the epsilon ring: 51,600 km span outer − 25,362 km radius.
    minInsertionAltKm: 27000,

    atmosphere: {
      limbEdge: 0x9adde0,
      limbMid: 0x5aa8b8,
      thickness: 0.012,
      intensity: 0.5,
    },

    features: { atmosphericGlow: true, equatorialBulge: true },

    shaderParams: {
      dayFadeSoft0: -0.20, dayFadeSoft1: 0.18,
      grazeFade0: 0.12, grazeFade1: 0.45,
    },

    // Ouranos detail style: near-featureless pale blue-green, EXTREMELY
    // subtle banding, slight polar darkening — restraint is the realism here.
    detail: { style: 'ouranos', activationKm: 100000, fullKm: 5000 },

    radiationWarning: {
      zones: [
        { minKm: 0, maxKm: 4000, label: '⚠️ Ring plane debris / upper atmosphere' },
      ],
    },

    navPresets: [
      {
        label: '🧊 Polar View',
        altitudeKm: 40000,
        uv: [0.5, 0.97],
        message: 'Descending toward Uranus\'s sunlit north pole — a view no other planet offers',
      },
      {
        label: '💍 Ring Plane',
        altitudeKm: 30000,
        uv: [0.5, 0.5],
        message: 'Approaching the ring plane — nine narrow charcoal rings silhouetted against the ice-giant atmosphere',
      },
    ],

    surfaceFeatures: [
      { name: 'North Polar Hood', latDeg: 85, lonDeg: 0 },
      { name: 'Equatorial Band', latDeg: 0, lonDeg: 0 },
    ],

    notableFeatures: [
      'Rotates on its side with a 98-degree tilt — the poles take turns pointing at the Sun',
      'Completes a full orbit every 84 years, with 21-year seasons — the Sun will stay over its north pole until ~2028',
      'Thirteen known dark, narrow rings discovered by stellar occultation in 1977',
      'The coldest planetary atmosphere in the solar system — cloud tops reach −224°C',
    ],

    moreInfo: {
      tilt: 'Uranus\'s extreme 98-degree axial tilt may be the result of a giant impact in the early solar system',
      seasons: 'Each season on Uranus lasts 42 years due to its 84-year orbital period — its poles experience 42-year days and nights',
      rings: 'Uranus\'s nine main narrow rings were discovered in 1977 through stellar occultation, decades before Voyager could image them',
      voyager: 'Voyager 2 flew past Uranus in January 1986, the only spacecraft to visit the ice giant',
    },

    facts: [
      'Uranus rotates backward (retrograde) compared to most planets — you could watch the Sun rise in the west',
      'Its nine dark rings are made of charcoal-dark material, completely different from Saturn\'s icy rings',
      'Uranus has been visited only once by a spacecraft — Voyager 2 in 1986',
    ],
  },

  // The narrow dark ring family as ONE textured disc (Saturn V7 pattern —
  // same saturn-rings.glsl shader; the generated strip carries the nine
  // rings + epsilon). Lies in the equatorial plane = tilted 97.77 deg with
  // the planet automatically.
  ringSystem: {
    shader: 'saturn-rings',
    texture: 'uranus/rings.png',
    innerKm: 41000,
    outerKm: 51600,
  },

  // All five Uranian moons orbit the equatorial plane — which is tilted
  // 97.77° relative to Uranus's orbital plane, so they genuinely orbit "over the
  // poles" relative to the ecliptic (the engine handles this automatically).
  bodies: [
    {
      name: 'Miranda', slug: 'miranda',
      radiusKm: 235.8, massKg: 6.59e19,
      semiMajorAxisKm: 129390, periodDays: 1.4135, phaseDeg: 0, inclinationDeg: 4.232,
      physics: 'kepler', tidallyLocked: true,
      color: 0x8a8890,
      normalScale: 1.2,  // calibrated down: 2.0 saturated the corona grooves
      geometrySegments: 64,
      detailFloor: { softKm: 50, hardKm: 10 },
      detail: { style: 'miranda', activationKm: 3000, fullKm: 100 },
      type: 'Icy Moon',
      surfaceGravity: 0.079,
      surfaceTempRange: [-213, -213],
      orbitalDistanceKm: { min: 129222, max: 129558 },
      surfaceFeatures: [
        { name: 'Verona Rupes', latDeg: -18.3, lonDeg: -12.2 },
        { name: 'Inverness Corona', latDeg: -66, lonDeg: 0 },
        { name: 'Arden Corona', latDeg: -29, lonDeg: -70 },
        { name: 'Elsinore Corona', latDeg: -18, lonDeg: 145 },
      ],
      notableFeatures: [
        'Verona Rupes is the tallest cliff in the solar system — 20 km high',
        'Patchwork surface of three angular coronae set in ancient cratered terrain',
        'Likely shattered and reassembled by an ancient giant impact',
        'Weak gravity means a 10-minute fall from the top of Verona Rupes',
      ],
      moreInfo: {
        verona: 'Verona Rupes rises 20 km above the surrounding terrain — taller than Mount Everest above sea level',
        coronae: 'The three coronae (Inverness, Arden, Elsinore) are concentric ridge-and-groove features unique to Miranda',
        reassembly: 'The impact that created the largest basin may have shattered Miranda, allowing it to reassemble in its current configuration',
      },
      facts: [
        'Miranda has the tallest cliff in the solar system, Verona Rupes, at 20 km high',
        'Its surface shows three bizarre concentric coronae, unlike any other moon',
        'Miranda\'s low gravity means a 10-minute free fall from Verona Rupes — you would have time to read a book on the way down',
      ],
    },
    {
      name: 'Ariel', slug: 'ariel',
      radiusKm: 578.9, massKg: 1.251e21,
      semiMajorAxisKm: 191020, periodDays: 2.520, phaseDeg: 70, inclinationDeg: 0.260,
      physics: 'kepler', tidallyLocked: true,
      color: 0xa8a49e,
      normalScale: 2.0,
      geometrySegments: 64,
      detailFloor: { softKm: 100, hardKm: 20 },
      detail: { style: 'cratered', activationKm: 4000, fullKm: 150 },
      type: 'Icy Moon',
      surfaceGravity: 0.269,
      surfaceTempRange: [-213, -213],
      orbitalDistanceKm: { min: 190850, max: 191190 },
      surfaceFeatures: [
        { name: 'Dunsinane Chasma', latDeg: -67, lonDeg: 92 },
      ],
      notableFeatures: [
        'Brightest of Uranus\'s major moons with the youngest surface',
        'Extensive network of canyons crisscross the surface',
        'Evidence of past cryovolcanic activity across icy terrain',
        'Most densely cratered of the inner Uranian moons',
      ],
      moreInfo: {
        brightness: 'Ariel\'s high albedo and young surface suggest geologically recent resurfacing, possibly from cryovolcanism',
        canyons: 'Ariel\'s vast canyon network suggests internal structural activity in the past',
        surface: 'Impact craters dot its surface, showing a history of bombardment',
      },
      facts: [
        'Ariel is the brightest moon of Uranus with the youngest-looking surface',
        'Its extensive canyon systems suggest past internal geological activity',
        'Ariel\'s terrain shows a mix of ancient cratering and younger cryovolcanic features',
      ],
    },
    {
      name: 'Umbriel', slug: 'umbriel',
      radiusKm: 584.7, massKg: 1.275e21,
      semiMajorAxisKm: 266000, periodDays: 4.144, phaseDeg: 150, inclinationDeg: 0.128,
      physics: 'kepler', tidallyLocked: true,
      color: 0x4e4a46,
      normalScale: 2.0,
      geometrySegments: 64,
      detailFloor: { softKm: 100, hardKm: 20 },
      detail: { style: 'cratered', activationKm: 4000, fullKm: 150 },
      type: 'Icy Moon',
      surfaceGravity: 0.2,
      surfaceTempRange: [-214, -214],
      orbitalDistanceKm: { min: 265720, max: 266280 },
      surfaceFeatures: [
        { name: 'Wunda', latDeg: -33.5, lonDeg: -44.5 },
      ],
      notableFeatures: [
        'The darkest of Uranus\'s moons — ancient, heavily cratered terrain',
        'Mysterious bright ring around the Wunda impact crater',
        'Dark surface material makes it one of the solar system\'s darkest bodies',
        'Ancient geologically inactive world frozen in time',
      ],
      moreInfo: {
        darkness: 'Umbriel\'s dark surface may indicate a thick coating of dark organic material or weathering from cosmic rays',
        wunda: 'The Wunda impact crater is surrounded by a bright ring of ejecta, a striking feature on Umbriel\'s dark surface',
        age: 'Umbriel\'s heavily cratered surface suggests minimal resurfacing since its formation',
      },
      facts: [
        'Umbriel is the darkest large moon in the Uranian system',
        'Its most notable feature is the mysterious bright ring around the Wunda impact crater',
        'The moon\'s dark surface and ancient terrain make it one of the most geologically inactive bodies known',
      ],
    },
    {
      name: 'Titania', slug: 'titania',
      radiusKm: 788.4, massKg: 3.400e21,
      semiMajorAxisKm: 435910, periodDays: 8.706, phaseDeg: 230, inclinationDeg: 0.340,
      physics: 'kepler', tidallyLocked: true,
      color: 0x9a908a,
      normalScale: 2.0,
      geometrySegments: 64,
      detailFloor: { softKm: 200, hardKm: 50 },
      detail: { style: 'cratered', activationKm: 5000, fullKm: 200 },
      type: 'Icy Moon',
      surfaceGravity: 0.367,
      surfaceTempRange: [-203, -203],
      orbitalDistanceKm: { min: 435730, max: 436090 },
      surfaceFeatures: [
        { name: 'Messina Chasma', latDeg: -23.5, lonDeg: 7.5 },
      ],
      notableFeatures: [
        'Largest moon of Uranus — comparable in size to Earth\'s Moon',
        'Massive canyon system Messina Chasma spans the surface',
        'Evidence of tectonic activity in its distant past',
        'Heavily cratered surface records billions of years of impacts',
      ],
      moreInfo: {
        size: 'At 1,577 km diameter, Titania is comparable to Earth\'s Moon',
        messina: 'Messina Chasma is a vast canyon network suggesting past tectonic stresses',
        activity: 'Titania shows signs of past geological activity with fault scarps and crater distributions',
      },
      facts: [
        'Titania is the largest moon of Uranus, nearly as big as Earth\'s Moon',
        'Its Messina Chasma canyon system indicates past internal geological activity',
        'The moon\'s surface shows a mixture of ancient craters and structural features from tectonic forces',
      ],
    },
    {
      name: 'Oberon', slug: 'oberon',
      radiusKm: 761.4, massKg: 3.076e21,
      semiMajorAxisKm: 583520, periodDays: 13.463, phaseDeg: 310, inclinationDeg: 0.058,
      physics: 'kepler', tidallyLocked: true,
      color: 0x8a8078,
      normalScale: 2.0,
      geometrySegments: 64,
      detailFloor: { softKm: 200, hardKm: 50 },
      detail: { style: 'cratered', activationKm: 5000, fullKm: 200 },
      type: 'Icy Moon',
      surfaceGravity: 0.346,
      surfaceTempRange: [-203, -203],
      orbitalDistanceKm: { min: 583310, max: 583730 },
      surfaceFeatures: [
        { name: 'Hamlet', latDeg: 46.5, lonDeg: 94.5 },
      ],
      notableFeatures: [
        'Outermost major moon of Uranus — the farthest known moon orbits here',
        'Ancient, heavily cratered surface showing intense bombardment history',
        'Dark poles suggesting methane frost or organic weathering products',
        'One of the most distant large natural satellites from a planet',
      ],
      moreInfo: {
        outermost: 'Oberon orbits beyond all other major Uranian moons, exposed to the full meteorite flux from space',
        craters: 'Its heavily cratered surface shows the cumulative effects of billions of years of impacts',
        composition: 'Dark material at the poles may be methane frost or dark organic compounds from weathering',
      },
      facts: [
        'Oberon is the outermost major moon of Uranus and one of the solar system\'s most distant large satellites',
        'Its ancient, heavily cratered surface records the full history of the Uranian system\'s impacts',
        'Dark polar regions hint at the presence of volatile ices or organic compounds',
      ],
    },
  ],

  loadingFacts: [
    'Uranus rotates on its side — its poles take turns pointing at the Sun',
    'Seasons on Uranus last 21 years each',
    'Uranus has 13 known rings, all dark and narrow',
    'Miranda has the tallest cliff in the solar system — 20 km high',
    'Uranus was the first planet discovered with a telescope (1781)',
    'Voyager 2 is the only spacecraft to have visited Uranus (1986)',
  ],
};
