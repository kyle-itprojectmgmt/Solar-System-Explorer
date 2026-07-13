# Solar System Explorer — V10 Session Prompt
# Pluto + Charon Binary System
# Save to Docs/V10_PLUTO.md

---

## HOW TO START

```bash
cd C:\dev\Solar-System-Explorer
git pull origin main
git status   ← must show clean working tree
claude --model claude-sonnet-4-6
```

Say: "Read .claude/instructions.md, then Docs/PROJECT_LOG.md,
then Docs/V10_PLUTO.md. Follow the orchestration model exactly.
Commit and push after every phase."

---

## GOAL

Add Pluto + Charon as the 10th navigable system (9 planets +
the Sun). Pluto is the most emotionally resonant body in the
solar system for most people — "the planet that got demoted."
New Horizons (2015) gave us extraordinary close-up imagery.

The system is visually unique:
- Tombaugh Regio: the iconic heart-shaped nitrogen ice plain
- Charon: half Pluto's size, the largest moon-to-body ratio
- Thin blue nitrogen atmosphere haze (surprised everyone)
- Dark reddish Cthulhu Macula region
- Water ice mountains up to 3,500 m tall

Version bump to 10.0.0.

---

## ORCHESTRATION MODEL

PHASE 1 — Orchestrator: infrastructure + textures
PHASE 2 — 3 workers in parallel
PHASE 3 — Orchestrator: integration, wiring, testing, deploy

WORKER FILE OWNERSHIP — strictly enforced:
  Worker 1: src/engine/shaders/pluto-surface.glsl
            src/engine/shaders/pluto-atmosphere.glsl
  Worker 2: src/engine/shaders/charon-surface.glsl
  Worker 3: src/data/systems/pluto.js (complete config)

Workers must NOT touch: main.js, renderer.js, camera.js,
physics.js, ui.js, vite.config.js, package.json, wrangler.toml,
index.html, any existing system files or shaders,
src/engine/glsl/simplex.glsl,
src/engine/glsl/surface-base.glsl, PROJECT_LOG.md

---

## TESTING STRATEGY

Full regression: Pluto system (all new suites)
Smoke test: all existing systems (Sun + 8 planets)
Feature-specific: Charon visible from Pluto orbit,
  atmosphere haze at limb, Tombaugh Regio visible from orbit
Security: CSP still A+ after deploy

---

## PHASE 1 — ORCHESTRATOR ONLY

### 1a — Texture acquisition

New Horizons gave us the best outer solar system imagery ever.
Primary sources (all NASA public domain):

**Pluto:**
NASA Photojournal: photojournal.jpl.nasa.gov
  Search "Pluto color map" — New Horizons LORRI + MVIC data
  Best: PIA19952 (Pluto color mosaic) or PIA20544
  Target: 4K-8K equirectangular color map
  public/textures/pluto/diffuse.jpg

USGS Astrogeology (if NASA photojournal unavailable):
  astrogeology.usgs.gov → search Pluto
  Controlled mosaic from New Horizons data

Björn Jónsson (bjj.is) often has processed versions:
  bjj.is/3d/planetary-maps — check for Pluto

**Charon:**
NASA Photojournal: PIA19968 or PIA20534
  New Horizons color map of Charon
  public/textures/charon/diffuse.jpg

If any download fails: create procedural placeholder using
the shader — Pluto's distinctive features are implemented
procedurally in pluto-surface.glsl anyway. Note URLs in
pluto.js comments.

Commit: `feat: V10 Pluto/Charon textures acquired`

### 1b — System skeleton

Create src/data/systems/pluto.js skeleton:
```javascript
export default {
  name: 'Pluto', slug: 'pluto',
  star: { distanceAU: 39.48, luminosity: 0.00064, color: 0xFFEEDD },
  primary: { name: 'Pluto', slug: 'pluto', type: 'dwarf_planet',
             radiusKm: 1188.3, /* Worker 3 fills rest */ },
  bodies: [], // Worker 3 adds Charon
};
```

