# Solar System Explorer — V6 Session Prompt
# Mars System with Parallel Worker Orchestration
# Save to Docs/V6_MARS.md

---

## HOW TO START

```bash
cd C:\dev\Solar-System-Explorer
git pull origin main
git status   ← must show clean working tree
claude --fable
```

Say: "Read .claude/instructions.md, then PROJECT_LOG.md, then
Docs/V6_MARS.md. Follow the orchestration model exactly —
build shared infrastructure first, then spawn workers in parallel.
Commit and push after every phase."

---

## ORCHESTRATION MODEL

You are the orchestrator. Use parallel Haiku-tier workers for
isolated implementational tasks. Follow this exact sequence:

PHASE 1 — Orchestrator builds shared infrastructure (you only)
PHASE 2 — Spawn 3 workers in parallel
PHASE 3 — Orchestrator integrates, wires, tests, deploys

WORKER FILE OWNERSHIP — strictly enforced, no overlaps:
  Worker 1: src/engine/shaders/mars-surface.glsl
            src/engine/shaders/mars-atmosphere.glsl
  Worker 2: src/engine/shaders/mars-dust.glsl
            src/engine/shaders/mars-polar.glsl
  Worker 3: src/data/systems/mars.js (complete config)

Workers must NOT touch: main.js, renderer.js, camera.js,
physics.js, ui.js, vite.config.js, package.json, index.html,
src/engine/glsl/simplex.glsl, PROJECT_LOG.md, wrangler.toml,
earth.js, jupiter.js, saturn.js

Orchestrator owns: all wiring, integration, testing, deployment,
PROJECT_LOG.md update, final commit.

---

## CONTEXT

v5.1.3 is live with Jupiter and Earth systems complete.
This session adds Mars as V6 — the first solid-surface planet
you can fly over with recognizable terrain features.

Mars is visually striking and scientifically rich:
- Olympus Mons: largest volcano in the solar system (3x Everest)
- Valles Marineris: canyon system the length of the United States
- Polar ice caps that visibly change with seasons
- Dust storms that can engulf the entire planet
- Pink/salmon sky from suspended dust
- Two tiny irregular moons: Phobos and Deimos
- Earth visible as a bright blue star in the Martian sky

Target experience: flying over Mars as if aboard a spacecraft,
seeing the same dramatic terrain photographed by Mars orbiters.

Version bump to 6.0.0.

---

## PHASE 1 — SHARED INFRASTRUCTURE (Orchestrator Only)

Build these in order. Commit after each step.
Workers depend on these — do not spawn until all complete.

### 1a — mars.js config skeleton
Create src/data/systems/mars.js with the schema structure only
(no shader details — Worker 3 fills those in). Just enough for
the engine to load the system without errors:

```javascript
export default {
  name: 'Mars',
  slug: 'mars',
  star: { distanceAU: 1.524, luminosity: 0.431, color: 0xFFEEDD },
  primary: {
    name: 'Mars', slug: 'mars', type: 'terrestrial',
    radiusKm: 3389.5, massKg: 6.39e23,
    rotationPeriodHours: 24.6229, axialTiltDeg: 25.19,
    oblateness: 0.99518,
    textures: {
      diffuse: 'mars/diffuse.jpg',
      normal: 'mars/normal.jpg',
    },
    // Worker 3 fills in all remaining fields
  },
  bodies: [], // Worker 3 adds Phobos and Deimos
};
```

Commit: `feat: V6 mars.js skeleton — system loads without errors`

### 1b — Mars texture acquisition
Download and place Mars textures in public/textures/mars/:

**Primary diffuse texture (Mars color map):**
Try these sources in order:
1. Solar System Scope: solarsystemscope.com/textures
   (mars 2k or 4k, CC BY 4.0)
2. NASA Visible Earth: visibleearth.nasa.gov
   Search "Mars" — Viking color mosaic
3. James Hastings-Trew planetary maps:
   planetpixelemporium.com/mars.html
   (marssurface.jpg — public domain)

**Normal/elevation map:**
MOLA (Mars Orbiter Laser Altimeter) data is the gold standard.
Try: astrogeology.usgs.gov/search/map/Mars/GlobalSurveyor/
     MOLA/MEA_90N90S_512ppd_r1_lsb_signed
