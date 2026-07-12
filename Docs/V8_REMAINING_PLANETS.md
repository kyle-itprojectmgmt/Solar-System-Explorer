# Solar System Explorer — V8 Session Prompt
# Mercury + Venus + Uranus + Neptune
# Complete the 8-planet solar system
# Parallel Worker Orchestration
# Save to Docs/V8_REMAINING_PLANETS.md

---

## HOW TO START

```bash
cd C:\dev\Solar-System-Explorer
git pull origin main
git status   ← must show clean working tree
claude --model claude-sonnet-4-6
```

Say: "Read .claude/instructions.md, then Docs/PROJECT_LOG.md,
then Docs/V8_REMAINING_PLANETS.md. Follow the orchestration
model exactly. Commit and push after every phase."

---

## GOAL

Complete the 8-planet solar system. This session adds:
- Mercury (cratered, no atmosphere, large sun)
- Venus (opaque cloud system, no radar toggle)
- Uranus (ice giant, sideways rotation, thin rings, Miranda)
- Neptune (deep blue, Great Dark Spot, Triton)

Version bump to 8.0.0.

All systems use the existing architecture:
- Data-driven engine — drop in config files
- Unified shader convention (surface-base.glsl)
- LIVE mode default, current UTC
- Security headers already in place (no changes needed)
- Per-system lazy loading already in vite.config.js

---

## ORCHESTRATION MODEL

PHASE 1 — Orchestrator: shared infrastructure + textures
PHASE 2 — 4 workers in parallel (one per planet)
PHASE 3 — Orchestrator: integration, wiring, testing, deploy

WORKER FILE OWNERSHIP — strictly enforced:
  Worker 1: src/data/systems/mercury.js
            src/engine/shaders/mercury-surface.glsl
  Worker 2: src/data/systems/venus.js
            src/engine/shaders/venus-clouds.glsl
  Worker 3: src/data/systems/uranus.js
            src/engine/shaders/uranus-atmosphere.glsl
            src/engine/shaders/miranda-surface.glsl
  Worker 4: src/data/systems/neptune.js
            src/engine/shaders/neptune-atmosphere.glsl
            src/engine/shaders/triton-surface.glsl

Workers must NOT touch: main.js, renderer.js, camera.js,
physics.js, ui.js, vite.config.js, package.json, wrangler.toml,
index.html, src/engine/glsl/simplex.glsl,
src/engine/glsl/surface-base.glsl, PROJECT_LOG.md,
any existing planet files (jupiter.js, earth.js, mars.js,
saturn.js) or their shaders.

---

## TESTING STRATEGY

Full regression: all 4 new systems
Smoke test: Jupiter, Earth, Mars, Saturn (verify no regression)
Feature-specific: sideways Uranus orbital geometry,
  Triton retrograde orbit, Miranda extreme cliff terrain
Security checklist: verify CSP still A+ after deploy

---

## PHASE 1 — ORCHESTRATOR ONLY

### 1a — Texture acquisition

Download and place all textures before spawning workers.
Primary source: solarsystemscope.com/textures (CC BY 4.0)
Fallback: planetpixelemporium.com (public domain)
Fallback: bjj.is (Björn Jónsson, public domain)

**Mercury:**
  public/textures/mercury/diffuse.jpg (SSS 2K-4K)
  public/textures/mercury/normal.jpg (if available)
  Note: Mercury is grey and heavily cratered — similar to Moon

**Venus:**
  public/textures/venus/clouds.jpg (SSS Venus Atmosphere texture)
  public/textures/venus/surface.jpg (SSS Venus Surface — not shown
    through clouds but used for radar-vision if ever added)
  Note: Venus atmosphere rotates 60x faster than surface

**Uranus:**
  public/textures/uranus/diffuse.jpg (SSS Uranus — pale blue-green)
  Note: Uranus is nearly featureless — mostly uniform color
  Miranda: no good public texture — use procedural detail only

**Neptune:**
  public/textures/neptune/diffuse.jpg (SSS Neptune — vivid deep blue)
  Triton: NASA Voyager 2 imagery at planetpixelemporium.com or bjj.is

If any download fails: create a solid-color placeholder canvas
texture and note the URL in the system config file comments.
Do NOT block session on texture downloads.

Commit: `feat: V8 textures acquired`

### 1b — System skeletons

Create minimal skeleton files for each system so the engine
can load them without errors. Workers fill in the details.

Create src/data/systems/mercury.js:
```javascript
export default {
  name: 'Mercury', slug: 'mercury',
  star: { distanceAU: 0.387, luminosity: 6.68, color: 0xFFFFEE },
  primary: { name: 'Mercury', slug: 'mercury', type: 'terrestrial',
             radiusKm: 2439.7, /* Worker 1 fills rest */ },
  bodies: [],
};
```

Create src/data/systems/venus.js:
```javascript
export default {
  name: 'Venus', slug: 'venus',
  star: { distanceAU: 0.723, luminosity: 1.91, color: 0xFFFFEE },
  primary: { name: 'Venus', slug: 'venus', type: 'terrestrial',
             radiusKm: 6051.8, /* Worker 2 fills rest */ },
  bodies: [],
};
```

Create src/data/systems/uranus.js:
```javascript
export default {
  name: 'Uranus', slug: 'uranus',
  star: { distanceAU: 19.19, luminosity: 0.0027, color: 0xFFEEDD },
  primary: { name: 'Uranus', slug: 'uranus', type: 'ice_giant',
             radiusKm: 25362, /* Worker 3 fills rest */ },
  bodies: [],
};
```