Note: at 39.48 AU the Sun is 1,560x dimmer than at Earth.
From Pluto the Sun is just the brightest star — a brilliant
point of light, not a disc. luminosity: 0.00064 reflects this.
The scene will be dim but still clearly lit on the day side.

Commit: `feat: V10 pluto.js skeleton`

### 1c — NAV panel wiring

Add 'pluto' to AVAILABLE_SYSTEMS.
Wire NAV panel Pluto button — currently shows "Coming Soon".

Note: Pluto is listed after Neptune in the NAV panel.
Label it "♇ Pluto" (dwarf planet symbol) or "🔵 Pluto".

Loading screen facts:
  "New Horizons revealed Pluto's heart in 2015 after a 9-year journey"
  "Pluto was discovered in 1930 by 24-year-old Clyde Tombaugh"
  "The heart shape is named Tombaugh Regio after its discoverer"
  "Charon is so large that Pluto and Charon orbit each other"
  "Pluto's atmosphere freezes and falls as snow every 248 years"
  "Water ice mountains on Pluto are as tall as the Rockies"
  "From Pluto, the Sun looks like a very bright star"
  "Pluto was reclassified as a dwarf planet in 2006"

Epoch: New Horizons flyby — 2015-07-14 11:49 UTC
  The moment New Horizons made closest approach to Pluto.
  This is the historically significant date for this system.
  calibrate rotationPhaseAtEpochDeg so Tombaugh Regio (the
  heart) faces the camera at this epoch.

Commit: `feat: V10 NAV panel Pluto wiring + loading facts`

### 1d — Commit Phase 1, spawn workers

```bash
git add -A
git commit -m "feat: V10 Phase 1 — pluto skeleton, textures, NAV wiring"
git push origin main
git show HEAD --name-only
```

Run full existing regression suite — all must pass.
ONLY spawn workers after green suite.

---

## PHASE 2 — PARALLEL WORKERS

### WORKER 1 SPEC — Pluto Surface + Atmosphere Shaders

Files owned:
  src/engine/shaders/pluto-surface.glsl
  src/engine/shaders/pluto-atmosphere.glsl

Read-only: src/engine/glsl/simplex.glsl,
           src/engine/glsl/surface-base.glsl

**pluto-surface.glsl:**
Pluto's surface has four visually distinct terrain types.
Detect from base texture luminance and hue — same pattern
as Ganymede/Iapetus terrain detection.

Use unified shader convention:
```glsl
float sunDot = dot(normalize(vNormal), uSunDirection);
float dayFade = sse_dayFade(sunDot, uDayFadeSoft0, uDayFadeSoft1);
float grazeFade = sse_grazeFade(sunDot, uGrazeFade0, uGrazeFade1);
```

Night side must be nearly pure black — Pluto is 39 AU from
the Sun. No atmosphere bright enough to scatter significant
light. No nearby reflective body (Charon is small).
Apply min(c, 0) bowl-only craters + dayFade × grazeFade
pattern (same as Moon fix in v8.0.1).

**TERRAIN TYPE 1 — Tombaugh Regio (the Heart):**
Bright nitrogen ice plain. The most distinctive feature.
Located at roughly lat 25°N, lon 180° (New Horizons-facing side).

Color: very bright white-pink #F5F0F0 to #FFE8E0
Texture: extremely smooth — nitrogen ice is viscous and
flows like a glacier, filling and smoothing everything.
Very subtle cellular texture (convective nitrogen cells,
similar to solar granulation but much larger — ~40 km each):
```glsl
// Tombaugh Regio: smooth nitrogen plains
// Detect: high luminance (> 0.75) in the heart region
float heartLat = lat - 0.436; // ~25°N in radians
float heartLon = lon - 3.14159; // ~180° lon
float heartDist = sqrt(heartLat*heartLat*4.0 + heartLon*heartLon);
float inHeart = smoothstep(1.2, 0.6, heartDist);

// Nitrogen convection cells — slow, large
float convCell = cellularNoise(vObjPos * 3.0 + uTime * 0.000001);
float convPattern = smoothstep(0.3, 0.7, convCell) * 0.05;

// Smooth white-pink color
vec3 heartColor = vec3(0.96, 0.92, 0.90) + convPattern;
```