If unavailable, use a procedural normal map (Worker 1 generates
height-based normals from the surface detail shader).

**Phobos and Deimos textures:**
These are tiny — 1K textures sufficient.
NASA/JPL public domain photos exist for both.
Try: photojournal.jpl.nasa.gov (search Phobos, Deimos)

Note all texture sources as comments in mars.js.
If any download fails, create a placeholder rust-red texture:
```javascript
// Placeholder: solid rust-red if texture unavailable
const canvas = document.createElement('canvas');
canvas.width = 512; canvas.height = 256;
const ctx = canvas.getContext('2d');
ctx.fillStyle = '#8B4513';
ctx.fillRect(0, 0, 512, 256);
```

Commit: `feat: Mars textures downloaded and placed`

### 1c — Sun direction calibration for Mars
In src/engine/ephemeris.js, verify that `sunDirectionFrom('mars', jd)`
works correctly. Mars orbits at 1.524 AU with a period of 686.97 days.
The Keplerian elements for Mars are already in the ELEMENTS table.

Add to physics.js the Mars sidereal day and epoch rotation:
```javascript
// Mars sidereal day: 24h 37m 22s = 24.6229 hours
// Mars epoch rotation phase at J2000:
// Mars prime meridian at J2000: 176.630° (IAU 2015)
// rotationPhaseAtEpochDeg: 176.630
```

Add a Mars calibration check to tests/suncal.mjs:
At Mars vernal equinox (approx 2024-11-12), sun should be
at Mars equator (declination ~0°) and at a known longitude.

Commit: `feat: Mars ephemeris calibration + rotation phase`

### 1d — System switching wiring for Mars
Update main.js / switchSystem() to handle 'mars':
- Mars system uses the same switchSystem() infrastructure
- Add 'mars' to AVAILABLE_SYSTEMS in config.js
- Wire the NAV panel Mars button to call switchSystem('mars')
  (currently shows "Coming Soon" — change to active)
- Loading screen fact pool for Mars (while textures load):
  "Olympus Mons is 3x the height of Mount Everest"
  "Valles Marineris would stretch across the United States"
  "A Martian day is only 40 minutes longer than Earth's"
  "Mars has the largest dust storms in the solar system"
  "Liquid water once flowed on Mars billions of years ago"
  "Both Viking landers detected no signs of life in 1976"
  "Perseverance rover is currently exploring Jezero Crater"
  "Mars has two small moons: Phobos and Deimos"

Commit: `feat: Mars system switching + NAV panel wiring + loading facts`

### 1e — Commit all shared infrastructure, spawn workers

```bash
git add -A
git status  ← verify all source files staged
git commit -m "feat: V6 shared infra — mars skeleton, textures, ephemeris, switching"
git push origin main
git show HEAD --name-only  ← verify .js files in commit
```

**Only after this commit — spawn 3 workers in parallel.**

---

## PHASE 2 — PARALLEL WORKERS

Spawn all 3 simultaneously. Pass each worker:
- Their specific task spec below
- The Earth shader files as reference (same patterns apply)
- Their exclusive file list
- Read-only reference to src/engine/glsl/simplex.glsl

### WORKER 1 SPEC — Mars Surface + Atmosphere Shaders

Files owned:
  src/engine/shaders/mars-surface.glsl
  src/engine/shaders/mars-atmosphere.glsl

Read-only reference: src/engine/glsl/simplex.glsl

**mars-surface.glsl:**
Mars surface procedural detail shader. Same pattern as the
Galilean moon shaders in detailShaders.js.

Uniforms: uTime, uAltitude, uDetailBlend, uSunDirection
Activation: below 20,000 km
uDetailBlend = smoothstep(20000.0, 2000.0, uAltitude)

Mars has two distinct terrain types — detect from base texture
luminance similar to Ganymede's mare/highland detection:

HIGHLANDS (southern hemisphere, luminance > 0.45):
Ancient heavily cratered terrain, 4+ billion years old.
Similar to Moon highlands but redder and more eroded.
- Multi-scale cratering: 4 octaves at decreasing sizes
- Crater floors filled with dust (slightly lighter than walls)
- Crater rims eroded and softened by billions of years of
  dust deposition (less sharp than lunar craters)
- Subtle dust ripple texture between craters (wind-sculpted)
- Color: dark rust #8B2500 to light ochre #C8783C

