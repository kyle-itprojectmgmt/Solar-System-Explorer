// ---------------------------------------------------------------------------
// Venus system configuration (V8 skeleton — Worker 2 completes primary
// detail fields; schema mirrors mars.js). No moons. What you see from
// orbit is the CLOUD DECK — the diffuse texture is the SSS Venus
// atmosphere map, and the 'aphrodite' detail style animates it.
//
// TEXTURES (in /public/textures/venus/): Solar System Scope 4K Venus
// Atmosphere (CC BY 4.0, Referer header) as diffuse_4k.jpg + local GDI+
// 2K base. The radar SURFACE map (8k_venus_surface.jpg at SSS) is NOT
// shipped — nothing renders it; URL kept here for a future radar mode.
// ---------------------------------------------------------------------------

export default {
  name: 'Venus System',
  slug: 'venus',

  // Simulation epoch: Magellan orbit insertion — the radar mapper that
  // gave us the surface beneath the clouds (house pattern epochs).
  epoch: '1990-08-10T17:00:00Z',

  // Thick atmosphere scatters even on the night side — faint warm glow,
  // brighter ambient than a bare rock.
  nightAmbient: { color: 0x554a3a, intensity: 0.07 },

  star: {
    name: 'Sun',
    distanceAU: 0.723,
    color: 0xfff3dd,          // filtered through high haze
    intensity: 2.5,           // house-pattern readability scale
    // Sun direction at the EPOCH in Venus's equatorial frame (v8cal.mjs,
    // verified through sunDirectionAt()): lambda0 = -94.60 deg from the
    // J2000 mean longitude (e = 0.0068 — the circular model is near-exact
    // for Venus). Axial tilt 177.36 deg means the effective obliquity is
    // 2.64 deg: declination never leaves +-2.6 deg, seasons are invisible.
    // Vector form (cos l0 * cos tilt, -cos l0 * sin tilt, -sin l0).
    direction: [0.0800, 0.0037, 0.9968],
  },

  primary: {
    name: 'Venus',
    slug: 'venus',
    type: 'Terrestrial Planet',
    radiusKm: 6051.8,
    massKg: 4.867e24,
    // Sidereal rotation 243.0185 days. RETROGRADE — expressed through the
    // 177.36 deg axial tilt (the IAU >90-degree-tilt convention the engine
    // already uses for Phoebe's orbit): the mesh spins positively about
    // its own axis, which points almost opposite ecliptic north, so the
    // Sun rises in the west. Do NOT use a negative period.
    rotationPeriodHours: 5832.45,
    rotationPhaseAtEpochDeg: 0,  // decorative — the cloud deck is nearly
                                 // featureless and drifts via the shader
    orbitalPeriodDays: 224.701,
    axialTiltDeg: 177.36,
    surfaceGravity: 8.87,        // m/s²
    surfaceTempRange: [465, 465], // °C — uniform; the atmosphere equalizes it

    textures: { diffuse: 'diffuse.jpg', diffuseHigh: 'diffuse_4k.jpg' },

    normalScale: 0.8,            // cloud relief only — keep soft
    detailFloor: { softKm: 2000, hardKm: 500 },
    minInsertionAltKm: 500,

    // Thick CO₂ atmosphere scatters far past the geometric shadow line —
    // the terminator is the widest in the sim. Limb glow uses default
    // (no 'style' key) warm cream CO₂ scattering colors.
    atmosphere: {
      limbEdge: 0xf0e0b0,       // warm cream at the very limb
      limbMid: 0xd8c898,        // pale tan mid-falloff
      thickness: 0.012,
      intensity: 0.8,
    },

    features: { atmosphericGlow: true },

    // Unified shader convention (V7 1b, surface-base.glsl). Venus's thick
    // atmosphere demands the widest terminator in the sim — soft band
    // stretches far into the night side.
    shaderParams: {
      dayFadeSoft0: -0.30, dayFadeSoft1: 0.22,
      grazeFade0: 0.15, grazeFade1: 0.50,
    },

    // Aphrodite detail style: cloud-deck super-rotation (3.9-day cycle vs
    // 243-day planet rotation), morphing cloud structure, polar vortices,
    // and night-side lightning. Activation is deliberately HIGH (Mars
    // dust-storm pattern) so the super-rotation signature reads well from
    // NAV-entry distance (~400,000 km); morphing and polar vortices stage
    // in via their own altitude gates.
    detail: {
      style: 'aphrodite',
      activationKm: 400000,
      fullKm: 2000,
    },

    // Venus: reentry hazard is the 90-bar, 465°C atmosphere.
    radiationWarning: {
      zones: [
        { minKm: 0, maxKm: 250, label: '⚠️ Atmospheric entry — 465°C / 90 bar below' },
      ],
    },

    // UI navigation shortcuts to cloud-deck features.
    navPresets: [
      {
        label: '🌪️ Polar Vortex',
        altitudeKm: 6000,
        uv: [0.5, 0.93],
        message: 'Descending to Venus\'s south polar vortex — the mysterious double-eyed storm',
      },
      {
        label: '☁️ Cloud Deck Close-Up',
        altitudeKm: 3000,
        uv: [0.5, 0.5],
        message: 'Approaching the cloud deck — 360 km/h winds shape the atmosphere',
      },
    ],

    // Surface features are cloud-deck anchors only; the diffuse texture is
    // the SSS Venus atmosphere map, and the detail shader animates it.
    surfaceFeatures: [
      { name: 'North Polar Vortex', latDeg: 85, lonDeg: 0 },
      { name: 'South Polar Vortex', latDeg: -85, lonDeg: 0 },
      { name: 'Equatorial Y-Feature', latDeg: 0, lonDeg: 0 },
    ],

    notableFeatures: [
      'Hottest planet in the solar system — surface temperature 465°C, hotter than Mercury',
      'Rotates backwards (retrograde) and takes 243 Earth days to spin once',
      'Atmospheric pressure is 90 times Earth\'s — equivalent to 900 meters underwater',
      'Clouds of sulfuric acid circle the planet in just 3.9 days, driven by 360 km/h winds',
    ],

    moreInfo: {
      clouds: 'The cloud deck is nearly featureless at visible wavelengths — what you see is thick haze masking the sulfuric acid below',
      retrograde: 'Venus spins backwards (axial tilt 177°), so the Sun rises in the west. A Venusian day is longer than its year',
      greenhouse: 'A runaway greenhouse effect: atmospheric CO₂ traps heat, creating a hell-world beneath pristine clouds',
      missions: 'Magellan (1990–94) used radar to map the hidden surface through the clouds. Future radar mode will render those maps',
    },

    facts: [
      'Venus has the hottest surface of any planet, despite Mercury being closer to the Sun',
      'A Venusian day (243 Earth days) is longer than a Venusian year (224.7 Earth days)',
      'The atmosphere circulates once every 3.9 days, but the planet itself rotates once per 243 days',
    ],
  },

  bodies: [],   // Venus has no moons

  loadingFacts: [
    'Venus rotates backwards — the Sun rises in the west',
    'A day on Venus is longer than its year',
    'Venus is the hottest planet despite not being closest to the Sun',
    "Surface pressure on Venus is 90x Earth's — like 900 m underwater",
    'Venus clouds are made of sulfuric acid droplets',
    'Magellan mapped 98% of the surface through the clouds with radar',
  ],
};
