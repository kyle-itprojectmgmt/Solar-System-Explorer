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

    // Worker 4 fills: navPresets, surfaceFeatures, notableFeatures,
    // moreInfo, facts.
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
  bodies: [],

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
