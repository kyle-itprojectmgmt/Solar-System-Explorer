// ---------------------------------------------------------------------------
// Saturn system configuration (V7). Schema mirrors mars.js / jupiter.js —
// the engine is fully data-driven and nothing in /src/engine knows this is
// Saturn.
//
// Units: km, kg, days, hours, degrees — the engine converts to scene units.
//
// TEXTURE SOURCES (files in /public/textures/<slug>/):
// Saturn diffuse: Solar System Scope (CC BY 4.0, Referer header needed —
//   v5a gotcha). SSS's "8k_saturn" ships 4096×2048; local 2K GDI+
//   downscale as the fast-loading base (Mars house pattern).
// Saturn rings: SSS 8k_saturn_ring_alpha.png (8192×500 RGBA radial strip,
//   CC BY 4.0) → rings.png. Cassini-derived opacity/color vs radius.
// Titan, Enceladus, Iapetus, Mimas, Tethys, Dione, Rhea: Steve Albers SOS
//   cylindrical maps (stevealbers.net/albers/sos/saturn/<moon>/
//   <moon>_rgb_cyl_www.jpg — non-commercial by permission, attribution
//   required; same source as the Galilean moons). 4K–8K.
// Hyperion, Phoebe: NO fetchable cylindrical maps (irregular bodies) —
//   color-only ellipsoids + procedural cratered detail (Metis/Phobos
//   house pattern).
// ---------------------------------------------------------------------------

