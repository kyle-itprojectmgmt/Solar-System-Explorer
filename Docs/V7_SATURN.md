# Solar System Explorer — V7 Session Prompt
# Saturn System with Security + Shader Convention
# Parallel Worker Orchestration
# Save to Docs/V7_SATURN.md

---

## HOW TO START

```bash
cd C:\dev\Solar-System-Explorer
git pull origin main
git status   ← must show clean working tree
claude --fable
```

Say: "Read .claude/instructions.md, then PROJECT_LOG.md, then
Docs/V7_SATURN.md. Follow the orchestration model exactly.
Commit and push after every phase."

---

## ORCHESTRATION MODEL

You are the orchestrator. Use parallel Haiku-tier workers for
isolated implementational tasks. Follow this exact sequence:

PHASE 1 — Orchestrator: Security + Shader Convention + Infrastructure
PHASE 2 — Spawn 4 workers in parallel
PHASE 3 — Orchestrator: Integration, wiring, testing, deploy

WORKER FILE OWNERSHIP — strictly enforced:
  Worker 1: src/engine/shaders/saturn-clouds.glsl
            src/engine/shaders/saturn-atmosphere.glsl
  Worker 2: src/engine/shaders/saturn-rings.glsl
            src/engine/shaders/saturn-ring-particles.glsl
  Worker 3: src/engine/shaders/titan.glsl
            src/engine/shaders/enceladus.glsl
            src/engine/shaders/iapetus.glsl
  Worker 4: src/data/systems/saturn.js (complete config)

Workers must NOT touch: main.js, renderer.js, camera.js,
physics.js, ui.js, vite.config.js, package.json, wrangler.toml,
index.html, src/engine/glsl/simplex.glsl,
src/engine/glsl/surface-base.glsl (orchestrator owns this),
PROJECT_LOG.md, any existing planet files

Orchestrator owns: all security files, surface-base.glsl,
renderer.js wiring, ui.js changes, integration, testing,
final deployment, PROJECT_LOG.md update.

---

## CONTEXT

v6.0.2 is live with Jupiter, Earth, Mars. This session adds:
1. Security hardening (OWASP-aligned, all planets)
2. Unified shader convention (additive, smoke test existing planets)
3. Saturn system — the most visually complex in the simulator
4. Telephoto/FOV zoom feature
5. Surface mode permanently removed

Version bump to 7.0.0.

---

## TESTING STRATEGY — READ BEFORE CODING

**Full regression:** Saturn (all new suites)
**Smoke test:** Jupiter, Earth, Mars (shader convention is additive —
  verify no visual change, no console errors, terminator still correct)
**Feature-specific:** FOV/telephoto, ring particles, CSP headers
**Manual validation focus:** Saturn only

After every Phase 1 commit, run the full existing suite to confirm
no regression before spawning workers. Workers should never break
existing planets.

---

## PHASE 1 — ORCHESTRATOR ONLY

Build these in order. Commit and push after each step.
Do NOT spawn workers until all Phase 1 steps are complete.

### 1a — Security Hardening

**wrangler.toml — add security headers for ALL routes:**
```toml
[[headers]]
  for = "/*"
  [headers.values]
    Content-Security-Policy = "default-src 'self'; script-src 'self'; style-src 'self' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; img-src 'self' data: blob:; connect-src 'self' https://api.open-notify.org https://www.google-analytics.com; frame-src https://open.spotify.com https://www.youtube-nocookie.com; worker-src 'none'; object-src 'none'; base-uri 'self'; form-action 'self'"
    X-Frame-Options = "SAMEORIGIN"
    X-Content-Type-Options = "nosniff"
    Referrer-Policy = "strict-origin-when-cross-origin"
    Permissions-Policy = "camera=(), microphone=(), geolocation=(), payment=(), usb=(), bluetooth=()"
    Cross-Origin-Opener-Policy = "same-origin"
    Cross-Origin-Resource-Policy = "same-origin"
```

Note: Use youtube-nocookie.com (not youtube.com) — privacy-enhanced
YouTube embed domain, better for GDPR compliance.

**/.well-known/security.txt:**
Create public/.well-known/security.txt:
```
Contact: kyle@itprojectmgmt.com
Expires: 2027-07-12T00:00:00Z
Preferred-Languages: en
Canonical: https://solar-system-explorer.kyle-d06.workers.dev/.well-known/security.txt
```

**iFrame URL sanitization in ui.js:**
The Spotify and YouTube URL inputs must validate before setting
iFrame src — prevents javascript: protocol injection:
```javascript
function sanitizeEmbedUrl(input, allowedDomains) {
  try {
    const url = new URL(input);
    if (!['https:', 'http:'].includes(url.protocol)) return null;
    const allowed = allowedDomains.some(d =>
      url.hostname === d || url.hostname.endsWith('.' + d));
    if (!allowed) return null;
    return url.href;
  } catch { return null; }
}
// Spotify: allowedDomains = ['spotify.com']
// YouTube: allowedDomains = ['youtube.com', 'youtube-nocookie.com']
// Apply before setting any iFrame src attribute
```

**npm audit:**
Run `npm audit` — fix any high or critical severity findings.
Log any unfixable findings with justification in PROJECT_LOG.md.

**Verify security:**
After deploy, run Mozilla Observatory scan at
observatory.mozilla.org against the live URL.
Target: A or A+ grade.
Log the score in PROJECT_LOG.md.
Confirm all three existing systems still load with zero console
errors after CSP is applied — CSP violations appear in the console.

Commit: `security: CSP headers, security.txt, iFrame sanitization`

### 1b — Unified Shader Convention

Create src/engine/glsl/surface-base.glsl:
```glsl
// surface-base.glsl
// Standard uniforms passed to ALL surface detail shaders.
// Orchestrator computes these once per body per frame in renderer.js
// and passes them via material.uniforms. Shaders use as needed.
//
// uSunDot:    dot(surfaceNormal, sunDirection) — pre-computed
// uDayFade:   smoothstep terminator blend — per-body config values
// uGrazeFade: high-frequency detail fade at low sun elevation
//             prevents grain/crater sparkle at grazing angles
//
// Helper functions:
float sse_dayFade(float sunDot, float soft0, float soft1) {
  return smoothstep(soft0, soft1, sunDot);
}
float sse_grazeFade(float sunDot, float graze0, float graze1) {
  return smoothstep(graze0, graze1, sunDot);
}
float sse_detailBlend(float altitude, float softKm, float hardKm) {
  return smoothstep(softKm, hardKm, altitude);
}
```