**TERRAIN TYPE 2 — Cthulhu Macula (dark equatorial band):**
Deep reddish-brown region. One of the darkest areas on Pluto.
Located at roughly lat 0-20°S, lon 0-120°.
Tholins (organic compounds) give it the dark reddish color.

Color: dark reddish-brown #3D1A0A to #5C2A10
Texture: ancient heavily cratered terrain.
Apply multi-scale cratering (bowl-only, hash-thinned).
Very rough and varied compared to the Heart.

```glsl
// Cthulhu: detect dark red areas (low luminance, red-dominant)
float isCthulhu = float(lum < 0.25 && baseColor.r > baseColor.b * 1.3);

vec3 cthulhuColor = vec3(0.35, 0.18, 0.08);
// Add crater detail — same pattern as Callisto but redder
float craterVal = min(craterNoise, 0.0) * dayFade * grazeFade;
cthulhuColor += craterVal * 0.3;
```

**TERRAIN TYPE 3 — Mountain regions:**
Water ice mountains up to 3,500 m tall. Found at the edges
of Tombaugh Regio — the mountains border the smooth plains.
Color: medium grey-white #C8C0B8
High normal map perturbation (sharp peaks, angular terrain).
```glsl
// Mountain terrain: high normal perturbation, grey-white
float isMountain = float(lum > 0.45 && lum < 0.75 && inHeart < 0.3);
float mountainRelief = fbm3(vObjPos * 20.0) * 0.15 * dayFade;
// Sharp peaks — high normalScale equivalent
```

**TERRAIN TYPE 4 — Bladed terrain / Tartarus Dorsa:**
Strange blade-like ridges of methane ice, unique to Pluto.
Located mid-latitudes, east of the heart.
Color: pale yellow-white #E8E4D0
Directional pattern — ridges run roughly north-south.
```glsl
// Bladed terrain: anisotropic noise (stretched in one direction)
vec2 bladeUv = vec2(vObjPos.x * 2.0, vObjPos.z * 8.0); // elongated
float blade = fbm3(vec3(bladeUv, 0.0)) * 0.12;
```

**pluto-atmosphere.glsl:**
Pluto's atmosphere was one of New Horizons' biggest surprises:
a thin nitrogen atmosphere with BLUE haze layers visible at
the limb when backlit by the Sun.

The haze is blue due to the same Rayleigh scattering as Earth
but much thinner. Multiple distinct haze layers visible
(about 20 layers up to 200 km altitude).

```glsl
// Pluto limb atmosphere: thin blue haze, multiple layers
float cosAngle = dot(normalize(vNormal),
                     normalize(uCameraPos - vPos));
float fresnel = 1.0 - abs(cosAngle);
float rim = pow(fresnel, 6.0); // very thin falloff

float sunDot = dot(normalize(vNormal), uSunDirection);
float litFactor = smoothstep(-0.05, 0.15, sunDot);

// Blue haze — surprisingly similar to Earth's Rayleigh scattering
// but much fainter (Pluto's atmosphere is 100,000x thinner than Earth)
vec3 hazeColor = vec3(0.50, 0.70, 1.00); // pale blue

// Multiple haze layers: add subtle banding
float layerBand = sin(fresnel * 30.0) * 0.15 + 0.85;

float opacity = rim * litFactor * 0.20 * layerBand;
gl_FragColor = vec4(hazeColor, opacity);
```