Create src/data/systems/neptune.js:
```javascript
export default {
  name: 'Neptune', slug: 'neptune',
  star: { distanceAU: 30.07, luminosity: 0.001, color: 0xFFEEDD },
  primary: { name: 'Neptune', slug: 'neptune', type: 'ice_giant',
             radiusKm: 24622, /* Worker 4 fills rest */ },
  bodies: [],
};
```

Commit: `feat: V8 system skeletons — 4 new planet configs`

### 1c — NAV panel wiring

In renderer.js or the system switching logic, add all 4 new
systems to AVAILABLE_SYSTEMS:
```javascript
export const AVAILABLE_SYSTEMS = [
  'jupiter', 'earth', 'mars', 'saturn',
  'mercury', 'venus', 'uranus', 'neptune'
];
```

Wire NAV panel planet rows to call switchSystem() for each.
Currently they show "Coming Soon" — change to active.

Loading screen facts per system:

Mercury facts:
  "Mercury has no atmosphere — temperatures swing 600°C between day and night"
  "A year on Mercury is shorter than its day"
  "Mercury's core makes up 85% of the planet's radius"
  "The Sun appears 3x larger from Mercury than from Earth"
  "MESSENGER orbited Mercury from 2011 to 2015"

Venus facts:
  "Venus rotates backwards — the Sun rises in the west"
  "A day on Venus is longer than its year"
  "Venus is the hottest planet despite not being closest to the Sun"
  "Surface pressure on Venus is 90x Earth's — like 900m underwater"
  "Venus clouds are made of sulfuric acid"

Uranus facts:
  "Uranus rotates on its side — its poles point toward the Sun"
  "Seasons on Uranus last 21 years each"
  "Uranus has 13 known rings, all dark and narrow"
  "Miranda has the tallest cliff in the solar system — 20km high"
  "Uranus was the first planet discovered with a telescope (1781)"

Neptune facts:
  "Neptune has the strongest winds in the solar system — 2,100 km/h"
  "Triton orbits backwards and will eventually crash into Neptune"
  "Neptune was predicted mathematically before it was seen"
  "A year on Neptune is 165 Earth years"
  "Voyager 2 is the only spacecraft to visit Neptune (1989)"

Commit: `feat: NAV panel wiring + loading facts for all 4 new systems`

### 1d — Uranus orbital geometry (critical, orchestrator only)

Uranus has a unique challenge: axial tilt of 97.8° — it rotates
on its side. Its moons orbit over its poles, not its equator.
This requires special handling in the orbital mechanics.

In physics.js, for bodies with axialTiltDeg > 80°:
The orbital reference plane for moons must be aligned with the
planet's equatorial plane (which is nearly perpendicular to the
ecliptic). Add a flag to uranus.js:
  polarOrbitingMoons: true

When polarOrbitingMoons is true, moon orbital calculations use
the planet's rotational pole as the orbital north vector instead
of the ecliptic north.

This is the key visual that makes Uranus unique — moons orbiting
over the poles rather than around the equator.

Commit: `feat: Uranus polar moon orbit geometry`

### 1e — Commit all Phase 1, spawn workers

```bash
git add -A
git status
git commit -m "feat: V8 Phase 1 — textures, skeletons, NAV wiring, Uranus geometry"
git push origin main
git show HEAD --name-only
```

Run existing regression suite — all must pass before spawning.
ONLY spawn workers after green suite.

---

## PHASE 2 — PARALLEL WORKERS

### WORKER 1 SPEC — Mercury

Files owned:
  src/data/systems/mercury.js (complete)
  src/engine/shaders/mercury-surface.glsl

Read-only: src/engine/glsl/simplex.glsl,
           src/engine/glsl/surface-base.glsl