**Add to renderer.js — compute and pass standard uniforms:**
For every body material, after computing sun direction, add:
```javascript
// Standard surface uniforms — passed to all surface shaders
const sunDot = /* computed per-fragment in shader from these: */
material.uniforms.uSunDirection = { value: sunDir };
// Per-body fade config from body.shaderParams:
material.uniforms.uDayFadeSoft0 = { value: cfg.shaderParams?.dayFadeSoft0 ?? -0.08 };
material.uniforms.uDayFadeSoft1 = { value: cfg.shaderParams?.dayFadeSoft1 ?? 0.15 };
material.uniforms.uGrazeFade0   = { value: cfg.shaderParams?.grazeFade0   ?? 0.20 };
material.uniforms.uGrazeFade1   = { value: cfg.shaderParams?.grazeFade1   ?? 0.55 };
```

**Update existing planet configs with shaderParams:**

In jupiter.js primary:
```javascript
shaderParams: {
  dayFadeSoft0: -0.12, dayFadeSoft1: 0.10,  // gas giant, no surface
  grazeFade0: 0.15,    grazeFade1: 0.50,
}
```

In earth.js primary (Earth):
```javascript
shaderParams: {
  dayFadeSoft0: -0.30, dayFadeSoft1: 0.10,  // wide — atmosphere
  grazeFade0: 0.10,    grazeFade1: 0.45,
}
```

In mars.js primary:
```javascript
shaderParams: {
  dayFadeSoft0: -0.08, dayFadeSoft1: 0.15,  // sharp — thin atmosphere
  grazeFade0: 0.20,    grazeFade1: 0.55,
}
```

**Update existing shaders to USE the new uniforms:**
In detailShaders.js (Jupiter/Moon/Galilean moon shaders):
  Replace any local `dot(vNormal, uSunDirection)` with
  the provided uniform value. Output must be IDENTICAL.

In earth-clouds.glsl, mars-surface.glsl:
  Replace local sunDot calculations with the uniform.
  dayFade/grazeFade values must match current behavior exactly.

This is purely a plumbing change — zero visual output change.

