# Solar System Explorer — V5 Session Prompt
# Earth + Moon System with Parallel Worker Orchestration
# Save to Docs/V5_EARTH_MOON.md

---

## HOW TO START

```bash
cd C:\dev\Solar-System-Explorer
git pull origin main
git status   ← must show clean working tree
claude --fable
```

Say: "Read .claude/instructions.md, then PROJECT_LOG.md, then
Docs/V5_EARTH_MOON.md. Follow the orchestration model exactly —
build shared infrastructure first, then spawn workers in parallel.
Commit and push after every phase."

---

## ORCHESTRATION MODEL

You are the orchestrator. Use parallel Haiku-tier workers for all
isolated implementational tasks. Follow this exact sequence:

PHASE 1 — Orchestrator builds shared infrastructure (you only)
PHASE 2 — Spawn 4 workers in parallel
PHASE 3 — Orchestrator reviews, integrates, wires, tests, deploys

WORKER FILE OWNERSHIP — strictly enforced, no overlaps:
  Worker 1: src/engine/shaders/earth-clouds.glsl
            src/engine/shaders/earth-lights.glsl
            src/engine/shaders/earth-aurora.glsl
  Worker 2: src/engine/shaders/earth-atmosphere.glsl
            src/engine/shaders/earth-ocean.glsl
  Worker 3: src/data/systems/earth.js (complete config)
  Worker 4: src/engine/shaders/moon-detail.glsl

Workers must NOT touch: main.js, renderer.js, camera.js,
physics.js, ui.js, vite.config.js, package.json, index.html,
src/engine/glsl/simplex.glsl, PROJECT_LOG.md, wrangler.toml

Orchestrator owns: all wiring, integration, testing, deployment,
PROJECT_LOG.md update, final commit.

---

## CONTEXT

v4.2.1 is live with Jupiter system complete. This session adds
the Earth + Moon binary system as V5. Version bump to 5.0.0.

The data-driven engine already supports multiple systems via
SYSTEM_CONFIG in src/config.js. Adding Earth = drop in earth.js
config + shaders. The engine loads it automatically.

Per-system lazy loading is already in vite.config.js — earth.js
will become its own chunk loaded only when user travels there.

Target experience: ISS quality — NASA 4K video from orbit.
The Earth system is the most visually rich in the simulator.

---

## PHASE 1 — SHARED INFRASTRUCTURE (Orchestrator Only)

Build these in order. Commit and push after each step.
Workers depend on these — do not spawn workers until all done.

### 1a — Keplerian ephemeris utility
Create src/engine/ephemeris.js:

```javascript
// Simplified Keplerian ephemeris for solar system bodies
// Accurate to ~1 arcminute for dates 1950-2050
// Source: NASA planetary fact sheets + JPL horizons elements

const J2000 = 2451545.0; // Julian date of J2000 epoch

// Convert ISO date string to Julian Date
export function isoToJD(isoString) {
  const d = new Date(isoString);
  return d.getTime() / 86400000 + 2440587.5;
}

// Solve Kepler's equation M = E - e*sin(E) for E
function solveKepler(M, e, tol = 1e-8) {
  let E = M;
  for (let i = 0; i < 100; i++) {
    const dE = (M - E + e * Math.sin(E)) / (1 - e * Math.cos(E));
    E += dE;
    if (Math.abs(dE) < tol) break;
  }
  return E;
}

// Keplerian elements at J2000 + rates per century
// [a(AU), e, i(deg), L(deg), wbar(deg), omega(deg),
//  da, de, di, dL, dwbar, domega]
const ELEMENTS = {
  earth: [
    1.00000011, 0.01671022, 0.00005, 100.46457166,
    102.94719, -11.26064,
    -0.00000005, -0.00003804, -0.01294, 35999.37244981,
    0.31795260, -18228.25
  ],
  moon: null, // handled separately via lunar theory
  mars: [
    1.52366231, 0.09341233, 1.85061, 355.45332,
    336.04084, 49.57854,
    -0.00007221, 0.00011902, -0.00724, 19140.29934243,
    0.44441088, -1020.19
  ],
  jupiter: [
    5.20336301, 0.04839266, 1.30530, 34.40438,
    14.72847, 100.55615,
    0.00060737, -0.00012880, -0.00557, 3034.90371757,
    0.21252668, 1217.17
  ],
  saturn: [
    9.53707032, 0.05415060, 2.48446, 49.94432,
    92.43194, 113.71504,
    -0.00301530, -0.00036762, 0.00523, 1222.11494724,
    0.28077479, -1591.05
  ]
};

// Get heliocentric ecliptic position (AU) for a body at a Julian date
export function heliocentricPosition(body, jd) {
  const el = ELEMENTS[body];
  if (!el) return new THREE.Vector3(0, 0, 0);
  
  const T = (jd - J2000) / 36525; // centuries since J2000
  const [a0,e0,i0,L0,wb0,om0, da,de,di,dL,dwb,dom] = el;
  
  const a  = a0  + da  * T;
  const e  = e0  + de  * T;
  const i  = (i0  + di  * T) * Math.PI / 180;
  const L  = (L0  + dL  * T) * Math.PI / 180;
  const wb = (wb0 + dwb * T) * Math.PI / 180;
  const om = (om0 + dom * T) * Math.PI / 180;
  
  const w = wb - om;           // argument of perihelion
  const M = L - wb;            // mean anomaly
  const E = solveKepler(((M % (2*Math.PI)) + 2*Math.PI) % (2*Math.PI), e);
  
  // Heliocentric position in orbital plane
  const xOrb = a * (Math.cos(E) - e);
  const yOrb = a * Math.sqrt(1 - e*e) * Math.sin(E);
  
  // Rotate to ecliptic coordinates
  const cosW = Math.cos(w), sinW = Math.sin(w);
  const cosOm = Math.cos(om), sinOm = Math.sin(om);
  const cosI = Math.cos(i), sinI = Math.sin(i);
  
  const x = (cosW*cosOm - sinW*sinOm*cosI)*xOrb +
             (-sinW*cosOm - cosW*sinOm*cosI)*yOrb;
  const y = (cosW*sinOm + sinW*cosOm*cosI)*xOrb +
             (-sinW*sinOm + cosW*cosOm*cosI)*yOrb;
  const z = (sinW*sinI)*xOrb + (cosW*sinI)*yOrb;
  
  return { x, y, z }; // AU, ecliptic J2000
}

// Get Earth-Moon distance and Moon position relative to Earth
// Simplified lunar theory (accurate to ~0.3°)
export function moonPositionGeocentricKm(jd) {
  const T = (jd - J2000) / 36525;
  // Lunar mean anomaly, mean elongation, etc.
  const M  = (134.96298 + 477198.867398*T) * Math.PI/180;
  const D  = (297.85036 + 445267.111480*T) * Math.PI/180;
  const Mp = (357.52772 + 35999.050340*T)  * Math.PI/180;
  const F  = (93.27191  + 483202.017538*T) * Math.PI/180;
  
  const lon = (218.3165 + 481267.8813*T) * Math.PI/180
    + (6.289*Math.sin(M) - 1.274*Math.sin(2*D-M)
       + 0.658*Math.sin(2*D) - 0.186*Math.sin(Mp)) * Math.PI/180;
  const lat = (5.128*Math.sin(F) + 0.280*Math.sin(M+F)
    - 0.277*Math.sin(M-F)) * Math.PI/180;
  const dist = 385001 - 20905*Math.cos(M); // km
  
  return {
    x: dist * Math.cos(lat) * Math.cos(lon),
    y: dist * Math.cos(lat) * Math.sin(lon),
    z: dist * Math.sin(lat),
    distKm: dist
  };
}

// Sun direction from a given body (normalized vector)
export function sunDirectionFrom(body, jd) {
  const bodyPos = heliocentricPosition(body, jd);
  // Sun is at origin; direction FROM body TO sun is negative of body pos
  const len = Math.sqrt(bodyPos.x**2 + bodyPos.y**2 + bodyPos.z**2);
  return { x: -bodyPos.x/len, y: -bodyPos.y/len, z: -bodyPos.z/len };
}
```

Wire ephemeris to the physics engine:
- In physics.js, import ephemeris.js
- Add `updateSunDirection(simDate)` that calls `sunDirectionFrom()`
  for the active system and updates renderer sun direction
- Call this whenever simDate changes (time advance, date picker, LIVE)
- For Jupiter system: sun direction from Jupiter
- For Earth system: sun direction from Earth
- This makes the sun direction physically correct for any date

Commit: `feat: Keplerian ephemeris utility + physics sun direction update`

### 1b — ESO starfield cubemap
Replace the current procedural random starfield with a
photographically accurate cubemap.

Download and add to public/textures/starfield/:
  ESO Milky Way panorama (public domain, eso0932a)
  URL: https://www.eso.org/public/images/eso0932a/
  Use the equirectangular projection version, convert to cubemap
  OR use any freely available CC0 milky way equirectangular map.

If download fails, note the URL in a comment and keep existing
starfield — do not block on this. Mark as manual step.

In renderer.js, replace the current Points starfield with:
```javascript
// Load equirectangular star map as sphere background
const starLoader = new THREE.TextureLoader();
const starTex = starLoader.load('/textures/starfield/milkyway.jpg');
starTex.mapping = THREE.EquirectangularReflectionMapping;
this.r.scene.background = starTex;
// Remove the old Points starfield geometry
```

