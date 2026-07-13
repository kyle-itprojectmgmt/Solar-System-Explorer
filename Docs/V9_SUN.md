# Solar System Explorer — V9 Session Prompt
# The Sun — Full Navigable System
# Parallel Worker Orchestration
# Save to Docs/V9_SUN.md

---

## HOW TO START

```bash
cd C:\dev\Solar-System-Explorer
git pull origin main
git status   ← must show clean working tree
claude --model claude-sonnet-4-6
```

Say: "Read .claude/instructions.md, then Docs/PROJECT_LOG.md,
then Docs/V9_SUN.md. Follow the orchestration model exactly.
Commit and push after every phase."

---

## GOAL

Add the Sun as a full navigable system — accessible from the
NAV panel, with orbit insertion, free fly, and cinematic modes.
The Sun is the most dramatic object in the simulator:
photosphere granulation, differential rotation, sunspots with
umbra/penumbra, solar flares, corona streamers, prominences,
and chromosphere limb glow.

**Critical constraint:** Do NOT change how the sun appears
from existing planet systems. The sun remains a point light
source for all planet renders. This session adds the Sun as
its own navigable system only.

**Scale:** Normalized — same as every other system. The Sun
fills the viewport similarly to Jupiter. True scale would
cause depth buffer precision issues. Body card shows true
data (696,000 km radius).

Version bump to 9.0.0.

---

## ORCHESTRATION MODEL

PHASE 1 — Orchestrator: infrastructure + geometry
PHASE 2 — 4 workers in parallel
PHASE 3 — Orchestrator: integration, flares, prominences,
           navigation wiring, testing, deploy

WORKER FILE OWNERSHIP — strictly enforced:
  Worker 1: src/engine/shaders/sun-photosphere.glsl
  Worker 2: src/engine/shaders/sun-corona.glsl
            src/engine/shaders/sun-chromosphere.glsl
  Worker 3: src/engine/shaders/sun-spots.glsl
  Worker 4: src/data/systems/sun.js (complete config)

Workers must NOT touch: main.js, renderer.js, camera.js,
physics.js, ui.js, vite.config.js, package.json, wrangler.toml,
index.html, src/engine/glsl/simplex.glsl,
src/engine/glsl/surface-base.glsl, PROJECT_LOG.md,
any existing planet files or their shaders.

---

## TESTING STRATEGY

Full regression: Sun system (all new suites)
Smoke test: all 8 existing systems (verify no regression —
  sun direction, lighting, terminator all unchanged)
Feature-specific: sunspot drift, flare particles,
  corona visibility at different altitudes
Security: CSP still A+ after deploy

---

## PHASE 1 — ORCHESTRATOR ONLY

### 1a — Sun system skeleton

Create src/data/systems/sun.js skeleton:
```javascript
export default {
  name: 'The Sun', slug: 'sun',
  isStar: true,  // flag for special rendering treatment
  primary: {
    name: 'Sun', slug: 'sun', type: 'star',
    // Normalized radius — same world-unit scale as planets
    // Jupiter radius = 1.0 world units (engine convention)
    // Sun true radius = 696,000 km, Jupiter = 69,911 km
    // True ratio = 9.95x — use 4.0x for normalized (fills screen well)
    radiusKm: 696000,
    radiusNormalized: 4.0,  // world units — orchestrator uses this
    massKg: 1.989e30,
    rotationPeriodHours: 609.12,  // 25.38 days — equatorial
    // Differential rotation handled in shader
    axialTiltDeg: 7.25,  // tilt relative to ecliptic
    rotationPhaseAtEpochDeg: 0,
    // Worker 4 fills remaining fields
  },
  bodies: [],  // no moons
};
```

Commit: `feat: V9 sun.js skeleton`

### 1b — Sun geometry setup

The Sun needs special geometry in renderer.js — it's a star,
not a planet. Unlike planets which receive light, the Sun
IS the light source.

In renderer.js, add a buildSunSystem() function:

```javascript
function buildSunSystem(cfg) {
  const R = cfg.primary.radiusNormalized; // 4.0 world units

  // 1. Photosphere sphere (the visible surface)
  const photoGeo = new THREE.SphereGeometry(R, 128, 64);
  const photoMat = buildSunPhotosphereMaterial(cfg);
  const photoMesh = new THREE.Mesh(photoGeo, photoMat);
  photoMesh.name = 'sun-photosphere';

  // 2. Chromosphere sphere (thin emission layer)
  const chromoGeo = new THREE.SphereGeometry(R * 1.005, 64, 32);
  const chromoMat = buildSunChromosphereMaterial(cfg);
  chromoMat.side = THREE.BackSide;
  chromoMat.transparent = true;
  chromoMat.blending = THREE.AdditiveBlending;
  chromoMat.depthWrite = false;
  // CRITICAL: logDepthBuf must be set on all custom materials
  chromoMat.extensions = { logDepthBuf: true };
  const chromoMesh = new THREE.Mesh(chromoGeo, chromoMat);

  // 3. Corona sphere (large, very transparent)
  const coronaGeo = new THREE.SphereGeometry(R * 8.0, 64, 32);
  const coronaMat = buildSunCoronaMaterial(cfg);
  coronaMat.side = THREE.BackSide;
  coronaMat.transparent = true;
  coronaMat.blending = THREE.AdditiveBlending;
  coronaMat.depthWrite = false;
  coronaMat.extensions = { logDepthBuf: true };
  const coronaMesh = new THREE.Mesh(coronaGeo, coronaMat);

  // 4. Sun acts as its own light — add a point light at origin
  // This replaces the directional sun light used in planet systems
  const sunLight = new THREE.PointLight(0xFFF5E0, 2.0, 0);
  sunLight.name = 'sun-self-light';

  // 5. Ambient light — slightly higher than planet systems
  // (corona scatters light everywhere near the sun)
  const ambientLight = new THREE.AmbientLight(0xFFEECC, 0.3);

  return { photoMesh, chromoMesh, coronaMesh, sunLight, ambientLight };
}
```

**No directional sun light in the Sun system** — the sun IS
the light source. The point light at origin illuminates the
corona and chromosphere from the inside.

**Camera constraints for the Sun:**
```javascript
// Sun system camera limits
minAltitudeKm: 50000,    // minimum 50,000 km above photosphere
                          // (below this is physically plasma)
maxAltitudeKm: 5000000,  // 5 million km — well into corona
defaultAltitudeKm: 500000, // 500,000 km — good corona view
```

Commit: `feat: Sun geometry setup — photosphere + corona + chromosphere spheres`

### 1c — NAV panel wiring

Add 'sun' to AVAILABLE_SYSTEMS:
```javascript
export const AVAILABLE_SYSTEMS = [
  'sun',  // first — it's the center of everything
  'mercury', 'venus', 'earth', 'mars',
  'jupiter', 'saturn', 'uranus', 'neptune'
];
```

Wire NAV panel Sun button. Currently shows "Solar Observatory"
stub — make it call switchSystem('sun').

Loading screen facts for the Sun:
  "The Sun contains 99.86% of all mass in the solar system"
  "Light from the Sun takes 8 minutes 20 seconds to reach Earth"
  "The Sun's core reaches 15 million degrees Celsius"
  "Solar flares can release energy equivalent to billions of nuclear bombs"
  "The Sun has been burning for 4.6 billion years — halfway through its life"
  "One million Earths could fit inside the Sun"
  "The Sun's corona is hotter than its surface — a mystery still unsolved"
  "Solar wind from the Sun reaches all the way to interstellar space"

Epoch: J2000 (2000-01-01 12:00 UTC) — no specific mission epoch
needed. The sun's rotation phase at J2000 is the reference.

Commit: `feat: NAV panel Sun wiring + loading facts`

### 1d — Sunspot activity slider

In the VIEW panel, add a Sun-specific control visible only
when the Sun is the active system:

```
SOLAR ACTIVITY
Activity:  [──────●──] 75%
           Solar Min    Solar Max
```