The haze is ONLY visible at the limb when the camera is on
the night side looking back at the lit limb (backlit geometry).
This creates the dramatic crescent + blue haze view that
became one of New Horizons' most iconic images.

Add a backlit enhancement: when the camera is between Pluto
and the Sun (sunDot < 0 from camera perspective), increase
haze opacity for the backlit glow effect.

Export: { plutoSurfaceUniforms, plutoSurfaceShader,
          plutoAtmosphereUniforms, plutoAtmosphereShader }

### WORKER 2 SPEC — Charon Surface Shader

File owned: src/engine/shaders/charon-surface.glsl

Read-only: src/engine/glsl/simplex.glsl,
           src/engine/glsl/surface-base.glsl

Charon is geologically fascinating — ancient cratered terrain
plus a dramatically different dark red polar cap.

Use unified shader convention. Night side pure black
(no atmosphere, no nearby bright reflector at this distance).
Apply min(c, 0) bowl-only + dayFade × grazeFade.

**TERRAIN TYPE 1 — Cratered plains (most of surface):**
Grey ancient terrain, heavily cratered.
Color: medium grey #909090 to #B0A8A0 (slightly warmer than Moon)
Multi-scale cratering — bowl-only, hash-thinned.
Large impact basin: Serenity Chasma (deep canyon system)
at approximately lat 5°N — darker grey, deeper depression.

```glsl
// Charon cratered plains
vec3 plainColor = vec3(0.58, 0.55, 0.52); // warm grey
float craterVal = min(craterNoise, 0.0) * dayFade * grazeFade;
plainColor += craterVal * vec3(0.2, 0.18, 0.15);
```

**TERRAIN TYPE 2 — Mordor Macula (dark polar cap):**
Charon's north pole has a remarkable dark reddish-brown cap —
completely different from the grey plains. Named Mordor Macula.
It forms when methane escapes from Pluto's atmosphere,
gets trapped by Charon's cold pole, and is processed into
dark tholins by radiation.

Color: very dark reddish-brown #2A1008 to #3D180A
Sharp-ish boundary at approximately lat 60°N.

```glsl
// Mordor Macula: dark red polar cap
float mordorLat = lat - 1.047; // ~60°N boundary
float mordorMask = smoothstep(-0.1, 0.2, vNormal.y - 0.5);

vec3 mordorColor = vec3(0.22, 0.10, 0.04); // very dark red-brown
// Subtle texture within the cap
float mordorTex = fbm3(vObjPos * 6.0) * 0.08;
mordorColor += mordorTex;

baseColor = mix(baseColor, mordorColor, mordorMask);
```

**TERRAIN TYPE 3 — Serenity Chasma (canyon system):**
A large canyon system running across Charon's equatorial region.
Implement as an elongated dark depression, similar to
Valles Marineris on Mars but on a much smaller scale.
Depth gives strong shadow contrast at oblique sun angles.

```glsl
// Canyon: dark linear feature near equator
float canyonLat = abs(lat) - 0.087; // near equator
float canyon = smoothstep(0.15, 0.0, abs(canyonLat)) *
               smoothstep(0.8, 0.5, abs(lon - 1.57)); // ~90° lon
float canyonDepth = canyon * 0.25 * dayFade;
baseColor *= (1.0 - canyonDepth);
```

**Pluto-facing hemisphere:**
Charon is tidally locked — same face always toward Pluto.
The Pluto-facing hemisphere (lon ~0°) has slightly different
illumination in reality (Plutoshine — reflected light from
Pluto). Very subtle — Pluto's albedo is high enough to
provide a small amount of illumination. Implement as a very
faint reddish-white ambient on the Pluto-facing side:
```glsl
// Plutoshine: faint illumination from reflected Pluto light
// Only on the Pluto-facing hemisphere (lon near 0°)
float plutoFacing = smoothstep(1.57, 0.0, abs(lon));
float plutoshineAmt = plutoFacing * (1.0 - dayFade) * 0.04;
vec3 plutoshineColor = vec3(0.95, 0.90, 0.88); // warm white
baseColor += plutoshineColor * plutoshineAmt;
```

