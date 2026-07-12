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

    // Worker 2 fills: atmosphere (limb glow block — thick CO2 scattering,
    // features.atmosphericGlow true), shaderParams (WIDE terminator like
    // Saturn's — thick atmosphere), detail (style 'aphrodite': cloud
    // super-rotation ~4.2 days vs the 243-day surface via time-drifting
    // UV resample, subtle banding, polar vortices above ~70 deg lat),
    // radiationWarning, navPresets, surfaceFeatures (cloud features only),
    // notableFeatures, moreInfo, facts.
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