LOWLANDS (northern hemisphere, luminance < 0.35):
Younger, smoother plains — likely ancient ocean floor.
- Very smooth with subtle undulation
- Scattered small impact craters
- Wind streak patterns: elongated noise in the prevailing
  wind direction (roughly east-west in equatorial regions)
- Color: lighter rust-orange #C86428 to tan #D4956A

VOLCANIC REGIONS (Tharsis plateau, ~0-30°N, 90-135°W):
Shield volcano terrain — smoother than highlands.
- Lava flow texture: elongated noise radiating from
  Olympus Mons coordinates (18.65°N, 226.2°E)
- Concentric ring texture around major calderas
- Slightly darker than surrounding plains

OLYMPUS MONS (18.65°N, 226.2°E):
At low altitude (below 5,000 km) when camera is near this
coordinate, add the caldera detail:
- Large circular depression at summit
- Scarp cliff at base (Olympus Mons has a dramatic 8km escarpment
  that drops to the surrounding plains)
- Subtle lava flow textures radiating outward

VALLES MARINERIS (approx -14°S, 300-360°E):
At low altitude when camera is near these coordinates:
- Deep dark canyon network
- Canyon walls with visible layering (sedimentary strata)
- Dust on canyon floors (slightly lighter)
- The canyon system stretches ~4,000 km — implement as an
  elongated dark depression in the noise

POLAR REGIONS (latitude > 70° both poles):
- Layered terrain: alternating light/dark bands from seasonal
  CO2 frost deposition over millions of years
- Use banded noise along latitude lines
- North pole: water ice + dust layers
- South pole: CO2 ice cap (brighter white)
  
Normal perturbation from height noise (same pattern as moon shader):
```glsl
float eps = 0.001;
float nx = fbm(uv + vec2(eps, 0.0), octaves);
float nz = fbm(uv - vec2(eps, 0.0), octaves);
float ny_h = fbm(uv + vec2(0.0, eps), octaves);
float ny_l = fbm(uv - vec2(0.0, eps), octaves);
vec3 procNormal = normalize(vec3(
  (nz - nx) / (2.0 * eps) * uDetailBlend * 1.5,
  (ny_h - ny_l) / (2.0 * eps) * uDetailBlend * 1.5,
  1.0
));
vec3 finalNormal = normalize(mix(baseNormal, procNormal,
  uDetailBlend * 0.5));
```

Altitude-staged octaves (mobile: subtract 2):
```glsl
int octaves = uAltitude > 10000.0 ? 3
            : uAltitude > 3000.0  ? 5
            : uAltitude > 500.0   ? 7 : 9;
```