Export: { charonSurfaceUniforms, charonSurfaceShader }

### WORKER 3 SPEC — pluto.js Complete Config

File owned: src/data/systems/pluto.js

```javascript
export default {
  name: 'Pluto',
  slug: 'pluto',

  star: {
    distanceAU: 39.48,
    luminosity: 0.00064,  // 1/r² — Sun is 1,560x dimmer than at Earth
    color: 0xFFFFFF,      // Sun appears white from this distance
    // From Pluto: Sun is just the brightest star, no visible disc
  },

  primary: {
    name: 'Pluto',
    slug: 'pluto',
    type: 'dwarf_planet',
    radiusKm: 1188.3,
    massKg: 1.303e22,
    rotationPeriodHours: -153.293,  // retrograde — same as Charon period
    // Pluto is tidally locked to Charon
    axialTiltDeg: 122.53,           // highly tilted
    rotationPhaseAtEpochDeg: 180.0, // calibrate so heart faces camera
                                     // at New Horizons epoch 2015-07-14
    oblateness: 1.0,                // nearly spherical

    textures: {
      diffuse: 'pluto/diffuse.jpg',
    },

    atmosphere: {
      enabled: true,
      shader: 'pluto-atmosphere',
      opaque: false,
      thickness: 0.015,    // thin — extends to ~200 km
      opacity: 0.20,
      fresnelPower: 6.0,
      color: [0.50, 0.70, 1.00],  // blue haze — surprising discovery
    },

    surface: {
      enabled: true,
      shader: 'pluto-surface',
    },

    shaderParams: {
      // Pluto: very thin atmosphere, fairly sharp terminator
      dayFadeSoft0: -0.03, dayFadeSoft1: 0.08,
      grazeFade0: 0.15,    grazeFade1: 0.50,
    },

    detailFloor: { softKm: 500, hardKm: 50 },
    minInsertionAltKm: 100,

    normalScale: 2.5,
    geometrySegments: 128,

    surfaceGravity: 0.620,  // m/s² — you'd weigh 6% of Earth weight
    surfaceTempRange: [-233, -223],  // °C

    notableFeatures: [
      'Tombaugh Regio — the iconic heart-shaped nitrogen ice plain',
      'Discovered in 1930, reclassified as dwarf planet in 2006',
      'New Horizons flyby in 2015 revealed a geologically active world',
      'Blue atmospheric haze — the same Rayleigh scattering as Earth',
    ],

    moreInfo: {
      heart: 'The heart (Sputnik Planitia) is a nitrogen ice glacier 1,000 km wide',
      mountains: 'Water ice mountains reach 3,500 m — as tall as the Rockies',
      atmosphere: 'The atmosphere freezes and snows onto the surface every orbit',
      charon: 'Charon is so large they orbit each other, not one orbiting the other',
    },

    surfaceFeatures: [
      { name: 'Tombaugh Regio', lat: 25.0, lon: 180.0 },
      { name: 'Sputnik Planitia', lat: 25.0, lon: 175.0 },
      { name: 'Cthulhu Macula', lat: -10.0, lon: 60.0 },
      { name: 'Tartarus Dorsa', lat: 5.0, lon: 225.0 },
      { name: 'Hillary Montes', lat: 20.0, lon: 165.0 },
      { name: 'Norgay Montes', lat: 15.0, lon: 170.0 },
    ],
  },

  bodies: [
    {
      name: 'Charon',
      slug: 'charon',
      type: 'moon',

      radiusKm: 606.0,
      massKg: 1.586e21,

      // Charon orbits at 19,596 km — very close
      semiMajorAxisKm: 19596,
      orbitalPeriodDays: 6.387,   // same as Pluto's rotation — tidally locked
      inclination: 0.001,          // nearly zero — coplanar with Pluto equator
      eccentricity: 0.0002,
      tidallyLocked: true,
      rotationPeriodHours: 153.293, // same as Pluto's rotation period

      textures: {
        diffuse: 'charon/diffuse.jpg',
      },

      surface: { enabled: true, shader: 'charon-surface' },

      shaderParams: {
        dayFadeSoft0: -0.02, dayFadeSoft1: 0.06,
        grazeFade0: 0.15,    grazeFade1: 0.50,
      },

      detailFloor: { softKm: 200, hardKm: 30 },
      geometrySegments: 64,

      surfaceGravity: 0.288,
      surfaceTempRange: [-220, -220],

      notableFeatures: [
        'Half the size of Pluto — largest moon-to-body ratio in solar system',
        'Mordor Macula: mysterious dark red polar cap of organic tholins',
        'Both Pluto and Charon are tidally locked — face each other forever',
        'Serenity Chasma: canyon system larger than the Grand Canyon',
      ],

      surfaceFeatures: [
        { name: 'Mordor Macula', lat: 80.0, lon: 0.0 },
        { name: 'Serenity Chasma', lat: 5.0, lon: 90.0 },
        { name: 'Oz Terra', lat: 60.0, lon: 0.0 },
      ],
    },
  ],

  curatedPresets: [
    {
      id: 'pluto-heart',
      name: '❤️ The Heart',
      system: 'pluto',
      description: 'Tombaugh Regio — the iconic nitrogen ice heart',
      camera: { mode: 'insertion', target: 'pluto',
                altitudeKm: 5000, incDeg: 25, phase: Math.PI },
    },
    {
      id: 'pluto-charon-view',
      name: '🌑 Pluto + Charon',
      system: 'pluto',
      description: 'Both worlds in one frame — the binary system',
      camera: { mode: 'insertion', target: 'pluto',
                altitudeKm: 40000, incDeg: 10, phase: Math.PI * 0.8 },
    },
    {
      id: 'pluto-crescent',
      name: '🌙 Blue Haze Crescent',
      system: 'pluto',
      description: 'Pluto\'s surprising blue atmospheric haze at the limb',
      camera: { mode: 'insertion', target: 'pluto',
                altitudeKm: 20000, incDeg: 5, phase: Math.PI * 0.15 },
    },
    {
      id: 'charon-mordor',
      name: '🔴 Mordor Macula',
      system: 'pluto',
      description: 'Charon\'s mysterious dark red polar cap',
      camera: { mode: 'insertion', target: 'charon',
                altitudeKm: 3000, incDeg: 70, phase: Math.PI },
    },
  ],
};
```