**Smoke test after this change:**
```bash
npm run build && npm run preview
```
Open all three systems. Verify:
  [ ] Jupiter terminator unchanged
  [ ] Earth day/night terminator unchanged
  [ ] Mars night side still dark (Bug #55 fix preserved)
  [ ] No console errors on any system
Run existing regression suites — all must pass before proceeding.

Commit: `refactor: unified shader convention — uDayFade uGrazeFade
across all surface shaders (additive, zero visual change)`

### 1c — Remove Surface Mode Permanently

Surface mode was hidden in v4d. Remove it completely:

In camera.js:
  Delete _poseSurface() method entirely.
  Remove 'surface' from mode handling switch/cases.

In ui.js:
  Surface mode row already hidden from CAM panel — confirm
  it's fully removed, not just display:none.
  Remove S key binding.
  Remove any surface-mode-specific UI code.

In instructions.md:
  Remove Surface mode from camera modes table.
  Remove any surface mode references from Known Gotchas.

Update PROJECT_LOG.md camera modes table — remove Surface row.
Note: _poseSurface longitude mirror bug (Bug #37) is now moot —
  close it as "removed with surface mode".

Commit: `feat: remove surface mode permanently — code and UI cleaned`

### 1d — Remove Historical Epoch Defaults

All systems must open in LIVE mode at current UTC.
No system should default to a historical date.

Audit every system config and system-switching code:
  jupiter.js: Remove any reference to 1979-03-05 as a default
  earth.js: Confirm no 1969 default (Apollo 11 only in preset)
  mars.js: Remove any reference to 1976-07-20 as a default
  main.js / switchSystem(): Confirm LIVE=true is applied on
    every system switch, not just first load

Curated presets (Voyager 1979, Apollo 11, Viking 1) are KEPT —
they are intentional named historical moments, not defaults.

Loading screen facts: remove any fact that implies a specific
historical starting date ("Starting at Voyager 1 flyby..." etc).

Verify: switch to each system fresh. HUD shows current UTC.
LIVE indicator is active (red dot pulsing).

Commit: `fix: all systems default to LIVE current UTC —
historical epoch defaults removed`

### 1e — saturn.js skeleton and texture acquisition

Create src/data/systems/saturn.js skeleton (Worker 4 fills it):
```javascript
export default {
  name: 'Saturn', slug: 'saturn',
  star: { distanceAU: 9.537, luminosity: 0.011, color: 0xFFEEDD },
  primary: { name: 'Saturn', slug: 'saturn',
             radiusKm: 60268, /* Worker 4 fills rest */ },
  bodies: [], // Worker 4 adds all 9 moons
};
```

**Texture acquisition — attempt downloads:**

Saturn:
  Solar System Scope 8K: solarsystemscope.com/textures
  (saturn CC BY 4.0 — cloud bands, pale gold/cream palette)
  public/textures/saturn/diffuse.jpg

Saturn ring texture (critical — the most important asset):
  NASA Cassini ring radial profile — public domain
  Best source: https://bjj.is/3d/planetary-maps (Björn Jónsson)
  OR: solarsystemscope.com/textures (saturn ring alpha map)
  This is a 1D or 2D texture showing ring opacity/color vs radius.
  public/textures/saturn/rings.png (must include alpha channel)

Titan: solarsystemscope.com/textures or Björn Jónsson
  public/textures/titan/diffuse.jpg (orange haze)

Enceladus, Iapetus, Mimas, Tethys, Dione, Rhea:
  NASA/JPL public domain Cassini imagery
  Björn Jónsson planetary maps: bjj.is
  1K-2K sufficient for most. 4K for Iapetus (two-tone feature).

Hyperion, Phoebe:
  NASA/JPL public domain — irregular shapes
  1K textures sufficient

If any download fails: create rust-colored placeholder, note URL
in saturn.js comments. Do not block on textures.

Commit: `feat: saturn.js skeleton + textures acquired`

### 1f — Saturn ephemeris calibration

Saturn sidereal day: 10.656 hours (10h 39m 22s)
Saturn orbital period: 10,759.22 days (29.46 years)
Saturn axial tilt: 26.73°
Saturn epoch rotation (IAU 2015): 38.90° at J2000

Add to saturn.js:
```javascript
rotationPeriodHours: 10.656,
rotationPhaseAtEpochDeg: 38.90,
axialTiltDeg: 26.73,
```

Add marscal-equivalent test for Saturn in tests/saturncal.mjs:
Verify subsolar point within acceptable error at known dates.
Saturn's rings have a dramatic seasonal tilt — the ring plane
inclination relative to Earth changes over Saturn's 29-year orbit.
At time of writing (2026), the rings are nearly edge-on as seen
from Earth (ring plane crossing ~2025). From the simulator this
means the rings appear thin from above but dramatic from the side.

Commit: `feat: Saturn ephemeris calibration + saturncal test`

### 1g — Commit all Phase 1, spawn workers

```bash
git add -A
git status  ← verify all source files staged
git commit -m "feat: V7 Phase 1 — security, shader convention,
  surface mode removed, epoch defaults removed, saturn skeleton"
git push origin main
git show HEAD --name-only  ← verify source files in commit
```

Run FULL existing regression suite before spawning workers.
All suites must be green. Fix any failures before proceeding.

**Only after green suite — spawn 4 workers in parallel.**

---

## PHASE 2 — PARALLEL WORKERS

### WORKER 1 SPEC — Saturn Cloud + Atmosphere Shaders

Files owned:
  src/engine/shaders/saturn-clouds.glsl
  src/engine/shaders/saturn-atmosphere.glsl

Read-only: src/engine/glsl/simplex.glsl,
           src/engine/glsl/surface-base.glsl

**saturn-clouds.glsl:**
Saturn's cloud bands are similar to Jupiter but with a distinct
palette — pale cream, muted gold, warm tan. Less contrast than
Jupiter, more pastel. The bands are real but softer.

Use the unified shader convention:
```glsl
// Receive standard uniforms from renderer:
uniform float uDayFadeSoft0;  // from shaderParams
uniform float uDayFadeSoft1;
uniform float uGrazeFade0;
uniform float uGrazeFade1;
uniform vec3 uSunDirection;

// Compute fades using surface-base helpers:
float sunDot = dot(normalize(vNormal), uSunDirection);
float dayFade = sse_dayFade(sunDot, uDayFadeSoft0, uDayFadeSoft1);
```

Saturn cloud palette:
  Equatorial zone:   pale cream-yellow #F5E8C0
  Belt regions:      warm tan #C8A878
  Temperate zones:   muted gold #D4B870
  Polar hexagon:     subtle blue-grey #8898AA (north pole only)
    (Saturn has a real hexagonal storm at its north pole —
     implement as a hexagonal banding pattern above 75°N)

Animation: cloud bands rotate slightly faster at equator
(differential rotation — same as Jupiter but less extreme).
Use uTime * 0.000012 for base drift.

Altitude-staged octaves (same pattern as Jupiter):
  > 30,000 km: 3 octaves
  > 8,000 km:  5 octaves
  > 2,000 km:  7 octaves
  else:        9 octaves

Normal perturbation from noise gradient (same as other bodies).

Night side fade using dayFade — gas giant so no surface but
the cloud layer should darken correctly at the terminator.

**saturn-atmosphere.glsl:**
Saturn's limb glow is similar to Jupiter — warm yellow-gold
atmospheric haze, slightly thinner than Jupiter's.

Same implementation pattern as Jupiter's atmosphere shader
but with Saturn's color palette:
  Limb color: warm gold #E8C860 fading to cream at terminator
  Opacity: 0.5 (slightly less than Jupiter)
  Fresnel power: 3.0

The ring shadow: from certain angles the rings cast a dark band
across Saturn's cloud tops. This is handled in Phase 3 by the
orchestrator (analytical shadow calculation) — the atmosphere
shader does not need to handle this.

Export: { saturnCloudsUniforms, saturnCloudsShader,
          saturnAtmosphereUniforms, saturnAtmosphereShader }

### WORKER 2 SPEC — Saturn Ring System Shaders

Files owned:
  src/engine/shaders/saturn-rings.glsl
  src/engine/shaders/saturn-ring-particles.glsl

Read-only: src/engine/glsl/simplex.glsl

**Ring system geometry:**
Saturn's rings extend from 7,000 km to 80,000 km above Saturn's
cloud tops. Key components from inner to outer:

| Ring | Inner radius | Outer radius | Character |
|------|-------------|--------------|-----------|
| D    | 66,900 km   | 74,510 km    | Faint, diffuse |
| C    | 74,510 km   | 92,000 km    | Translucent, grey |
| B    | 92,000 km   | 117,580 km   | Densest, brightest |
| Cassini Division | 117,580 | 122,170 | Dark gap |
| A    | 122,170 km  | 136,775 km   | Dense, structured |
| F    | 140,180 km  | 140,180 km   | Thin, kinked |

All rings are a flat disc geometry (THREE.RingGeometry) centered
on Saturn. The ring plane is perpendicular to Saturn's rotation
axis (tilted 26.73° from orbital plane).

**saturn-rings.glsl:**
The primary ring shader applied to the ring disc geometry.

Uniforms: uRingTexture (the 1D/2D Cassini opacity map),
          uSunDirection, uSaturnCenter, uCameraPosition,
          uTime

```glsl
// Ring radial position (0.0 = inner edge, 1.0 = outer edge)
float ringR = /* derived from vUv or vertex position */;

// Sample ring texture for opacity and color
vec4 ringTex = texture2D(uRingTexture, vec2(ringR, 0.5));
float opacity = ringTex.a;
vec3 ringColor = ringTex.rgb;

// If no ring texture loaded, procedural fallback:
// B ring: dense white-grey, C ring: translucent grey,
// Cassini Division: near-transparent, A ring: white-grey
if (opacity == 0.0) {
  // Procedural ring opacity by radius:
  float bRing = smoothstep(0.28, 0.32, ringR) *
                (1.0 - smoothstep(0.58, 0.62, ringR));
  float aRing = smoothstep(0.64, 0.68, ringR) *
                (1.0 - smoothstep(0.90, 0.94, ringR));
  float cRing = smoothstep(0.08, 0.12, ringR) *
                (1.0 - smoothstep(0.28, 0.30, ringR)) * 0.4;
  opacity = max(bRing * 0.9, max(aRing * 0.7, cRing));
  ringColor = vec3(0.88, 0.84, 0.78); // warm grey-white
}

// Forward scattering: rings are brighter when backlit
// (same principle as Jupiter's rings)
vec3 viewDir = normalize(uCameraPosition - vWorldPos);
float scatter = max(0.0, -dot(viewDir, uSunDirection));
float forwardScatter = pow(scatter, 3.0) * 0.6;
ringColor *= (1.0 + forwardScatter);

// Ring self-shadow: B ring casts shadow on C ring
// (simplified — full shadow calc done by orchestrator)

gl_FragColor = vec4(ringColor, opacity);
```

Ring rendering requirements:
- depthWrite: false (transparent geometry)
- side: THREE.DoubleSide (visible from above and below)
- transparent: true
- Render AFTER Saturn sphere (correct depth sort)
- The rings pass IN FRONT of Saturn on the near side and
  BEHIND Saturn on the far side — this requires correct
  render order, not shader logic

**saturn-ring-particles.glsl:**
Particle layer that activates only when camera is within
the ring plane at altitude < 5,000 km above ring midplane.

Particles are simple billboard sprites (PointsMaterial with
a circular sprite texture). Each particle is a chunk of
ice/rock — white to grey, slight size variation.

```javascript
// Particle generation (in renderer.js Phase 3):
// Generate ~50,000 particles distributed across ring radii
// weighted by ring density (B ring densest)
// Each particle: position in ring plane + small random Z offset
// (rings are thin but not infinitely thin — ~10m to 1km thick)
// Particle size: 2-8 pixels, scaled by distance
// Color: white #F8F8F8 to light grey #C8C8C8

// Visibility: only show when:
// abs(camera.position.y - ringPlane.y) < 5000 km AND
// camera is within outer ring radius
```

The particle shader:
```glsl
// Circular sprite
vec2 uv = gl_PointCoord - 0.5;
float r = length(uv);
if (r > 0.5) discard;
// Soft edge
float alpha = smoothstep(0.5, 0.3, r);
// Ice color with slight variation
vec3 iceColor = mix(vec3(0.85), vec3(1.0),
  fract(sin(vParticleId * 127.1) * 43758.5));
gl_FragColor = vec4(iceColor, alpha * 0.7);
```

Export: { saturnRingsUniforms, saturnRingsShader,
          ringParticlesGeometry, ringParticlesMaterial }

### WORKER 3 SPEC — Moon Shaders (Titan, Enceladus, Iapetus)

Files owned:
  src/engine/shaders/titan.glsl
  src/engine/shaders/enceladus.glsl
  src/engine/shaders/iapetus.glsl

Read-only: src/engine/glsl/simplex.glsl,
           src/engine/glsl/surface-base.glsl

**titan.glsl:**
Titan has a thick nitrogen atmosphere that completely hides
the surface. From orbit: an opaque orange sphere.

This is an ATMOSPHERE shader (BackSide sphere, larger radius),
not a surface shader. The base Titan mesh is hidden behind
the atmosphere shell.

```glsl
// Titan atmosphere: thick orange haze
// Rayleigh + Mie scattering produces the orange color
// (nitrogen + organic haze particles — "tholins")

float sunDot = dot(normalize(vNormal), uSunDirection);
float litFactor = smoothstep(-0.2, 0.3, sunDot);

// Deep orange atmosphere, brighter on lit limb
vec3 hazeColor = mix(
  vec3(0.55, 0.25, 0.05),  // deep brown-orange in shadow
  vec3(0.85, 0.50, 0.10),  // bright orange on lit limb
  litFactor
);

// Very thick haze — opacity much higher than Earth's atmosphere
float cosAngle = dot(normalize(vNormal),
                     normalize(uCameraPos - vPos));
float fresnel = 1.0 - abs(cosAngle);
float rim = pow(fresnel, 1.8);  // thicker falloff = broader glow

// The haze is so thick the disc itself appears orange
// (not just the limb) — add a surface-filling haze component
float discFill = (1.0 - fresnel) * 0.4 * litFactor;
float opacity = clamp(rim * 0.85 + discFill, 0.0, 1.0);

gl_FragColor = vec4(hazeColor * litFactor, opacity);
```

Also create a simple Titan surface material (barely visible
through the haze):
  Dark brown/orange #3A1A00 — the hydrocarbon lakes and plains
  Barely visible even at low altitude — just color context

**enceladus.glsl:**
Enceladus is bright white — the most reflective body in the
solar system (albedo 1.38 — reflects more light than hits it
due to its fresh ice surface).

Surface detail shader (same pattern as moon shaders):
- Bright white ice: #F8F8FF overall
- Tiger stripe fractures (south pole, lat < -60°):
  Blue-grey cracks #88AACC on bright white surface
  These are the active fractures that emit geysers
- Subtle cratering (ancient surface in north hemisphere)
- Young smooth plains (south hemisphere — geologically active)

Geyser plumes (south pole, same system as Io's plumes):
- Particle system at 4 locations along tiger stripes
- Height: 500 km into space
- Color: pure white ice particles
- Must be parented to Enceladus mesh (same fix as Io plumes)

Use unified shader convention for night fade.

**iapetus.glsl:**
Iapetus has extreme two-tone coloring — one hemisphere jet
black (dark as coal), the other brilliant white ice. The
boundary between them is dramatic.

Surface detection from base texture luminance:
DARK hemisphere (luminance < 0.2): Cassini Regio
  Deep dark brown-black #1A0A00
  Very subtle texture (dust deposits on ice)
  Almost no crater detail visible (too dark)

BRIGHT hemisphere (luminance > 0.6): bright ice
  White to cream #F5F0E8
  Heavy cratering (ancient terrain)
  Multi-scale crater detail

TRANSITION ZONE (0.2-0.6): gradient between the two
  Sharp-ish boundary (real Iapetus has a fairly clear edge)

The equatorial ridge (Iapetus's walnut shape):
  A mountain range 20 km tall running along the equator
  Implement as a band of elevated terrain normal perturbation
  at lat -5° to +5°, enhanced relief pointing outward

Use unified shader convention for night fade.

For Mimas, Tethys, Dione, Rhea, Hyperion, Phoebe:
  These use standard cratered-terrain shader similar to Moon/Callisto.
  Reuse the existing moon detail shader pattern from detailShaders.js
  adapted for each moon's color and terrain type.
  Mimas: grey, heavily cratered, giant Herschel crater
  (1/3 of diameter) — implement as a single large crater feature
  at lat 0°, lon 104°.
  Implement using the same craterProfile function but with
  min(c, 0) bowl-only (no rim rings — learned from Mars).

Export: { titanUniforms, titanShader,
          enceladusUniforms, enceladusShader,
          iapetusUniforms, iapetusShader }

### WORKER 4 SPEC — saturn.js Complete Config

File owned: src/data/systems/saturn.js

Complete the saturn.js config. Follow jupiter.js and mars.js
schema exactly. All 9 moons included — no placeholders.

```javascript
export default {
  name: 'Saturn', slug: 'saturn',

  star: {
    distanceAU: 9.537,
    luminosity: 0.011,  // 1/r² — Saturn gets 1.1% of Earth's sunlight
    color: 0xFFEEDD,    // slightly cooler/dimmer sun
  },

  primary: {
    name: 'Saturn', slug: 'saturn', type: 'gas_giant',
    radiusKm: 60268,         // equatorial
    massKg: 5.683e26,
    rotationPeriodHours: 10.656,
    axialTiltDeg: 26.73,
    oblateness: 0.9796,      // very oblate (polar/equatorial = 54,364/60,268)
    rotationPhaseAtEpochDeg: 38.90,

    textures: {
      diffuse: 'saturn/diffuse.jpg',
    },

    atmosphere: {
      enabled: true,
      shader: 'saturn-atmosphere',
      color: [0.85, 0.75, 0.50],
      thickness: 0.02,
    },

    rings: {
      enabled: true,
      shader: 'saturn-rings',
      particleShader: 'saturn-ring-particles',
      texture: 'saturn/rings.png',
      innerRadiusKm: 66900,    // D ring inner edge
      outerRadiusKm: 140180,   // F ring outer edge
      tiltDeg: 26.73,          // matches Saturn axial tilt
      components: [
        { name: 'D', inner: 66900,  outer: 74510,  opacity: 0.15 },
        { name: 'C', inner: 74510,  outer: 92000,  opacity: 0.40 },
        { name: 'B', inner: 92000,  outer: 117580, opacity: 0.95 },
        { name: 'Cassini', inner: 117580, outer: 122170, opacity: 0.02 },
        { name: 'A', inner: 122170, outer: 136775, opacity: 0.75 },
        { name: 'F', inner: 140180, outer: 140180, opacity: 0.30 },
      ],
    },

    shaderParams: {
      dayFadeSoft0: -0.12, dayFadeSoft1: 0.10,
      grazeFade0: 0.15,    grazeFade1: 0.50,
    },

    detailFloor: { softKm: 5000, hardKm: 500 },
    minInsertionAltKm: 50000,  // stay above the rings

    surfaceGravity: 10.44,
    surfaceTempRange: [-178, -178],  // cloud top temperature

    notableFeatures: [
      'Ring system spans 282,000 km but only ~10 meters thick',
      'Least dense planet — would float in water',
      'North pole has a permanent hexagonal storm',
      'Titan is the only moon with a thick atmosphere',
    ],

    moreInfo: {
      rings: 'Ring particles are water ice from 1cm to 10m across',
      hexagon: 'The north pole hexagon is wider than two Earths',
      density: 'Saturn\'s mean density is 0.687 g/cm³ — less than water',
    },

    surfaceFeatures: [
      { name: 'North Polar Hexagon', lat: 90, lon: 0 },
      { name: 'Great White Spot region', lat: 40, lon: 0 },
    ],
  },

  bodies: [
    // TIER 1 — 7 major moons
    {
      name: 'Titan', slug: 'titan', type: 'moon_with_atmosphere',
      radiusKm: 2574.7, massKg: 1.345e23,
      semiMajorAxisKm: 1221870, orbitalPeriodDays: 15.945,
      inclination: 0.33, eccentricity: 0.0288,
      tidallyLocked: true, rotationPeriodHours: 382.68,
      textures: { diffuse: 'titan/diffuse.jpg' },
      atmosphere: { enabled: true, shader: 'titan',
                    opaque: true, color: [0.85, 0.50, 0.10] },
      shaderParams: { dayFadeSoft0: -0.20, dayFadeSoft1: 0.20,
                      grazeFade0: 0.10, grazeFade1: 0.40 },
      detailFloor: { softKm: 500, hardKm: 100 },
      surfaceGravity: 1.352,
      notableFeatures: [
        'Only moon with a dense atmosphere (nitrogen, like Earth)',
        'Liquid methane lakes and rivers on the surface',
        'Organic haze makes the sky orange',
        'Huygens probe landed here in 2005',
      ],
    },
    {
      name: 'Enceladus', slug: 'enceladus', type: 'icy_moon',
      radiusKm: 252.1, massKg: 1.08e20,
      semiMajorAxisKm: 238020, orbitalPeriodDays: 1.370,
      inclination: 0.009, eccentricity: 0.0047,
      tidallyLocked: true, rotationPeriodHours: 32.88,
      textures: { diffuse: 'enceladus/diffuse.jpg' },
      geysers: { enabled: true, locations: [
        { lat: -82, lon: 0,   name: 'Baghdad Sulcus' },
        { lat: -80, lon: 90,  name: 'Damascus Sulcus' },
        { lat: -79, lon: 180, name: 'Cairo Sulcus' },
        { lat: -78, lon: 270, name: 'Alexandria Sulcus' },
      ]},
      shaderParams: { dayFadeSoft0: -0.05, dayFadeSoft1: 0.10,
                      grazeFade0: 0.20, grazeFade1: 0.55 },
      detailFloor: { softKm: 50, hardKm: 10 },
      surfaceGravity: 0.113,
      notableFeatures: [
        'Active geysers shoot ice 500 km into space',
        'Subsurface ocean — one of the best bets for life',
        'Most reflective body in the solar system',
        'Cassini flew through the geysers and detected organic compounds',
      ],
    },
    {
      name: 'Iapetus', slug: 'iapetus', type: 'icy_moon',
      radiusKm: 734.5, massKg: 1.806e21,
      semiMajorAxisKm: 3560820, orbitalPeriodDays: 79.321,
      inclination: 15.47, eccentricity: 0.0283,
      tidallyLocked: true, rotationPeriodHours: 1903.7,
      textures: { diffuse: 'iapetus/diffuse.jpg' },
      shaderParams: { dayFadeSoft0: -0.05, dayFadeSoft1: 0.10,
                      grazeFade0: 0.20, grazeFade1: 0.55 },
      detailFloor: { softKm: 200, hardKm: 50 },
      surfaceGravity: 0.223,
      notableFeatures: [
        'Half jet-black, half brilliant white — the "yin-yang moon"',
        '20 km tall equatorial mountain ridge (the "walnut shape")',
        'Dark hemisphere coated by infalling dust from outer moons',
        'Discovered by Giovanni Cassini in 1671',
      ],
    },
    {
      name: 'Mimas', slug: 'mimas', type: 'icy_moon',
      radiusKm: 198.2, massKg: 3.75e19,
      semiMajorAxisKm: 185520, orbitalPeriodDays: 0.942,
      inclination: 1.574, eccentricity: 0.0196,
      tidallyLocked: true, rotationPeriodHours: 22.62,
      textures: { diffuse: 'mimas/diffuse.jpg' },
      shaderParams: { dayFadeSoft0: -0.05, dayFadeSoft1: 0.10,
                      grazeFade0: 0.20, grazeFade1: 0.55 },
      detailFloor: { softKm: 50, hardKm: 10 },
      surfaceGravity: 0.064,
      herschelCrater: { lat: 0, lon: 104, radiusDeg: 18 },
      notableFeatures: [
        '"Death Star Moon" — Herschel crater is 1/3 its diameter',
        'Herschel impact nearly shattered Mimas',
        'Interior may hide a liquid water ocean despite its small size',
      ],
    },
    {
      name: 'Tethys', slug: 'tethys', type: 'icy_moon',
      radiusKm: 531.1, massKg: 6.175e20,
      semiMajorAxisKm: 294660, orbitalPeriodDays: 1.888,
      inclination: 1.091, eccentricity: 0.0001,
      tidallyLocked: true, rotationPeriodHours: 45.31,
      textures: { diffuse: 'tethys/diffuse.jpg' },
      shaderParams: { dayFadeSoft0: -0.05, dayFadeSoft1: 0.10,
                      grazeFade0: 0.20, grazeFade1: 0.55 },
      detailFloor: { softKm: 100, hardKm: 20 },
      surfaceGravity: 0.146,
      notableFeatures: [
        'Ithaca Chasma — canyon 2,000 km long, 3-5 km deep',
        'Nearly pure water ice — one of the brightest moons',
        'Odysseus crater is 2/5 the diameter of Tethys itself',
      ],
    },
    {
      name: 'Dione', slug: 'dione', type: 'icy_moon',
      radiusKm: 561.4, massKg: 1.096e21,
      semiMajorAxisKm: 377400, orbitalPeriodDays: 2.737,
      inclination: 0.028, eccentricity: 0.0022,
      tidallyLocked: true, rotationPeriodHours: 65.69,
      textures: { diffuse: 'dione/diffuse.jpg' },
      shaderParams: { dayFadeSoft0: -0.05, dayFadeSoft1: 0.10,
                      grazeFade0: 0.20, grazeFade1: 0.55 },
      detailFloor: { softKm: 100, hardKm: 20 },
      surfaceGravity: 0.232,
      notableFeatures: [
        'Bright ice cliffs on the trailing hemisphere',
        'Evidence of past geological activity',
        'Shares orbit with Helene and Polydeuces (Trojan moons)',
      ],
    },
    {
      name: 'Rhea', slug: 'rhea', type: 'icy_moon',
      radiusKm: 763.8, massKg: 2.307e21,
      semiMajorAxisKm: 527040, orbitalPeriodDays: 4.518,
      inclination: 0.331, eccentricity: 0.001,
      tidallyLocked: true, rotationPeriodHours: 108.4,
      textures: { diffuse: 'rhea/diffuse.jpg' },
      shaderParams: { dayFadeSoft0: -0.05, dayFadeSoft1: 0.10,
                      grazeFade0: 0.20, grazeFade1: 0.55 },
      detailFloor: { softKm: 200, hardKm: 50 },
      surfaceGravity: 0.264,
      notableFeatures: [
        'Saturn\'s second largest moon',
        'May have a tenuous ring system of its own',
        'Heavily cratered ancient surface',
      ],
    },
    // TIER 2 — 2 interesting moons
    {
      name: 'Hyperion', slug: 'hyperion', type: 'irregular_moon',
      radii: { x: 180, y: 133, z: 103 },  // irregular shape
      massKg: 5.619e18,
      semiMajorAxisKm: 1481010, orbitalPeriodDays: 21.277,
      inclination: 0.43, eccentricity: 0.123,
      tidallyLocked: false,  // chaotic tumbling rotation
      rotationPeriodHours: null,  // chaotic — unpredictable
      chaoticRotation: true,  // special physics flag
      textures: { diffuse: 'hyperion/diffuse.jpg' },
      shaderParams: { dayFadeSoft0: -0.05, dayFadeSoft1: 0.10,
                      grazeFade0: 0.20, grazeFade1: 0.55 },
      detailFloor: { softKm: 50, hardKm: 10 },
      geometrySegments: 32,
      surfaceGravity: 0.017,
      notableFeatures: [
        'Chaotic tumbling — rotation is completely unpredictable',
        'Sponge-like surface covered in deep pits',
        'Reddish color from organic compounds (tholins)',
        'One of the largest known irregular bodies in the solar system',
      ],
    },
    {
      name: 'Phoebe', slug: 'phoebe', type: 'irregular_moon',
      radiusKm: 106.5, massKg: 8.29e18,
      semiMajorAxisKm: 12955760, orbitalPeriodDays: 550.58,
      inclination: 175.2,  // retrograde — orbits backwards
      eccentricity: 0.163,
      tidallyLocked: false,
      rotationPeriodHours: 9.274,
      textures: { diffuse: 'phoebe/diffuse.jpg' },
      shaderParams: { dayFadeSoft0: -0.05, dayFadeSoft1: 0.10,
                      grazeFade0: 0.20, grazeFade1: 0.55 },
      detailFloor: { softKm: 30, hardKm: 5 },
      geometrySegments: 32,
      surfaceGravity: 0.045,
      notableFeatures: [
        'Orbits retrograde — a captured Kuiper Belt object',
        'Dark surface — one of the darkest objects in the solar system',
        'Cassini photographed it in 2004 during Saturn approach',
        'Source of the Phoebe ring — Saturn\'s largest ring',
      ],
    },
  ],

  curatedPresets: [
    { id: 'saturn-rings-above', name: '💍 Ring Plane View',
      system: 'saturn',
      description: 'See Saturn\'s rings from 30° above the ring plane',
      camera: { mode: 'insertion', target: 'saturn',
                altitudeKm: 150000, incDeg: 30, phase: 0 } },
    { id: 'saturn-rings-edge', name: '➖ Ring Edge-On',
      system: 'saturn',
      description: 'Saturn\'s rings razor-thin from the ring plane',
      camera: { mode: 'insertion', target: 'saturn',
                altitudeKm: 80000, incDeg: 0, phase: 0 } },
    { id: 'saturn-through-rings', name: '✨ Through the Rings',
      system: 'saturn',
      description: 'Fly through the ring particles at close range',
      camera: { mode: 'insertion', target: 'saturn',
                altitudeKm: 115000, incDeg: 0, phase: 0 } },
    { id: 'titan-view', name: '🟠 Titan Close Pass',
      system: 'saturn',
      description: 'Skim through Titan\'s orange atmosphere',
      camera: { mode: 'insertion', target: 'titan',
                altitudeKm: 500, incDeg: 20, phase: 0 } },
    { id: 'enceladus-geysers', name: '💨 Enceladus Geysers',
      system: 'saturn',
      description: 'Fly over the south pole geyser plumes',
      camera: { mode: 'insertion', target: 'enceladus',
                altitudeKm: 200, incDeg: -80, phase: 0 } },
    { id: 'iapetus-boundary', name: '⚫⚪ Iapetus Boundary',
      system: 'saturn',
      description: 'The dramatic dark-light boundary of Iapetus',
      camera: { mode: 'insertion', target: 'iapetus',
                altitudeKm: 1000, incDeg: 0, phase: 0 } },
    { id: 'mimas-deathstar', name: '💫 Death Star View',
      system: 'saturn',
      description: 'Face-on view of Mimas and the Herschel crater',
      camera: { mode: 'orbit', target: 'mimas',
                altitudeKm: 500 } },
  ],
};
```

---

## PHASE 3 — ORCHESTRATOR: INTEGRATION

### 3a — Merge workers and integrate shaders

Wire all Saturn shaders into renderer.js following the same
pattern as Earth and Mars. For each body, call the appropriate
material builder.

### 3b — Ring shadow system (critical visual feature)

Two shadow effects:

RINGS SHADOW ON SATURN:
The rings cast a curved shadow band across Saturn's cloud tops.
Implement analytically in the Saturn cloud shader:

```glsl
// In saturn-clouds.glsl, compute ring shadow:
// For each fragment, cast a ray from the fragment toward the sun.
// If the ray passes through the ring plane within the ring radii,
// the fragment is in shadow.
float ringPlaneDist = /* Saturn center to ring plane in world units */;
vec3 fragToSun = normalize(uSunDirection);
// Find where the ray crosses the ring plane (y = 0 in ring coords)
float t = /* parametric distance to ring plane intersection */;
if (t > 0.0) {
  vec3 ringIntersect = vWorldPos + fragToSun * t;
  float r = length(ringIntersect - uSaturnCenter) / KM_PER_UNIT;
  // Check if intersection is within ring span
  if (r > 66900.0 && r < 140180.0) {
    // Sample ring opacity at this radius
    float ringOp = sampleRingOpacity(r);
    // Darken Saturn surface proportionally
    cloudColor *= (1.0 - ringOp * 0.7);
  }
}
```

SATURN SHADOW ON RINGS:
Saturn casts a shadow across its rings on the anti-sun side.
In the ring shader, check if the ring fragment is behind Saturn:

```glsl
// Ring fragment in Saturn's shadow if it's on the anti-sun side
// and within Saturn's geometric shadow cone
vec3 fragToSun = normalize(uSunDirection);
vec3 fragToSaturn = normalize(uSaturnCenter - vWorldPos);
float behindSaturn = dot(fragToSaturn, fragToSun);
if (behindSaturn > 0.0) {
  // Check angular radius of Saturn from this fragment
  float satAngularRadius = asin(uSaturnRadius /
    length(uSaturnCenter - vWorldPos));
  float fragAngle = acos(behindSaturn);
  if (fragAngle < satAngularRadius) {
    ringColor *= 0.05; // deep shadow
  }
}
```

### 3c — Telephoto / FOV zoom (Backlog #12)

Add FOV control to the VIEW panel and bottom tray.

**FOV slider in VIEW panel:**
Under a new OPTICS section:
```
OPTICS
Field of View: 75°  [──●────────]
               5°          90°
```
Logarithmic slider: 5° to 90°. Default 75°.
Live update: `camera.fov = value; camera.updateProjectionMatrix()`
Save to localStorage 'sse-fov'.

**🔭 button in bottom tray:**
Quick toggle between 75° (normal) and 10° (telephoto).
Position: between 👁 and ☕ in the tray.
Tooltip: "Telephoto zoom — narrows field of view for distant objects.
Makes Earth fill the frame from lunar orbit."

**Update Earthrise preset:**
When the Earthrise preset fires, after positioning the camera:
```javascript
// Auto-set telephoto for dramatic Earth view:
camera.fov = 10;
camera.updateProjectionMatrix();
updateFovSlider(10); // sync the slider UI
```

**Update Saturn ring presets:**
"Through the Rings" preset sets FOV to 25° for a wider view
of the surrounding ring particles.

### 3d — Hyperion chaotic rotation physics

Hyperion has non-deterministic chaotic rotation — it tumbles
unpredictably. In physics.js, for bodies with chaoticRotation: true:

```javascript
// Instead of uniform rotation, apply Euler rotation
// with chaotic angular velocity that evolves over time
if (body.chaoticRotation) {
  // Seed chaos from body's orbital phase (deterministic but complex)
  const chaos = Math.sin(body.phase * 7.3) *
                Math.cos(body.phase * 3.1) *
                Math.sin(body.phase * 11.7);
  body.mesh.rotation.x += chaos * 0.001 * dt;
  body.mesh.rotation.y += 0.0007 * dt;
  body.mesh.rotation.z += chaos * 0.0013 * dt;
}
```

This produces a tumbling motion that looks irregular without
being truly random (deterministic from orbital position).

### 3e — Enceladus geyser plumes

Same particle system as Io's volcanic plumes but white ice.
Must be parented to Enceladus mesh (Io plume fix pattern).

Plume positions from saturn.js geysers array.
Height: 500 km. Color: pure white #FFFFFF.
4 active plumes at tiger stripe coordinates.

### 3f — Phoebe retrograde orbit

Phoebe's inclination of 175.2° means it orbits retrograde.
In the orbit integration, handle inclinations > 90° correctly:
  The orbit is prograde in the mathematical sense but the
  inclination means it appears retrograde from Saturn.
  Verify: Phoebe should appear to orbit opposite direction
  to all other Saturn moons when viewed from system overview.

### 3g — Security checklist (every planet build)

After deploying Saturn, verify:
  [ ] CSP headers active (check in browser DevTools → Network
      → response headers on any request)
  [ ] No CSP violations in console on any of the 4 systems
  [ ] Mozilla Observatory score A or A+ (run the scan)
  [ ] npm audit — zero high/critical findings
  [ ] security.txt accessible at /.well-known/security.txt
  [ ] iFrame sanitization: test pasting a javascript: URL
      into Spotify input — should be silently rejected

Log Observatory score and date in PROJECT_LOG.md.

### 3h — Full test suite

```bash
npm run build
npm run preview
```

**Saturn specific tests (new — tests/saturntest.mjs):**
  [ ] Saturn loads as 4th system from NAV panel
  [ ] Rings render with Cassini Division visible
  [ ] Ring shadow visible on Saturn cloud tops
  [ ] Saturn shadow visible on anti-sun rings
  [ ] All 9 moons orbit correctly
  [ ] Phoebe orbits retrograde (opposite to others)
  [ ] Hyperion tumbles (rotation.x/y/z all changing)
  [ ] Enceladus geysers visible from south pole
  [ ] Titan shows opaque orange atmosphere
  [ ] Iapetus shows two-tone dark/light hemispheres
  [ ] Mimas shows Herschel crater
  [ ] Ring particles visible below 5,000 km in ring plane
  [ ] FOV slider changes field of view live
  [ ] 🔭 button toggles 75°↔10°
  [ ] All 7 curated presets execute correctly
  [ ] Dust storm slider NOT shown for Saturn (Mars only)
  [ ] LIVE mode active by default (no historical epoch)

**Smoke test — existing planets:**
  [ ] Jupiter: loads, terminator correct, no console errors
  [ ] Earth: loads, city lights visible, LIVE mode active
  [ ] Mars: loads, dust storm slider present, no epoch default
  [ ] All existing regression suites green

**Security tests (new — tests/security.mjs):**
  [ ] CSP header present on index.html response
  [ ] X-Frame-Options header present
  [ ] X-Content-Type-Options header present
  [ ] security.txt returns 200
  [ ] Spotify input rejects javascript: URL
  [ ] YouTube input rejects data: URL

### 3i — Deploy

```bash
npx wrangler deploy
```

Verify live at solar-system-explorer.kyle-d06.workers.dev:
  Navigate to Saturn via NAV panel.
  Run Mozart Observatory scan.
  Log score in PROJECT_LOG.md.

---

## VERSION AND PROJECT LOG

Bump package.json to "7.0.0"

Update PROJECT_LOG.md:
  - Add v7 to Version History
  - Mark backlog #12 (telephoto) as resolved
  - Mark surface mode bug #37 as resolved (mode removed)
  - Mark epoch default bugs as resolved
  - Log security implementation and Observatory score
  - Add any new bugs discovered

Commit: `docs: v7 complete — Saturn live, PROJECT_LOG updated`
Push: `git push origin main`

---

## PRIORITY ORDER IF TIME RUNS OUT

1. Phase 1 security + shader convention (foundation)
2. Saturn.js config (Worker 4 — system won't load without it)
3. Saturn cloud + atmosphere (Worker 1 — visual core)
4. Ring shader (Worker 2 — the showpiece)
5. Moon shaders (Worker 3 — depth)
6. Phase 3 ring shadow system (critical visual)
7. Telephoto/FOV (quick win, high payoff)
8. Hyperion chaotic rotation (interesting but subtle)
9. Enceladus geysers (same as Io plumes pattern)
10. Security verification pass

Never deploy with broken existing systems. Smoke test
before every deploy.
