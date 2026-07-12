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

    // Worker 3 fills: atmosphere (limb glow — pale cyan, features.
    // atmosphericGlow true), shaderParams, detail (style 'ouranos':
    // near-featureless pale blue-green, EXTREMELY subtle banding, slight
    // polar darkening — restraint is the realism here), radiationWarning,
    // navPresets, notableFeatures, moreInfo, facts.
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

  // Worker 3 fills: Miranda (detail style 'miranda' — Verona Rupes cliff,
  // coronae patchwork), Titania, Oberon, Ariel, Umbriel in the
  // saturn.js body schema (semiMajorAxisKm / periodDays / phaseDeg /
  // inclinationDeg / physics: 'kepler').
  bodies: [],

  loadingFacts: [
    'Uranus rotates on its side — its poles take turns pointing at the Sun',
    'Seasons on Uranus last 21 years each',
    'Uranus has 13 known rings, all dark and narrow',
    'Miranda has the tallest cliff in the solar system — 20 km high',
    'Uranus was the first planet discovered with a telescope (1781)',
    'Voyager 2 is the only spacecraft to have visited Uranus (1986)',
  ],
};