---

## PHASE 3 — ORCHESTRATOR: INTEGRATION

### 3a — Wire Pluto shaders into renderer.js

Follow the exact same pattern as mars.js and neptune.js.
Pluto is a terrestrial body — same material building path.

Key differences:
- Very dim sun (luminosity 0.00064) — verify the scene
  ambient is sufficient to see the night side earthshine.
  Pluto has NO significant planetshine — Charon is too small
  and dim. Night side should be pure black.
- Atmosphere sphere: thin, blue, BackSide sphere
  Same makeLimbScatterMaterial pattern as other bodies
  CRITICAL: set extensions = { logDepthBuf: true }

### 3b — Charon positioning

Charon orbits at 19,596 km — very close to Pluto.
At 40,000 km altitude both are easily visible together.
Verify that from the "Pluto + Charon" preset both bodies
are clearly in frame simultaneously.

The orbital period is 6.387 days — at 100x speed Charon
completes an orbit in ~1.5 hours of real time. At 1000x
it zips around in ~9 minutes. Verify the orbit is smooth
and correctly prograde.

Charon should be ALWAYS visible from the Pluto-facing
hemisphere — it's tidally locked and hangs stationary
in Pluto's sky.

### 3c — Epoch calibration

At the New Horizons flyby epoch (2015-07-14 11:49 UTC):
- Tombaugh Regio (the heart) was on the New Horizons-facing
  side — roughly sub-spacecraft point