This slider controls:
- Number of visible sunspots (0 at min, 8-12 at max)
- Flare frequency (rare at min, every few minutes at max)
- Corona brightness (dim at min, bright at max)
- Store as 'sse-sun-activity' in localStorage
- Default: 75% (we're near Solar Cycle 25 maximum in 2026)

Commit: `feat: Solar activity slider in VIEW panel`

### 1e — Commit Phase 1, spawn workers

```bash
git add -A
git commit -m "feat: V9 Phase 1 — sun skeleton, geometry, NAV wiring, activity slider"
git push origin main
git show HEAD --name-only
```

Run full existing regression suite — all must pass.
ONLY spawn workers after green suite.

---

## PHASE 2 — PARALLEL WORKERS

### WORKER 1 SPEC — Sun Photosphere Shader

File owned: src/engine/shaders/sun-photosphere.glsl

Read-only: src/engine/glsl/simplex.glsl

The photosphere is the visible surface of the Sun.
It is NOT receiving external light — it IS the light source.
Do not use uSunDirection or dayFade — not applicable here.
The surface is self-luminous (emissive) throughout.

**Granulation:**
The photosphere shows a cellular pattern of convective cells
called granules. Each granule is a rising column of hot plasma
~1,000 km across (about 1/700th of the sun's diameter).
The pattern slowly evolves — granules rise, spread, and sink
over ~10 minutes real time.

```glsl
uniform float uTime;       // simulation seconds
uniform float uActivity;   // 0.0-1.0 solar activity level

// Granulation: Voronoi-like cellular pattern
// Each cell = one convective granule
// Bright center (rising hot plasma), dark edges (cooling, sinking)

// Scale: ~700 granules visible across the disc at any time
// In UV space: uv * 30.0 gives ~900 cells (slightly more than real)
vec2 granUv = vUv * 28.0;

// Slow time evolution — granule lifetime ~10 minutes
// At 1x speed: nearly stationary. At 1000x: visibly churning.
float t = uTime * 0.0001; // very slow

// Cellular noise for granule pattern
// Bright center (value near 1.0) = hot rising plasma
// Dark boundaries (value near 0.0) = cool sinking plasma
float granCell = cellularNoise(granUv + t); // implement as fbm-based voronoi
float granBright = smoothstep(0.1, 0.7, granCell);

// Granule color: bright yellow-white center, orange-red edges
vec3 hotColor  = vec3(1.00, 0.95, 0.80); // 5,778K yellow-white
vec3 coolColor = vec3(0.85, 0.45, 0.10); // ~4,500K orange-red

vec3 granColor = mix(coolColor, hotColor, granBright);
```

**Differential rotation:**
The sun rotates faster at the equator (25.38 days) than at
the poles (34.4 days). This means features at different
latitudes drift at different rates.

```glsl
// Latitude from normalized normal
float lat = asin(clamp(vNormal.y, -1.0, 1.0));

// Differential rotation rate (Snodgrass 1983 formula):
// omega(deg/day) = 14.713 - 2.396*sin²(lat) - 1.787*sin⁴(lat)
float sinLat = sin(lat);
float omegaDegPerDay = 14.713
  - 2.396 * sinLat * sinLat
  - 1.787 * sinLat * sinLat * sinLat * sinLat;

// Convert to rotation offset for uTime (in sim seconds):
float rotOffset = omegaDegPerDay / 86400.0 * uTime * (3.14159/180.0);

// Apply to UV longitude:
float lon = atan(vNormal.z, vNormal.x) + rotOffset;
vec2 rotUv = vec2(lon / 6.28318, (lat + 1.5708) / 3.14159);
```

**Limb darkening:**
The edges of the solar disc appear darker than the center.
This is because at the limb you're looking through more
atmosphere at an oblique angle, seeing cooler layers.
Classic limb darkening law:

```glsl
// Limb darkening — Eddington approximation
// mu = cos(angle from disc center)
float mu = dot(normalize(vNormal), normalize(uCameraPos));
mu = max(0.0, mu);

// Limb darkening coefficients (Green 2002):
// I(mu) / I(1) = 1 - u*(1 - mu)
float u_ld = 0.6; // limb darkening coefficient
float limbDark = 1.0 - u_ld * (1.0 - mu);

// Apply to final color
vec3 finalColor = granColor * limbDark;

// Add subtle large-scale brightness variation (supergranulation)
float superGran = fbm3(vec3(rotUv * 4.0, t * 0.01)) * 0.08;
finalColor += superGran * hotColor;

// Self-luminous — no ambient/diffuse lighting calculation
// Brightness modulated only by limb darkening and granulation
gl_FragColor = vec4(finalColor, 1.0);
```

**Sunspot holes** (dark regions — actual sunspot rendering
is in Worker 3, but the photosphere needs to RECEIVE the
sunspot darkness overlay):
```glsl
// Receive sunspot mask from a uniform texture or passed value
// Sunspot areas: darken significantly (umbra ~60% darker)
uniform sampler2D uSunspotMask; // generated procedurally by Worker 3
float spotMask = texture2D(uSunspotMask, rotUv).r;
finalColor *= (1.0 - spotMask * 0.7); // umbra darkening
```

Export: { sunPhotosphereUniforms, sunPhotosphereShader }

### WORKER 2 SPEC — Corona + Chromosphere Shaders

Files owned:
  src/engine/shaders/sun-corona.glsl
  src/engine/shaders/sun-chromosphere.glsl

Read-only: src/engine/glsl/simplex.glsl

**sun-corona.glsl:**
The corona is the sun's outer atmosphere — a halo of
superhot plasma (1-3 million K) extending millions of km.
Visible to the naked eye only during total solar eclipses.
From orbit, it's the most visually dramatic feature.

Applied to a large BackSide sphere (radius 8x photosphere).
Additive blending — it glows on top of everything.

```glsl
uniform float uTime;
uniform float uActivity;  // 0.0-1.0 solar activity
uniform vec3  uCameraPos;

varying vec3 vWorldPos;
varying vec3 vNormal;

void main() {
  // Distance from sun center (normalized to photosphere radius)
  float r = length(vWorldPos); // in world units
  float rNorm = r / 4.0;      // 1.0 = photosphere surface

  // Fresnel-style limb emphasis
  vec3 viewDir = normalize(uCameraPos - vWorldPos);
  float cosAngle = abs(dot(normalize(vWorldPos), viewDir));
  float fresnel = 1.0 - cosAngle;
  float rim = pow(fresnel, 1.5);

  // Corona falls off with distance from surface
  // Real corona: ~1/r² brightness falloff
  float distFade = 1.0 / (rNorm * rNorm);
  distFade = clamp(distFade, 0.0, 1.0);

  // Streamer structure: elongated noise along radial directions
  // Solar streamers extend millions of km along the equatorial plane
  float lat = asin(clamp(normalize(vWorldPos).y, -1.0, 1.0));
  float lon = atan(vWorldPos.z, vWorldPos.x);

  // Slow streamer drift
  float t = uTime * 0.000005;

  // Radial streamer pattern: noise elongated in the radial direction
  vec2 streamerUv = vec2(lon / 6.28318 + t, abs(lat) / 1.5708);
  float streamer = fbm3(vec3(streamerUv * vec2(8.0, 3.0), t)) * 0.6
                 + 0.4; // base corona always present

  // Activity modulates corona brightness significantly
  float activityBoost = 0.5 + uActivity * 0.8;

  // Corona color: white-blue inner, yellow-white outer
  vec3 innerColor = vec3(1.00, 1.00, 1.00); // inner: pure white
  vec3 outerColor = vec3(1.00, 0.95, 0.75); // outer: warm white
  vec3 coronaColor = mix(outerColor, innerColor, distFade);

  // Equatorial brightening: corona is brighter near equator
  // (helmet streamers concentrate near solar equator)
  float equatBright = 1.0 - abs(lat) / 1.5708;
  equatBright = 0.5 + equatBright * 0.5;

  float opacity = rim * distFade * streamer * activityBoost
                * equatBright * 0.4;
  opacity = clamp(opacity, 0.0, 0.6);

  gl_FragColor = vec4(coronaColor, opacity);
}
```

**Polar plumes:**
At solar minimum, long thin plumes extend from the poles.
At solar maximum, the corona is more uniform and chaotic.

```glsl
// Polar plumes: visible above 60° latitude at solar minimum
float plumeRegion = smoothstep(1.05, 1.40, abs(lat));
float plumeNoise = fbm3(vec3(lon * 6.0, rNorm, t * 2.0));
float plume = plumeRegion * plumeNoise * (1.0 - uActivity) * 0.5;
opacity += plume;
```

**sun-chromosphere.glsl:**
The chromosphere is a thin layer just above the photosphere.
In visible light: reddish-pink (hydrogen alpha emission).
Visible as a thin colored rim at the limb.

Applied to a BackSide sphere just larger than photosphere
(radius 1.005x). Very thin, tight fresnel falloff.

```glsl
// Very tight limb-only glow
float cosA = abs(dot(normalize(vWorldPos), normalize(uCameraPos - vWorldPos)));
float fresnel = 1.0 - cosA;
float rim = pow(fresnel, 8.0); // very tight — only at the edge

// Chromosphere color: deep red-pink (hydrogen alpha 656nm)
vec3 chromoColor = vec3(0.95, 0.15, 0.20); // H-alpha red

// Spicule texture: thousands of tiny jets covering the surface
// Implement as fine high-frequency noise
float spicules = fbm3(vObjPos * 40.0 + uTime * 0.00002) * 0.3 + 0.7;

float opacity = rim * 0.6 * spicules;
gl_FragColor = vec4(chromoColor, opacity);
```

Export: { sunCoronaUniforms, sunCoronaShader,
          sunChromosphereUniforms, sunChromosphereShader }

### WORKER 3 SPEC — Sunspot Shader

File owned: src/engine/shaders/sun-spots.glsl

Read-only: src/engine/glsl/simplex.glsl

Sunspots are regions of intense magnetic activity that appear
dark because they're cooler than surrounding photosphere
(~3,700K vs ~5,778K). They have two zones:
- Umbra: dark central core (appears nearly black)
- Penumbra: lighter surrounding region with radial filaments

Sunspots drift with differential rotation at their latitude.
They typically appear in pairs (bipolar magnetic regions).
They form and decay over days to weeks.

**Procedural sunspot placement:**
Generate sunspot positions deterministically from a seed.
Spots appear in the activity belt (±30° from equator).
Number scales with uActivity.

```glsl
uniform float uTime;
uniform float uActivity;  // 0.0-1.0

// Generate N sunspot centers (N = 0-12 based on activity)
// Each spot: lat (±30°), lon (drifts with differential rotation),
//            radius (0.02-0.08 in UV space), age (0-1)

// For each potential spot position:
float spotContrib(vec2 uv, vec2 spotCenter, float spotRadius) {
  float dist = length(uv - spotCenter);

  // Umbra: inner dark core
  float umbra = smoothstep(spotRadius * 0.4, 0.0, dist);

  // Penumbra: outer lighter region with radial filaments
  float penumbra = smoothstep(spotRadius, spotRadius * 0.4, dist)
                 * (1.0 - umbra);

  // Penumbra filaments: radial noise pattern
  float angle = atan(uv.y - spotCenter.y, uv.x - spotCenter.x);
  float filament = 0.5 + 0.5 * sin(angle * 12.0
    + fbm3(vec3(uv * 8.0, uTime * 0.00001)) * 2.0);

  // Darkness: umbra=0.85 dark, penumbra=0.45 dark
  float darkness = umbra * 0.85 + penumbra * filament * 0.45;
  return darkness;
}

// Umbra color: very dark red-brown (~3,700K)
vec3 umbraColor  = vec3(0.25, 0.08, 0.02);
// Penumbra color: orange-brown (~4,500K)
vec3 penumbraColor = vec3(0.65, 0.35, 0.10);

// Sample up to 12 spot positions
// Use hash functions to place spots deterministically
// from a uSpotSeed uniform that changes daily (sim time)
```

**Spot drift with differential rotation:**
Each spot's longitude drifts at its latitude's rotation rate.
Use the same Snodgrass formula as Worker 1.

**Output:**
The sunspot shader outputs a darkness mask (0=no spot, 1=full
umbra darkness). This is sampled by the photosphere shader
via uSunspotMask to darken the appropriate regions.

Implement as a render-to-texture approach OR pass spot
positions as uniforms to both shaders:
```glsl
// Pass up to 12 spot positions as uniform arrays:
uniform vec2  uSpotPositions[12]; // lat/lon pairs
uniform float uSpotRadii[12];     // sizes
uniform int   uSpotCount;         // active spots (0-12)
```

This avoids a render-to-texture pass and keeps things simple.
The photosphere shader (Worker 1) receives the same uniforms
and computes spot darkness inline.

Export: { sunSpotsUniforms, sunSpotsShader,
          updateSunspotPositions } // function to update per frame

### WORKER 4 SPEC — sun.js Complete Config

File owned: src/data/systems/sun.js

Complete the sun.js config. The Sun is unique — it has no
bodies[] (no moons) and is self-luminous.

```javascript
export default {
  name: 'The Sun',
  slug: 'sun',
  isStar: true,

  // No star: {} section — the Sun IS the star
  // Planet systems have star: { distanceAU, luminosity }
  // Sun system has no external star

  primary: {
    name: 'Sun',
    slug: 'sun',
    type: 'star',

    radiusKm: 696000,
    radiusNormalized: 4.0,  // world units
    massKg: 1.989e30,

    // Differential rotation — equatorial period used as base
    rotationPeriodHours: 609.12,  // 25.38 days equatorial
    axialTiltDeg: 7.25,
    rotationPhaseAtEpochDeg: 84.0,  // IAU 2015 solar prime meridian at J2000

    textures: {
      // No diffuse texture — fully procedural
    },

    photosphere: {
      enabled: true,
      shader: 'sun-photosphere',
      granulationScale: 28.0,
      limbDarkeningCoeff: 0.6,
      supergranulationAmp: 0.08,
    },

    chromosphere: {
      enabled: true,
      shader: 'sun-chromosphere',
      color: [0.95, 0.15, 0.20],
      thickness: 1.005,  // radius multiplier
      opacity: 0.60,
    },

    corona: {
      enabled: true,
      shader: 'sun-corona',
      radius: 8.0,       // radius multiplier for corona sphere
      baseOpacity: 0.40,
      activityScale: 0.8,
    },

    sunspots: {
      enabled: true,
      shader: 'sun-spots',
      maxCount: 12,
      activityBelt: 30.0,  // degrees from equator
      defaultActivity: 0.75,
    },

    shaderParams: {
      // Sun has no day/night fade — self-luminous throughout
      // These are kept for engine compatibility but unused
      dayFadeSoft0: -1.0, dayFadeSoft1: -1.0,
      grazeFade0: 0.0,    grazeFade1: 0.0,
    },

    detailFloor: { softKm: 100000, hardKm: 50000 },
    minInsertionAltKm: 50000,

    // Camera defaults
    defaultAltitudeKm: 500000,
    maxAltitudeKm: 5000000,

    surfaceGravity: 274.0,  // m/s² — shown in body card
    surfaceTempK: 5778,     // photosphere temperature

    notableFeatures: [
      'Core temperature: 15 million°C — nuclear fusion powers all life on Earth',
      'Corona mystery: the outer atmosphere is hotter than the surface',
      'Solar flares can disrupt GPS, radio, and power grids on Earth',
      'The Sun will become a red giant in ~5 billion years',
    ],

    moreInfo: {
      composition: '73% hydrogen, 25% helium, 2% heavier elements',
      energy: 'Converts 4 million tonnes of mass to energy every second',
      light: 'Photons take ~100,000 years to escape the core, 8 min to reach Earth',
      cycle: 'Solar activity follows an 11-year cycle — currently Solar Cycle 25',
    },

    surfaceFeatures: [
      { name: 'North Pole', lat: 90, lon: 0 },
      { name: 'South Pole', lat: -90, lon: 0 },
      { name: 'Solar Equator', lat: 0, lon: 0 },
    ],
  },

  bodies: [],  // Sun has no moons

  curatedPresets: [
    {
      id: 'sun-corona-view',
      name: '☀️ Corona View',
      system: 'sun',
      description: 'See the Sun\'s million-degree corona from 500,000 km',
      camera: { mode: 'insertion', target: 'sun',
                altitudeKm: 500000, incDeg: 20, phase: Math.PI },
    },
    {
      id: 'sun-photosphere',
      name: '🌞 Photosphere Close-Up',
      system: 'sun',
      description: 'Granulation cells and sunspot detail at 100,000 km',
      camera: { mode: 'insertion', target: 'sun',
                altitudeKm: 100000, incDeg: 0, phase: Math.PI },
    },
    {
      id: 'sun-north-pole',
      name: '🌀 Polar Plumes',
      system: 'sun',
      description: 'Solar polar plumes streaming into space',
      camera: { mode: 'insertion', target: 'sun',
                altitudeKm: 300000, incDeg: 80, phase: Math.PI },
    },
    {
      id: 'sun-limb',
      name: '🔆 Solar Limb',
      system: 'sun',
      description: 'Chromosphere and prominences at the solar limb',
      camera: { mode: 'insertion', target: 'sun',
                altitudeKm: 150000, incDeg: 0, phase: Math.PI * 0.5 },
    },
  ],
};
```

---

## PHASE 3 — ORCHESTRATOR: INTEGRATION

### 3a — Wire Sun shaders into renderer.js

In renderer.js, detect `cfg.isStar === true` and call
`buildSunSystem()` instead of the standard planet builder.

Key differences from planet rendering:
- No directional sun light (sun IS the light source)
- Point light at origin illuminates the scene
- Corona sphere renders AFTER photosphere (correct depth)
- No shadow casting (sun is self-luminous)
- No atmosphere halo (corona replaces it)

Wire all uniforms per frame:
```javascript
// Per-frame sun uniforms
sunPhotoMat.uniforms.uTime.value = simSeconds;
sunPhotoMat.uniforms.uActivity.value = getSunActivity(); // from slider
sunPhotoMat.uniforms.uSpotPositions.value = spotPositions;
sunPhotoMat.uniforms.uSpotCount.value = activeSpotCount;
sunCoronaMat.uniforms.uTime.value = simSeconds;
sunCoronaMat.uniforms.uActivity.value = getSunActivity();
sunCoronaMat.uniforms.uCameraPos.value = camera.position;
```

### 3b — Solar flare particle system

Solar flares are brief intense brightening events near sunspots.
They emit a burst of charged particles in an arc above the surface.

```javascript
function buildSolarFlare(spotPosition, spotRadius) {
  // Particle arc: 50-100 particles following a magnetic field arc
  // Height: 20,000-100,000 km above photosphere
  // Color: bright yellow-white, then fading to orange-red
  // Duration: 2-30 sim-seconds depending on time multiplier
  // Trigger: random chance per active sunspot per frame,
  //          scaled by uActivity

  const flareGeo = new THREE.BufferGeometry();
  // Arc trajectory: parametric curve from one side of spot to other
  const arcPoints = generateFlareArc(spotPosition, spotRadius);
  flareGeo.setFromPoints(arcPoints);

  const flareMat = new THREE.PointsMaterial({
    color: 0xFFFF88,
    size: 0.02,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  flareMat.extensions = { logDepthBuf: true };

  // Animate: particles move along arc, fade out over duration
  // Parent to photosphere mesh so it rotates with sun
  return new THREE.Points(flareGeo, flareMat);
}

// Trigger flare check each frame:
// probability = uActivity * 0.001 per active sunspot per frame
// At 1x speed: very rare. At 1000x speed: frequent.
```

### 3c — Solar prominences

Prominences are large loops of plasma following magnetic field
lines, visible at the solar limb. They arc 50,000-100,000 km
above the surface and last days to weeks.

Implement as semi-transparent tube geometry:
```javascript
function buildProminence(basePosition, height, width) {
  // Parametric arc: y = sin(t*π) * height (parabolic loop)
  // Implement as TubeGeometry from a CatmullRomCurve3
  const curve = new THREE.CatmullRomCurve3(arcPoints);
  const tubeGeo = new THREE.TubeGeometry(curve, 20, width, 8, false);

  const tubeMat = new THREE.MeshBasicMaterial({
    color: 0xFF3300,   // deep red — hydrogen plasma
    transparent: true,
    opacity: 0.6,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  tubeMat.extensions = { logDepthBuf: true };

  // Place 3-6 prominences near the limb
  // Parent to photosphere mesh — rotate with sun
  // Visible best from the limb view preset
}
```

### 3d — Sunspot position update loop

Each frame, update the sunspot positions using differential
rotation. Sunspots persist for days-weeks of sim time.

```javascript
// Sunspot state: array of { lat, lon, radius, age, maxAge }
let sunspots = [];

function updateSunspots(simSeconds, activity) {
  const targetCount = Math.round(activity * 12);

  // Age existing spots
  sunspots = sunspots.filter(s => s.age < s.maxAge);
  sunspots.forEach(s => {
    s.age += simDelta;
    // Drift longitude with differential rotation at this latitude
    const omegaRadPerSec = differentialRotation(s.lat);
    s.lon += omegaRadPerSec * simDelta;
  });

  // Spawn new spots if needed
  while (sunspots.length < targetCount) {
    const lat = (Math.random() - 0.5) * 60 * Math.PI/180; // ±30°
    sunspots.push({
      lat, lon: Math.random() * Math.PI * 2,
      radius: 0.03 + Math.random() * 0.05,
      age: 0,
      maxAge: (7 + Math.random() * 14) * 86400, // 7-21 sim days
    });
  }

  // Pass positions to shader uniforms
  updateSpotUniforms(sunspots);
}
```

### 3e — Verify existing systems unaffected

The Sun system uses its own light setup (point light at origin).
When switching AWAY from the Sun to any planet system, verify:
- The directional sun light is restored
- Planet terminator/day-night is correct
- No corona sphere bleeds into the planet scene
- All 8 planet systems load correctly after visiting the Sun

```bash
# Test sequence:
# 1. Load Sun → verify corona and photosphere
# 2. Switch to Earth → verify terminator correct
# 3. Switch to Jupiter → verify moons light correctly
# 4. Switch back to Sun → verify Sun still renders
```

### 3f — Security checklist

[ ] CSP still active — Sun system adds no new external domains
[ ] npm audit clean
[ ] Observatory score still A+

### 3g — Full test suite

New tests/suntest.mjs (target 20+ checks):
  [ ] Sun system loads from NAV panel
  [ ] Photosphere renders (not black, not white — granulated)
  [ ] Limb darkening: edge pixels darker than center pixels
  [ ] Differential rotation: feature at equator moves faster than at 45°
  [ ] Sunspots visible at 75% activity
  [ ] Sunspot count = 0 at 0% activity
  [ ] Sunspot count > 6 at 100% activity
  [ ] Corona visible at 500,000 km altitude
  [ ] Corona not visible at 50,000 km (too close, inside it)
  [ ] Chromosphere: red rim visible at limb
  [ ] Solar flares: at least one flare event at 100% activity
    over 60 sim-seconds at 1000x speed
  [ ] All 4 curated presets execute without error
  [ ] Solar activity slider: 0% → 100% → renders without crash
  [ ] LIVE mode active on Sun system load
  [ ] After visiting Sun, switch to Earth: terminator correct
  [ ] After visiting Sun, switch to Jupiter: moons lit correctly
  [ ] Sun system smoke: zero console errors

Full regression suite: all existing 17 suites still green.

```bash
npm run build
npm run preview
npx wrangler deploy
```

---

## VERSION AND PROJECT LOG

Bump package.json to "9.0.0"

Update Docs/PROJECT_LOG.md:
  - Add v9 to Version History
  - Note Sun as navigable system complete
  - Log any new bugs discovered
  - Update Future Systems section

Commit: `docs: v9 complete — Sun system live, PROJECT_LOG updated`
Push: `git push origin main`

---

## PRIORITY ORDER IF TIME RUNS OUT

1. Phase 1 (must complete before workers)
2. Worker 1: photosphere + granulation + limb darkening (most visual)
3. Worker 4: sun.js config (system won't load without it)
4. Worker 2: corona (second most visual — the showpiece)
5. Worker 3: sunspots (dramatic but optional for first deploy)
6. Phase 3: integration + wiring
7. Solar flares (nice to have — implement if time allows)
8. Prominences (nice to have — implement if time allows)
9. Differential rotation verification

The Sun must render SOMETHING (even a plain yellow sphere)
before deploying. Never deploy a broken system.
Smoke test all 8 existing systems before every deploy.

---

## SECURITY CHECKLIST (every planet build)

[ ] No new external domains needed in CSP
[ ] npm audit clean
[ ] Observatory score still A+ (verify after deploy)
[ ] security.txt expiry current (expires 2027-07-12)

---

## STYLE GUIDE

Montserrat headings | Lato body
Primary Blue: #0077CC | Light Blue: #66B2FF
White: #FFFFFF | Light Gray: #D9D9D9
Dark Gray: #4D4D4D at 85% opacity | Space Black: #050510

Sun accent color for UI elements specific to Sun system:
  Solar Gold: #FFB800