**mercury-surface.glsl:**
Mercury looks like the Moon but with important differences:
- Heavily cratered, ancient surface
- No atmosphere = no erosion = sharper crater features than Moon
- Color: darker grey overall (#888888 to #AAAAAA)
- Smooth plains (intercrater plains) in some regions
- Caloris Basin: enormous impact feature 1,550 km across
  at lat 30°N, lon 160°W — implement as a large dark depression
  with radiating secondary crater chains
- Hollows: small bright features unique to Mercury — implement
  as tiny bright blue-white patches scattered at mid-latitudes

Use the same crater shader pattern as Moon (bowl-only, no rim
rings — the procedural crater lesson from v6 Mars).
min(c, 0) bowl depressions only, hash-thinned.

Use unified shader convention (surface-base.glsl):
```glsl
float sunDot = dot(normalize(vNormal), uSunDirection);
float dayFade = sse_dayFade(sunDot, uDayFadeSoft0, uDayFadeSoft1);
float grazeFade = sse_grazeFade(sunDot, uGrazeFade0, uGrazeFade1);
```

Night side must be completely dark (no atmosphere to scatter light).

**mercury.js complete config:**
```javascript
export default {
  name: 'Mercury', slug: 'mercury',
  star: {
    distanceAU: 0.387,
    luminosity: 6.68,   // Sun is 6.68x brighter at Mercury
    color: 0xFFFFEE,
    angularSizeMult: 2.6, // Sun appears 2.6x larger than from Earth
  },
  primary: {
    name: 'Mercury', slug: 'mercury', type: 'terrestrial',
    radiusKm: 2439.7,
    massKg: 3.301e23,
    rotationPeriodHours: 1407.6,  // 58.6 Earth days
    axialTiltDeg: 0.034,
    rotationPhaseAtEpochDeg: 0,
    oblateness: 1.0,  // nearly perfect sphere
    textures: { diffuse: 'mercury/diffuse.jpg' },
    atmosphere: { enabled: false },
    surface: { enabled: true, shader: 'mercury-surface' },
    shaderParams: {
      dayFadeSoft0: -0.02, dayFadeSoft1: 0.05,  // sharp — no atmosphere
      grazeFade0: 0.10,    grazeFade1: 0.40,
    },
    detailFloor: { softKm: 500, hardKm: 100 },
    minInsertionAltKm: 100,
    surfaceGravity: 3.70,
    surfaceTempRange: [-180, 430],
    normalScale: 2.0,
    notableFeatures: [
      'Caloris Basin — 1,550 km impact crater, one of largest in solar system',
      'No atmosphere — temperature swings 600°C between day and night',
      'Rotates 3 times for every 2 orbits (3:2 spin-orbit resonance)',
      'Core is enormous — 85% of planet radius',
    ],
    moreInfo: {
      resonance: '3:2 spin-orbit resonance means a solar day = 2 Mercury years',
      sun: 'The Sun appears 2.6x larger from Mercury than from Earth',
      exploration: 'BepiColombo mission currently en route, arrives 2025',
    },
    surfaceFeatures: [
      { name: 'Caloris Basin', lat: 30.0, lon: 160.0 },
      { name: 'Rachmaninoff Crater', lat: 27.0, lon: 57.0 },
      { name: 'Caloris Planitia', lat: 30.0, lon: 195.0 },
    ],
  },
  bodies: [],
  curatedPresets: [
    { id: 'mercury-sun', name: '☀️ Giant Sun View',
      system: 'mercury',
      description: 'See the Sun 2.6x larger than from Earth',
      camera: { mode: 'insertion', target: 'mercury',
                altitudeKm: 5000, incDeg: 0, phase: 0 } },
    { id: 'caloris-basin', name: '💥 Caloris Basin',
      system: 'mercury',
      description: 'The massive 1,550 km impact crater',
      camera: { mode: 'insertion', target: 'mercury',
                altitudeKm: 2000, incDeg: 20, phase: 0 } },
    { id: 'mercury-terminator', name: '🌗 Terminator View',
      system: 'mercury',
      description: 'Extreme day/night contrast — no atmosphere',
      camera: { mode: 'insertion', target: 'mercury',
                altitudeKm: 1000, incDeg: 0, phase: 0 } },
  ],
};
```

### WORKER 2 SPEC — Venus

Files owned:
  src/data/systems/venus.js (complete)
  src/engine/shaders/venus-clouds.glsl

Read-only: src/engine/glsl/simplex.glsl,
           src/engine/glsl/surface-base.glsl

**venus-clouds.glsl:**
Venus is completely covered by thick sulfuric acid clouds.
From orbit you see ONLY clouds — no surface visible at all.
The clouds form a solid uniform deck at 45-70 km altitude.

The clouds rotate around Venus in ~4 Earth days — 60x faster
than Venus itself rotates (243 days). This super-rotation is
one of Venus's most distinctive features.

Cloud appearance:
- Nearly uniform pale yellow-white (#F5F0DC to #E8E0C0)
- Very subtle banding at mid-latitudes (not as dramatic as Jupiter)
- Polar vortex: both poles have a dark spiral vortex feature
  (discovered by Venus Express) — implement as dark grey-green
  swirl pattern above 70° latitude
- Very subtle texture — Venus clouds are thick and featureless
  at visible wavelengths compared to Jupiter

```glsl
// Cloud rotation: much faster than surface
// uTime * 0.0008 gives ~4-day rotation period
vec2 cloudUv = vUv;
cloudUv.x += uTime * 0.0008; // super-rotation

// Base cloud color: uniform pale yellow
vec3 cloudColor = vec3(0.96, 0.94, 0.87);

// Very subtle banding (low contrast — real Venus clouds are bland)
float lat = abs(asin(clamp(vObjPos.y / length(vObjPos), -1.0, 1.0)));
float band = fbm3(vec3(cloudUv * 3.0, 0.0)) * 0.06;
cloudColor -= band * vec3(0.3, 0.2, 0.1);

// Polar vortex (both poles)
float polarLat = abs(lat) - 1.22; // > 70°
if (polarLat > 0.0) {
  float vortex = fbm3(vec3(cloudUv * 8.0 + uTime * 0.0005, 0.0));
  float vortexMask = smoothstep(0.0, 0.2, polarLat);
  cloudColor = mix(cloudColor,
    vec3(0.60, 0.65, 0.55), // dark grey-green vortex
    vortex * vortexMask * 0.5);
}

// Lit side only — apply dayFade
float dayFade = sse_dayFade(sunDot, uDayFadeSoft0, uDayFadeSoft1);
gl_FragColor = vec4(cloudColor * dayFade, dayFade);
```

The clouds ARE the planet surface from visual perspective.
Apply this as a MeshStandardMaterial with the cloud shader
on a sphere the same size as Venus (not larger) — unlike
atmosphere spheres, this replaces the surface entirely.

Night side: very dark with subtle sulphuric glow from lightning
(brief flicker effect, very subtle, add if time allows).

**venus.js complete config:**
```javascript
export default {
  name: 'Venus', slug: 'venus',
  star: {
    distanceAU: 0.723,
    luminosity: 1.91,  // closer to Sun
    color: 0xFFFFEE,
  },
  primary: {
    name: 'Venus', slug: 'venus', type: 'terrestrial',
    radiusKm: 6051.8,
    massKg: 4.867e24,
    rotationPeriodHours: -5832.6,  // NEGATIVE = retrograde rotation
    // Venus rotates backwards — Sun rises in the west
    axialTiltDeg: 177.4,  // essentially upside down
    rotationPhaseAtEpochDeg: 0,
    oblateness: 1.0,
    textures: {
      diffuse: 'venus/surface.jpg',  // hidden under clouds
      clouds: 'venus/clouds.jpg',    // what you actually see
    },
    atmosphere: {
      enabled: true,
      shader: 'venus-clouds',  // full cloud deck, not thin halo
      opaque: true,
      thickness: 0.008,
      opacity: 1.0,
      fresnelPower: 3.0,
      color: [0.96, 0.94, 0.87],
    },
    shaderParams: {
      dayFadeSoft0: -0.20, dayFadeSoft1: 0.15,
      grazeFade0: 0.10,    grazeFade1: 0.40,
    },
    detailFloor: { softKm: 2000, hardKm: 500 },
    minInsertionAltKm: 500,
    surfaceGravity: 8.87,
    surfaceTempRange: [465, 465],  // uniform — atmosphere distributes heat
    notableFeatures: [
      'Hottest planet — 465°C surface despite not being closest to Sun',
      'Rotates backwards — Sun rises in the west on Venus',
      'A day on Venus is longer than a year on Venus',
      'Atmospheric pressure 90x Earth — like being 900m underwater',
    ],
    moreInfo: {
      clouds: 'Clouds are made of sulfuric acid droplets',
      retrograde: 'Venus may have been flipped by a giant impact',
      greenhouse: 'Runaway greenhouse effect — cautionary tale for climate',
    },
    surfaceFeatures: [
      { name: 'Aphrodite Terra', lat: -5.0, lon: 105.0 },
      { name: 'Ishtar Terra', lat: 70.0, lon: 340.0 },
      { name: 'Maxwell Montes', lat: 65.0, lon: 3.0 },
    ],
  },
  bodies: [],
  curatedPresets: [
    { id: 'venus-clouds', name: '☁️ Cloud Ocean View',
      system: 'venus',
      description: 'The endless sulfuric acid cloud deck',
      camera: { mode: 'insertion', target: 'venus',
                altitudeKm: 10000, incDeg: 20, phase: 0 } },
    { id: 'venus-polar', name: '🌀 Polar Vortex',
      system: 'venus',
      description: 'The mysterious dark polar vortex',
      camera: { mode: 'insertion', target: 'venus',
                altitudeKm: 5000, incDeg: 80, phase: 0 } },
    { id: 'venus-terminator', name: '🌗 Crescent Venus',
      system: 'venus',
      description: 'Venus as a crescent — brighter than any star',
      camera: { mode: 'insertion', target: 'venus',
                altitudeKm: 50000, incDeg: 0, phase: 0 } },
  ],
};
```

### WORKER 3 SPEC — Uranus + Miranda

Files owned:
  src/data/systems/uranus.js (complete)
  src/engine/shaders/uranus-atmosphere.glsl
  src/engine/shaders/miranda-surface.glsl

Read-only: src/engine/glsl/simplex.glsl,
           src/engine/glsl/surface-base.glsl

**uranus-atmosphere.glsl:**
Uranus is a pale blue-green ice giant. Nearly featureless
at visible wavelengths — methane in the atmosphere absorbs
red light, making it appear blue-green (#7FCFCF to #99DDDD).

Unlike Neptune which has visible cloud features, Uranus is
remarkably bland. The interest comes from its geometry, not
its surface features.

```glsl
// Uranus cloud layer: nearly uniform pale blue-green
// Very subtle banding — much less than Jupiter or Saturn
vec3 baseColor = vec3(0.50, 0.82, 0.82); // pale cyan-blue

// Extremely subtle banding
float lat = asin(clamp(vObjPos.y / length(vObjPos), -1.0, 1.0));
float band = fbm3(vec3(vUv * 2.0 + uTime * 0.000003, 0.0)) * 0.04;
baseColor -= band * 0.3;

// Polar darkening: poles are slightly darker
float poleDark = abs(lat) / 1.5708; // 0 at equator, 1 at pole
baseColor *= (1.0 - poleDark * 0.15);

float dayFade = sse_dayFade(sunDot, uDayFadeSoft0, uDayFadeSoft1);
gl_FragColor = vec4(baseColor * (0.2 + 0.8 * dayFade), 1.0);
```

Limb atmosphere: thin blue-green halo, similar to Neptune.
  thickness: 0.012, opacity: 0.40, fresnelPower: 4.0
  color: [0.40, 0.75, 0.80]

Uranus also has rings — 13 narrow dark rings much fainter than
Saturn's. Implement as a single thin ring mesh using the same
saturn-rings.glsl pattern but much more transparent:
  innerRadiusKm: 38000, outerRadiusKm: 51000
  opacity: 0.15 overall (very dark and faint)
  The rings are tilted with Uranus's extreme axial tilt

**miranda-surface.glsl:**
Miranda is Uranus's most interesting moon — it has the most
dramatic terrain of any small body in the solar system.
Verona Rupes cliff: 20 km tall (taller than Everest x2.3).

Surface: patchwork of wildly different terrain types right
next to each other — ancient cratered plains, younger grooved
terrain, and chaotic cliff-bounded regions called coronae.

Use the same terrain-type detection pattern as Ganymede
(dark ancient vs light younger terrain based on luminance):

ANCIENT TERRAIN (dark, heavily cratered):
  Dark grey-brown #2A2420
  Multi-scale cratering (bowl-only, hash-thinned)

CORONAE (medium tone, grooved):
  Concentric and radial groove patterns
  Similar to Ganymede's grooved terrain shader
  Color: lighter grey-brown #4A3830

VERONA RUPES (cliff):
  Near the equator at approximately lat 15°S, lon 350°
  Implement as an extreme normal map perturbation —
  steep vertical face with shadow
  Color: exposed bright ice on cliff face #C0C8D0

```glsl
// Miranda's patchwork terrain
float lum = length(baseColor);
float isCrater = float(lum < 0.35);
float isCoronae = float(lum > 0.35 && lum < 0.55);

// Verona Rupes approximate location
vec2 veronaCoord = vec2(radians(-15.0), radians(350.0));
float veronaLat = asin(clamp(vObjPos.y / length(vObjPos), -1.0, 1.0));
float veronaLon = atan(vObjPos.z, vObjPos.x);
float veronaProx = length(vec2(veronaLat - veronaCoord.x,
                               veronaLon - veronaCoord.y));
float cliffFace = smoothstep(0.3, 0.05, veronaProx);
```

**uranus.js complete config:**
```javascript
export default {
  name: 'Uranus', slug: 'uranus',
  star: {
    distanceAU: 19.19,
    luminosity: 0.0027,  // very dim sun at 19 AU
    color: 0xFFEEDD,
  },
  primary: {
    name: 'Uranus', slug: 'uranus', type: 'ice_giant',
    radiusKm: 25362,
    massKg: 8.681e25,
    rotationPeriodHours: -17.24,  // NEGATIVE = retrograde
    axialTiltDeg: 97.77,  // rotates on its side
    rotationPhaseAtEpochDeg: 0,
    oblateness: 0.9772,

    textures: { diffuse: 'uranus/diffuse.jpg' },

    atmosphere: {
      enabled: true,
      shader: 'uranus-atmosphere',
      opaque: false,
      thickness: 0.012,
      opacity: 0.40,
      fresnelPower: 4.0,
      color: [0.40, 0.75, 0.80],
    },

    rings: {
      enabled: true,
      shader: 'saturn-rings',  // reuse saturn ring shader
      texture: null,           // no texture — procedural only
      innerRadiusKm: 38000,
      outerRadiusKm: 51000,
      tiltDeg: 97.77,          // matches planet tilt
      opacity: 0.15,
    },

    shaderParams: {
      dayFadeSoft0: -0.15, dayFadeSoft1: 0.15,
      grazeFade0: 0.12,    grazeFade1: 0.45,
    },

    detailFloor: { softKm: 5000, hardKm: 1000 },
    minInsertionAltKm: 5000,

    surfaceGravity: 8.69,
    surfaceTempRange: [-224, -224],

    polarOrbitingMoons: true,  // moons orbit over poles

    notableFeatures: [
      'Rotates on its side — poles point toward the Sun',
      'Seasons last 21 years — one pole in continuous darkness',
      '13 narrow dark rings — much fainter than Saturn\'s',
      'Miranda has the tallest cliff in the solar system (20 km)',
    ],
    moreInfo: {
      tilt: 'Likely caused by a massive collision early in solar system history',
      seasons: 'Currently northern summer — north pole has had 42 years of sunlight',
      ice: 'Mantle of water, ammonia, and methane ice below cloud layer',
    },
  },

  bodies: [
    {
      name: 'Miranda', slug: 'miranda', type: 'icy_moon',
      radiusKm: 235.8,
      massKg: 6.59e19,
      semiMajorAxisKm: 129390,
      orbitalPeriodDays: 1.413,
      inclination: 4.232,
      eccentricity: 0.0013,
      tidallyLocked: true,
      rotationPeriodHours: 33.92,
      textures: { diffuse: null },  // procedural only
      surface: { enabled: true, shader: 'miranda-surface' },
      shaderParams: {
        dayFadeSoft0: -0.03, dayFadeSoft1: 0.08,
        grazeFade0: 0.15,    grazeFade1: 0.50,
      },
      detailFloor: { softKm: 100, hardKm: 20 },
      geometrySegments: 64,
      surfaceGravity: 0.079,
      surfaceTempRange: [-213, -213],
      notableFeatures: [
        'Verona Rupes — 20 km cliff, tallest in solar system',
        'Patchwork of wildly different terrain types',
        'May have been shattered and reassembled by ancient impact',
        'Chaotic coronae terrain found nowhere else',
      ],
    },
    // Titania, Oberon, Umbriel, Ariel — smaller moons
    // Add as simple spheres with placeholder grey textures
    // No detailed shaders needed for launch
    {
      name: 'Titania', slug: 'titania', type: 'icy_moon',
      radiusKm: 788.4, massKg: 3.53e21,
      semiMajorAxisKm: 435910, orbitalPeriodDays: 8.706,
      inclination: 0.08, eccentricity: 0.0011,
      tidallyLocked: true, rotationPeriodHours: 208.9,
      textures: { diffuse: null },
      detailFloor: { softKm: 200, hardKm: 50 },
      surfaceGravity: 0.379,
    },
    {
      name: 'Oberon', slug: 'oberon', type: 'icy_moon',
      radiusKm: 761.4, massKg: 3.01e21,
      semiMajorAxisKm: 583520, orbitalPeriodDays: 13.463,
      inclination: 0.07, eccentricity: 0.0014,
      tidallyLocked: true, rotationPeriodHours: 323.1,
      textures: { diffuse: null },
      detailFloor: { softKm: 200, hardKm: 50 },
      surfaceGravity: 0.346,
    },
  ],

  curatedPresets: [
    { id: 'uranus-ring-view', name: '💍 Rings Edge-On',
      system: 'uranus',
      description: 'Uranus rings are nearly vertical — unique geometry',
      camera: { mode: 'insertion', target: 'uranus',
                altitudeKm: 50000, incDeg: 0, phase: 0 } },
    { id: 'uranus-pole', name: '🌀 Polar View',
      system: 'uranus',
      description: 'Looking down the pole — like no other planet',
      camera: { mode: 'insertion', target: 'uranus',
                altitudeKm: 30000, incDeg: 90, phase: 0 } },
    { id: 'miranda-cliff', name: '🏔️ Verona Rupes',
      system: 'uranus',
      description: 'The 20 km cliff — tallest in the solar system',
      camera: { mode: 'insertion', target: 'miranda',
                altitudeKm: 500, incDeg: 10, phase: 0 } },
  ],
};
```

### WORKER 4 SPEC — Neptune + Triton

Files owned:
  src/data/systems/neptune.js (complete)
  src/engine/shaders/neptune-atmosphere.glsl
  src/engine/shaders/triton-surface.glsl

Read-only: src/engine/glsl/simplex.glsl,
           src/engine/glsl/surface-base.glsl

**neptune-atmosphere.glsl:**
Neptune is a vivid deep cobalt blue — the most intensely
colored planet in the solar system. Unlike pale Uranus,
Neptune has visible cloud features.

The Great Dark Spot (GDS): a large storm system similar to
Jupiter's GRS. It came and went — Voyager 2 saw it in 1989,
Hubble found it gone in 1994, new spots have appeared since.
Implement as an optional dark oval feature.

```glsl
vec3 baseColor = vec3(0.08, 0.20, 0.65); // deep cobalt blue

// Subtle banding (more than Uranus, less than Jupiter)
float lat = asin(clamp(vObjPos.y / length(vObjPos), -1.0, 1.0));
float banding = fbm3(vec3(vUv * 4.0 + uTime * 0.000005, 0.0)) * 0.08;
// Darker belts, lighter zones
baseColor += banding * vec3(0.05, 0.08, 0.10);

// White cirrus-like clouds at mid-latitudes
float cloudNoise = fbm3(vec3(vUv * 8.0 + uTime * 0.00002, 0.0));
float cloudCover = smoothstep(0.65, 0.80, cloudNoise);
// Only at certain latitudes (30-50° both hemispheres)
float cloudLat = smoothstep(0.40, 0.52, abs(lat)) *
                 (1.0 - smoothstep(0.70, 0.87, abs(lat)));
vec3 cloudColor = vec3(0.85, 0.88, 0.95);
baseColor = mix(baseColor, cloudColor, cloudCover * cloudLat * 0.7);

// Great Dark Spot (lat -20°, varies in longitude)
float gdsLat = lat - (-0.349); // -20° in radians
float gdsLon = atan(vObjPos.z, vObjPos.x) - uTime * 0.00008;
float gdsDist = sqrt(pow(gdsLat * 3.0, 2.0) + pow(gdsLon * 1.2, 2.0));
float gds = smoothstep(0.4, 0.2, gdsDist);
baseColor = mix(baseColor, vec3(0.02, 0.06, 0.25), gds * 0.7);

float dayFade = sse_dayFade(sunDot, uDayFadeSoft0, uDayFadeSoft1);
gl_FragColor = vec4(baseColor * (0.15 + 0.85 * dayFade), 1.0);
```

Limb atmosphere: vivid blue haze.
  thickness: 0.015, opacity: 0.45, fresnelPower: 3.5
  color: [0.15, 0.35, 0.85]

**triton-surface.glsl:**
Triton is extraordinary: retrograde orbit, nitrogen geysers,
cantaloupe terrain, thin pink atmosphere.

Surface has two main terrain types:

CANTALOUPE TERRAIN (northern hemisphere, unique to Triton):
Dimple-covered surface that looks like the skin of a cantaloupe.
Implement as a Voronoi-like cellular noise with rounded
dimples (inverse of crater — raised edges, rounded floor):
```glsl
// Cantaloupe: cellular dimples
float cellNoise = 1.0 - length(fract(vUv * 12.0) - 0.5) * 2.0;
float cantaloupe = smoothstep(0.3, 0.7, cellNoise) * 0.3;
// Pinkish-grey color for cantaloupe
vec3 cantaloupeColor = vec3(0.72, 0.65, 0.60);
```

POLAR ICE CAP (southern hemisphere):
Bright nitrogen frost — pure white to pale pink.
Very bright — Triton is highly reflective.
```glsl
float southPole = smoothstep(0.0, -0.5, vObjPos.y / length(vObjPos));
vec3 iceColor = vec3(0.95, 0.90, 0.92); // pale pink-white
baseColor = mix(baseColor, iceColor, southPole);
```

Overall color: pale pinkish-grey (#C0B4B0 to #D4C8C0).

Nitrogen geyser plumes (south pole region):
Same particle system as Io/Enceladus plumes.
Must be parented to Triton mesh.
Height: 8 km (much smaller than Io's 300 km).
Color: dark grey-brown (dust entrained in nitrogen).
4-6 active geysers at south polar coordinates.

**neptune.js complete config:**
```javascript
export default {
  name: 'Neptune', slug: 'neptune',
  star: {
    distanceAU: 30.07,
    luminosity: 0.001,  // extremely dim — Sun is barely brighter than stars
    color: 0xFFEEDD,
  },
  primary: {
    name: 'Neptune', slug: 'neptune', type: 'ice_giant',
    radiusKm: 24622,
    massKg: 1.024e26,
    rotationPeriodHours: 16.11,
    axialTiltDeg: 28.32,
    rotationPhaseAtEpochDeg: 0,
    oblateness: 0.9832,

    textures: { diffuse: 'neptune/diffuse.jpg' },

    atmosphere: {
      enabled: true,
      shader: 'neptune-atmosphere',
      opaque: false,
      thickness: 0.015,
      opacity: 0.45,
      fresnelPower: 3.5,
      color: [0.15, 0.35, 0.85],
    },

    shaderParams: {
      dayFadeSoft0: -0.15, dayFadeSoft1: 0.15,
      grazeFade0: 0.12,    grazeFade1: 0.45,
    },

    detailFloor: { softKm: 5000, hardKm: 1000 },
    minInsertionAltKm: 5000,
    surfaceGravity: 11.15,
    surfaceTempRange: [-218, -218],

    notableFeatures: [
      'Strongest winds in the solar system — 2,100 km/h',
      'Great Dark Spot — storm larger than Earth (seen by Voyager 1989)',
      'Predicted mathematically before it was observed (1846)',
      'Triton orbits backwards and will crash into Neptune in ~3.6 billion years',
    ],
    moreInfo: {
      winds: 'Wind speeds approach supersonic — cause of the dark spot storms',
      prediction: 'Discovered from gravitational effects on Uranus\'s orbit',
      voyager: 'Only Voyager 2 has visited — the most distant planetary flyby',
    },
  },

  bodies: [
    {
      name: 'Triton', slug: 'triton', type: 'captured_moon',
      radiusKm: 1353.4,
      massKg: 2.139e22,
      semiMajorAxisKm: 354759,
      orbitalPeriodDays: -5.877,  // NEGATIVE = retrograde orbit
      inclination: 156.885,       // retrograde — > 90°
      eccentricity: 0.000016,
      tidallyLocked: true,
      rotationPeriodHours: -141.05,  // retrograde
      textures: { diffuse: 'triton/diffuse.jpg' },
      surface: { enabled: true, shader: 'triton-surface' },
      atmosphere: {
        enabled: true,
        thickness: 0.005,
        opacity: 0.08,
        fresnelPower: 7.0,
        color: [0.90, 0.75, 0.80],  // faint pink nitrogen haze
      },
      geysers: {
        enabled: true,
        locations: [
          { lat: -55, lon: 0,   name: 'Geyser Alpha' },
          { lat: -58, lon: 90,  name: 'Geyser Beta' },
          { lat: -52, lon: 180, name: 'Geyser Gamma' },
          { lat: -60, lon: 270, name: 'Geyser Delta' },
        ],
        height: 8,        // km — much smaller than Io
        color: 0x4A3828,  // dark grey-brown dust
      },
      shaderParams: {
        dayFadeSoft0: -0.03, dayFadeSoft1: 0.10,
        grazeFade0: 0.15,    grazeFade1: 0.50,
      },
      detailFloor: { softKm: 200, hardKm: 50 },
      surfaceGravity: 0.779,
      surfaceTempRange: [-235, -235],  // coldest measured surface
      notableFeatures: [
        'Coldest measured surface in the solar system (-235°C)',
        'Orbits backwards — a captured Kuiper Belt object',
        'Active nitrogen geysers shooting 8 km into space',
        'Cantaloupe terrain found nowhere else in the solar system',
      ],
    },
    {
      name: 'Proteus', slug: 'proteus', type: 'irregular_moon',
      radiusKm: 210, massKg: 4.4e19,
      semiMajorAxisKm: 117647, orbitalPeriodDays: 1.122,
      inclination: 0.075, eccentricity: 0.0005,
      tidallyLocked: true, rotationPeriodHours: 26.93,
      textures: { diffuse: null },
      detailFloor: { softKm: 50, hardKm: 10 },
      geometrySegments: 32,
      surfaceGravity: 0.07,
    },
  ],

  curatedPresets: [
    { id: 'neptune-blue', name: '🔵 Deep Blue Neptune',
      system: 'neptune',
      description: 'The most vivid blue in the solar system',
      camera: { mode: 'insertion', target: 'neptune',
                altitudeKm: 50000, incDeg: 20, phase: 0 } },
    { id: 'neptune-dark-spot', name: '🌀 Great Dark Spot',
      system: 'neptune',
      description: 'The massive storm larger than Earth',
      camera: { mode: 'insertion', target: 'neptune',
                altitudeKm: 20000, incDeg: -20, phase: 0 } },
    { id: 'triton-geysers', name: '💨 Triton Geysers',
      system: 'neptune',
      description: 'Nitrogen geysers on the coldest surface',
      camera: { mode: 'insertion', target: 'triton',
                altitudeKm: 300, incDeg: -70, phase: 0 } },
    { id: 'triton-cantaloupe', name: '🍈 Cantaloupe Terrain',
      system: 'neptune',
      description: 'Terrain found nowhere else in the solar system',
      camera: { mode: 'insertion', target: 'triton',
                altitudeKm: 500, incDeg: 30, phase: 0 } },
  ],
};
```

---

## PHASE 3 — ORCHESTRATOR: INTEGRATION

### 3a — Wire all 4 systems into renderer.js

For each new system, add material building in renderer.js
following the exact same pattern as mars and saturn.

Venus cloud material: treat like Titan — the cloud shader
IS the surface, not an atmosphere overlay. The surface mesh
uses the cloud shader directly.

Mercury: standard MeshStandardMaterial + mercury-surface.glsl
  High roughness (0.95) — Mercury is matte
  No metalness

Uranus atmosphere: same makeLimbScatterMaterial pattern
Uranus rings: reuse buildRingMesh from saturn — same geometry,
  different opacity and radii from uranus.js config

Neptune: same pattern as Uranus
Triton geysers: same buildGeyserPlumes as Enceladus/Io
  CRITICAL: parent geysers to Triton mesh group

### 3b — Triton retrograde orbit verification

Triton's orbital period is negative (-5.877 days).
In physics.js, negative orbital period must result in
retrograde motion (orbits opposite direction to Neptune's
rotation). Verify with an orbit-direction probe:
  At t=0 and t+small_dt, Triton should move OPPOSITE
  direction to Neptune's rotation and to Proteus.

### 3c — Uranus polar moon verification

With polarOrbitingMoons: true in uranus.js, Miranda and
the other Uranus moons should orbit over the poles.
From the Uranus equatorial view, moons should appear to
move up and down (polar) rather than left and right (equatorial).
Verify visually and with a coordinate probe.

### 3d — Mercury sun size

Mercury's sun appears 2.6x larger than from Earth.
The sun point light rendering already exists — it doesn't
render a visible solar disc. Add to the body info card:
"The Sun appears 2.6x larger from Mercury's surface."
The angularSizeMult config value can be used in future
solar disc rendering.

### 3e — Security checklist

After deploy, verify:
  [ ] CSP still active (check DevTools response headers)
  [ ] No CSP violations in console on any of 8 systems
  [ ] npm audit still clean

### 3f — Full test suite

```bash
npm run build
# Verify dist has system-mercury.js, system-venus.js,
# system-uranus.js, system-neptune.js as lazy chunks
npm run preview
```

New test suite (tests/v8test.mjs):
  [ ] All 4 new systems load from NAV panel
  [ ] LIVE mode active by default on all systems
  [ ] Mercury: night side completely dark (no atmosphere)
  [ ] Venus: cloud deck fully covers surface
  [ ] Venus: clouds rotating faster than surface
  [ ] Venus: polar vortex visible above 70° latitude
  [ ] Uranus: pale blue-green uniform color
  [ ] Uranus: moons orbiting over poles (not equator)
  [ ] Uranus rings: faint, tilted with axial tilt
  [ ] Miranda: patchwork terrain visible below 500 km
  [ ] Neptune: vivid deep blue, clearly different from Uranus
  [ ] Neptune: Great Dark Spot visible at -20° latitude
  [ ] Neptune: white cloud streaks at mid-latitudes
  [ ] Triton: orbits retrograde (opposite Proteus)
  [ ] Triton: cantaloupe terrain visible below 500 km
  [ ] Triton: polar ice cap visible
  [ ] Triton geysers: parented to mesh (rotate with Triton)
  [ ] All 8 planets reachable from NAV panel
  [ ] All existing systems (Jupiter/Earth/Mars/Saturn) smoke test green

```bash
npx wrangler deploy
```

Verify live at app.solarexplorer.co (or workers.dev):
  Navigate to all 4 new systems. Zero console errors.

---

## VERSION AND PROJECT LOG

Bump package.json to "8.0.0"

Update PROJECT_LOG.md (Docs/PROJECT_LOG.md):
  - Add v8 to Version History
  - Mark all 8 planets as complete
  - Note any texture download results
  - Add any new bugs discovered

Commit: `docs: v8 complete — all 8 planets live, PROJECT_LOG updated`
Push: `git push origin main`

---

## PRIORITY ORDER IF TIME RUNS OUT

1. Phase 1 (must complete before workers)
2. Neptune config + atmosphere shader (Worker 4, most visually dramatic)
3. Mercury config + surface shader (Worker 1, simplest)
4. Venus config + cloud shader (Worker 2, unique feature)
5. Uranus config + Miranda shader (Worker 3, most complex geometry)
6. Phase 3 integration
7. Triton geysers (nice to have — same as existing pattern)
8. Uranus rings (simple geometry reuse)

Never deploy with any system broken.
Smoke test all existing systems before every deploy.

---

## SECURITY CHECKLIST (every planet build)

[ ] New domains added to CSP if needed (none expected for these planets)
[ ] npm audit clean
[ ] Observatory score still A+ (run if time allows)
[ ] security.txt expiry current

---

## STYLE GUIDE

Montserrat headings | Lato body
Primary Blue: #0077CC | Light Blue: #66B2FF
White: #FFFFFF | Light Gray: #D9D9D9
Dark Gray: #4D4D4D at 85% opacity | Space Black: #050510