- Calibrate rotationPhaseAtEpochDeg so the heart faces the
  camera when the simulation is set to this exact date/time

Add a New Horizons flyby preset to the SAVE panel:
```javascript
// In the curated presets, add:
{
  id: 'new-horizons-epoch',
  name: '🚀 New Horizons Flyby',
  system: 'pluto',
  description: 'The exact moment of humanity\'s first Pluto encounter',
  date: '2015-07-14T11:49:00Z',
  camera: { mode: 'insertion', target: 'pluto',
            altitudeKm: 12500, incDeg: 0, phase: Math.PI },
}
```
This preset sets the simulation date AND camera position.
The heart should be clearly visible face-on at this moment.

### 3d — Verify backlit haze effect

The most iconic New Horizons image: Pluto as a backlit
crescent with blue haze layers at the limb. This requires:
- Camera on the night side of Pluto, looking back toward sun
- Phase ≈ 0.1-0.2 (just past the terminator, sun mostly behind)
- Atmosphere shader enhanced for backlit geometry

Test the "Blue Haze Crescent" preset specifically:
The crescent of Pluto should show a clearly blue atmospheric
haze at the lit limb. If the haze is too faint to see at
this distance, increase opacity for the backlit case.

### 3e — Security checklist

[ ] CSP still active, no new external domains needed
[ ] npm audit clean
[ ] Observatory score still A+

### 3f — Full test suite

New tests/plutotest.mjs:
  [ ] Pluto system loads from NAV panel
  [ ] LIVE mode active on load
  [ ] Tombaugh Regio visible as bright region from 5,000 km
  [ ] Cthulhu Macula visible as dark reddish region
  [ ] Atmosphere haze visible at limb
  [ ] Blue crescent visible from night side
  [ ] Charon orbits correctly (6.387 day period)
  [ ] Charon visible alongside Pluto at 40,000 km
  [ ] Mordor Macula visible on Charon north pole
  [ ] Night side pure black (< 3% luminance)
  [ ] All 4 curated presets execute without error
  [ ] New Horizons epoch preset: heart facing camera
  [ ] Smoke test: all existing systems still load correctly

```bash
npm run build
npm run preview
npx wrangler deploy
```

Verify live at app.solarexplorer.co.

---

## VERSION AND PROJECT LOG

Bump package.json to "10.0.0"

Update Docs/PROJECT_LOG.md:
  - Add v10 to Version History
  - Mark Pluto + Charon as complete
  - Close backlog #65 (Pluto deferred — now built)
  - Note any new bugs

Commit: `docs: v10 complete — Pluto+Charon live, PROJECT_LOG updated`
Push: `git push origin main`

---

## PRIORITY ORDER IF TIME RUNS OUT

1. Phase 1 (must complete before workers)
2. Worker 3: pluto.js config (system won't load without it)
3. Worker 1: Pluto surface + atmosphere (most visual impact)
4. Worker 2: Charon surface
5. Phase 3 integration
6. Backlit haze effect calibration
7. New Horizons epoch preset

Pluto must render something before deploying.
Smoke test all existing systems before deploy.

---

## SECURITY CHECKLIST (every build)

[ ] No new external domains in CSP
[ ] npm audit clean
[ ] Observatory score A+
[ ] security.txt expiry current (2027-07-12)

---

## STYLE GUIDE

Montserrat headings | Lato body
Primary Blue: #0077CC | Light Blue: #66B2FF
White: #FFFFFF | Light Gray: #D9D9D9
Space Black: #050510

Pluto accent: #E8D4C0 (warm pinkish-white — Tombaugh Regio color)