If using a cubemap instead, use CubeTextureLoader with 6 faces.

Commit: `feat: ESO photographic starfield cubemap`

### 1c — HYG bright star overlay
Add the 9,096 naked-eye visible stars (magnitude < 6.5) from the
HYG database as colored point sprites over the starfield.

Download hygdata_v3.csv from:
  https://github.com/astronexus/HYG-Database

Process at build time or load at runtime. Each star needs:
  - 3D position (x,y,z columns, already in parsecs, Cartesian)
  - Visual magnitude (mag column)
  - Color index B-V (ci column) → spectral color
  - Proper name if available (proper column)

Spectral color from B-V index:
```javascript
function bvToColor(bv) {
  // O/B: blue-white, A: white, F: yellow-white,
  // G: yellow, K: orange, M: deep red
  if (bv < -0.3) return new THREE.Color(0.6, 0.7, 1.0);   // O blue
  if (bv < 0.0)  return new THREE.Color(0.7, 0.8, 1.0);   // B blue-white
  if (bv < 0.3)  return new THREE.Color(1.0, 1.0, 1.0);   // A white
  if (bv < 0.6)  return new THREE.Color(1.0, 1.0, 0.9);   // F yellow-white
  if (bv < 0.8)  return new THREE.Color(1.0, 0.95, 0.7);  // G yellow
  if (bv < 1.4)  return new THREE.Color(1.0, 0.8, 0.5);   // K orange
  return new THREE.Color(1.0, 0.5, 0.3);                   // M red
}
```

Brightness from magnitude: size = Math.max(0.5, 3.0 - mag * 0.4)

Place stars at large radius (500 world units) from scene origin.
Stars are fixed in inertial space — they don't rotate with bodies.

Named stars (Sirius, Vega, Betelgeuse, Rigel, Antares, etc.):
When body labels are enabled and camera is in Surface mode or
very far from a body, show labels for stars brighter than mag 1.5.

Commit: `feat: HYG bright star catalog — 9000 stars with spectral colors`

### 1d — System switching infrastructure
Update the engine to support switching between Jupiter and Earth.

In src/config.js, SYSTEM_CONFIG is already there. Add:
```javascript
export const AVAILABLE_SYSTEMS = ['jupiter', 'earth'];
```

In main.js, update the system loader to handle the switch:
```javascript
async function switchSystem(slug) {
  showLoadingScreen(`Traveling to ${slug}...`);
  
  // Dispose current system
  renderer.disposeSystem();
  physics.reset();
  
  // Load new system config (lazy chunk)
  const { default: system } = await import(
    `./data/systems/${slug}.js`
  );
  
  // Rebuild scene with new system
  await renderer.buildSystem(system);
  physics.init(system);
  
  // Update config
  SYSTEM_CONFIG = slug;
  
  hideLoadingScreen();
}
```

Wire the NAV panel "Coming Soon" Earth button to call
`switchSystem('earth')` once earth.js exists.
Jupiter button calls `switchSystem('jupiter')`.

The cinematic hyperjump sequence is a future enhancement —
for V5 use a simple loading screen transition.

Commit: `feat: system switching infrastructure — switchSystem() + NAV panel wiring`

### 1e — Commit all shared infrastructure, then spawn workers

```bash
git add -A
git status  ← verify all source files staged
git commit -m "feat: V5 shared infra — ephemeris, starfield, HYG stars, system switching"
git push origin main
git show HEAD --name-only  ← verify .js files in commit
```

**Only after this commit — spawn the 4 workers in parallel.**

---

## PHASE 2 — PARALLEL WORKERS

Spawn all 4 simultaneously. Each worker gets:
- This prompt's worker spec below
- Relevant section of PROJECT_LOG.md Earth+Moon spec
- Their exclusive file list
- The shared simplex.glsl path (read-only reference)

### WORKER 1 SPEC — Earth Cloud + City Lights + Aurora Shaders

Files owned:
  src/engine/shaders/earth-clouds.glsl
  src/engine/shaders/earth-lights.glsl
  src/engine/shaders/earth-aurora.glsl

Read-only reference: src/engine/glsl/simplex.glsl (for noise functions)

**earth-clouds.glsl:**
Procedural animated cloud system overlay on Earth's surface texture.

Uniforms: uTime, uAltitude, uDetailBlend (same pattern as Jupiter)
Activation: below 50,000 km (uDetailBlend = smoothstep(50000, 5000, uAltitude))

Layer 1 — Large weather systems:
  Simplex fBm 3 octaves, slow animation (uTime * 0.00003)
  White cloud coverage: values above 0.55 become cloud
  Opacity varies: thin wispy at edges, dense at center
  Rotate cloud layer slightly faster than surface (1.3x)
  — jet stream simulation