export default {
  name: 'Saturn System',
  slug: 'saturn',

  // Simulation epoch: Cassini Saturn Orbit Insertion — the house pattern of
  // historic-mission epochs (Voyager 1 / Apollo 11 / Viking 1 / Cassini).
  epoch: '2004-07-01T02:48:00Z',

  // Night side: no city lights, colder and dimmer than Mars — faint warm
  // cloud-band silhouettes only.
  nightAmbient: { color: 0x443f33, intensity: 0.05 },

  star: {
    name: 'Sun',
    distanceAU: 9.537,
    color: 0xffeedd,          // cooler, dimmer sun at 9.5 AU
    intensity: 2.2,           // Saturn gets ~1.1% of Earth's sunlight; kept
                              // bright for readability (house pattern —
                              // Jupiter 2.6 @ 5.2 AU, Mars 2.4 @ 1.5 AU)
    // Sun direction at the EPOCH in Saturn's equatorial frame. Calibrated
    // the marscal way (the ephemeris FLATTENS this vector's declination and
    // rebuilds it from tilt — the seasonal phase lives in λ0):
    //   ANCHOR CHOICE: the circular-orbit model (e = 0.056 real) cannot be
    //   right at every date across a 29.5-year orbit. Every system opens
    //   LIVE, and the ring tilt TODAY is the visible seasonal feature — so
    //   λ0 is anchored to the most recent ring-plane crossing,
    //   2025-03-23 (sun crossing to the SOUTH ring face, δ = 0 falling):
    //   7,570 days after the epoch = 253.3° of travel, λ = 270° there →
    //   λ0 = +16.7°. Costs ~2° of declination back at the 2004 epoch
    //   (model −25.5° vs real −23.6°) and ~5° around the 2009 equinox —
    //   accepted so 2020s–2030s LIVE lighting is right (2026: δ ≈ −7°,
    //   rings nearly edge-on, matching the real sky).
    //   Vector form (cos λ0·cos tilt, −cos λ0·sin tilt, −sin λ0);
    //   verified by tests/saturncal.mjs.
    direction: [0.8556, -0.4309, -0.2874],
  },

  primary: {
    name: 'Saturn',
    slug: 'saturn',
    type: 'Gas Giant',
    radiusKm: 60268,          // equatorial
    polarRadiusKm: 54364,     // most oblate planet in the solar system
    massKg: 5.683e26,
    // System III sidereal rotation: 10h 39m 22.4s.
    rotationPeriodHours: 10.6562,
    // IAU 2015 System III prime meridian (W = 38.90° at J2000 +
    // 810.7939024°/day) propagated to the Cassini SOI epoch ≈ 222.5°.
    // Decorative for a gas giant — the banded texture is axisymmetric, so
    // no user-visible feature anchors to longitude (unlike Mars/Earth).
    rotationPhaseAtEpochDeg: 222.5,
    orbitalPeriodDays: 10759.22, // 29.46 years
    axialTiltDeg: 26.73,
    surfaceGravity: 10.44,       // m/s² at cloud tops
    surfaceTempRange: [-178, -178], // °C, cloud tops

    // 2K base loads fast; desktop silently upgrades to the SSS map
    // (same progressive diffuseHigh path Earth/Mars use).
    textures: { diffuse: 'diffuse.jpg', diffuseHigh: 'diffuse_8k.jpg' },

    normalScale: 1.8,   // cloud band relief, softer than Jupiter's
    detailFloor: { softKm: 5000, hardKm: 500 },
    // Free insertion orbits stay above the main ring span: F ring outer
    // edge 140,180 km from center − 60,268 km radius ≈ 79,912 km altitude
    // (Jupiter house pattern; rounded up). Ring-plane presets that dive
    // between the rings are routed through orbit mode (documented
    // exemption, like Jupiter's GRS close pass).
    minInsertionAltKm: 80000,

    // Saturn's radiation belts are mild next to Jupiter's (the rings soak
    // up the trapped particles) — warn only inside the D ring gap.
    radiationWarning: {
      zones: [
        { minKm: 0, maxKm: 6600, label: '⚠️ Inner radiation belt / ring plane debris' },
      ],
    },

    atmosphere: {
      limbEdge: 0xe8c860,     // warm gold at the very limb
      limbMid: 0xf5ecd0,      // cream mid-falloff
      thickness: 0.02,        // thinner haze shell than Jupiter's
      intensity: 0.9,
      // style: 'saturn' — wired in Phase 3 (Worker 1's shader)
    },

    features: { atmosphericGlow: true, equatorialBulge: true },

    // Unified shader convention (V7 1b, surface-base.glsl).
    shaderParams: {
      dayFadeSoft0: -0.12, dayFadeSoft1: 0.10, // gas giant, no hard surface
      grazeFade0: 0.15, grazeFade1: 0.50,
    },

    // detail: { style: 'saturn', activationKm: 50000, fullKm: 5000 },
    // ^ wired in Phase 3 once Worker 1's saturn-clouds.glsl lands.

    navPresets: [
      {
        label: '🔷 North Polar Hexagon',
        altitudeKm: 8000,
        uv: [0.5, 0.97],
        message: 'Descending to Saturn\'s north polar hexagon — a storm wider than two Earths',
      },
      {
        label: '🌪️ Great White Spot latitude',
        altitudeKm: 15000,
        uv: [0.5, 0.72],
        message: 'Approaching the Great White Spot storm band at 40° north latitude',
      },
    ],

    surfaceFeatures: [
      { name: 'North Polar Hexagon', latDeg: 87, lonDeg: 0 },
      { name: 'Great White Spot band', latDeg: 40, lonDeg: 0 },
    ],

    notableFeatures: [
      'Ring system spans 282,000 km wide but only ~10 meters thick',
      'Least dense planet in the solar system — would float in water',
      'Permanent hexagonal storm at north pole wider than two Earths',
      '146 known moons orbiting Saturn',
    ],

    moreInfo: {
      rings: 'Ring particles are almost pure water ice, from 1 cm grains to 10 m boulders',
      hexagon: 'The north polar hexagon is wider than two Earths and has persisted since Voyager saw it in 1981',
      density: 'Saturn\'s mean density is 0.687 g/cm³ — less than water',
    },

    facts: [
      'Saturn\'s rings are made of water ice and span 282,000 km across',
      'It\'s the only planet that would float in water',
      'A permanent hexagon-shaped storm wider than Earth caps its north pole',
    ],
  },

  // Saturn's main ring system — the showpiece. Real radial spans (km from
  // Saturn's center, NASA/JPL). The Cassini Division is the gap between
  // B outer and A inner (no mesh — absence is the feature). Rendering uses
  // the Cassini radial texture (saturn/rings.png) via Worker 2's shader,
  // wired in Phase 3; opacity/color here are the procedural fallback.
  rings: [
    { name: 'D Ring', type: 'flat', innerKm: 66900,  outerKm: 74510,  color: 0x554e44, opacity: 0.04, thicknessKm: 100 },
    { name: 'C Ring', type: 'flat', innerKm: 74510,  outerKm: 92000,  color: 0x6b6459, opacity: 0.18, thicknessKm: 100 },
    { name: 'B Ring', type: 'flat', innerKm: 92000,  outerKm: 117580, color: 0xd8cdb8, opacity: 0.90, thicknessKm: 100 },
    { name: 'A Ring', type: 'flat', innerKm: 122170, outerKm: 136775, color: 0xc4b9a4, opacity: 0.65, thicknessKm: 100 },
    { name: 'F Ring', type: 'flat', innerKm: 139930, outerKm: 140430, color: 0xb0a898, opacity: 0.25, thicknessKm: 50 },
  ],

  // Worker 4 fills: all 9 moons (Titan, Enceladus, Iapetus, Mimas, Tethys,
  // Dione, Rhea + Hyperion, Phoebe) in the mars.js/jupiter.js body schema.
  bodies: [
    {
      name: 'Titan', slug: 'titan',
      radiusKm: 2574.7, massKg: 1.345e23,
      semiMajorAxisKm: 1221870, periodDays: 15.945, phaseDeg: 0, inclinationDeg: 0.33,
      physics: 'kepler', tidallyLocked: true,
      textures: { diffuse: 'diffuse.jpg' },
      normalScale: 1.0,
      detailFloor: { softKm: 500, hardKm: 100 },
      color: 0xd9821e,
      type: 'Moon with Atmosphere',
      surfaceGravity: 1.352,
      surfaceTempRange: [-179, -179],
      orbitalDistanceKm: { min: 1186680, max: 1257060 },
      atmosphere: {
        style: 'titan',
        limbEdge: 0xd98019,
        limbMid: 0x8b4010,
        thickness: 0.10,
        intensity: 1.0,
        opaque: true,
      },
      notableFeatures: [
        'Only moon with a dense atmosphere — nitrogen-rich like Earth\'s',
        'Liquid methane lakes and rivers on the surface',
        'Orange haze from organic molecules obscures the surface',
        'Huygens probe landed in 2005 — the most distant landing in history',
      ],
      moreInfo: {
        atmosphere: '1.5x Earth\'s surface pressure — the only moon where you could walk unsuited except for the -179°C cold',
        lakes: 'Kraken Mare is a methane sea larger than the Caspian Sea',
        huygens: 'Huygens (2005): the most distant landing in history, sent back first images from Titan\'s surface',
      },
      facts: [
        'Titan is the only moon with a thick atmosphere thicker than Earth\'s at sea level',
        'It has liquid methane lakes near its north pole, unique in the solar system',
        'Titan\'s haze is so thick its surface is invisible from orbit — only radar sees through',
      ],
    },
    {
      name: 'Enceladus', slug: 'enceladus',
      radiusKm: 252.1, massKg: 1.08e20,
      semiMajorAxisKm: 238020, periodDays: 1.370, phaseDeg: 40, inclinationDeg: 0.009,
      physics: 'kepler', tidallyLocked: true,
      textures: { diffuse: 'diffuse.jpg' },
      normalScale: 2.0,
      detailFloor: { softKm: 50, hardKm: 10 },
      color: 0xf0f4f8,
      type: 'Icy Moon',
      surfaceGravity: 0.113,
      surfaceTempRange: [-240, -128],
      orbitalDistanceKm: { min: 236918, max: 239156 },
      detail: { style: 'enceladus', activationKm: 5000, fullKm: 200 },
      geysers: {
        enabled: true,
        heightKm: 500,
        locations: [
          { name: 'Baghdad Sulcus', latDeg: -82, lonDeg: 0 },
          { name: 'Damascus Sulcus', latDeg: -80, lonDeg: 90 },
          { name: 'Cairo Sulcus', latDeg: -79, lonDeg: 180 },
          { name: 'Alexandria Sulcus', latDeg: -78, lonDeg: 270 },
        ],
      },
      surfaceFeatures: [
        { name: 'Baghdad Sulcus', latDeg: -82, lonDeg: 0 },
        { name: 'Damascus Sulcus', latDeg: -80, lonDeg: 90 },
        { name: 'Cairo Sulcus', latDeg: -79, lonDeg: 180 },
        { name: 'Alexandria Sulcus', latDeg: -78, lonDeg: 270 },
      ],
      notableFeatures: [
        'Water geysers reach 500 km into space from the south pole',
        'Subsurface ocean beneath ice — best bet for microbial life',
        'Most reflective body in the solar system — surface albedo > 0.99',
        'Cassini flew through plumes and detected organic molecules',
      ],
      moreInfo: {
        geysers: 'Plumes of water vapor and organic compounds erupt from fractures at the south pole',
        ocean: 'A global subsurface ocean up to 100 km deep supports hydrothermal vents',
        organics: 'Cassini detected complex organic molecules in the plumes, a sign of prebiotic chemistry',
      },
      facts: [
        'Enceladus shoots geysers 500 km high, reaching Saturn\'s E-ring',
        'Its subsurface ocean may harbor life, making it a key target for exploration',
        'The plumes contain organic compounds that may be building blocks for life',
      ],
    },
    {
      name: 'Iapetus', slug: 'iapetus',
      radiusKm: 734.5, massKg: 1.806e21,
      semiMajorAxisKm: 3560820, periodDays: 79.321, phaseDeg: 120, inclinationDeg: 15.47,
      physics: 'kepler', tidallyLocked: true,
      textures: { diffuse: 'diffuse.jpg' },
      normalScale: 2.0,
      detailFloor: { softKm: 200, hardKm: 50 },
      color: 0x8a7a66,
      type: 'Icy Moon',
      surfaceGravity: 0.223,
      surfaceTempRange: [-173, -143],
      orbitalDistanceKm: { min: 3460080, max: 3661560 },
      detail: { style: 'iapetus', activationKm: 8000, fullKm: 300 },
      surfaceFeatures: [
        { name: 'Cassini Regio', latDeg: 0, lonDeg: -95 },
        { name: 'Equatorial Ridge', latDeg: 0, lonDeg: 180 },
        { name: 'Turgis Crater', latDeg: 17, lonDeg: -28 },
      ],
      notableFeatures: [
        'Half jet-black, half brilliant white — yin-yang appearance',
        'Equatorial ridge 20 km high creates a distinctive walnut shape',
        'Dark side coated with dust from the distant moon Phoebe',
        'Discovered by Giovanni Cassini in 1671',
      ],
      moreInfo: {
        ridge: 'The 20 km equatorial ridge is one of the largest ridge structures in the solar system',
        duality: 'The Cassini Regio dark material may have been accreted from Phoebe',
        discovery: 'Giovanni Cassini\'s observation in 1671 marked the first discovery of Iapetus',
      },
      facts: [
        'Iapetus is half black and half white, making it look like a yin-yang symbol',
        'It has a 20 km ridge along its equator, giving it a walnut-like shape',
        'The dark material on one hemisphere may have drifted in from Phoebe billions of years ago',
      ],
    },
    {
      name: 'Mimas', slug: 'mimas',
      radiusKm: 198.2, massKg: 3.75e19,
      semiMajorAxisKm: 185520, periodDays: 0.942, phaseDeg: 200, inclinationDeg: 1.574,
      physics: 'kepler', tidallyLocked: true,
      textures: { diffuse: 'diffuse.jpg' },
      normalScale: 2.0,
      detailFloor: { softKm: 50, hardKm: 10 },
      color: 0x9a9a96,
      type: 'Icy Moon',
      surfaceGravity: 0.064,
      surfaceTempRange: [-209, -181],
      orbitalDistanceKm: { min: 181884, max: 189156 },
      detail: { style: 'cratered', activationKm: 3000, fullKm: 100, params: { basinUV: [0.211, 0.5] } },
      surfaceFeatures: [
        { name: 'Herschel Crater', latDeg: 0, lonDeg: -104 },
      ],
      notableFeatures: [
        'The "Death Star" moon — Herschel crater is 1/3 of its diameter',
        'Giant impact that created Herschel nearly shattered the entire moon',
        'Might harbor a subsurface ocean hidden by the massive crater impact',
        'Orbits Saturn in less than a day',
      ],
      moreInfo: {
        herschel: 'Herschel crater, 139 km wide, is one of the largest impact structures relative to body size',
        survival: 'The impact that created Herschel was nearly catastrophic for Mimas',
        ocean: 'Recent analysis suggests Mimas may have a hidden subsurface ocean',
      },
      facts: [
        'Mimas looks like the Death Star from Star Wars because of its giant Herschel crater',
        'The impact that created Herschel nearly destroyed the entire moon',
        'Herschel crater is so large that the impact should have fragmented Mimas',
      ],
    },
    {
      name: 'Tethys', slug: 'tethys',
      radiusKm: 531.1, massKg: 6.175e20,
      semiMajorAxisKm: 294660, periodDays: 1.888, phaseDeg: 250, inclinationDeg: 1.091,
      physics: 'kepler', tidallyLocked: true,
      textures: { diffuse: 'diffuse.jpg' },
      normalScale: 2.0,
      detailFloor: { softKm: 100, hardKm: 20 },
      color: 0xb8bcc0,
      type: 'Icy Moon',
      surfaceGravity: 0.146,
      surfaceTempRange: [-187, -187],
      orbitalDistanceKm: { min: 294630, max: 294690 },
      detail: { style: 'cratered', activationKm: 4000, fullKm: 150 },
      surfaceFeatures: [
        { name: 'Ithaca Chasma', latDeg: -10, lonDeg: 30 },
        { name: 'Odysseus Crater', latDeg: 33, lonDeg: -129 },
      ],
      notableFeatures: [
        'Ithaca Chasma canyon stretches 2,000 km across the surface',
        'Nearly pure water ice composition',
        'Odysseus crater spans 2/5 of the moon\'s diameter',
        'Ancient heavily cratered surface hints at an old world',
      ],
      moreInfo: {
        ithaca: 'Ithaca Chasma is a massive canyon system over 2,000 km long and 100 km wide',
        composition: 'Tethys is made almost entirely of water ice with some rock',
        odysseus: 'The Odysseus basin spans 440 km across, nearly half the moon\'s width',
      },
      facts: [
        'Tethys has Ithaca Chasma, a canyon 2,000 km long that could wrap around Earth',
        'It\'s almost entirely made of water ice',
        'Odysseus crater is so large that Tethys should have been shattered by the impact',
      ],
    },
    {
      name: 'Dione', slug: 'dione',
      radiusKm: 561.4, massKg: 1.096e21,
      semiMajorAxisKm: 377400, periodDays: 2.737, phaseDeg: 300, inclinationDeg: 0.028,
      physics: 'kepler', tidallyLocked: true,
      textures: { diffuse: 'diffuse.jpg' },
      normalScale: 2.0,
      detailFloor: { softKm: 100, hardKm: 20 },
      color: 0xaaa8a2,
      type: 'Icy Moon',
      surfaceGravity: 0.232,
      surfaceTempRange: [-186, -186],
      orbitalDistanceKm: { min: 376570, max: 378230 },
      detail: { style: 'cratered', activationKm: 4000, fullKm: 150 },
      surfaceFeatures: [
        { name: 'Ice Cliffs (Wispy Terrain)', latDeg: -20, lonDeg: -130 },
        { name: 'Evander Basin', latDeg: -57, lonDeg: -145 },
      ],
      notableFeatures: [
        'Bright ice cliffs dominate the trailing hemisphere',
        'Evidence of past geological activity on an icy world',
        'Shares its orbit with two Trojan moons (Helene and Polydeuces)',
        'Surface of ancient cratered terrain mixed with younger wispy deposits',
      ],
      moreInfo: {
        cliffs: 'The wispy terrain consists of bright ice cliffs up to 1 km high',
        trojan: 'Helene and Polydeuces are Trojan moons that share Dione\'s orbit at the Lagrange points',
        geology: 'Dione may have experienced cryovolcanism in its distant past',
      },
      facts: [
        'Dione has striking ice cliffs on its trailing side up to 1 km high',
        'Two small Trojan moons, Helene and Polydeuces, share Dione\'s orbit',
        'Evidence suggests Dione may once have had geological activity',
      ],
    },
    {
      name: 'Rhea', slug: 'rhea',
      radiusKm: 763.8, massKg: 2.307e21,
      semiMajorAxisKm: 527040, periodDays: 4.518, phaseDeg: 80, inclinationDeg: 0.331,
      physics: 'kepler', tidallyLocked: true,
      textures: { diffuse: 'diffuse.jpg' },
      normalScale: 2.0,
      detailFloor: { softKm: 200, hardKm: 50 },
      color: 0xa8a49c,
      type: 'Icy Moon',
      surfaceGravity: 0.264,
      surfaceTempRange: [-220, -174],
      orbitalDistanceKm: { min: 526510, max: 527570 },
      detail: { style: 'cratered', activationKm: 5000, fullKm: 200 },
      surfaceFeatures: [
        { name: 'Tirawa Basin', latDeg: 34, lonDeg: -151 },
        { name: 'Inktomi Crater', latDeg: -14, lonDeg: -112 },
      ],
      notableFeatures: [
        'Saturn\'s second-largest moon, nearly as big as Mercury',
        'May have its own tenuous ring system',
        'Ancient, heavily cratered surface records billions of years of impacts',
        'Potential to host a subsurface ocean like Mimas',
      ],
      moreInfo: {
        size: 'At 1,527 km diameter, Rhea is only 4.5% smaller than Mercury',
        rings: 'Rhea may have its own faint ring system, unique for a moon',
        craters: 'The ancient heavily cratered surface shows Rhea is geologically dead',
      },
      facts: [
        'Rhea is Saturn\'s second-largest moon and is nearly as large as Mercury',
        'It may have its own ring system, making it the only moon with rings',
        'Its surface is heavily cratered and ancient, showing a dead world',
      ],
    },
    {
      name: 'Hyperion', slug: 'hyperion',
      radiusKm: 135, radii: { x: 180, y: 133, z: 103 },
      massKg: 5.619e18,
      semiMajorAxisKm: 1481010, periodDays: 21.277, phaseDeg: 150, inclinationDeg: 0.43,
      physics: 'kepler', tidallyLocked: false, chaoticRotation: true, rotationPeriodHours: null,
      color: 0x9c8468,
      normalScale: 2.0,
      detailFloor: { softKm: 50, hardKm: 10 },
      geometrySegments: 64,
      detail: { style: 'cratered', activationKm: 1500, fullKm: 30 },
      type: 'Irregular Moon',
      surfaceGravity: 0.017,
      surfaceTempRange: [-180, -160],
      orbitalDistanceKm: { min: 1298850, max: 1663170 },
      notableFeatures: [
        'Chaotic tumbling — rotation genuinely unpredictable',
        'Sponge-like surface of deep impact craters and pits',
        'Reddish organic (tholin) staining on the surface',
        'Largest known irregularly-shaped moon at 360 × 266 × 206 km',
      ],
      moreInfo: {
        chaos: 'Hyperion\'s chaotic rotation was one of the first demonstrations of chaos in the solar system',
        shape: 'Its potato-like form creates a gravitational field too weak to spin it regularly',
        surface: 'The sponge-like surface suggests a loosely bound rubble pile of material',
      },
      facts: [
        'Hyperion tumbles chaotically — its rotation is genuinely unpredictable',
        'Its gravitational field is so weak that it cannot settle into a regular spin',
        'A sponge-like surface with deep craters dominates its irregular body',
      ],
    },
    {
      name: 'Phoebe', slug: 'phoebe',
      radiusKm: 106.5, massKg: 8.29e18,
      semiMajorAxisKm: 12955760, periodDays: 550.56, phaseDeg: 20, inclinationDeg: 175.2,
      physics: 'kepler', tidallyLocked: false, rotationPeriodHours: 9.274,
      color: 0x3d3a36,
      normalScale: 2.0,
      detailFloor: { softKm: 30, hardKm: 5 },
      geometrySegments: 64,
      detail: { style: 'cratered', activationKm: 1000, fullKm: 20 },
      type: 'Irregular Moon',
      surfaceGravity: 0.045,
      surfaceTempRange: [-198, -163],
      orbitalDistanceKm: { min: 10843680, max: 15067840 },
      notableFeatures: [
        'Orbits retrograde — a captured Kuiper Belt object',
        'Among the darkest objects in the solar system',
        'Photographed by Cassini during a close approach in 2004',
        'Sheds the dust that darkens Iapetus via the Phoebe ring',
      ],
      moreInfo: {
        capture: 'Phoebe\'s retrograde orbit suggests it was captured from the Kuiper Belt billions of years ago',
        darkness: 'At an albedo of only 0.06, Phoebe is one of the darkest known objects',
        iapetus: 'Dust from Phoebe is slowly migrating inward to darken Iapetus\'s leading hemisphere',
      },
      facts: [
        'Phoebe orbits retrograde, the only large moon of Saturn to do so',
        'It\'s a captured Kuiper Belt object, likely billions of years old',
        'Phoebe is one of the darkest objects in the solar system',
      ],
    },
  ],

  loadingFacts: [
    'Saturn\'s rings span 282,000 km but are only about 10 meters thick',
    'Saturn is the least dense planet — it would float in water',
    'A permanent hexagonal storm wider than two Earths caps Saturn\'s north pole',
    'Titan is the only moon in the solar system with a dense atmosphere',
    'Enceladus shoots geysers of water ice 500 km into space',
    'Cassini orbited Saturn for 13 years before its Grand Finale plunge in 2017',
    'Iapetus is half jet-black and half brilliant white',
    'The ring particles are almost pure water ice, from dust grains to house-sized boulders',
  ],
};
