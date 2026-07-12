// ---------------------------------------------------------------------------
// Mars system configuration (V6). Schema mirrors earth.js — the engine is
// fully data-driven and nothing in /src/engine knows this is Mars.
//
// Units: km, kg, days, hours, degrees — the engine converts to scene units.
//
// TEXTURE SOURCES (noted per file in /public/textures/mars|phobos|deimos):
// Mars diffuse: Solar System Scope 2K/4K Mars (CC BY 4.0) — needs a Referer
//   header past hotlink protection (v5a gotcha), else NASA Viking mosaic.
// Mars normal: derived from MOLA topography (USGS Astrogeology, public
//   domain) if obtainable; procedural relief in the detail shader otherwise.
// Phobos / Deimos: NASA/JPL Viking imagery mosaics, public domain.
// ---------------------------------------------------------------------------

export default {
  name: 'Mars System',
  slug: 'mars',

  // Simulation epoch: Viking 1 touchdown at Chryse Planitia — the first
  // successful Mars landing, seven years to the day after Apollo 11.
  // (Historic-mission epochs are the house pattern: Voyager 1 for Jupiter,
  // Apollo 11 for Earth.)
  epoch: '1976-07-20T11:53:06Z',

  // Night side: faint rusty terrain silhouettes, no city lights to compete
  // with — slightly dimmer than Earth's ambient.
  nightAmbient: { color: 0x554433, intensity: 0.06 },

  star: {
    name: 'Sun',
    distanceAU: 1.524,
    color: 0xfff0dd,          // marginally warmer through suspended dust
    intensity: 2.4,           // Mars gets 43% of Earth's sunlight; kept
                              // brighter than physical for readability
                              // (house pattern — Jupiter uses 2.6 at 5.2 AU)
    // Sun direction at the EPOCH in Mars's equatorial frame. Calibration
    // (verified by tests/marscal.mjs, same method as Earth's suncal):
    //   Viking 1 landed at Ls ≈ 97° — just past northern summer solstice —
    //   so solar declination = asin(sin 25.19° · sin 97°) ≈ +25.0°.
    //   Landing was 16:13 local mean solar time at 49.97°W: the sun sat
    //   ~4.22 h past local noon → subsolar longitude ≈ 111.5°W.
    // PIPELINE GOTCHA (measured): sunDirectionAt() FLATTENS this vector's
    // declination and rebuilds it from the tilt — the seasonal phase lives
    // in the ecliptic longitude λ0, not in the y component. So this vector
    // must be the model's own equatorial form
    //   (cos λ0·cos tilt, −cos λ0·sin tilt, −sin λ0)
    // with λ0 = −173.2° chosen so declination = +25.0° AND decreasing
    // (post-solstice). The epoch longitude offset is carried by
    // rotationPhaseAtEpochDeg below.
    // NOTE the ephemeris is a circular-orbit model; Mars e = 0.093 means
    // the subsolar longitude can lead/lag by up to ~10° across the year.
    // Fine for lighting; refine when the ephemeris gains eccentricity.
    direction: [-0.8986, 0.4226, 0.1184],
  },

  primary: {
    name: 'Mars',
    slug: 'mars',
    type: 'Terrestrial Planet',
    radiusKm: 3396.2,         // equatorial
    polarRadiusKm: 3376.2,    // oblate — rendered as ellipsoid
    massKg: 6.417e23,
    // True sidereal day (24h 37m 22.66s). The SOLAR day (sol) is 24.6597 h —
    // do not confuse them; the terminator calibration needs sidereal.
    rotationPeriodHours: 24.6229,
    // frame azimuth of the epoch sun (−172.5°) minus the Viking subsolar
    // longitude (−111.5°) — measured convention: frame_lon = body_lon + phase.
    rotationPhaseAtEpochDeg: -61.0,
    orbitalPeriodDays: 686.98,
    axialTiltDeg: 25.19,
    surfaceGravity: 3.72,          // m/s²
    surfaceTempRange: [-125, 20],  // °C

    // 2K base loads fast; desktop silently upgrades to the 8K SSS map
    // (same progressive diffuseHigh path Earth uses).
    textures: { diffuse: 'diffuse.jpg', diffuseHigh: 'diffuse_8k.jpg' },

    // Worker 3 completes: atmosphere (style 'dust'), detail (style 'ares'),
    // dust storm layer config, detailFloor, radiationWarning, navPresets,
    // surfaceFeatures, notableFeatures, moreInfo, facts.
  },

  // Worker 3 adds Phobos and Deimos (kepler, radii ellipsoids like Amalthea).
  bodies: [],

  loadingFacts: [
    'Olympus Mons is three times the height of Mount Everest',
    'Valles Marineris would stretch across the entire United States',
    'A Martian day is only 40 minutes longer than Earth\'s',
    'Mars has the largest dust storms in the solar system',
    'Liquid water once flowed on Mars billions of years ago',
    'Viking 1 made the first successful Mars landing on July 20, 1976',
    'Perseverance rover has explored Jezero Crater since 2021',
    'Phobos orbits Mars faster than Mars rotates — it rises in the west',
  ],
};