Layer 2 — Hurricane vortex features:
  Same technique as GRS: spiral vortex noise at tropical latitudes
  (±23° from equator). 2-3 vortex centers, drift slowly westward.
  Counterclockwise in northern hemisphere, clockwise in southern.
  Scale: 500-1500 km diameter, significantly smaller than GRS.

Layer 3 — Weather front streaks:
  Elongated noise at mid-latitudes (30-60° north and south)
  Long thin cloud bands stretching east-west
  Slightly faster motion than equatorial clouds

Output: cloud color (white #F8F8FF) + opacity (0.0-0.9)
Blend additively over the base Earth texture day side.

**earth-lights.glsl:**
City lights visible on night side, fading in past terminator.

Uniforms: uSunDirection (vec3), uTime

The terminator is where dot(surfaceNormal, uSunDirection) = 0.
Night side: dot product < 0.
Deep night (dot < -0.1): full city light intensity.
Twilight zone (dot between -0.1 and 0.1): fade city lights in/out.

City light distribution (from Black Marble texture concept —
implement procedurally since we can't load the actual NASA file):
  Dense clusters: Western Europe, Eastern USA, Japan, India corridor
  Medium density: China coast, Southeast Asia, Eastern Australia
  Sparse: South America, Africa, Central Asia
  None: Oceans, Antarctica, Sahara, Amazon, Siberia

Implement as multi-scale noise weighted by a "population density"
texture that approximates real city distributions:
  Use layered noise with different frequency/amplitude per region
  High frequency tight clusters = cities
  Low frequency dim glow = suburbs/roads between cities

Color: warm orange-yellow #FFD080 for most lights
       blue-white #E8F0FF for dense downtown cores

Occasional lightning flash: random blue-white point flash in
storm regions (where cloud coverage is high). Very rare (0.1%
chance per frame per storm cell), 2-frame duration.

**earth-aurora.glsl:**
Aurora borealis and australis visible from orbit.

Uniforms: uTime, uSunDirection

Aurora oval: centered on magnetic poles (~82°N, 111°W geographic
for north; ~74°S, 127°E for south). Width: 5-8° latitude band.

Curtain structure: vertical bands of light with internal shimmer.
  Use stretched noise (10:1 vertical aspect) for curtain texture
  Animate: uTime * 0.1 for shimmer, uTime * 0.02 for drift
  
Colors: green #00FF88 dominant, purple #8844FF at top of curtains,
        pink #FF6688 at very bottom where curtains meet atmosphere.
        Mix based on vertical position in curtain.

Intensity varies with solar activity — use slow noise function
(uTime * 0.001) to modulate overall brightness.
Visible from orbit only (deactivate below 1,000 km altitude).

Combine all three into a single material export:
  export { cloudsUniforms, cloudsShader }
  export { lightsUniforms, lightsShader }
  export { auroraUniforms, auroraShader }

### WORKER 2 SPEC — Earth Atmosphere + Ocean Shaders

Files owned:
  src/engine/shaders/earth-atmosphere.glsl
  src/engine/shaders/earth-ocean.glsl

**earth-atmosphere.glsl:**
Rayleigh scattering produces Earth's vivid blue limb glow —
the most recognizable Earth feature from space.

This is the most important Earth shader. It must look stunning.

Uniforms: uSunDirection, uCameraPosition, uAltitude

Implement on a sphere slightly larger than Earth (radius * 1.025),
rendered with THREE.BackSide, transparent, additive blending.

Rayleigh scattering shader:
```glsl
// Fresnel-style rim calculation
float cosAngle = dot(normalize(vNormal), normalize(uCameraPos - vPos));
float fresnel = 1.0 - abs(cosAngle);
float rim = pow(fresnel, 2.5);

// Only on lit side (+ atmospheric bleed past terminator)
float sunDot = dot(normalize(vNormal), uSunDirection);
float litFactor = smoothstep(-0.15, 0.2, sunDot);

// Rayleigh color: deep blue at limb, white near terminator
vec3 limbColor = mix(
  vec3(0.2, 0.5, 1.0),   // deep blue at full rim
  vec3(1.0, 0.6, 0.3),   // orange-red at terminator
  1.0 - litFactor
);

float opacity = rim * litFactor * 0.7;
gl_FragColor = vec4(limbColor, opacity);
```

Terminator atmospheric bleed:
At the terminator (sunDot near 0), add a soft orange-red glow
that extends slightly past the geometric shadow boundary.
This is the atmospheric refraction of sunlight at sunset/sunrise
and is one of the most beautiful features seen from the ISS.

From ISS altitude (408 km) add a horizon glow:
Below 2,000 km altitude, the atmosphere should be visible as
a thin blue line along the horizon in all directions.
Implement as a distance-from-horizon gradient.

**earth-ocean.glsl:**
Ocean specular highlight (sun glint) — blinding reflection
visible from orbit when geometry aligns correctly.

Uniforms: uSunDirection, uCameraPosition, uTime

Sun glint: when the reflection vector of sunlight off the ocean
surface aligns with the camera direction, create a bright
specular highlight. This is physically based ocean reflection.

```glsl
vec3 viewDir = normalize(uCameraPosition - vWorldPos);
vec3 reflDir = reflect(-uSunDirection, vNormal);
float glint = pow(max(0.0, dot(reflDir, viewDir)), 200.0);
// 200 = very sharp highlight (ocean is very smooth)
vec3 glintColor = vec3(1.0, 0.98, 0.9) * glint * 3.0;
```

Add wave normal perturbation at low altitude (below 5,000 km):
Use noise to perturb the ocean normal slightly.
Creates ripple effect on specular. Scale with uAltitude.

Whitecap noise at wind-swept regions:
High-frequency noise at mid-latitudes (30-60° both hemispheres)
to simulate whitecap coverage. Color: white, low opacity.

Land mask: apply ocean effects only where base texture is blue
(ocean). Sample the base diffuse texture and check if blue channel
dominates. This avoids ocean glint appearing over continents.

### WORKER 3 SPEC — earth.js System Config

File owned: src/data/systems/earth.js

Write the complete Earth + Moon system config following exactly
the same schema as jupiter.js. Read jupiter.js for reference on
schema structure.

```javascript
// src/data/systems/earth.js
export default {
  name: 'Earth',
  slug: 'earth',
  
  star: {
    // Sun direction computed from ephemeris — placeholder
    distanceAU: 1.0,
    luminosity: 1.0,
    color: 0xFFF5E0,
  },
  
  primary: {
    name: 'Earth',
    slug: 'earth',
    type: 'terrestrial',
    radiusKm: 6371,
    massKg: 5.972e24,
    rotationPeriodHours: 23.9345,
    axialTiltDeg: 23.44,
    // Oblate: equatorial 6378, polar 6357
    oblateness: 0.99664,  // polar/equatorial radius ratio
    
    textures: {
      diffuse: 'earth/diffuse.jpg',     // Blue Marble 8K
      specular: 'earth/specular.jpg',   // ocean vs land
      normal: 'earth/normal.jpg',       // elevation normal map
      clouds: 'earth/clouds.jpg',       // cloud layer (optional)
    },
    
    atmosphere: {
      enabled: true,
      shader: 'earth-atmosphere',
      color: [0.2, 0.5, 1.0],
      thickness: 0.025,
      rayleigh: true,
    },
    
    ocean: {
      enabled: true,
      shader: 'earth-ocean',
      specularGlint: true,
    },
    
    clouds: {
      enabled: true,
      shader: 'earth-clouds',
      rotationMultiplier: 1.3,
    },
    
    lights: {
      enabled: true,
      shader: 'earth-lights',
    },
    
    aurora: {
      enabled: true,
      shader: 'earth-aurora',
      northPole: { lat: 82, lon: -111 },
      southPole: { lat: -74, lon: 127 },
    },
    
    detailFloor: {
      softKm: 2000,
      hardKm: 200,  // ISS altitude is 408 km — generous floor
    },
    
    notableFeatures: [
      'Only known planet with life',
      'Surface 71% ocean — the "Blue Marble"',
      'Strongest magnetic field of any terrestrial planet',
      'One large moon stabilizes axial tilt',
    ],
    
    moreInfo: {
      iss: 'International Space Station orbits at 408 km altitude',
      atmosphere: '78% nitrogen, 21% oxygen, 1% argon',
      moon: 'The Moon is unusually large relative to Earth',
    },
    
    // Surface feature labels (appear below 500 km altitude)
    surfaceFeatures: [
      { name: 'Amazon Basin', lat: -3.4, lon: -60.0 },
      { name: 'Sahara Desert', lat: 23.0, lon: 13.0 },
      { name: 'Himalayas', lat: 28.0, lon: 84.0 },
      { name: 'Great Barrier Reef', lat: -18.3, lon: 147.7 },
      { name: 'Grand Canyon', lat: 36.1, lon: -112.1 },
      { name: 'Antarctica', lat: -90.0, lon: 0.0 },
    ],
  },
  
  bodies: [
    {
      name: 'Moon',
      slug: 'moon',
      type: 'rocky_moon',
      radiusKm: 1737.4,
      massKg: 7.342e22,
      
      // Orbital elements (mean values)
      semiMajorAxisKm: 384400,
      orbitalPeriodDays: 27.321,
      inclination: 5.145,  // degrees to ecliptic
      eccentricity: 0.0549,
      tidallyLocked: true,
      rotationPeriodHours: 655.7,  // = orbital period
      
      textures: {
        diffuse: 'moon/diffuse.jpg',   // NASA CGI Moon Kit 8K
        normal: 'moon/normal.jpg',
        displacement: 'moon/displacement.jpg',
      },
      
      surfaceGravity: 1.62,  // m/s²
      surfaceTempRange: [-173, 127],  // °C
      
      // Earthshine: Earth illuminates Moon's night side
      earthshine: true,
      
      detailFloor: {
        softKm: 50,
        hardKm: 1,  // LRO data supports 1 km zoom floor
      },
      
      geometrySegments: 64,
      
      notableFeatures: [
        'Only extraterrestrial body visited by humans (1969-1972)',
        'Tidally locked — same face always toward Earth',
        'Surface unchanged for ~3 billion years in many regions',
        '6 Apollo landing sites with equipment still present',
      ],
      
      moreInfo: {
        formation: 'Formed from debris after Mars-sized body hit Earth',
        tides: 'Moon causes Earth\'s ocean tides',
        stabilizer: 'Stabilizes Earth\'s axial tilt preventing climate chaos',
      },
      
      // Surface feature labels
      surfaceFeatures: [
        { name: 'Sea of Tranquility', lat: 8.5, lon: 31.4 },
        { name: 'Tycho Crater', lat: -43.3, lon: -11.2 },
        { name: 'Copernicus Crater', lat: 9.7, lon: -20.1 },
        { name: 'Mare Imbrium', lat: 32.8, lon: -15.6 },
        { name: 'South Pole', lat: -90.0, lon: 0.0 },
      ],
      
      // Apollo landing sites (appear below 50 km altitude)
      apolloSites: [
        {
          name: 'Apollo 11',
          lat: 0.67, lon: 23.47,
          date: 'July 20, 1969',
          crew: 'Armstrong, Aldrin, Collins',
          achievement: 'First humans on the Moon',
        },
        {
          name: 'Apollo 12',
          lat: -3.01, lon: -23.42,
          date: 'November 19, 1969',
          crew: 'Conrad, Bean, Gordon',
          achievement: 'Precision landing near Surveyor 3',
        },
        {
          name: 'Apollo 14',
          lat: -3.65, lon: -17.47,
          date: 'February 5, 1971',
          crew: 'Shepard, Mitchell, Roosa',
          achievement: 'Oldest rocks returned, Fra Mauro highlands',
        },
        {
          name: 'Apollo 15',
          lat: 26.13, lon: 3.63,
          date: 'July 30, 1971',
          crew: 'Scott, Irwin, Worden',
          achievement: 'First lunar rover, Hadley-Apennine',
        },
        {
          name: 'Apollo 16',
          lat: -8.97, lon: 15.50,
          date: 'April 21, 1972',
          crew: 'Young, Duke, Mattingly',
          achievement: 'Highlands sample return, Descartes',
        },
        {
          name: 'Apollo 17',
          lat: 20.19, lon: 30.77,
          date: 'December 11, 1972',
          crew: 'Cernan, Schmitt, Evans',
          achievement: 'Last humans on Moon, Taurus-Littrow',
        },
      ],
    },
  ],
  
  // Curated presets for the Earth system
  curatedPresets: [
    {
      id: 'iss-orbit',
      name: '🛸 ISS Orbit View',
      description: 'Experience Earth from ISS altitude (408 km)',
      camera: {
        mode: 'insertion',
        target: 'earth',
        altitudeKm: 408,
        incDeg: 51.6,  // ISS actual inclination
        phase: 0,
        locked: false,
      },
      sim: { timeMultiplier: 1 },
    },
    {
      id: 'earthrise',
      name: '🌍 Earthrise',
      description: 'See Earth rise above the lunar horizon',
      camera: {
        mode: 'insertion',
        target: 'moon',
        altitudeKm: 200,
        incDeg: 0,
        phase: Math.PI * 0.75,
        locked: false,
      },
      sim: { timeMultiplier: 1 },
    },
    {
      id: 'apollo11',
      name: '🚀 Apollo 11 Site',
      description: 'Fly over Tranquility Base — first Moon landing',
      camera: {
        mode: 'insertion',
        target: 'moon',
        altitudeKm: 50,
        incDeg: 0,
        phase: 0,  // position above Apollo 11 coordinates
        locked: false,
      },
      sim: { timeMultiplier: 1 },
    },
    {
      id: 'city-lights',
      name: '🌃 City Lights at Night',
      description: 'Watch city lights emerge on Earth\'s night side',
      camera: {
        mode: 'insertion',
        target: 'earth',
        altitudeKm: 20000,
        incDeg: 0,
        phase: Math.PI,  // night side
        locked: false,
      },
      sim: { timeMultiplier: 10 },
    },
    {
      id: 'aurora-view',
      name: '💚 Aurora from Orbit',
      description: 'Polar orbit to see aurora borealis from above',
      camera: {
        mode: 'insertion',
        target: 'earth',
        altitudeKm: 2000,
        incDeg: 85,  // near polar
        phase: 0,
        locked: false,
      },
      sim: { timeMultiplier: 100 },
    },
  ],
  
  // Minimum orbit insertion altitude (above surface)
  minInsertionAltKm: 200,
  
  // Signal delay to Earth (near zero — we ARE at Earth)
  signalDelayLabel: 'At Earth',
};
```

Also fetch and note texture sources:
Earth textures (add URLs as comments in earth.js):
  Blue Marble: https://visibleearth.nasa.gov/images/74117
  Normal map: derived from SRTM elevation data
  Specular map: land vs ocean mask
  Cloud layer: https://visibleearth.nasa.gov/images/57747

Moon textures:
  NASA CGI Moon Kit: https://svs.gsfc.nasa.gov/4720
  (includes 8K color, normal, displacement maps)

### WORKER 4 SPEC — Moon Detail Shader

File owned: src/engine/shaders/moon-detail.glsl

Read-only reference: src/engine/glsl/simplex.glsl

Write moon-detail.glsl following the same pattern as the Galilean
moon detail shaders in detailShaders.js.

Uniforms: uTime, uAltitude, uDetailBlend
Activation: below 10,000 km
uDetailBlend = smoothstep(10000.0, 500.0, uAltitude)

Base luminance detection: sample existing texture to determine
terrain type (mare vs highland) same as Ganymede shader.

**MARE terrain (dark, luminance < 0.3):**
Ancient volcanic plains, nearly flat.
- Very smooth, subtle undulation noise (low frequency, low amplitude)
- Dark basalt color with slight blue-grey tint (#1A1A2A)
- Occasional small fresh craters with bright white ejecta
- Wrinkle ridges: linear features from ancient lava cooling
  (slightly brighter parallel ridges, subtle normal perturbation)

**HIGHLAND terrain (bright, luminance > 0.5):**
Ancient heavily cratered terrain, 4+ billion years old.
Apply same multi-scale cratering as Callisto shader but adapted:
- 4 octaves of circular crater features
- More size variation than Callisto (Moon has larger range)
- Bright fresh craters with distinctive ray systems
- Crater rays: Tycho (lat -43.3, lon -11.2) — rays extend 1500 km
  Copernicus (lat 9.7, lon -20.1) — rays extend 800 km
  Implement as radial noise pattern from these coordinates, white,
  fading with distance following 1/r² falloff

**At very low altitude (below 200 km):**
- Opposition surge: halo of increased brightness when sun is
  directly behind camera. Retroreflective effect from regolith.
  dot(viewDir, sunDir) ≈ 1.0 → brightness increase
- Regolith texture: highest frequency noise suggesting
  glass-bead microstructure of lunar soil

**Terminator drama (near day/night boundary):**
When sunDot is near 0 (terminator zone):
- Amplify shadow casting: craters near terminator cast
  dramatically long shadow fingers
- Even small craters become visually prominent
- This is the most dramatic visual feature of the Moon from orbit

**Earthshine (visible on night side):**
When camera can see the Moon's night side, add very subtle
blue-white illumination (#9AAABB at 8% opacity) representing
Earth's reflected light. Earthshine does NOT require Earth to be
in frame — it's a global illumination effect.

**Apollo site markers (below 50 km altitude):**
Near each Apollo site coordinate (from earth.js config):
- Subtle bright spot on the surface
- Small label: "Apollo 11 ↓" etc.
- The actual LM descent stage is still there — LRO photographed it
  Implement as a tiny bright point at each coordinate

Export: { moonDetailUniforms, moonDetailShader }

---

## PHASE 3 — ORCHESTRATOR: INTEGRATION

After all 4 workers complete and commit their branches:

### 3a — Merge worker branches
```bash
git checkout main
git merge worker/earth-clouds --no-ff
git merge worker/earth-atmosphere --no-ff
git merge worker/earth-config --no-ff
git merge worker/moon-detail --no-ff
git push origin main
```
Resolve any conflicts before each merge.
Workers own separate files so conflicts should be minimal.

### 3b — Wire Earth shaders into renderer
In renderer.js, add Earth-specific material building:

```javascript
function buildEarthMaterial(cfg, textures) {
  // Multi-layer material: base texture + cloud overlay
  // + atmosphere sphere + ocean glint
  const baseMat = new THREE.MeshStandardMaterial({
    map: textures.diffuse,
    normalMap: textures.normal,
    roughnessMap: textures.specular,
    roughness: 0.8,
    metalness: 0.0,
  });
  
  // Apply cloud shader on top
  // Apply atmosphere sphere (BackSide sphere, larger radius)
  // Apply aurora sphere (polar regions only)
  // Wire all uniforms: uSunDirection, uTime, uAltitude, uDetailBlend
}

function buildMoonMaterial(cfg, textures) {
  // Standard material + moon-detail procedural shader
  // Wire uniforms same pattern as Galilean moons
}
```

### 3c — Wire Apollo sites
In renderer.js, when building the Moon mesh:
Read earth.js cfg.bodies[0].apolloSites array.
For each site:
  Convert lat/lon to 3D position (same latLonToLocal function)
  Create a small bright point marker (sprite or mesh)
  Parent to Moon mesh (so it rotates with the Moon)
  Show label below 50 km altitude

### 3d — Wire ISS Mode (optional, implement if time allows)
```javascript
async function updateISSPosition() {
  try {
    const res = await fetch(
      'http://api.open-notify.org/iss-now.json'
    );
    const data = await res.json();
    const lat = data.iss_position.latitude;
    const lon = data.iss_position.longitude;
    // Position camera at ISS altitude 408 km above this lat/lon
    cameraCtl.setISSPosition(lat, lon, 408);
  } catch(e) {
    console.warn('ISS position unavailable:', e);
  }
}
// Update every 5 seconds when ISS Mode is active
```
Add "🛸 ISS Mode" button in Earth's Orbit Insertion panel.
When active: camera follows real ISS position in real time.
When unavailable: show "ISS position offline" toast.

### 3e — Download and add textures
Manually download and place:
  public/textures/earth/diffuse.jpg   (Blue Marble 8K)
  public/textures/earth/normal.jpg    (elevation normal map)
  public/textures/earth/specular.jpg  (land/ocean mask)
  public/textures/moon/diffuse.jpg    (NASA CGI Moon Kit 8K)
  public/textures/moon/normal.jpg
  public/textures/moon/displacement.jpg

If textures are not yet downloaded, create placeholder gray
textures so the system renders (even without textures) and the
structural code can be tested.
Note texture sources in a comment in earth.js.

### 3f — Test Earth system end-to-end
Switch to Earth system via NAV panel.
Verify:
  [ ] Loading screen shows "Earth System"
  [ ] Earth renders with texture and atmosphere
  [ ] Moon orbits Earth correctly
  [ ] Click Moon in NAV panel → navigates to Moon
  [ ] Orbit Insertion on Earth → correct altitude and inclination
  [ ] Orbit Insertion on Moon → Earthrise visible
  [ ] Cloud shader animates slowly
  [ ] City lights visible on night side
  [ ] Aurora visible from polar orbit
  [ ] Apollo site markers visible below 50 km
  [ ] Date picker affects moon position
  [ ] Switch back to Jupiter → Jupiter system correct
  [ ] All existing Jupiter features still work

### 3g — Final build and deploy
```bash
npm run build
# Verify dist has earth.js as its own lazy chunk
npm run preview
# Full regression: all Earth features + all existing Jupiter tests
npx wrangler deploy
```

Verify live URL:
  - NAV panel shows Earth as clickable (not Coming Soon)
  - Earth system loads when clicked
  - Jupiter system still works

---

## VERSION AND PROJECT LOG

Bump package.json to "5.0.0"

Update PROJECT_LOG.md:
  - Add v5 to Version History with all commit hashes
  - Mark Earth+Moon spec items as implemented
  - Add any new bugs discovered
  - Note texture URLs still needed if not downloaded

Commit: `docs: v5 complete — PROJECT_LOG.md updated`
Push: `git push origin main`

---

## PRIORITY ORDER IF TIME RUNS OUT

1. Phase 1 shared infrastructure (must complete before workers)
2. Worker 3 (earth.js config) — system won't load without it
3. Worker 2 (atmosphere shader) — most visually important
4. Workers 1 + 4 (clouds/lights/aurora + moon detail) — parallel
5. Phase 3 integration — wiring and testing
6. ISS Mode — optional, implement only if time allows

The Earth system must render something (even gray spheres) before
deploying. Don't deploy a broken system.

---

## STYLE GUIDE

Montserrat headings | Lato body text
Primary Blue: #0077CC | Light Blue: #66B2FF
White: #FFFFFF | Light Gray: #D9D9D9
Dark Gray: #4D4D4D 85% opacity | Space Black: #050510