**mars-atmosphere.glsl:**
Mars has a thin CO2 atmosphere (0.6% of Earth's pressure).
The atmosphere produces a distinctive pinkish-salmon sky color
from suspended dust particles. The limb glow is much fainter
than Earth's but clearly visible from orbit.

Implement on a sphere slightly larger than Mars (radius × 1.015),
THREE.BackSide, transparent, additive blending.

```glsl
// Mars limb — much thinner than Earth, salmon/pink tint
float cosAngle = dot(normalize(vNormal),
                     normalize(uCameraPos - vPos));
float fresnel = 1.0 - abs(cosAngle);
float rim = pow(fresnel, 3.5); // thinner falloff than Earth

float sunDot = dot(normalize(vNormal), uSunDirection);
float litFactor = smoothstep(-0.1, 0.15, sunDot);

// Mars atmospheric color: salmon-pink from dust scattering
// NOT blue Rayleigh — Mars dust makes it reddish-pink
vec3 limbColor = mix(
  vec3(0.7, 0.4, 0.3),   // deep pink-red at limb
  vec3(0.9, 0.6, 0.4),   // salmon at terminator
  1.0 - litFactor
);

float opacity = rim * litFactor * 0.35; // fainter than Earth
gl_FragColor = vec4(limbColor, opacity);
```

The atmosphere also produces a haze effect at low altitude:
Below 3,000 km add a subtle dust haze over the surface
(especially in equatorial regions where dust storms occur).
```glsl
if (uAltitude < 3000.0) {
  float hazeBlend = smoothstep(3000.0, 500.0, uAltitude) * 0.15;
  vec3 hazeColor = vec3(0.75, 0.55, 0.40); // dusty salmon
  // Mix haze over the surface color
}
```

Export: { marsSurfaceUniforms, marsSurfaceShader,
          marsAtmosphereUniforms, marsAtmosphereShader }

### WORKER 2 SPEC — Mars Dust Storm + Polar Ice Shaders

Files owned:
  src/engine/shaders/mars-dust.glsl
  src/engine/shaders/mars-polar.glsl

Read-only reference: src/engine/glsl/simplex.glsl

**mars-dust.glsl:**
Mars global dust storms are one of the most dramatic features —
they can engulf the entire planet for weeks, turning it into a
featureless orange sphere. Regional storms are more common and
create swirling dust devil patterns.

This shader is an overlay on top of the surface (like Earth clouds).
Activate as a cloud-equivalent layer.

Uniforms: uTime, uAltitude, uDetailBlend, uDustStormIntensity
(uDustStormIntensity: 0.0 = clear, 1.0 = global storm)

DUST STORM LAYER:
```glsl
// Regional dust: patches of raised dust in southern spring/summer
// Use slow-moving noise for dust opacity
float dustBase = fbm(vUv * 2.5 + uTime * 0.000008, 4);
dustBase = smoothstep(0.55, 0.75, dustBase);

// Dust color: opaque tan-orange #D4956A to #E8B080
vec3 dustColor = mix(
  vec3(0.83, 0.58, 0.42),  // lighter dust
  vec3(0.91, 0.69, 0.50),  // denser dust
  dustBase
);

// Storm intensity controls global coverage
float stormCover = mix(dustBase, 1.0, uDustStormIntensity * 0.8);
float alpha = stormCover * uDetailBlend * 0.7;
```

DUST DEVILS (small-scale, visible below 2,000 km):
Thin rotating columns of dust, common in equatorial regions.
```glsl
if (uAltitude < 2000.0) {
  // Small vortex features (much smaller than hurricanes)
  float devilR = 0.008; // ~30 km radius on Mars
  // Place 5-8 dust devils scattered in equatorial band
  // Each one: thin spiral, pale orange, very faint
  // Use same vortex math as hurricane but much smaller and fainter
}
```

GLOBAL STORM MODE (uDustStormIntensity > 0.5):
When a global storm is active, surface features become invisible
under the dust layer. The planet appears as a uniform orange sphere.
The storm should have subtle swirling texture even at global coverage.

Expose uDustStormIntensity as a UI slider in the Earth system's
equivalent of the display toggles — add to the VIEW panel under
Mars-specific controls when Mars is the active system:
  "Dust Storm: [──●──────] 0%"
Range 0-100%, default 20% (light regional dust haze always present).

**mars-polar.glsl:**
Mars polar ice caps are visually distinctive — bright white against
the rust-red surface. They shrink and grow with the seasons.

This shader modifies the surface color near the poles.

North pole (lat > 70°N): water ice + dust layers year-round
- Permanent water ice cap
- Surrounding layered terrain (lighter bands)
- In northern summer: CO2 frost sublimes, water ice remains
- Color: bright white #F0F0F0 mixed with dusty layers #D4C8A0

South pole (lat > 70°S): CO2 ice dominant
- Seasonal CO2 frost (disappears in southern summer)
- Permanent water ice beneath
- Swiss-cheese texture: irregular pits and holes in the CO2 ice
  (visible in Mars Express imagery — implement as Voronoi-like
  noise creating dark pits in the bright ice surface)
- Color: bright white #F5F5F5 with dark pit holes #3A2010

Seasonal variation: use a slow sine function of uTime to vary
the cap extent slightly (very slow — Mars year is 687 days):
```glsl
float marsYear = uTime / (686.97 * 24.0 * 3600.0); // in Mars years
float seasonalFactor = sin(marsYear * 2.0 * 3.14159);
// North cap slightly shrinks in northern summer
// South cap dramatically shrinks in southern summer
float northCapLat = 70.0 + seasonalFactor * 3.0;
float southCapLat = 70.0 - seasonalFactor * 8.0; // more dramatic
```

Export: { marsDustUniforms, marsDustShader,
          marsPolarUniforms, marsPolarShader }

### WORKER 3 SPEC — mars.js Complete System Config

File owned: src/data/systems/mars.js

Complete the mars.js config started in Phase 1. Follow earth.js
schema exactly. Read earth.js and jupiter.js for reference.

```javascript
export default {
  name: 'Mars',
  slug: 'mars',

  star: {
    distanceAU: 1.524,
    luminosity: 0.431,  // 1/r² from sun — Mars gets 43% of Earth's sunlight
    color: 0xFFEEDD,    // slightly warmer/dimmer than Earth's sun view
  },

  primary: {
    name: 'Mars',
    slug: 'mars',
    type: 'terrestrial',
    radiusKm: 3389.5,
    massKg: 6.39e23,
    rotationPeriodHours: 24.6229,  // sol = 24h 37m 22s
    axialTiltDeg: 25.19,           // similar to Earth's 23.4°
    oblateness: 0.99518,

    textures: {
      diffuse: 'mars/diffuse.jpg',
      normal: 'mars/normal.jpg',
    },

    atmosphere: {
      enabled: true,
      shader: 'mars-atmosphere',
      color: [0.7, 0.4, 0.3],      // pink-red dust scattering
      thickness: 0.015,             // much thinner than Earth
      rayleigh: false,              // dust scattering, not Rayleigh
    },

    dust: {
      enabled: true,
      shader: 'mars-dust',
      defaultIntensity: 0.2,        // light regional haze by default
    },

    polar: {
      enabled: true,
      shader: 'mars-polar',
      northCapMinLat: 70.0,
      southCapMinLat: 70.0,
    },

    surface: {
      enabled: true,
      shader: 'mars-surface',
    },

    detailFloor: {
      softKm: 1000,
      hardKm: 100,    // MOLA data supports ~100m resolution
    },

    normalScale: 2.5,   // dramatic terrain relief
    geometrySegments: 128,  // higher res for elevation features

    minInsertionAltKm: 200,

    radiationWarning: {
      zones: [
        { minKm: 0, maxKm: 300, label: '⚠️ Reentry altitude' },
        // Mars has no global magnetic field — surface radiation
        // is significantly higher than Earth but no belts
      ]
    },

    surfaceTempRange: [-125, 20],  // °C
    surfaceGravity: 3.72,          // m/s²

    notableFeatures: [
      'Olympus Mons — largest volcano in the solar system (21 km high)',
      'Valles Marineris — canyon system 4,000 km long, 7 km deep',
      'Dust storms can engulf the entire planet for weeks',
      'Evidence of ancient rivers and lakes now long dry',
    ],

    moreInfo: {
      day: 'A Martian day (sol) is 24 hours 37 minutes — close to Earth',
      gravity: 'Mars gravity is 38% of Earth — you\'d weigh less than half',
      missions: 'Perseverance rover exploring Jezero Crater since 2021',
      moons: 'Phobos will eventually crash into Mars in ~50 million years',
    },

    // Surface feature labels (appear below 2,000 km)
    surfaceFeatures: [
      { name: 'Olympus Mons', lat: 18.65, lon: 226.2 },
      { name: 'Valles Marineris', lat: -14.0, lon: 299.0 },
      { name: 'Hellas Basin', lat: -42.7, lon: 70.0 },
      { name: 'Jezero Crater', lat: 18.4, lon: 77.7 },
      { name: 'Gale Crater', lat: -5.4, lon: 137.8 },
      { name: 'Syrtis Major', lat: 8.4, lon: 69.5 },
      { name: 'Tharsis Plateau', lat: 0.0, lon: 247.0 },
      { name: 'Argyre Basin', lat: -49.7, lon: 316.0 },
      { name: 'North Polar Cap', lat: 85.0, lon: 0.0 },
      { name: 'South Polar Cap', lat: -85.0, lon: 0.0 },
    ],
  },

  bodies: [
    {
      name: 'Phobos',
      slug: 'phobos',
      type: 'irregular_moon',

      // Irregular shape: 27 × 22 × 18 km
      radii: { x: 13.5, y: 11.0, z: 9.0 },  // km half-dimensions
      massKg: 1.0659e16,

      semiMajorAxisKm: 9376,
      orbitalPeriodDays: 0.31891,   // orbits faster than Mars rotates!
      inclination: 1.093,
      eccentricity: 0.0151,
      tidallyLocked: true,
      rotationPeriodHours: 7.653,

      textures: { diffuse: 'phobos/diffuse.jpg' },
      geometrySegments: 32,

      surfaceGravity: 0.0057,  // m/s²
      surfaceTempRange: [-40, -4],

      detailFloor: { softKm: 20, hardKm: 5 },

      notableFeatures: [
        'Orbits Mars faster than Mars rotates — rises in the west',
        'Will crash into Mars or break apart in ~50 million years',
        'Stickney crater covers a third of its diameter',
        'One of the darkest objects in the solar system',
      ],
    },
    {
      name: 'Deimos',
      slug: 'deimos',
      type: 'irregular_moon',

      // Irregular shape: 15 × 12 × 11 km
      radii: { x: 7.5, y: 6.0, z: 5.5 },
      massKg: 1.4762e15,

      semiMajorAxisKm: 23458,
      orbitalPeriodDays: 1.26244,
      inclination: 1.788,
      eccentricity: 0.0002,
      tidallyLocked: true,
      rotationPeriodHours: 30.3,

      textures: { diffuse: 'deimos/diffuse.jpg' },
      geometrySegments: 32,

      surfaceGravity: 0.003,
      surfaceTempRange: [-40, -4],

      detailFloor: { softKm: 10, hardKm: 3 },

      notableFeatures: [
        'Smallest moon of Mars — only 15 km across',
        'So small, escape velocity is walking speed',
        'Smoother surface than Phobos — more dust covered',
        'From Mars surface, barely looks like a star',
      ],
    },
  ],

  // Curated presets for the Mars system
  curatedPresets: [
    {
      id: 'olympus-flyover',
      name: '🌋 Olympus Mons Flyover',
      system: 'mars',
      description: 'Fly over the largest volcano in the solar system',
      camera: {
        mode: 'insertion',
        target: 'mars',
        altitudeKm: 500,
        incDeg: 20,
        phase: 0,  // position near Olympus Mons longitude
        locked: false,
      },
    },
    {
      id: 'valles-marineris',
      name: '🏔️ Valles Marineris',
      system: 'mars',
      description: 'Soar over the solar system\'s greatest canyon',
      camera: {
        mode: 'insertion',
        target: 'mars',
        altitudeKm: 300,
        incDeg: 0,
        phase: 0,  // position over Valles Marineris
        locked: false,
      },
    },
    {
      id: 'global-view',
      name: '🔴 Mars Global View',
      system: 'mars',
      description: 'See the full red planet from orbit',
      camera: {
        mode: 'insertion',
        target: 'mars',
        altitudeKm: 15000,
        incDeg: 30,
        phase: 0,
        locked: false,
      },
    },
    {
      id: 'phobos-chase',
      name: '🛸 Chase Phobos',
      system: 'mars',
      description: 'Follow Phobos — the moon that rises in the west',
      camera: {
        mode: 'chase',
        target: 'phobos',
      },
    },
    {
      id: 'north-pole',
      name: '❄️ North Polar Cap',
      system: 'mars',
      description: 'Polar orbit over Mars\'s water ice cap',
      camera: {
        mode: 'insertion',
        target: 'mars',
        altitudeKm: 2000,
        incDeg: 85,
        phase: 0,
        locked: false,
      },
    },
  ],
};
```

Also add Earth-blue-dot feature: from the Mars surface or low orbit,
Earth should be visible as a bright blue-white point of light in
the Martian sky. Add a comment noting this is handled by the HYG
star catalog (Earth's position relative to Mars needs a special
case — Earth may not appear correctly in the star catalog at Mars).
Document as a future enhancement in earth.js and mars.js.

---

## PHASE 3 — ORCHESTRATOR: INTEGRATION

After all 3 workers complete:

### 3a — Merge worker branches
```bash
git checkout main
git merge worker/mars-surface --no-ff
git merge worker/mars-dust --no-ff
git merge worker/mars-config --no-ff
git push origin main
```

### 3b — Wire Mars shaders into renderer.js
In renderer.js, add Mars-specific material building following
the same pattern as Earth:

```javascript
function buildMarsMaterial(cfg, textures) {
  // Base material
  const mat = new THREE.MeshStandardMaterial({
    map: textures.diffuse,
    normalMap: textures.normal,
    normalScale: new THREE.Vector2(cfg.normalScale, cfg.normalScale),
    roughness: 0.95,   // Mars surface is very rough/matte
    metalness: 0.0,
  });

  // Atmosphere sphere (BackSide, larger radius)
  // Dust storm overlay (cloud equivalent)
  // Polar shader (surface color modification)
  // Wire all uniforms: uSunDirection, uTime, uAltitude,
  //   uDetailBlend, uDustStormIntensity

  return { baseMat, atmosphereMesh, dustMesh };
}
```

### 3c — Wire dust storm slider to VIEW panel
When Mars is the active system, the VIEW panel should show
a Mars-specific control:

```
MARS CONDITIONS
Dust Storm: [──●──────] 20%
```

This slider sets uDustStormIntensity on the dust shader (0.0-1.0).
Store in localStorage as 'sse-mars-dust-intensity'.
Default: 0.2 (light regional haze).

At 100% a global storm engulfs the planet — dramatic.

### 3d — Phobos and Deimos in physics
Phobos has an orbital period of 7.65 hours — it orbits faster
than Mars rotates. This means from the Martian surface, Phobos
rises in the WEST and sets in the EAST (opposite of everything else).

Use Keplerian orbit for both moons (same as Earth's Moon).
The n-body integrator is overkill for these tiny moons.

Important: verify Phobos orbital direction in the prograde
convention — it should move eastward (prograde) but appear
to move westward from Mars's surface due to Mars's slower rotation.

### 3e — Surface feature labels
Mars feature labels use the same billboard sprite system
as other bodies. Wire from mars.js surfaceFeatures array.

Special treatment for Olympus Mons:
Below 5,000 km altitude near Olympus Mons coordinates, add
a subtle visual marker showing the massive caldera rim.
The caldera is 80 km across — visible from orbit.

### 3f — Test Mars system end-to-end
```
[ ] NAV panel Mars button navigates to Mars (no "Coming Soon")
[ ] Loading screen shows Mars facts while textures load
[ ] Mars renders with correct rust-red color
[ ] Atmosphere shows salmon/pink limb glow
[ ] Dust haze visible at equatorial regions
[ ] Dust storm slider in VIEW panel works (0-100%)
[ ] Global storm at 100%: planet turns orange sphere
[ ] Polar ice caps visible at poles
[ ] Phobos orbits correctly (fast, inner orbit)
[ ] Deimos orbits correctly (slow, outer orbit)
[ ] Surface features labeled below 2,000 km
[ ] Olympus Mons visible as raised terrain with caldera
[ ] Valles Marineris visible as dark canyon system
[ ] All 5 curated presets work
[ ] Orbit Insertion on Mars: correct altitude and inclination
[ ] Switch back to Earth → Earth still correct
[ ] Switch back to Jupiter → Jupiter still correct
[ ] Zero console errors on all three systems
```

### 3g — Final build and deploy
```bash
npm run build
# Verify dist has system-mars.js as lazy chunk
npm run preview
npx wrangler deploy
```

---

## VERSION AND PROJECT LOG

Bump package.json to "6.0.0"

Update PROJECT_LOG.md:
  - Add v6 to Version History with all commit hashes
  - Mark Mars system items as implemented
  - Note any texture download results
  - Add any new bugs discovered

Commit: `docs: v6 complete — Mars system live, PROJECT_LOG updated`
Push: `git push origin main`

---

## PRIORITY ORDER IF TIME RUNS OUT

1. Phase 1 shared infrastructure (must complete before workers)
2. Worker 3 (mars.js config) — system won't load without it
3. Worker 1 (mars-surface + mars-atmosphere) — most visual impact
4. Worker 2 (mars-dust + mars-polar) — dramatic features
5. Phase 3 integration and wiring
6. Dust storm slider — implement if time allows
7. Phobos orbital direction verification
8. Curated presets fine-tuning

Mars must render something (even with placeholder textures)
before deploying. Don't deploy a broken system.

---

## STYLE GUIDE

Montserrat headings | Lato body
Primary Blue: #0077CC | Light Blue: #66B2FF
White: #FFFFFF | Light Gray: #D9D9D9
Dark Gray: #4D4D4D at 85% opacity | Space Black: #050510

Mars accent color for UI elements specific to Mars system:
  Rust Red: #C84B0A (use for Mars-specific labels/highlights)
