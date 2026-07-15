# Solar System Explorer — Project Log
# Living document. Updated by Claude Code at the end of every session.
# Human: Kyle Ewing | kyle@itprojectmgmt.com | itprojectmgmt.com

---

## Project Overview

A photorealistic, first-person 3D explorer of the solar system.
First release covers the Jupiter system. Architecture is designed
to scale to Saturn, the full solar system, and beyond.

**Live URL:** solar-system-explorer.kyle-d06.workers.dev
**Repository:** github.com/[USERNAME]/Solar-System-Explorer
**Hosting:** Cloudflare Pages (unlimited bandwidth, $5/mo plan)
**Texture Storage:** Cloudflare R2 (zero egress fees)
**Build:** Vite + Vanilla JavaScript + Three.js
**Deploy:** `npm run deploy` → `npx wrangler deploy` (Workers deployment, not Pages)
**Note:** Site is deployed as a Cloudflare Worker (workers.dev URL), not Cloudflare Pages.
Use `npx wrangler deploy` — NOT `wrangler pages publish` or `wrangler pages deploy`.

---

## Brand / Style Guide

Source: ITprojectMGMT.com (Kyle Ewing's professional site)
Apply consistently to ALL UI elements.

**Typography:**
- Headings / labels / mode names: Montserrat (Google Fonts)
- Body text / data / readouts: Lato (Google Fonts)

**Color Palette:**
- Primary Blue:       #0077CC — active states, borders, key actions
- Light Blue Accent:  #66B2FF — highlights, HUD readouts, hover states
- White:              #FFFFFF — primary text on dark backgrounds
- Light Gray:         #D9D9D9 — secondary text, dividers, inactive
- Dark Gray:          #4D4D4D — panel backgrounds at 85% opacity
- Space Black:        #050510 — scene background, deep space

**UI Aesthetic:**
Panels: Dark Gray #4D4D4D at 85% opacity, 1px #0077CC border at 30%
opacity, 8px border radius, minimal backdrop blur.
Overall feel: NASA mission control meets deep space. Professional,
minimal, awe-inspiring. Never cluttered.

---

## Architecture Decisions

### Data-Driven Engine
All planetary system data lives in config files, never in engine code.
- Active system: `/src/data/systems/jupiter.js`
- Saturn stub: `/src/data/systems/saturn.js` (empty template)
- Switch systems: change `SYSTEM_CONFIG` in `src/config.js` — one line
- Engine files in `/src/engine/` have zero Jupiter-specific logic
- A future developer can drop in `saturn.js` and it renders with no
  engine changes

### Git Commit Discipline — CRITICAL
Source code was lost across multiple sessions (v1 through v3b) because
Claude Code committed only documentation files, not source code.
ALL sessions lost — v1, v2, v3, v3b source never committed to git.
Recovery required full rebuild from prompt files.

Rule: after every feature, run git add -A, verify source files are
staged with git status, commit, then git push origin main immediately.
Verify with git show HEAD --name-only that .js/.glsl files appear.
If only .md files appear in the commit, source was not staged — fix it.
Registered via Cloudflare Registrar (at-cost, zero markup, native DNS
integration with Pages). Target domain: a *.co extension — final name
TBD. DNS connection to Cloudflare Pages is two clicks once registered.

### Hosting Stack Decision
Cloudflare Pages (unlimited bandwidth) + Cloudflare R2 (zero egress)
on existing $5/mo Workers paid plan. Total extra cost at 100,000
visitors: $0. Chose over GitHub Pages (100GB soft cap), Vercel
(100GB/mo free then expensive), Netlify (surprise overage billing).

### Multi-Agent / Cost Strategy
Orchestrator: Claude Sonnet/Opus for architecture, integration, review.
Workers: Claude Haiku for isolated implementational tasks (single shader,
config entry, documentation, UI copy). Worker file ownership must be
exclusive — no two workers touch the same file. Shared infrastructure
always built by orchestrator and committed before workers spawn.
Run /compact after each completed major feature to manage context.
Standing instructions in .claude/instructions.md (auto-read by Claude Code).

### Texture Architecture
- Development: loads from `/public/textures/{body-slug}/`
- Production: loads from Cloudflare R2 via `TEXTURE_BASE_URL` in
  `src/config.js` — one line change to switch environments
- R2 bucket: `solar-system-explorer-textures`
- Path pattern: `/textures/{body-slug}/diffuse.jpg`
- Currently JPEG (KTX2 compression planned — see Backlog)

### Renderer
- Currently: WebGL via Three.js (chosen for postprocessing compatibility)
- Planned: WebGPU upgrade when postprocessing library supports it
- Post-processing: bloom, lens flare, depth of field, film grain,
  vignette via `postprocessing` npm library

### Physics
- Galilean moons: N-body velocity-Verlet with mutual perturbations
- Inner moons (Metis, Adrastea, Amalthea, Thebe): Keplerian orbits
- Time controls: Pause / 1x / 10x / 100x / 1,000x / 10,000x
- Simulation start date: March 5, 1979 (Voyager 1 Jupiter flyby)
- Io/Europa/Ganymede 1:2:4 orbital resonance emerges from real masses

### Procedural Detail Shaders
Shared GLSL Simplex noise library in `/src/engine/glsl/simplex.glsl`.
All shaders disabled above activation altitude — zero GPU cost when far.
Uniforms: `uTime`, `uAltitude`, `uDetailBlend` passed every frame.

### Camera Pose Angle Conventions — CRITICAL
Two pose functions use OPPOSITE angle conventions — never change
either without updating both and measuring ground-track drift:

  _poseInsertion(): position = (cos φ, 0, −sin φ) — phase INCREASES = prograde
  _poseOrbit():     position = (cos θ, 0, +sin θ) — theta DECREASES = prograde
  (_poseSurface and its +sin-lon mirror bug #37 removed with Surface mode, V7)

Verified by orbitdir.mjs: orbit +21.4°E, insertion 0° +36.3°E,
retrograde -51.6°W, GeoSync 0.00°. Measure ground-track direction
before and after any orbital mechanics change.

### Known UI Gotcha — #ui-root Specificity Rule (3rd occurrence v5b)
`#ui-root > * { pointer-events: auto }` uses ID specificity and
overrides pointer-events:none on child elements. Has caused three
separate pointer-event bugs. NEVER use this rule. Use class-based
selectors only. Use `visibility: hidden` not `opacity: 0` when a
panel must be invisible but not interactive.

### Sun / Rotation Calibration — Per System
star.direction must be the true equatorial sun direction at the system
epoch. rotationPhaseAtEpochDeg must be calibrated to UTC. Use
full-precision sidereal day: 23.93446959h for Earth, 24.6229h for
Mars. Coarse values accumulate large longitude errors over decades.
Verify subsolar point against real ephemeris after any epoch or
rotation config changes. LIVE mode syncs via Date.now() (always UTC ms)
— never use getHours() or other local-time methods anywhere in the
time pipeline.

### Insertion Preset Order — CRITICAL (v6 discovery)
Insertion presets must call setMode('insertion') FIRST then
setInsertion({...}) — entry re-derives altitude from current camera
distance and clobbers preset values if setInsertion() runs first.
Measured: 45,614 km instead of 15,000 when order was wrong.

### Procedural Crater Lesson (v6 Mars)
The base 8K texture already carries orbit-scale basins. Every strong
procedural crater layer renders as stamped donut rings (xz-projection
lattice, dUv Callisto pattern — all produce rings). Rule: if it looks
like a stamp sheet the answer is LESS, not different paint.
Working pattern: sub-texture roughness only below 1,500 km,
hash-thinned, relief-led with no rim paint.

### ShaderMaterial + Logarithmic Depth Buffer — CRITICAL (v7 discovery)
Raw THREE.ShaderMaterial silently loses depth testing when the scene
uses a logarithmic depth buffer. Symptom: the mesh renders as a flat
billboard or donut in front of everything (Titan appeared as an orange
donut until this was found). Fix: always set on raw ShaderMaterials:
  material.extensions = { logDepthBuf: true };
  material.defines = { USE_LOGDEPTHBUF: '' };
OR use onBeforeCompile injection into MeshStandardMaterial instead of
raw ShaderMaterial — it inherits log-depth support automatically.
This applies to ALL custom shader overlays: atmosphere spheres, ring
discs, particle materials, any BackSide mesh. Check first when a new
shader renders incorrectly at depth.

### Security Headers — Cloudflare Workers (v7 discovery)
The wrangler.toml [[headers]] block is NOT valid for Workers Static
Assets. Use public/_headers file instead (Cloudflare Pages/Workers
static assets convention). Format:
  /*
    Content-Security-Policy: default-src 'self'; ...
    X-Frame-Options: SAMEORIGIN
    X-Content-Type-Options: nosniff
    ...
Verify headers are active via browser DevTools → Network →
response headers, or run Mozilla Observatory after deploy.
Current Observatory score: A+ (130, 10/10 tests) — maintain this.


### Normal Map Conventions — CRITICAL (v10.0.6 discovery)
Three.js expects OpenGL convention: +G = north (up). Many downloaded
normal maps use DirectX convention: +G = south (down). Symptom: north-
facing mountain slopes are lit instead of south-facing slopes at low
sun angles. Fix: invert green channel at source before wiring.
Always verify with normalcal.mjs (low sun, shadowed north face check).
Also: never sRGB-tag normal maps — use THREE.NoColorSpace explicitly
or the GPU will decode-skew every normal. The textures.normal path
must set normalMap.colorSpace = THREE.NoColorSpace.
Also: normalMapScale must be separate from normalScale (the procedural
cloud relief key) — sharing them doubles cloud relief and regresses
the V5b black-lumps fix. Use normalMapScale for texture normals.

### Per-System Lazy Loading (add before multi-system build)
Currently all system configs (jupiter.js, saturn.js) are bundled at
build time. Before adding Earth/Mars/Saturn, update vite.config.js
manualChunks to lazy-load each system config separately:
  manualChunks(id) {
    if (id.includes('/data/systems/')) {
      const name = id.split('/data/systems/')[1].replace('.js','');
      return `system-${name}`;
    }
  }
Each system's config then only downloads when the user travels to it.
Textures are already fully on-demand (load only when scene builds).
GPU memory management: dispose current system before loading new one.

### Multi-User Architecture — Purely Client-Side
The simulator is entirely stateless on the server. Each user gets their
own independent browser instance — Three.js renders on their GPU, physics
runs in their tab, localStorage saves to their device only. No user data
touches the server. Scales to unlimited simultaneous users at $0 cost
because Cloudflare serves static files only.

Preset sharing uses URL encoding (base64 query parameter) — no database
needed. "Share View" generates a URL containing the full preset state.
Anyone clicking the link arrives at the exact same view. This is the
Google Maps model — coordinates in the URL, not a database.

Community preset gallery (shared/voted presets) would require Cloudflare
D1 database — deferred to V6+ as a future enhancement.

---

## Bodies in Simulation

### Jupiter
- Radius: 71,492 km (equatorial) / 66,854 km (polar) — oblate spheroid
- Oblate scale: Y axis = 0.9353 relative to X/Z
- Rotation: 9.925 hours
- Axial tilt: 3.13°
- Features: animated Great Red Spot, cloud band rotation, limb glow,
  atmospheric scattering shader, equatorial bulge
- Procedural detail: cloud turbulence, GRS vortex, atmospheric haze
  (activates below 50,000 km)
- Texture: 8K/16K Solar System Scope CC BY 4.0

### Jupiter Ring System (4 components)
| Ring | Inner (km) | Outer (km) | Notes |
|------|-----------|-----------|-------|
| Halo | 92,000 | 122,500 | Torus geometry, blue-neutral |
| Main | 122,500 | 129,000 | Narrow, reddish, brightest |
| Gossamer Amalthea | 129,000 | 182,000 | Wide, faint orange |
| Gossamer Thebe | 129,000 | 226,000 | Widest, faintest |
All rings: semi-transparent, additive-blended, forward-scattering
shader — backlit by sun creates dramatic flare effect.

### Galilean Moons
| Moon | Semi-major (km) | Period (days) | Radius (km) |
|------|----------------|---------------|-------------|
| Io | 421,700 | 1.769 | 1,821 |
| Europa | 671,100 | 3.551 | 1,560 |
| Ganymede | 1,070,400 | 7.155 | 2,634 |
| Callisto | 1,882,700 | 16.689 | 2,410 |
All tidally locked (rotation period = orbital period).

### Inner Moons (Keplerian)
Metis (127,969 km), Adrastea (128,980 km),
Amalthea (181,366 km), Thebe (221,900 km)

### Sun
Distance: 5.2 AU from Jupiter. Rendered as distant point light
+ lens flare. Fixed direction in scene (not orbiting body in v1).

---

## Camera Modes

| # | Mode | Key | Description |
|---|------|-----|-------------|
| 1 | Cinematic | C | Auto scripted pans, startup default, loops |
| 2 | Free Fly | F | WASD + mouse, 6DOF, Shift = 5x boost |
| 3 | Orbit | O | Click body, camera advances along orbital path |
| 4 | Chase | H | Trails moon above/behind, surface visible below |
| 5 | System View | G | Full system, orbital path lines |
| 6 | Orbit Insertion | I | Physically accurate orbit, GeoSync preset |

(Surface mode removed permanently in V7 — hidden since v4d, code deleted;
a first-person ground experience would be a future rebuild from scratch.)

### Orbit Insertion Details
- Parameters: parent body, altitude, inclination, geosync toggle
- Jupiter GeoSync: 160,000 km radius, locked to 9.925h rotation
- Camera: nadir-pointing, 15° forward tilt in direction of travel
- HUD: altitude, velocity, period, surface speed, radiation warning
- Non-geosync: camera advances along orbital path at correct velocity
- GeoSync: camera and texture rotation locked to same time accumulator

---

## Audio System

7 modes, 2-second crossfade, saved to localStorage.

| # | Mode | Source |
|---|------|--------|
| 1 | Silent | — |
| 2 | Voyager Radio | Web Audio API procedural — plasma wave sounds |
| 3 | Deep Space Ambient | Web Audio API — Brian Eno / Apollo aesthetic |
| 4 | Psychedelic Journey | Web Audio API — Carbon Based Lifeforms aesthetic |
| 5 | Cosmic Electronic | Web Audio API — Solar Fields aesthetic |
| 6 | Spotify Playlist | iFrame embed, user pastes URL, localStorage |
| 7 | YouTube Playlist | iFrame embed, user pastes URL, localStorage |

---

## UI Components

**HUD (always visible):**
- Top left: simulated date/time, time multiplier, signal delay to Earth
- Top center: ALT readout (within 50,000 km of any body)
- Top right: camera mode, active body name
- Bottom left: sound mode selector, volume slider
- Bottom right: Ko-fi donate button, screenshot button

**Three-zone architecture (v4c — replaces Mission Control):**
- Zone 1 top-left: ghost time text, no panel box — clickable date opens
  the calendar picker (1950–2050), 🔴 LIVE toggle tracks the real clock.
  Dims to 20% while a panel is open.
- Zone 2 right edge: vertical icon stack, one panel at a time, Tab
  cycles — 🎥 Camera (7 mode rows + altitude/inclination/Camera Speed/
  Chase Height sliders), ⏱ Time (speed buttons, slider, date, LIVE),
  🪐 Bodies (solar-system hierarchy; real moons clickable, others
  Coming Soon), ⭐ Presets (5 curated + saved views with 🔗 base64
  ?view= URL sharing), 👁 Display (Local/System-wide labels, rings,
  orbital paths, resonance, velocity-vector stub, altitude presets),
  ❓ Help (? key).
- Zone 3 bottom center: persistent tray — 🎵 music (audio flyout: mute,
  generative dropdown, Spotify/YouTube rows), volume, 📷 screenshot,
  👁 presentation (eye-slash while active), ☕ Ko-fi.
- Upcoming-event toasts appear above the tray with Watch → navigation.

**View controls:**
Fullscreen — F11 or top-right button. Presentation mode — P or the
subtle bottom-right eye icon (hides all UI; screenshots use it).
Tooltips on every control (hover 500 ms / mobile long-press).

**Body Info Panel (click any body):**
Name, radius, mass, orbital period, distance from Jupiter, 2-3 facts,
Set as Target button. Dismiss: click outside or Escape.

**Controls Help Overlay (? key):**
Full keyboard + mouse + touch reference. Two column layout.
Close: Escape, ?, or click outside.

**Loading Screen:**
Blurred Jupiter background, progress bar, rotating Jupiter facts.

---

## Surface Feature Labels

Appear below activation altitude as 3D billboard sprites.
Fade in below threshold, fade out above.
**Note: labels must be parented to moon mesh (not scene) so they
rotate with the surface. Same fix required as volcanic plumes (Bug #4).**

| Moon | Altitude | Features |
|------|----------|---------|
| Io | 500 km | Pele Volcano, Loki Patera, Prometheus Volcano, Ra Patera, Tupan Patera |
| Europa | 500 km | Conamara Chaos, Thera Macula, Pwyll Crater, Tyre Macula, Cilix Crater |
| Ganymede | 500 km | Galileo Regio, Nicholson Regio, Uruk Sulcus, Osiris Crater, Gilgamesh Basin |
| Callisto | 500 km | Valhalla Impact Basin, Asgard Basin, Heimdall Crater, Lofn Crater, Burr Crater |

---

## Texture Credits

| Body | Source | License |
|------|--------|---------|
| Jupiter | Solar System Scope | CC BY 4.0 |
| Io | USGS via Steve Albers | Public Domain |
| Europa | USGS via Steve Albers | Public Domain |
| Ganymede | USGS via Steve Albers | Public Domain |
| Callisto | Björn Jónsson | Public Domain |
| Saturn + ring strip | Solar System Scope | CC BY 4.0 |
| Titan, Enceladus, Iapetus, Mimas, Tethys, Dione, Rhea | Steve Albers SOS (Cassini data) | Non-commercial by permission — attribution required (see backlog #10) |
| Mercury, Venus (atmosphere), Uranus, Neptune | Solar System Scope | CC BY 4.0 |
| Triton | Steve Albers SOS (Voyager 2 data) | Non-commercial by permission — attribution required (see backlog #10) |
| Pluto, Charon | Steve Albers SOS (New Horizons LORRI+MVIC data) | Non-commercial by permission — attribution required (see backlog #10). Pluto map rolled 180° to the engine's center-origin convention |
| Uranus rings | Generated in-house (GDI+ radial strip, true ring radii) | — |

Full credits in README.md.

---

## Version History

### v1 — Initial Build
Commit: b1fcdf2 (26 files)
- Data-driven engine with jupiter.js config + saturn.js stub
- N-body physics, Keplerian inner moons, time controls
- All 6 original camera modes with 0.8s eased transitions
- NASA-derived textures, 10,000-star field with Milky Way
- Four-ring system with forward-scattering backlit shader
- Io volcanic plumes (Pele, Loki, Prometheus)
- Eclipse shadow calculations + transit shadow dots on Jupiter
- Eclipse event ticker with 5-event countdown
- 4 procedural Web Audio soundscapes + Spotify + YouTube embeds
- Post-processing: bloom, lens flare, DoF, film grain, vignette
- Adaptive quality tiers: desktop / tablet / mobile
- Touch controls for mobile
- Voyager mode preset (March 5, 1979 flyby trajectory)
- Ko-fi donate button, screenshot button
- Cloudflare Pages deployment, wrangler.toml configured

### v2 — Bug Fixes + Orbit Insertion
- Fixed: Jupiter oval distortion (aspect ratio + oblate scale 0.9353)
- Fixed: Chase mode reliability (spring lerp, orbital-direction offset,
  update order, target persistence)
- Added: Altitude control (scroll zoom, ALT HUD, presets, surface labels)
- Added: Camera Mode 7 — Orbit Insertion with Jupiter GeoSync preset
- Added: Controls help overlay (? key)
- Created: FUTURE_ENHANCEMENTS.md

### v3 — Procedural Detail Shaders (Complete — commits 2091c7a → 7359a7d)
- Shared GLSL Simplex noise library: 2D/3D Simplex, ridged, fBm 2-4
  octaves, cellular noise, crater-profile helper. Mobile tier drops
  one octave via define. Bodies opt in through config — no body-specific
  code in engine. uDetailBlend exactly 0 above activation altitude.
- Jupiter: banded turbulence with altitude-staged octaves, 4:1 latitude
  wisps, GRS spiral vortex (anchored to scanned pixel position in both
  texture resolutions), blue-grey horizon haze below 10,000 km
- Io: sulfur palette modulation, lava flows, calderas (thinned by cell
  hash to avoid uniform density), hot spot glow below 200 km
- Europa: fractal ice crack network (domain warping fixed fingerprint
  loop artifact), chaos terrain, subsurface ocean glow
- Ganymede: grooved terrain ridges, dark cratered terrain (crater
  lattice gated below 3,000 km to fix tiling artifact), polar auroras
- Callisto: multi-scale fractal cratering, Valhalla rings anchored to
  scanned basin position at 18°N
- Bonus fixes caught during descent testing: DoF now focuses on near
  surface not body center (sharpened all low-altitude views), quality
  tier detection fixed from maxTouchPoints to pointer:coarse media
  query (fixed touchscreen laptops being demoted to tablet tier)
- Surface Detail Active green dot working in body info panel
- All bodies screenshot-tested at spec altitudes, 50-61 FPS confirmed
- Zero console errors in production

### v4 — Backlog Features + Sharpness Pass (Complete — commits ba275a3 → a1d2814)

**Group 0 — Sharpness Pass:**
- Anisotropic filtering (maxAnisotropy) + LinearMipmapLinearFilter on
  all textures — Jupiter and all moons
- Normal map intensity per body: Jupiter 2.0, Io 3.0, Europa 2.5,
  Ganymede 2.5, Callisto 2.0, inner moons 1.5 (data-driven in config)
- Jupiter specular: roughness 0.7, metalness 0.05
- Bloom threshold raised to 0.85 — cloud bands no longer softened
- Altitude-staged octave counts: Jupiter 3→9 octaves, moons 3→9
- Base noise frequency increased: Jupiter 1.5x, moons 2.0x
- Normal perturbation from noise gradient — surfaces genuinely 3D
- Texture upgrades: 16K Jupiter doesn't exist publicly (Solar System
  Scope caps at 8K — already shipped). Moon 8K sources need GeoTIFF
  conversion — URLs noted in renderer.js comments for future upgrade
- Relief lighting tuned: clamped height gradients to prevent
  sub-pixel noise octaves exploding screen-space derivatives

**Group 1 — Infrastructure:**
- Version bumped to 4.0.0
- Dynamic version display on loading screen: "Jupiter System — v4.0.0"
- instructions.md confirmed moved to .claude/
- @cloudflare/vite-plugin purged from lockfile

**Group 2 — Bug Fixes:**
- Io volcanic plumes and hotspots re-parented to moon mesh — verified
  bearing tracks rotation exactly at 10,000x time speed
- Surface feature labels were already fixed in v3b — no change needed
- Per-frame aspect ratio self-heal added to render loop
- Amalthea rendered at correct 250×146×128 km ellipsoid dimensions

**Group 3 — UI Improvements:**
- Inclination -90° to +90°: negative values reverse phase advance and
  travel tangent (simple tilt alone doesn't reverse orbit direction)
- Logarithmic altitude slider with live readout replaces preset buttons
- F11 fullscreen + P presentation mode (hides all UI)
- GRS navigation button anchored to live uGrsUV uniform — survives
  texture swaps

**Group 4 — Visual:**
- Data-driven zoom floors with quadratic resistance per body config
- ALT pulse triggers within 10% of hard floor (asymptotic convergence
  means exact arrival never occurs)
- Jupiter limb glow: proper atmospheric scattering shader — thin warm
  feathered rim on day side, absent on night side, verified from
  day side / terminator / night side angles

**Testing:**
- Headless smoke test suite rebuilt from scratch (v3b version was
  never committed) — 22 checks, all green
- Committed under tests/ with README capturing sim-time-vs-wall-clock
  rules for future sessions

**Deployment:** Live at solar-system-explorer.kyle-d06.workers.dev
Verified by fetching deployed JS and confirming all v4 feature strings.
- Bug 1 (Orbit mode): Camera advances along orbital path, one revolution
  per 60 sim-seconds scaling with time multiplier. Capped at 1 rev per
  5 wall-seconds to prevent strobing at high time multipliers. 15° nadir
  tilt now correctly aligned with direction of travel.
- Bug 2 (Orbit Insertion): Phase driven by shared physics.simSeconds
  accumulator — was advancing at real orbital periods (imperceptible at
  1x). Surface speed ground-track readout added to HUD (e.g. 29.1 km/s
  over Jupiter at 500 km). Default view: nadir + 15° forward tilt.
- Bug 3 (GeoSync): Camera phase pinned directly to rotation angle
  applied that frame (primaryRotation for Jupiter, moon mesh rotation
  for tidally locked moons) + offset captured at lock engage. Zero drift
  by construction — verified 0.0 km/s over 2,000 sim-seconds at 10,000x
  on both Jupiter and Io. HUD reads "0.0 km/s (Geosynchronous)."
- Bug 4 (Chase): Camera 3R behind + 1.5R above, looking 2R ahead of
  moon. Surface below, horizon and Jupiter ahead. Chase Height slider
  (0.2–4× radius) and Orbital Speed slider in Mission Control, appear
  only in their respective modes.
- Smoke test: 51-check headless test suite, all passing. Test pattern:
  measure against sim-time, settle transitions via cameraCtl.update()
  directly (headless Chrome renders at ~4fps so wall-clock assertions
  give false failures).
- Note: not yet deployed — live site still v3. Deploy when ready:
  update Ko-fi handle in config.js first, then npm run deploy.

### v4b — Hardware Review Fixes + UI Polish (Complete — 2026-07-11, commits a09d06a → see final)
Per Docs/V4b_PROMPT.md. Version 4.1.0. Deployed after Group 3 and at
session end.

- Group 1 (a09d06a): slider live-drag investigated — every slider
  already used the input event; the "catches up on release" symptom
  (bug #11) was the Mission Control altitude slider restarting its
  1.5 s tween per input event. It now sets orbit distance directly
  while dragging. "Orbital Speed" renamed "Camera Speed".
- Group 2 (48c3122, b8680b6, 5ac0669, 00c4865):
  - Bug #12 flicker: NOT z-fighting (detail shaders inject into the
    base material — no second mesh exists). Real cause: v4 sharpness
    noise going sub-pixel (temporal shimmer) + sub-pixel thresholded
    lines. Fixed with footprint-faded fbmN octaves, dtlFreqFade on the
    finest layers, and derivative-widened dtlAAstep thresholds.
    Measured shimmer (mean |px diff| under 0.00025 rad rotation):
    Io 17.98→11.71, Europa 24.23→11.10 (≈ legitimate-parallax floor).
  - Bug #13: Ganymede/Io uniform halos replaced with the Jupiter limb
    scattering shader via per-body atmosphereLimb config; Europa added.
    Lit-side only, verified day/night/terminator.
  - Bug #14: inner moons at 64-segment spheres (config geometrySegments);
    the actual "hole" was camera.near = 50 km clipping bodies whose
    floors sit 20 km up — near lowered to 10 km (log depth buffer).
  - Bug #8: plume particles now use a radial-gradient sprite — soft
    orange-yellow sparks, no more white squares.
- Group 3 (22f9810, 0459dff, 6e20a0c): body info cards expanded from
  config (type badge, gravity, temp range, orbital distance, notable
  features, collapsible More Info; diameter/periods derive from the
  sim-driving radiusKm/periodDays); GRS button removed from the Jupiter
  card (kept in Orbit Insertion); music player collapse chevron with
  localStorage persistence (independent of presentation mode); Spotify
  #1DB954 / YouTube #FF0000 inline-SVG brand icons, embeds verified
  end-to-end; resonance lines rebuilt — connecting lines between Io/
  Europa/Ganymede, Primary Blue conjunction pulse within 15°, and a
  "Resonance: N% aligned" HUD readout.
- Group 4 (b30b950): shared tooltip system (500 ms hover, mobile
  long-press, viewport-clamped, native titles stripped) attached to all
  sound modes, camera modes, time controls, display checkboxes, sliders,
  insertion controls, corner buttons, and the Voyager preset.
- Testing: all verification scripts committed under tests/ (flicker
  probe, moon halos, inner-moon floor, body cards, music flow,
  resonance conjunction, tooltips) alongside the 22-check smoke suite.

---

### v4c — UI Redesign + Bug Fixes (Complete — 2026-07-11, commits c7f93ce → 8594bd6 + docs)
Per Docs/V4c_PROMPT.md. Version 4.2.0. The largest UI change since v1:
three-zone architecture (ghost clock top-left, icon-stack panels on the
right edge, persistent bottom tray).

- G1 (c7f93ce): 4.2.0; dev-mode console.warn while KOFI_URL is the
  YOUR_HANDLE placeholder.
- G2 (973ad49, 8d4e463): ring depth sort (bug #18/#21) — prescribed
  flags were already set; the visible artifact was the lit ring band
  crossing the night-side disc, fixed by eclipsing ring material inside
  the primary's shadow cylinder in both ring shaders. Free look
  (bug #16/#22): hold Alt / two-finger drag in Orbit/Chase/Insertion —
  orientation-only offset, 0.5 s ease back to nadir, top-right
  indicator, blur-safe. Inclination auto-switch (bug #15/#23): dragging
  the slider outside insertion switches modes with a toast (slider
  value captured before the switch to avoid clobbering).
- Date utility (ae7171c, mid-session requirement): dateToSimSeconds /
  simSecondsToDate in physics.js — the single source of truth for all
  date conversions; presets store ISO 8601 UTC strings. Epoch comes
  from the config-driven physics.epochMs (the system epoch is noon UTC,
  so the suggested hardcoded midnight would have been 12 h off). Plus
  PhysicsEngine.jumpToSimSeconds: n-body moons re-initialize
  analytically at the target time (date picker / LIVE / presets).
- G3+G4 (b7c06e3): bottom center tray (music + glow, volume,
  screenshot, presentation eye-slash, Ko-fi) and the upward audio
  flyout (mute, Space Sounds dropdown, Spotify/YouTube expandable
  rows). Old Player panel, audio icon row, corner buttons and embed
  drawer removed. Presentation mode keeps only the tray's eye.
- G5 (b445593): ghost time text (no box), clickable date → calendar
  picker (1950–2050, 10-year jumps, year input; jump preserves
  time-of-day), 🔴 LIVE toggle tracking the real UTC clock at a
  self-enforcing 1× with 60 s re-sync, persisted.
- G6 (abf97b5): six-icon right-edge stack replaces Mission Control —
  Camera (mode rows + the four sliders), Time, Bodies (solar system
  hierarchy from config.SOLAR_SYSTEM; real moons clickable; others
  "Coming Soon"), Presets (5 curated + saved views with base64 ?view=
  URL sharing and page-load restore), Display (label split, visual
  toggles, restored altitude preset buttons), Help. Tab cycles panels.
- G7 (db98a53): upcoming events as toasts above the tray with Watch →
  navigation (eclipse: pull back past the moon; transit: sun-side view
  of Jupiter's face). Replaces the event ticker.
- G8a (8594bd6): manualChunks function form — per-system lazy chunks
  (system-jupiter.js / system-saturn.js verified in dist).
- Stubs noted for future: Sun corona visuals (backlog), system-wide
  labels and velocity vector toggles are placeholders with toasts.

### v4d — UI Polish + Orbital Mechanics (Complete — 2026-07-11, commits 6916955 → 3abbf9b + docs)
Per Docs/V4d_PROMPT.md. Version 4.2.1.

- Item 1 (6916955): inclination mechanics investigated before applying
  the prescribed fix — the existing fixed-axis tilt already produced
  correct inclined great circles (measured: ±45° latitude sweep at 45°,
  -89.7°..+90° at 90° = true polar over both poles; Jupiter's screen
  offset constant at every inclination — the 15° forward-tilt default).
  The prescribed rotation about (sin φ, 0, -cos φ) is the instantaneous
  tangent axis and would have produced constant-latitude circles with
  the camera hovering over one pole at 90°, so it was not applied
  literally. The real defect was the plane-change lurch: the camera
  snapped onto the new circle unless it sat at a node. Now the camera's
  current bearing becomes the line of nodes when tilting away from
  equatorial (physical plane-change behavior, tilt axis = radial at
  ins.nodePhase) with a transition blend — measured position jump at a
  0→60° change: exactly 0 units.
- Item 2 (c4f6a76): stack emoji replaced with Montserrat text labels
  CAM / TIME / NAV / SAVE / VIEW / HELP; tooltips updated.
- Items 3–5 (3abbf9b): ALT / INC / SPD as peer stack buttons below a
  divider, each a focused single-control panel; "Camera Speed" renamed
  "Orbit Speed" throughout; Surface mode hidden from UI (S key inert,
  camera.js implementation intact for V5). Chase Height remains
  contextual in the CAM panel (its new home was unspecified).
- Verified: 13-check v4d suite + 22-check regression, zero errors.
- Hotfix (post-v4d): the item-1 node anchoring made the nadir view ROLL
  about the view axis while dragging the slider — the whole scene
  appeared to rotate (bug report: "inclination rotates the scene").
  Nothing ever rotated in the scene graph; the camera orientation
  followed the pivoting tangent. Reverted to a FIXED line of nodes
  (+X of the equatorial frame, explicit x/y/z form), keeping the
  plane-change transition blend. Measured while dragging 0→90°: max
  per-step view roll < 2°, body centered (< 0.6 NDC), scene-graph
  rotation exactly zero, polar sweep ±90°, retrograde preserved, both
  inclination sliders in sync (tests/incroll.mjs).
- Hotfix 2 (pole snap on entry, 917e46f): with a stale high inclination
  stored, entering insertion snapped the camera to the pole — the entry
  derivation reused the camera's equatorial longitude as phase on the
  inclined circle (phase ≈ ±90° = max latitude; measured 13.7°→-82.2°,
  421 u). Fix: entry now SOLVES the line of nodes so the inclined plane
  passes through the camera's bearing; the node is set only at entry,
  never on INC drags (the roll fix holds). Entering at 0° parks the
  node 90° behind the camera so inclination drags arc up the camera's
  own meridian — no jump, no roll. nodePhase captured in presets.
  tests/polesnap.mjs guards entry/drag/return/sync.
- Hotfix 3 (framing): "camera looks sideways, rings fill the screen" —
  the orientation math was already correct (up = radial, nadir + 15°);
  the problem was framing at distance: System View entry clamped
  altitude to 500,000 km where the fixed 15° tilt parks a small planet
  at NDC -0.6 under the ring arc. Now the forward tilt adapts to the
  body's apparent size (15° skimming → smaller when far, planet stays
  centered) and far entries arrive at a framing distance (3.7 radii,
  ~264,500 km for Jupiter — planet fills ~half the view); in-range
  altitudes still preserved. tests/lookdir.mjs (13 checks).
- Hotfix 4 (bands vertical on fresh entry): measured first — the entry
  phase exactly equals the camera bearing (a ±π/2 shift would have
  moved the camera, not fixed the roll). The spin axis projected at 90°
  on screen because the lookAt up was the RADIAL: near-nadir views
  degenerate screen-up onto the travel tangent (in-plane), rolling the
  planet a quarter turn at every phase. Screen-up is now the
  orbit-plane normal — bands horizontal at all phases and the view is
  roll-free around a full revolution. Axis angle measured 90°→0°;
  entry bearing preserved. tests/bands.mjs.
- Hotfix 5 (measurement session): full geometry table (11 inclinations
  × 4 phases) shows latitude = sin(phase)·sin(inc) exactly for BOTH
  signs, constant radius, and left/right drags numerically identical —
  the reported positive-inclination "oval" does not exist in the
  current build. Only artifact: a 2.4% radius dip from per-step blend
  restarts — small INC deltas (≤3°) now move directly. Ring floor
  added: config-driven minInsertionAltKm (Jupiter 160,000 km, above
  the gossamer edge) clamps free insertion orbits, ALT slider, and
  pinch zoom, with a one-shot HUD note. Documented exemptions: the
  GeoSync lock (physical geosync altitude 88,508 km sits inside the
  gossamer span; unlocking lifts above the rings) and the GRS close
  pass (now always routed through orbit mode). tests/incmeasure.mjs +
  tests/ringfloor.mjs.

### v5 — Earth + Moon System, Parallel Worker Build (Complete — 2026-07-11, commits a025bd5 → f83dbeb + docs)
Per Docs/V5_PROMPT.md. Version 5.0.0. First multi-system release —
the NAV panel now travels between Jupiter and Earth.

**Phase 1 — shared infrastructure (orchestrator):**
- 1a (a025bd5): `src/engine/ephemeris.js` — Keplerian circular-orbit
  sun direction from config epoch; physics updates `sunDir` every tick
  and on date jumps. Renderer follows it: sun light, anchor, lens
  flare, and ring shader sun uniforms all track the ephemeris, so
  Earth gets real seasons (sun-Y flips sign across half a year —
  measured) and Jupiter's static sun is just the no-period case.
- 1b+1c (53b0041): ESO Milky Way panorama (eso0932a, public domain) on
  a background sphere replaces the procedural starfield (kept as
  fallback); HYG bright-star catalog build script → 8,834 stars
  (mag < 6.5) as point sprites with spectral B-V colors, named stars
  labeled when body labels are on (backlog #12/#14 done).
- 1d (18d85c7): system switching — `AVAILABLE_SYSTEMS` +
  validated `?system=` URL param + `switchSystem()` full-reload
  navigation (clean GPU disposal, loading screen as the transition,
  correct lazy chunk); NAV panel planet rows become travel rows.

**Phase 2 — 4 parallel Haiku workers, exclusive file ownership:**
- W1: earth-clouds.glsl, earth-lights.glsl, earth-aurora.glsl
- W2: earth-atmosphere.glsl (full Rayleigh ShaderMaterial), earth-ocean.glsl
- W3: src/data/systems/earth.js (full config — Apollo 11 epoch
  1969-07-20, 6 Apollo sites, ISS preset, texture sources)
- W4: moon-detail.glsl
- Workers ran in parallel (~40–46k tokens each) and never touched
  engine files. Orchestrator review found real bugs to fix before
  integration: clouds had out-of-scope variables and hurricane centers
  that could never land in the tropics band (rewritten — vortices now
  placed on-sphere with angular-distance falloff); ocean used
  `normalize(v * k)` == `normalize(v)`, silently deleting the wave
  amplitude, and passed pre-scaled positions to dtlFreqFade (double-
  counts frequency); moon wrinkle ridges striped the entire mare
  (now sparse regional patches) and fine-crater amplitudes read as
  cobblestone (halved). Config referenced a texture that doesn't
  exist yet (removed; 8K upgrade is a manual step).

**Phase 3 — integration (f83dbeb):**
- Worker chunks registered as `terra` / `luna` detail styles with
  brace-isolated scopes; new always-present object-space uniforms
  `uSunObj` / `uCamObj` updated per frame (day/night, glint,
  opposition surge, earthshine all need them).
- Rayleigh atmosphere path (`atmosphere.style === 'rayleigh'`) with
  per-frame altitude; Apollo site markers + labels parented to the
  Moon mesh, labels fade in below ~70 km.
- Textures: NASA Blue Marble topo/bathy 5400px + SSS 8K Moon
  (CC BY 4.0). ISS Mode (prompt item 3d, optional) deferred to V5.1.
- Verified: tests/earthtest.mjs (14 checks — both shader styles
  compile clean at close range, Moon at 384,400 km, seasons, Apollo
  markers, NAV travel rows, date jumps move the Moon) + full Jupiter
  regression (smoke 22, incmeasure 6, ringfloor 7) all green.
  Deployed and live-verified in a fresh headless browser: both
  systems load at v5.0.0 with zero console errors.

### v5a — Cloud Circulation + 8K Textures + City Lights (Complete — 2026-07-11, commit 58636f4 + docs)
Per Kyle's V5a message (4 items). Version 5.1.0.

- Item 1 (critical): earth-clouds.glsl rewritten around a latitude-zone
  circulation model. The clear subtropical belt is the signature — the
  alternating ITCZ white band → clear desert zone (Sahara/Australia
  visible through the gaps) → mid-latitude comma swirls → polar grey
  is what makes Earth read as Earth instead of a cloud planet. ITCZ
  meanders and follows the sun into the summer hemisphere (real
  seasonal migration, driven by the v5 ephemeris); zonal shear rotates
  the noise field (easterly trades / faster westerlies); hurricanes
  are basin-aware — fixed anchors over the real warm-water nurseries
  (NW Pacific, NE Pacific, N Atlantic, S Indian), never over land,
  active only in that hemisphere's summer, clear eye at the center.
  Altitude-staged octaves + a below-8,000 km puff-erosion layer.
  Calibration note: the first cut read as uniform confetti — base
  noise dropped to continent scale (freq 9 + freq 26 breakup),
  verified against screenshots at 22,000 and 6,000 km.
- Item 2: texture sourcing. LANDED: 8K SSS daymap (wired as
  diffuseHigh — desktop silently upgrades after load; needed a
  Referer header to clear SSS hotlink protection), 8K nightmap, 8K
  cloud layer, 8K specular ocean mask (SSS ships it as .tif —
  converted via GDI+). night/clouds/specular are on disk but not yet
  wired (lights stay procedural per Item 3). STILL MANUAL: NASA CGI
  Moon Kit — svs.gsfc.nasa.gov is serving an expired TLS certificate;
  URL noted in earth.js, retry when NASA fixes their cert.
- Item 3: earth-lights.glsl — uniform noise replaced with 20 hardcoded
  population-density gaussians on the sphere. Western Europe, Japan,
  and the US East Coast are the dominant features from high altitude;
  Sahara, Amazon, Siberia, and the oceans are near-black. Measured by
  pixel probe: London 58 / Paris 55 / Milan 49 / Cairo 39 / Moscow 30
  luminance vs Sahara 7, Atlantic 0. tests/nightlights.mjs guards the
  placement (projects known lat/lons to screen and samples pixels).
- Item 4: dev-mode calibration logging — each detail shader logs its
  activation/deactivation with live altitude + blend, and
  `__sse.renderer.logShaderState()` dumps a per-body uniform table
  plus pointers to every tuning knob (cloud zone weights, city-light
  region weights + gain, moon crater amplitudes, per-body
  normalScale). DEV builds only.
- Verified: earthtest 14/14, Jupiter regression (smoke 22, incmeasure
  6, ringfloor 7), zero console errors; deployed and live-verified in
  a fresh headless browser, both systems at v5.1.0.

### v5b — Panel UX + Panning + Radiation Zones + Night Side (Complete — 2026-07-11, commits 804b8d0 → c1ac764 + docs)
Per Docs/V5b_PROMPT.md + two mid-session additions. Version 5.1.1.

- Item 4 first, measured (804b8d0): the "can't pan over the ocean" bug
  had nothing to do with the ocean — an elementFromPoint grid + real
  CDP drags showed a fixed bottom-center dead zone where the HIDDEN
  body info card (opacity 0) swallowed pointerdown. The
  `#ui-root > * { pointer-events: auto }` ID-specificity override
  strikes a third time; fixed with an ID-scoped rule +
  visibility:hidden. The prescribed cause (ocean mesh raycast) was
  impossible: no ocean mesh exists and raycastBody() intersects only
  the invisible picker spheres. All 9 probe points drag cleanly now.
- Items 1–3 (2ed076b): central panel manager — ONE panel open
  globally (9 stack panels + Orbital Insertion + body card + audio
  flyout; tray exempt, date picker stays a self-dismissing popover).
  Transparent dismiss overlay sits below all UI as the first
  positioned child of #ui-root (DOM order instead of the spec's
  z-999 — this codebase's panels aren't at z-1000+); swipe dismisses
  on touch; the camera drag works immediately after dismissal. OI
  panel gained a ✕; closing it by ANY route returns the camera to
  the mode it was in before insertion (cameraCtl.preModeOI).
- Item 5 (9a932ab): radiation warnings are config-driven
  (radiationWarning.zones per body). Earth: Inner Van Allen
  1,000–6,000 km, Outer 13,000–60,000 km, reentry < 400 km — clean at
  74,000 km and at ISS altitude. Jupiter keeps its blanket zone.
- Mid-session (695a300, measured at 382 km over Lake Michigan): night
  side was ~black because scene ambient was 0x223344×0.06 — now
  config-driven nightAmbient (Earth 0x8899bb×0.18 → faint terrain
  silhouettes, dark-blue lakes; Jupiter unchanged). Terminator bleed
  widened + faint night limb scatter in earth-atmosphere.glsl.
  Day-side black cloud lumps at grazing sun = cloud RELIEF (on Earth
  normalScale drives only cloud height) → 2.0→0.8. Measured innocent:
  ocean chunk (only adds glint), texture colorSpace (already sRGB),
  8K map (active, 8192px verified). Midwest olive-green is the July
  Blue Marble source palette itself — September variant noted in
  earth.js for a tan/brown look. City-light gain 0.3→0.4 vs the new
  ambient floor (c1ac764; brightest city 62 vs floor 28).
- Verified: tests/v5b.mjs NEW (18 checks: panel exclusivity, ✕ /
  outside-click behavior incl. camera-mode return, drag-after-dismiss,
  old dead zone, all five radiation zone cases) + earthtest 14/14 +
  nightlights + Jupiter regression (smoke 22, incmeasure 6,
  ringfloor 7). Deployed; both systems live-verified at v5.1.1, zero
  console errors.

### v5c — Earth Cloud Polish + Preset Scoping (Complete — 2026-07-12, commits 52c1026 → 6f9541c + docs)
Per Docs/V5c_PROMPT.md. Version 5.1.3 (5.1.2 was never bumped in
package.json — bcac126 shipped as 5.1.1; both steps landed here).

- Item 1 (52c1026, bug #41): hurricane spiral rose. Measured first at the
  terminator (probe places the NW-Pacific storm at sunDot 0.084): the
  pure sin(ang_spiral*3.5) rendered as machined concentric rings under
  relief shading. ec_spiral now bends arm phase with fbm3 (±1.2 rad),
  de-centers rings with radial snoise, and fades band contrast outward;
  the coherent eyewall is kept (real hurricanes have one). Day-side
  3.5-cycle spiral amplitude outside the eyewall: 13.1 → 4.1 (organic).
  tests/hurricane.mjs gates on it and screenshots both sun angles.
  NOTE for tuning: the prompt's prescribed snippet assumed a 2D-uv
  hurricane function; the real one works on 3D sphere positions — the
  fix was adapted, not pasted.
- Item 2 (c5f8b46, bug #42): LAYER 5 cloud puff was ±0.18 ADDITIVE over
  every cloud pixel below 8,000 km (wall-to-wall confetti); now it's
  subtractive edge erosion (domain-warped snoise, edge mask
  1-|cov-0.5|*2.5) — dense decks solid, edges ragged. Ocean glint:
  fixed pow(400) made a ~450 km undithered disc at 2,113 km (normal
  rotation and view rotation nearly cancel there, so the lobe decays
  very slowly across the surface); sharpness now altitude-scaled
  mix(6000 close → 150 far) + screen-space rim dither + capped core.
  Measured footprint 450 km → 157 km glitter core; looks like real
  ISS-photo sun glitter at 700 km. tests/glint.mjs gates the footprint.
- Item 3 (6f9541c, bug #49): curated presets scoped per system. The
  prompt assumed config-side curatedPresets arrays — reality: the list
  is hardcoded in ui.js._buildPresetsPanel, so entries got a `system`
  tag matched against system.slug (Moon Alignment scoped jupiter too —
  it's the Galilean resonance). The prompt's expected Earth presets
  didn't exist and were BUILT: 🛰️ ISS Orbit View (navPreset uv path),
  🌍 Earthrise (jumps to the nearest full-Earth lunar phase within one
  month — at the July epoch Earth-from-Moon is a black disc, measured —
  then a 40 s sweep lifts Earth over the limb from startTheta = Earth
  bearing + 156°), 🌃 City Lights at Night (aims at whichever of six
  major cities is deepest in darkness right now — never touches the
  clock), 🌌 Aurora from Orbit (dark magnetic pole via sun sign).
  Helpers _bodyFrameNormal/_flyToLatLon (uv = [0.5+lon/360, 0.5+lat/180]
  matches flyToFeature's SphereGeometry mapping). tests/presets.mjs:
  28 checks — scoping both directions + camera behavior per preset.
- Verified: hurricane + glint metric gates green, presets 28/28,
  earthtest 14/14, nightlights, v5b 18, livedefault, Jupiter regression
  (smoke 22, incmeasure 6, ringfloor 7) — all against the dev server
  (window.__sse is DEV-only; production builds can't run the suites).
  Production build checked separately: both systems load at v5.1.3 with
  zero console errors + v5c feature strings in the served bundle.
  GOTCHA hit again: the dev server bakes __APP_VERSION__ at startup —
  restart it after a package.json version bump or the loading-screen
  version checks fail against stale 5.1.1.
- Deployed (dde94afd) and live-verified with cache-bust: both systems
  v5.1.3, zero console errors, v5c strings present in the live bundle.

### v6 — Mars System, Parallel Worker Build (Complete — 2026-07-12, commits 5267c43 → see final + docs)
Per Docs/V6_MARS.md. Version 6.0.0. Third system — NAV now travels
Jupiter ⇄ Earth ⇄ Mars.

**Phase 1 — shared infrastructure (orchestrator):**
- Epoch: Viking 1 touchdown 1976-07-20T11:53:06Z (house pattern:
  historic-mission epochs). Prompt-vs-reality: ephemeris.js has NO
  ELEMENTS table and no sunDirectionFrom() — it's config-driven
  (star.direction at epoch + orbitalPeriodDays), so 1c needed zero
  engine code, only calibrated config values.
- Calibration gotcha (measured): sunDirectionAt() FLATTENS the epoch
  vector's declination and rebuilds it from tilt — the seasonal phase
  lives in the ecliptic longitude λ0. Mars: λ0 = −173.2° (declination
  +25.0° decreasing, Ls ≈ 97°), rotationPhaseAtEpochDeg −61.0 puts the
  subsolar point at 111.5°W (Viking landed 16:13 LMST @ 49.97°W).
  tests/marscal.mjs: epoch geometry exact, sol-vs-sidereal residual
  0.5°, quarter/half-year declination phasing. 6/6.
- Textures: 8K SSS Mars daymap (CC BY 4.0, Referer header) + local 2K
  GDI+ downscale as base; diffuseHigh progressive swap. MOLA normal
  skipped (GeoTIFF manual step, backlog pattern). Phobos/Deimos have NO
  directly-fetchable cylindrical maps (Albers references Seal/Stooke
  without files) — color-only ellipsoids + procedural detail (Metis
  house pattern); manual fetch noted in mars.js.
- 'mars' in AVAILABLE_SYSTEMS — NAV travel row was automatic (v5 1d
  infrastructure), loadingFacts in config.

**Phase 2 — 3 parallel Haiku workers, exclusive file ownership:**
W1 mars-surface.glsl + mars-atmosphere.glsl, W2 mars-dust.glsl +
mars-polar.glsl, W3 mars.js completion (~40k tokens each). The v5
lesson held — every worker shipped real bugs the orchestrator review
caught BEFORE commit: Olympus const vector double-converted degrees +
GLSL-const-with-builtins; Valles longitude test compared 265..330E
against atan2's −180..180 (canyon never rendered); scarp "ring"
degenerated to a filled disc; dtlFreqFade fed pre-scaled positions
(exact v5 repeat); dust-devil fbm sampled a ±0.08 domain (constant);
polar projection normalized onto the unit circle (spiral troughs and
swiss-cheese pits lost their radial coordinate); south collar mask
multiplied to zero; `patch` is a GLSL reserved word; dOct referenced
at function scope.

**Phase 3 — integration + measured visual calibration:**
- ares detail style (chunk order surface → polar → dust so a global
  storm veils the caps) with uDustStorm style uniform; atm.style 'dust'
  through a shared shell-material path; untextured detail bodies get a
  1px white map (vMapUv only compiles when a map exists — Phobos/
  Deimos are the first color-only detail bodies).
- Craters: FOUR visual iterations, each measured by screenshot. The 8K
  texture already carries orbit-scale basins; every strong procedural
  crater layer rendered as stamped donut rings (xz-projection lattice
  columns → dUv Callisto pattern → still donuts → subdued → whisper).
  Final: sub-texture roughness only below 1,500 km, hash-thinned,
  relief-led with no rim paint. If it looks like a stamp sheet, the
  answer is LESS, not different paint.
- Dust storms: detail activation raised to 50,000 km so a 100% storm
  reads from global view (2018-storm featureless orange sphere —
  verified) — the veil is the one layer that must not gate at low
  altitude only. VIEW panel gets a data-driven Conditions slider (any
  primary with detail.params.dustIntensity; localStorage
  sse-dust-<slug>).
- Olympus Mons at real proportions (0.09 rad shield, 80 km caldera,
  smooth basal scarp annulus, craters suppressed on the young shield);
  Valles Marineris renders as a genuine 4,000 km canyon slash; north
  cap at its (correct) northern-summer minimum with ragged edges.
- Insertion presets must setMode FIRST then setInsertion — entry
  re-derives altitude from current camera distance and clobbers preset
  values (measured 45,614 km instead of 15,000).
- Phobos physics verified prograde AND outrunning the spin (3.55×) —
  test gotcha: +Y rotation means the surface's atan2(z,x) DECREASES;
  compare moon motion against the surface, not mesh.rotation.y's sign.
- 5 Mars curated presets (Olympus flyover, Valles, Global View, Chase
  Phobos, North Polar Cap) in the ui.js tagged list.
- Suites: tests/marstest.mjs NEW (13 — orbits, prograde, ares compile,
  storm uniform, ellipsoids, dust slider), marscal.mjs NEW (6),
  presets.mjs extended to 57 checks across three systems.
- Verified: full 13-suite regression green against the dev server
  (smoke, earthtest, marstest, marscal, suncal, nightlights, presets,
  v5b, livedefault, hurricane, glint, incmeasure, ringfloor). Build
  produces the system-mars lazy chunk. Deployed (b7a42224) and
  live-verified with cache-bust in a fresh headless browser: all THREE
  systems load at v6.0.0 with zero console errors, v6 feature strings
  in the served bundle.

### v6.0.1 — Mars Hardware-Review Fixes (Complete — 2026-07-12, commit 4d37d74 + docs)
Kyle's real-hardware pass at 1,291 km confirmed three visual bugs; all
measured headless before and after (mars-surface.glsl + mars-dust.glsl
only). Bug #51 crater donuts: the rings were the RELIEF rim ridge (the
prescribed "rim paint" was already gone in v6) — craters are now
min(c, 0) depressions only, hash-thinned to 35%/25% of cells; the
terrain texture dominates. Bug #53 Valles Marineris black slash
(measured min luminance 0): noise-modulated -0.42 relief + step strata
paint stacked — now depth -0.10, ±15% floor noise, softened strata,
varied dust floor (canyon min lum 23, mean 66 vs terrain 63-82,
internal structure visible). Bug #54 dust lattice caterpillar rows:
field coordinates domain-warped (the Earth city-light #43 fix class) +
veil thinned to 35% below 1,000 km — the 100% storm from global
distance remains a featureless orange sphere (verified). marstest
13/13, marscal 6/6. Deployed (eeadb787), live index confirmed serving
the new bundle.

### v6.0.2 — Mars Night-Side Detail Fade (Complete — 2026-07-12, commit c3efcf2 + docs)
Kyle's second hardware pass: glowing orange crater blobs on the pitch
NIGHT side at 736 km (bug #55). The forensic toggles (sun light off /
ambient off / uNormalScale=0 / dust killed) pinned it: relief-perturbed
normals catch sun from below the local horizon and bloom turns those
fragments into glow dots — dust was innocent. Fix is two-tier in
mars-surface.glsl (+ same construct in mars-polar.glsl): each chunk's
height AND color deltas fade through the terminator via a captured-
baseline rescale (the fade must be per-chunk — a global uDetailBlend
fade would also kill the dust veil, which is deliberately exempt: dust
stays faintly visible against the night sky), and the high-frequency
layers additionally fade with sun elevation because tall sub-pixel
bumps sparkle under ANY grazing light, not just past the terminator.
Measured: deep night 2,285 bright px → 0, terminator dark half
1,469 → 0, day side byte-identical. marstest 13/13, marscal 6/6,
presets 57/57. Deployed (a76a8246), live bundle hash verified.

### v7 — Saturn System + Security + Shader Convention (Complete — 2026-07-12, commits 4755b51 → 57bd971 + docs)
Per Docs/V7_SATURN.md. Version 7.0.0. Fourth system — NAV travels
Jupiter ⇄ Earth ⇄ Mars ⇄ Saturn. Surface mode removed permanently.

**Phase 1 — security + conventions + infrastructure (orchestrator):**
- 1a Security: public/_headers (Workers Static Assets — the prompt's
  wrangler.toml [[headers]] is not valid for Workers; verified against
  CF docs and live wrangler dev): CSP (script/style/img/connect/frame
  locked down; youtube-nocookie for embeds), XFO, XCTO, Referrer-Policy,
  Permissions-Policy, COOP, CORP. security.txt (RFC 9116 mailto:).
  ui.js sanitizeEmbedUrl (protocol + hostname validation before the
  embed regexes; youtu.be kept). npm audit: 0 vulnerabilities.
  tests/security.mjs (28 checks vs wrangler-served prod build).
- 1b Shader convention: glsl/surface-base.glsl (sse_dayFade/
  sse_grazeFade/sse_detailBlend) injected into every detail style;
  per-body config shaderParams → uDayFade0/1 + uGrazeFade0/1 uniforms.
  Mars/Earth night-fade constants moved to config VERBATIM (zero visual
  change; bug #55/#48 behavior preserved); Jupiter's params inert today
  (gasGiant has no local day fade — Phong handles its terminator).
- 1c Surface mode DELETED (code + UI; bug #37 moot). 1d LIVE-by-default
  verified (v5.1.2 already shipped it); Viking 1 — 1976 preset built
  (Mars had no route back to its epoch; Apollo-11 pattern).
- 1e Textures: SSS Saturn (4096×2048 — SSS's max for Saturn) + 2K GDI+
  base + 8192×500 RGBA Cassini ring strip; Steve Albers cylindrical
  maps for Titan/Enceladus/Iapetus/Mimas/Tethys/Dione/Rhea (4K–8K).
  Hyperion/Phoebe: no fetchable maps — color-only + procedural.
- 1f Ephemeris: λ0 anchored to the 2025-03-23 ring-plane crossing —
  LIVE is the default view, so TODAY'S ring tilt wins the circular-
  model error budget (2026 δ ≈ −7.1° vs real −7.5°, rings nearly
  edge-on; costs ~2° at the 2004 Cassini SOI epoch, documented).
  tests/saturncal.mjs is pure node (ephemeris.js is dependency-free).

**Phase 2 — 4 parallel Haiku workers, exclusive file ownership:**
W1 saturn-clouds/saturn-atmosphere, W2 saturn-rings/ring-particles,
W3 titan/enceladus/iapetus, W4 saturn.js config. The house rule held a
third time — every worker shipped real bugs caught in review BEFORE
commit: Cassini Division fallback ramped to 0.90 opacity across the
gap; Encke gap in A-ring-relative coords vs full-span position;
Enceladus tiger-stripe mask INVERTED (stripes everywhere EXCEPT the
pole); iapetus undeclared variable (compile failure) + ridge gate
multiplying the whole height field; reversed-arg smoothstep (GLSL UB).

**Phase 3 — integration + measured calibration:**
- Rings: ONE textured disc, span calibrated by MEASURING the SSS
  strip's alpha profile (Cassini dip t≈0.71, B onset t≈0.32 →
  69,075–140,715 km; F ring below the strip's floor, omitted). NORMAL
  blending (B ring occludes — additive can't). Saturn shadow preserved.
  24k fly-through particles (band-weighted radii, ±25 km), visible when
  the camera is within 5,000 km of the plane and inside the span.
- Ring shadow on clouds: analytical sun-ray/ring-plane crossing in the
  kronos chunk — applied to diffuseColor AFTER the detail mix (a real
  shadow doesn't scale with uDetailBlend; measured 63%→7% dilution
  before the fix), activation 400,000 km so it reads from NAV entry.
  Probe: band 2.2× darker than mirror latitude at 2017 northern summer.
- Titan: opaque haze shell needed TWO discoveries — FrontSide (a
  BackSide shell's disc fill is always depth-occluded by the moon) and
  three.js log-depth chunks (raw ShaderMaterials don't write log depth;
  the shell lost every depth test → rim donut). Now a Voyager-style
  opaque orange ball, surface ghosting through below 1,000 km.
- Physics: orbital inclination for Kepler orbits (+X node line);
  >90° = retrograde emerges naturally (Phoebe 175.2° verified
  orbiting opposite to all other moons); kepler velocities kept live
  (chase-mode tangents were equator-only before). Orbit lines inclined.
- Hyperion: deterministic sim-time tumble (3 incommensurate freqs —
  scales with time multiplier, freezes on pause, replays after jumps).
  Phoebe: 9.27 h spin for non-locked moons.
- Enceladus geysers: Io plume system parameterized (white ice, 2-radii
  jets, mesh-parented). Tiger stripes: 4 thin meandering parallel
  troughs (the ridged-noise first cut painted an angular maze).
- FOV/telephoto (backlog #12): OPTICS log slider 5–90°, 🔭 tray toggle
  48°↔10° (NORMAL is the renderer's 48°, not the prompt's assumed 75° —
  wide FOVs oval-stretch spheres, v2 lesson), sse-fov persisted,
  Earthrise auto-telephoto, Through-the-Rings preset at 25°.
- 7 Saturn curated presets (ui.js tagged list); Through the Rings uses
  orbit mode as the documented ring-floor exemption.
- Suites: saturntest.mjs NEW (23), saturncal (8), security (28);
  presets extended (Viking). Full regression green (16 suites).
- Deployed (1c24c6b9) and live-verified with cache-bust: all FOUR
  systems at v7.0.0, zero console errors, zero CSP violations, v7
  feature strings in the served bundles. Security suite 28/28 against
  the live URL. **Mozilla Observatory: A+ (score 130, 10/10 tests,
  scanned 2026-07-12)** — exceeds the launch target.

### v7.0.1 — Saturn Hardware-Review Fixes (2026-07-12, commits 769edae + 5e484ab)
Kyle's real-hardware pass, two fixes:
- Ring particles REMOVED entirely (769edae): the fly-through overlay
  read as white blob snowflakes, not ice. _buildRingParticles + the
  plane-proximity gate + the point shader deleted; the textured disc
  alone carries the ring plane. saturntest now asserts particle ABSENCE.
- Cloud bands (5e484ab): measured 4% zone/belt contrast (uniform tan).
  LAYER 2 rewritten as a per-latitude palette — cream zones / warm brown
  belts via fract(lat·3.5) with fbm edge meander, blue-grey polar caps,
  strengthened north hexagon-region tint; base texture kept as
  brightness modulation. Terminator widened via shaderParams
  (−0.25/0.20 — thick-atmosphere scatter past the shadow line). After:
  11–13% band contrast at formula latitudes, Hubble-style banding
  confirmed by screenshot. Ring shadow measured unchanged (2.2×).
  Probe gotcha logged: framing evaluates must setMode('free') + settle
  BEFORE the screenshot evaluate — cinematic flies the camera between
  evaluates. NOTE: prescribed probe latitudes vs the fract(lat·3.5)
  band map disagree — sample where the formula actually puts belts.
- Deployed (ab19da60) after two transient Cloudflare API 5xxs (522/520
  — their side; first backoff retry succeeded). Live bundle verified:
  particle strings gone, palette + terminator strings present.

### v7.0.2 — Universal Thin-Atmosphere Halo Fix (2026-07-12)
Kyle's hardware pass, all systems: thin-atmosphere halos read as thick
rings wrapping the night side. Universal fix (Titan + Saturn EXEMPT):
- renderer.js: makeLimbScatterMaterial gains uFresnelPow/uLit0/uLit1
  uniforms (defaults 3.0/−0.12/0.25 preserve Jupiter's gas-giant limb);
  atmosphereLimb shells pass fresnelPower + tight lit gate (−0.05..0.20)
  and default thickness 0.02→0.008. makeShellAtmosphereMaterial gains
  uHorizonGlow (config opt-in, Earth only).
- earth-atmosphere.glsl: fresnel pow 2.8→5.0, lit gate −0.25..0.15 →
  −0.05..0.20, v5b night-scatter term REMOVED (halo alpha had a
  night-side floor — the ring cause; terrain nightAmbient unaffected),
  ISS horizon arc gated by uHorizonGlow and sharpened (3.2→6.5).
- mars-atmosphere.glsl: fresnel 3.5→4.5, lit gate −0.08..0.15 →
  −0.05..0.20, low-alt rim pow 3.0→3.8.
- Configs: Earth thickness 0.025→0.010 + intensity 1.2→0.5 +
  horizonGlow; Mars 0.015→0.012; Io/Europa/Ganymede atmosphereLimb
  thinned (0.005/0.004/0.006, intensity 0.12/0.08/0.15, fresnel
  6.5/7.0/6.0, spec colors). Moon/Callisto/Saturn moons: none (already).
- tests/haloshots.mjs NEW: diff-render probe (frame with vs without
  atmosphere shells — starfield/clouds cancel; a luminance threshold
  alone reads Milky Way pixels as halo). Analytic silhouette radius
  (asin(R/d) projected), samples ±80° per half. Measured: night halo
  0px on all five bodies; lit runs Earth 3px / Mars 4px / Io 2px /
  Europa 1px / Ganymede 2px. Spec-altitude close-ups (Earth 2,919 +
  405 km ISS line, Io 369 km) verified by screenshot.
- Regression green: smoke 22/22, limb, moonlimb, earthtest 14/14,
  marstest 13/13, titanprobe (shell ratio 1.10 + opaque haze intact).

### v8 — Mercury + Venus + Uranus + Neptune: the 8-planet solar system
### (Complete — 2026-07-12, commits 87436b7 → eaed2f1 + docs)
Per Docs/V8_REMAINING_PLANETS.md. Version 8.0.0. NAV now travels all
EIGHT planets. Live-verified: all 8 systems at v8.0.0 on
app.solarexplorer.co, zero console errors, CSP intact, npm audit clean.

**Prompt-vs-reality (the V8 prompt assumed a foreign schema — grounded
against mars.js/saturn.js before any work):** no `luminosity`/`oblateness`/
`surface.shader`/`polarOrbitingMoons`/config-side curatedPresets exist.
Key discovery: the engine works in the primary's EQUATORIAL frame, so
Uranus's "moons over the poles" needs ZERO physics changes — moons+rings
live in the equatorial plane automatically and the 97.77° tilt expresses
itself through the calibrated sun direction (root.rotation.z carries the
tilt for the starfield). Retrograde ROTATION (Venus 177.36°, Uranus
97.77°) uses positive periods + the >90° tilt convention; retrograde
ORBIT (Triton) is inclinationDeg 156.885 (Phoebe convention, verified:
Triton steps −0.164 rad while Proteus steps +0.933).

**Phase 1 — textures + calibration + skeletons (orchestrator):**
- SSS Mercury 8K (+2K GDI+ base), Venus atmosphere 4K (+2K base; the
  clouds ARE the diffuse — the radar surface map is NOT shipped, URL in
  venus.js), Uranus/Neptune 2K (SSS max — featureless planets). Triton:
  real Voyager 2 map (Steve Albers SOS 4K, attribution required).
  uranus/rings.png GENERATED (GDI+ 2048×32 radial strip, 9 narrow rings
  + ε at true radii 41,837–51,149 km, widths ~5x so 1-px rings survive).
- Ephemeris λ0 anchors (scratch v8cal.mjs verified through the engine's
  own sunDirectionAt): Uranus λ0 −3.69° from the 2007-12-07 equinox —
  reproduces Voyager 1986 (δ −81.4°, SOUTH pole sunward) AND LIVE 2026
  (δ +77.1°, sun near the NORTH pole — the signature view). Neptune λ0
  −34.81° from the 2005 southern solstice (Voyager −22.9°, 2026 −19.3°).
  Venus δ = ±2.6° via the 177.36° tilt. Mercury: MEAN-longitude anchor —
  e = 0.206 makes the circular model oscillate ±23° (equation of
  center), zero-mean by construction, documented in mercury.js.
- Epochs (house pattern): MESSENGER OI 2011, Magellan OI 1990,
  Voyager 2 1986-01-24, Voyager 2 1989-08-25.
- renderer geysers.tint config override (Enceladus stays white ice;
  Triton's nitrogen plumes entrain dark dust). tests/v8skeleton.mjs.

**Phase 2 — 4 parallel Haiku workers, exclusive file ownership:**
W1 mercury-surface + mercury.js, W2 venus-clouds + venus.js, W3
uranus-clouds + miranda-surface + uranus.js, W4 neptune-clouds +
triton-surface + neptune.js (~50–65k tokens each). The house rule held a
FOURTH time — every worker shipped real bugs caught in review BEFORE
commit: reversed-smoothstep UB at SIX sites; Uranus storm anchored to
vObjPos so every fragment computed its own storm center (v5 hurricane
class); Triton geyser zone compared radians against sin-space constants
(a 1° sliver at −49° instead of −31..−57°); Venus "morphing" was a
global sin(uTime) amplitude that periodically flattened the planet;
Venus lightning hashed per-PIXEL (white-noise static, fixed with
cell-quantized flashes); cantaloupe "septa" drawn as an annulus around
each cell center = the banned donut-rim pattern (real walls live at
HIGH Worley distance); Miranda's crater suppression ran AFTER the
grooves it was meant to spare; Caloris gained a third crater field
instead of suppressing (real floor is smooth plains).

**Phase 3 — integration + measured visual calibration:**
- 6 detail styles registered (hermes/aphrodite/ouranos/miranda/
  poseidon/triton, brace-isolated chunks; cloud styles on gas-giant
  octaves). 16 curated presets (4/system) in the ui.js tagged list,
  incl. the 4 epoch presets (MESSENGER/Magellan/Voyager 2 ×2).
- Venus super-rotation: 3.9-day cloud deck vs 243-day planet via
  time-drifting UV resample of the diffuse. Rate is EXACTLY 3.0e-6
  rev/s so the 1e6-s uTime wrap advances an integer 3 revolutions —
  no pattern pop. (uTime in detail styles is SIM seconds — freezes on
  pause, scales with multiplier; super-rotation is physical.)
- Screenshot calibration (v6 four-iteration precedent, three rounds):
  Miranda corona grooves 0.20→0.025 + fbm amplitude variation +
  normalScale 2.0→1.2 (the first cut was zebra-print bullseyes);
  Triton dimples soft-edged/per-cell-hashed/70%-thinned + normalScale
  1.5→1.0 (bubble wrap); Mercury crater tier halved + thinned to
  20%/15% (pepper speckle over an 8K map that already carries craters);
  Venus lightning 0.6% duty/wider/dimmer (read as stuck pixels).
- Suites: tests/v8test.mjs NEW (21 — all six styles compile at close
  range, Triton retrograde vs Proteus, Miranda world-Y amplitude
  0.99 R = over the poles, polar sun, geyser mesh-parenting),
  v8shots.mjs (7 screenshot probes), v8live.mjs (live URL: CSP +
  bundle feature strings + all 8 systems boot). Full regression green:
  smoke 22, earthtest 14, marstest 13, marscal, saturntest 22,
  saturncal, presets 60, v5b 18, livedefault, nightlights, hurricane,
  glint, incmeasure 6, ringfloor 7, haloshots, v8skeleton 10, v8test 21.
- Deployed (92af3d44); all 8 systems live-verified with cache-bust.

### v8.0.1 — Hardware-Review Fix Batch (2026-07-12)
Kyle's real-hardware pass on v8: four items, all measured before fixing.
- **INC slider no longer forces Orbit Insertion**: adjusts the current
  orbit in orbit mode (orbPhi = π/2 − inc) and insertion mode directly;
  the v4c auto-switch + toast now fire only from non-orbital modes.
- **Moon night side (bug class = Mars #55)**: measured 14% mean night
  luminance with EVERY pixel bright at 3,480 km. moon-detail.glsl had no
  night discipline at all, ±rim relief, painted "lit rims", a terminator
  drama layer amplifying relief on BOTH sides of the terminator, and a
  reversed-smoothstep earthshine gate (UB). Now: bowl-only relief, rim
  paint removed, per-chunk day fade + graze fade on fine scales,
  day-gated terminator drama, earthshine 0.06→0.015 LINEAR (the emissive
  was the entire flat night glow — linear 0.06 sRGB-encodes to ~14%
  output; 0.015 ≈ the 8% spec; the prescribed `earthshine` config field
  never existed — it is hardcoded in the chunk). Moon shaderParams added
  (−0.02/0.06 + 0.15/0.50). DAY-side bycatch (screenshot): the v5 mare
  "white ejecta" painted positive rims — a full donut-ring sheet at
  2,500 km — now bright fresh-crater FLOORS. Wrinkle-ridge dark
  squiggles remain (pre-v8 character, logged with #63).
- **cratered style audit**: Ariel measured 38k bright night ring pixels
  — the shared style (Callisto/Phobos/Saturn+Uranus moons/Proteus) had
  no night fade either; added captured-baseline day fade + graze fade on
  its finest scales (accepted day-side look untouched). Mercury/Miranda/
  Triton measured PURE ZERO before any fix — the V8 chunks' night
  discipline held. Mercury shaderParams tightened (−0.01/0.03 +
  0.10/0.40). Guard: tests/moonnight.mjs (anti-solar luminance probe;
  GATE=1: all six probes ≤ 8% / zero bright pixels).
- **Lit-hemisphere entry**: default cinematic shots are now SUN-RELATIVE
  (startTheta = offset from the live subsolar azimuth) and the camera
  ELEVATION follows the sun for near-polar suns (Uranus) — all 8 systems
  open at cam·sun ≈ 0.93. Scripted presets (Voyager, Earthrise) keep
  absolute thetas. (The prescribed ins.phase fix targeted the wrong API —
  boot enters cinematic mode, not insertion.)
- **⏸/▶ pause button** in the tray between 📷 and 👁: icon mirrors state,
  resume restores the last non-zero speed (physics.pausedIndex), Space
  was already bound, PAUSED HUD label synced. LIVE fix: pause now
  suspends the LIVE sync (it used to force 1× back instantly); resume
  re-syncs via the >2 s drift snap.
- Guards: tests/v801.mjs (18 checks) + moonnight GATE. Full regression
  green (smoke, earthtest, marstest, saturntest, v8skeleton, v8test,
  incmeasure, ringfloor, polesnap, incroll, presets, v5b, livedefault,
  nightlights). Deployed (658e3c61); all 8 systems live-verified at
  v8.0.1, zero console errors.

### v7.0.3 — Custom Domain app.solarexplorer.co (2026-07-12)
Primary URL is now https://app.solarexplorer.co (zone solarexplorer.co;
landing page at the apex is separate and unchanged). Changes:
- wrangler.toml: routes for app.solarexplorer.co/* + `workers_dev = true`
  — GOTCHA: adding a route silently DISABLES the workers.dev URL
  (measured: 404 after first deploy); the explicit flag keeps the legacy
  alias live.
- src/config.js: new APP_URL constant (canonical public URL).
- ui.js _sharePreset: share links use APP_URL in production (canonical
  even when visited via workers.dev), location.origin in dev so
  localhost testing still works.
- README live-demo link, security.txt Canonical updated. CSP untouched
  (fully origin-relative). Docs/ prompt files + version history keep
  the old URL as historical record.
- Verified live: both URLs 200; headless probe drove the real SAVE →
  🔗 flow on app.solarexplorer.co with a stubbed clipboard — copied
  link is https://app.solarexplorer.co/?view=… ✓; stack.mjs share/
  preset checks green (its 4 failures are pre-v7 staleness: 9 stack
  buttons vs expected 6, Saturn now a built system — suite needs a
  refresh, logged as bug #61).
- NEW FINDING (bug #62): Cloudflare zone auto-injects Web Analytics
  (static.cloudflareinsights.com/beacon.min.js) on the custom domain;
  our CSP blocks it (console error, no functional impact). Decision
  needed: disable RUM injection in the dashboard (privacy-policy
  aligned) or allow it in CSP script-src/connect-src.

### v9 — The Sun: First Star System (Complete — 2026-07-12, commits 05e090e → see final + docs)
Per Docs/V9_SUN.md. Version 9.0.0. NAV now travels all 8 planets AND the
Sun. Live-verified: all 9 systems at v9.0.0 on app.solarexplorer.co and
workers.dev, zero console errors, security suite 28/28 vs the live URL,
npm audit clean.

**Prompt-vs-reality (grounded before any work — the V8 lesson):** no
`radiusNormalized` exists ("Jupiter = 1.0 world units" is false — the
engine is true-scale km, KM_PER_UNIT 1000), so the Sun ships at real
radiusKm 696,000 (696 units; log depth buffer + the 1.8e6-unit starfield
absorb it). The prompt's corona pseudocode sampled length(vWorldPos) for
radial falloff — CONSTANT on a shell; replaced with the view ray's IMPACT
PARAMETER b (closest approach to the origin), which is the correct
"distance from the sun" for any glow shell. The prescribed PointLight
"illuminating the corona from inside" was dropped — every sun material is
an emissive raw shader that ignores scene lights. Config-side
curatedPresets still don't exist (presets live in the ui.js tagged list).

**Phase 1 — isStar infrastructure (orchestrator):**
- system.isStar branches: _buildSunLights (ambient only — no directional
  sun, no planet-shine, no sprite/lens flare) and _buildSunPrimary
  (photosphere sphere + chromosphere 1.005x + corona 8x BackSide additive
  shells, all with the V7 logdepthbuf chunks). _syncSunDirection guarded.
- Config-driven maxInsertionAltKm (default 500,000; Sun 5,000,000 —
  500,000 km is less than one solar radius above the photosphere): camera
  entry/zoom/setInsertion clamps + both ui.js ALT slider ceilings.
- main.js loading fix: a texture-less system never fires
  loadingManager.onLoad — isStar reveals after 600 ms instead of the 12 s
  fallback stall.
- NAV star row: HERE badge when current, travel row when built, stub
  otherwise. SOLAR ACTIVITY slider in VIEW (star systems only, Solar Gold
  readout, sse-sun-activity persisted, default 0.75 = Cycle 25 max).
- sun.js skeleton: J2000 epoch, star block for engine parity
  (distanceAU 0 makes the HUD signal-delay formula yield the true ~8 min
  20 s to Earth), IAU W0 = 84.176° rotation phase, Carrington 609.12 h.
- Gate: tests/sunskeleton.mjs (15) + full 18-suite regression green
  BEFORE workers spawned.

**Phase 2 — 4 parallel Haiku workers, exclusive file ownership:**
W1 sun-photosphere.glsl, W2 sun-corona + sun-chromosphere, W3
sun-spots.glsl (a GLSL library prepended to the photosphere fragment —
no RTT pass; spot state lives on the CPU), W4 sun.js completion. The
house rule held a FIFTH time — review caught real bugs BEFORE commit:
the 2-plane worley2 projection degenerated (equatorial bands stretch into
a near-1D domain + hemispheres mirror; fixed with a LOCAL 3D worley
(ph_worley3) sampled directly on the sphere direction — no projection at
all); faculae threshold inverted (1−smoothstep(0,…) selected the dark
HALF of the noise field, ~50% coverage instead of sparse bright patches);
corona polar plumes had no radial attenuation (constant fan to the shell
edge with a hard cut at b=8); sunspot filaments normalized a zero vector
at the exact spot center (NaN propagates through 0*NaN).

**Phase 3 — integration + measured calibration:**
- Sunspot lifecycle (CPU): spawn in the ±30° belt, drift at the residual
  Snodgrass rate (the SAME residual the granulation shader uses, so spots
  stay pinned to their plasma; the mesh carries the equatorial term —
  rotationPhaseAtEpochDeg stays meaningful), 7–21 sim-day lives, count
  tracks the activity slider with ~1.5 s wall-clock spawn/retire blends
  folded into the shader's age-fade windows (a sim-day fade is invisible
  at 1×).
- Differential rotation precision: uTime wraps at 1e6 s (drifts use the
  closed-loop circular noise trick, integer K — granulation K=1667 ≈
  600 s cycle); the unwrapped uDays uniform carries the secular residual
  drift (float32-safe for decades where raw simSeconds is not).
- Flares: particle arcs from live sunspots (80 sprites along a loop,
  additive, parented to the photosphere mesh in unit object space so they
  ride rotation), wall-clock 4–9 s lives, probability ∝ activity × spot
  count with a mild log10(multiplier) boost. Prominences: 4 deterministic
  (mulberry32) CatmullRom tube loops at the limb, calibrated from
  cartoon-red rings (0.5 opacity) to thin deep-red plasma arcs.
- Screenshot calibration (3 rounds, house precedent): granulation LOD —
  dtlFreqFade at freq 8/20 fades each worley octave toward its mean well
  before sub-pixel, so the disc is granulated at ≤500k km and a clean
  limb-darkened disc by ~2–3M km (the first cut read as white confetti
  from orbit — the v4b shimmer class); output gain 1.6 → 1.35 (blown
  whites); body-card temps corrected to °C (fmtTempRange renders °C —
  Kelvin values would have mislabeled).
- 4 Sun curated presets in the ui.js tagged list (setMode FIRST, then
  setInsertion — the v6 order rule).
- Suites: tests/suntest.mjs NEW (28 — limb darkening via analytic disc
  projection because the insertion forward tilt offsets the disc; corona
  diff-render VISIBLE at 500k / OCCLUDED at 50k; spot-count-vs-slider;
  flare spawn+cleanup; presets incl. the 1.2M km altitude surviving
  entry; Sun→Earth/Jupiter cross-system lighting restoration),
  sunshots.mjs (5 calibration screenshots), prodboot.mjs (all-9-systems
  boot probe, works on preview AND live). GOTCHA: diff-render probes must
  pause physics + double-render raw (renderer.render + readPixels in ONE
  evaluate) — the postfx film grain is temporal and defeats
  screenshot-pair diffs (first probe version measured grain, not corona).
- Full regression green at 9.0.0: all 20 prior suites + sunskeleton 15 +
  suntest 28. Deployed (7ea4abd6); both URLs live-verified — first probe
  hit the stale edge cache (v8.0.1 for ~20 s), second pass clean.

### v10 — Pluto + Charon: the dwarf-planet binary (Complete — 2026-07-13,
### commits f808359 → see final + docs)
Per Docs/V10_PLUTO.md. Version 10.0.0. NAV now travels all 8 planets, the
Sun, AND Pluto (♇ icon via the new SOLAR_SYSTEM per-body icon field).
Live-verified: all 10 systems at v10.0.0 on app.solarexplorer.co, zero
console errors, security 28/28 vs the live URL, npm audit clean.

**Prompt-vs-reality (grounded first, house rule):** no `luminosity`/
`oblateness`/`surface.shader`/config `curatedPresets` (the V8 finding
again) — real schema is star.intensity+direction, detail styles,
atmosphere.style, ui.js tagged presets. The prompt's `rotationPeriodHours:
-153.293` violates the house retrograde convention (tilt 122.53° > 90 +
POSITIVE period). The "binary barycenter physics pattern" (bug #65) was
NOT needed: Charon as a Keplerian moon + equal periods gives the mutual
lock BY CONSTRUCTION — measured sub-Charon meridian pinned at 0.000°E at
epoch, quarter-orbit, and two orbits (Pluto's ~2,110 km barycenter wobble
is the only unmodeled part).

**Phase 1 — textures + calibration + skeleton:**
- Albers SOS New Horizons color mosaics: Pluto 8K (2K base + 8K
  progressive, Mercury pattern), Charon 4K. Non-commercial by permission,
  attribution required (joins backlog #10).
- Ephemeris λ0 = +158.1° (tests/plutocal.mjs, 8 checks): flyby subsolar
  +51.5°N (heart sunlit, south pole in decades-long dark) AND LIVE-era
  +57.0° approaching the 2029-30 solstice max 57.47° = 180 − tilt.
- Epoch 2015-07-14T11:49Z (New Horizons closest approach, house pattern).

**Phase 2 — 3 parallel Haiku workers (exclusive files):** W1
pluto-surface + pluto-atmosphere, W2 charon-surface, W3 pluto.js. The
house rule held a SIXTH time — review before commit caught: Sputnik
convection dimples at cell CENTERS (bubble wrap), dtlFreqFade pinned at
freq 40 under 120/240-cycle ridge noise (v4b shimmer class), and the
atmosphere forwardScatter with a +dot that peaks on the DAY side
(forward-scattered light exits along −uSunW). Charon's chunk passed
review clean — a first.

**Phase 3 — integration + measured calibration:**
- TEXTURE CONVENTION FINDING: the Albers Pluto map centers on 180°E (the
  standard NH presentation — heart at center) but the ENGINE convention
  is 0°E at map center (Earth precedent, suncal pixel-verified; measured
  via flyToFeature landing 180.7° off). Shipped jpgs ROLLED 180° with
  exact pixel clones (a DrawImage first cut left a seam line); the heart
  wraps the u seam at 0.989 (shader masks made wrap-aware). Charon's map
  is already center-origin — untouched.
- rotationPhaseAtEpochDeg −139.2 IN LOCKSTEP with Charon phaseDeg −139.2:
  subsolar lands 176.0°E (heart center) at the epoch while the lock keeps
  sub-Charon at 0°E (IAU prime meridian) — heart at the anti-Charon point
  exactly as in reality. Charon's local lon 0 faces Pluto (the
  plutoshine +X assumption, verified).
- Screenshot calibration (3 rounds): Sputnik polygons rewritten as a
  per-cell TONE MOSAIC (color only, zero relief) — BOTH worley-F1 relief
  cuts stamped rings, because high-F1 regions circle feature points (true
  cell boundaries need F2−F1, not in the GLSL library). Blue haze ring:
  negated forward-scatter dot + dedicated wider fresnel (pow 2.5, 4x
  gain) — the backlit crescent now shows the NH blue ring; crescent
  preset switched to sunRel offset (absolute theta landed lit-side).
- 5 curated presets (NH 2015 epoch preset returns the sim to the flyby
  AND frames the heart; binary preset shows both worlds + the Sun as a
  brilliant star). Boot cinematic lit (settled cam·sun 0.947).
- Suites: tests/plutotest.mjs NEW (28 — epoch/lock/heart/Cthulhu probes,
  haze diff-render blue-dominance, moonnight night gate 0 bright px,
  binary NDC framing, Mordor pole-vs-mid patch, all presets, cross-system
  boots), plutoshots.mjs (6 calibration screenshots), plutocal.mjs (8).
  prodboot extended to 10 systems + version-agnostic. Full regression
  green at 10.0.0 (25 suites). Deployed (3ddff730); both URLs live-
  verified, all 10 systems, zero console errors.

### v10.0.1 — About section, donate URL, HUD site link (2026-07-13)
- Donate: KOFI_URL placeholder replaced by DONATE_URL →
  https://solarexplorer.co/support (tray ☕ button; .kofi-btn class kept —
  tooltip/tray suites reference it). SITE_URL added to config.js.
- HELP panel: About section at the bottom (divider, ABOUT title, blurb,
  `v${__APP_VERSION__} · Built by Kyle Ewing`, 🌐 solarexplorer.co link,
  privacy line). Version string reads the Vite define — never hardcode it.
- HUD: persistent #site-link (solarexplorer.co) inside .hud-ghost below
  the ghost clock; hides with the HUD in presentation mode. No CSP change
  needed (plain target=_blank navigation, not a fetch).
- Physics "pause inactive systems" optimization: MEASURED, NOT SHIPPED.
  The premise was false — one PhysicsEngine exists per page (system switch
  is a full page navigation, config.js switchSystem), so inactive systems
  never tick. tests/physbench.mjs baseline: worst case 2.0 µs/frame
  (Jupiter, 4 n-body moons) — 250x under the 0.5 ms target. Frame-skipping
  would risk 6x-coarser rotation stepping at 10,000x for a ~2 µs gain.
- Suites: tests/about.mjs NEW (27 — donate href, About content/styling,
  site-link + presentation-mode hide, Triton retrograde, zero console
  errors on all 10 systems), tests/physbench.mjs NEW (per-system physics
  µs/frame). smoke 22, ringfloor 7, orbitdir, datepicker, plutotest 28
  all green. tray/tooltip/stack failures confirmed PRE-EXISTING on clean
  HEAD via git stash (stale v4c-era selectors: data-audio-mode,
  .presentation-btn, 6-vs-9 stack buttons, Saturn Coming Soon toast).

### v10.0.2 — GA4 cookieless analytics + CSP update + privacy text (2026-07-13)
- GA4 (G-9WT0466782) added, backlog #11 DONE. Bootstrap is public/ga-init.js
  (external, NOT inline — script-src has no 'unsafe-inline'; an inline
  snippet CSP-violated on every load, caught by tests/security.mjs) loaded
  synchronously before the async gtag.js tag so dataLayer + consent
  defaults exist first.
- Cookieless is enforced by consent mode — gtag('consent','default',
  {analytics_storage:'denied', ad_storage:'denied'}) BEFORE config. The
  legacy storage/client_storage:'none' fields are kept but GA4 ignores
  them (they show up as ep.* params in hits). Verified via headless probe:
  ZERO cookies, no _ga localStorage, gcs=G100 consent flag in every hit.
- send_page_view:false + custom page_view from boot() (src/engine/
  analytics.js): switchSystem() is a full page navigation, so every system
  switch lands in boot() — auto + custom page_view would double-count.
  page_title = capitalized system slug → per-system breakdown in GA4.
- preset_launch event wraps the single curated-preset dispatch point
  (ui.js preset-row onclick): preset_id = label minus emoji, system =
  slug. User-saved presets NOT tracked (names are user data).
- Analytics helpers no-op in dev (import.meta.env.DEV) and under
  automation (navigator.webdriver) — regression suites don't pollute the
  property. Probes must mask webdriver to observe hits.
- CSP (public/_headers): script-src + www.googletagmanager.com
  www.google-analytics.com; connect-src/img-src use *.google-analytics.com
  *.googletagmanager.com *.analytics.google.com wildcards per Google's CSP
  guide (EU visitors route to region1.google-analytics.com — www-only
  allowlist would drop their hits with console CSP errors).
- HELP About privacy line: "No cookies · Anonymous usage stats only"
  (was "No tracking · No cookies · No data collected"); tests/about.mjs
  assertion updated.
- GA4 flushes events in BATCHED POSTS with multi-second delay — probes
  must inspect request POST bodies, not just URLs, and wait ~10 s.
- Suites: security 28 (zero CSP violations on all systems WITH GA4 live),
  about 27, smoke 22, presets 60 — all green. npm audit: 0 vulns.
- Observatory (post-deploy scan, algorithm v5): workers.dev A+ (125) —
  GA4's only cost is -5 SRI (gtag.js can't be hashed, Google rotates it).
  app.solarexplorer.co was C (55): HSTS missing from _headers (never
  there — FIXED, Strict-Transport-Security added → B 75) + no HTTP→HTTPS
  redirect (zone "Always Use HTTPS" off — bug #63, needs Kyle's dashboard
  toggle, then A+ 120). GA4 did NOT degrade the CSP test (still passes
  no-unsafe with the specific external hosts).
- Live verification (headless, webdriver masked): gtag.js loads, exactly
  one page_view per system visit (dt=Jupiter/Saturn/Pluto — GA4 sends
  page_title as the dt= param, NOT ep.page_title; probe assertions must
  check dt=), zero cookies on live origin, About shows v10.0.2 + new
  privacy line, only CSP violation is the pre-existing bug #62 beacon.

### v10.0.3 — atmosphere gradients + Jupiter preset speeds + star backdrop (2026-07-14)
- 3-stop vertical atmosphere gradient on every thin-atmosphere primary
  (Earth, Mars, Jupiter, Saturn, Uranus, Neptune, Pluto — Titan/Venus
  exempt, dedicated opaque shaders untouched). Gradient axis is the
  view-ray IMPACT-PARAMETER height in the shell (h = ((1+t)·sin−1)/t,
  0 = cloud tops, 1 = shell top), NOT a fresnel remap — raw fresnel only
  spans ~0.7-1.0 across the visible halo annulus, so any fresnel-derived
  height never reaches the low color band. Jupiter/Uranus/Neptune get it
  via makeLimbScatterMaterial (config colorLow/Mid/High + opacity, GLSL
  GRADIENT3 define; legacy 2-color path compiled unchanged for the moon
  exosphere slivers). Earth/Mars/Saturn/Pluto get it baked into their
  dedicated .glsl shells + a new shared uThickness uniform. Night-side
  gate untouched (haloshots: night run 0px on all five disc bodies).
- Modest halo visibility bumps: Earth intensity 0.5→0.65, fresnel pow
  5→4; Mars 0.9→1.15 (×0.35 bake → effective 0.40); Saturn 0.9→1.1 +
  pow 3→3.5; Pluto day-haze scale 0.30→0.38 (backlit NH ring gain
  untouched). Kyle's spec opacities assume uniform-alpha semantics the
  additive pipeline doesn't have — applied as relative increases instead.
- Jupiter curated preset speeds: the REAL bug was presets that never set
  a time index inheriting the user's stale speed (run Triple Moon Shadow
  at 1,000×, then Io Volcano Flyby launched at 1,000×). Io Volcano Flyby
  + GRS Close Pass now set 10×; Triple Moon Shadow 1,000×→100× (spec said
  50× — TIME_STEPS has no 50, 100× is the closest step; notify text
  updated); Voyager 1979 1×→100× (moons visibly move during the sweep);
  Moon Alignment stays a deliberate 10,000× (resonance needs it).
- Starfield: milkyway.jpg 4000×2000 → 6000×3000 (7.9 MB). MEASURED
  CEILING: ESO's downloadable original TIFF for eso0932a is itself
  6000×3000 — the 800-Mpix GigaGalaxy version exists only as zoomify
  tiles. 8K+ of the SAME photographic pano would need tile stitching;
  NASA SVS starmap_2020 offers 8K/16K but is a synthetic catalog render
  (different visual character — not swapped without Kyle's say-so).
  Bug #59 starfield half improved ~1.5× linear; telephoto blur below
  ~30° FOV remains inherent.
- Star backdrop recede (~15-20%): HYG star sprite color ×0.8, panorama
  sky MeshBasicMaterial color 0xd9d9d9, procedural-fallback opacity
  0.95→0.80. toneMappingExposure deliberately NOT touched (global — dims
  planets too). Verified: lit Jupiter clearly dominates, named stars
  still visible.
- tests/v1003probe.mjs NEW (preset speeds asserted AGAINST pre-set stale
  1,000×, + limb gradient inner-brighter-than-outer on all six gradient
  primaries). Probe lessons re-learned: diff-render with/without
  renderer.atmosphereMesh in ONE evaluate — analytic silhouette math
  loses to tilted oblate ellipses (Saturn 26.7°) and renderer.update()
  re-asserts ring visibility per frame, so hide sky/points/rings AFTER
  update, before the raw renders. tests/v1003visual.mjs NEW (backdrop +
  30° FOV shots).
- Suites: smoke 22, presets 60, v1003probe 18, plutotest 28, earthtest
  14, marstest 13, saturntest 22, v8test 21, haloshots PASS, limb 4
  shots + 0 errors — all green.

### v10.0.4 — Earth surface haze + cloud fade + false Africa lights (2026-07-14)
- Surface haze ROOT CAUSE (bug #74, diff-render measured with the new
  tests/hazeprobe.mjs): NOT the atmosphere shell (hiding it is
  pixel-identical over the disc at 500/5k/40k/100k km — the shell has no
  logdepthbuf chunks so it always loses the depth test inside the
  silhouette; only the halo annulus survives) and NOT a cloud alpha
  floor (coverage genuinely reaches 0 in clear zones — fbmN is signed).
  It was _buildPrimary's hardcoded Jupiter "ammonia ice" Phong specular
  (0x332211, shininess 8) — a broad warm lobe washing land AND ocean at
  EVERY altitude (+~[20,8,2] RGB at disc center, measured). Now
  config-driven (cfg.specular/cfg.shininess, gas-giant default
  unchanged); Earth sets specular 0x000000 — ocean reflection comes from
  the procedural glint, land is Lambertian. Kyle's proposed atmosphere
  fixes (altitude opacity fade, dimmer colorLow) deliberately NOT
  applied — probe shows the shell contributes zero over the disc, so
  they'd only dim the calibrated v10.0.3 halo.
- Cloud fade (bug #75): the knob is detail.activationKm (drives
  uDetailBlend), NOT detailFloor (texture-res floor). 50,000/500 gave
  blend 0.11 at 40,000 km (milky cloud ghost) and 0 at 100,000 km (no
  clouds at all — no Blue Marble). Now 2,000,000/100,000: blend 1.0
  through 100,000 km, easing off only toward system-framing distances.
  Terra detail (clouds/lights/glint/aurora) now effectively always-on
  for Earth — fine, dtlFreqFade guards handle distance aliasing and the
  disc is small when far.
- False Africa night lights (bug #76): the ungated RURAL term in
  earth-lights.glsl (fbm^1.5 × 0.06 on ALL land) lit the Sahara, Congo
  basin, and Kalahari. There is no density floor in this shader — Kyle's
  prompt's max(density, 0.02) doesn't exist. Rural now gated by
  smoothstep(0.05, 0.30, region) — dim sprawl survives around real metro
  regions, wilderness is ocean-dark. Also added the missing South Africa
  entries (Gauteng 0.55, Cape Town 0.35 — the verify list expected them).
- nightlights.mjs extended: Congo dark sample + DARK_CAP 13/255 (5%)
  assertion, plus a whole second southern-Africa pass (Johannesburg
  darkest-hour aim; Jo'burg > 1.8× dark refs, > 30 lum, darks ≤ cap).
  Measured after fix: Sahara 3.6, Congo 0.5, Kalahari 2, ocean 1 —
  dark land IS ocean-dark; Jo'burg 73, Cape Town 29; Europe unchanged
  (London 113, Paris 110).
- tests/hazeprobe.mjs NEW: 4 altitudes × {full, noatmo, nodetail,
  nospec} screenshot matrix with persistent toggles (survives the RAF
  loop's per-frame renderer.update — detail killed via entry
  activationKm, not the uniform, which update() rewrites every frame).
- Suites: earthtest 14, glint PASS, haloshots PASS (night halo still
  0px on all five disc bodies), smoke 22, nightlights both passes —
  all green.

### v10.0.5 — Earth diffuse upgrade + 16.7MB dead assets removed (2026-07-14)
- diffuse_8k.jpg replaced: was the stylized SSS daymap (4.4MB, soft,
  oversaturated swirly land texture, flat ocean); now NASA BMNG July
  world.topo.bathy.200407 — the SAME source series as the 5400×2700 boot
  map, so the silent progressive swap no longer shifts Earth's palette
  mid-session. Source: eoimages.gsfc.nasa.gov imagerecord 73751,
  21600×10800 original (26MB), Lanczos-downscaled to 8192×4096 JPEG q92
  optimized = 5.9MB. NOTE: Kyle's "15-25MB indicates quality" heuristic
  assumed a native-8K source; a downsample of a 233MP original encodes
  far cleaner at q92 — fidelity verified by 1:1 crop comparison
  (Himalaya/Alps/Baja: current was visibly soft, new resolves ridge
  detail + bathymetry). Both files Greenwich-centered, no UV retarget
  needed. Legacy eoimages URL pattern for other months:
  imagerecords/73000/{73580+25·(month−1)}/world.topo.bathy.2004MM.*.
- Dead textures deleted from public/textures/earth/: clouds.jpg (12MB),
  night.jpg (3.0MB), specular.jpg (1.7MB) — downloaded v5a, never wired
  (all three layers procedural by design), zero code references
  (comments/docs only; earth.js comment updated). Deploy asset list
  91→88 files, −16.7MB. Old SSS diffuse_8k recoverable from git history.
- Quality-gate finding (Phase 1): highResPrimary = tier==='desktop'
  (main.js detectQuality); tier only demotes on pointer:coarse, so
  desktop + headless Chrome both get the 8K swap. Verified at the
  network level, preview AND live: diffuse_8k.jpg 200 / 6,104,167 bytes,
  swap fires ~after loading screen, no dead-texture requests.
- tests/tex8kprobe.mjs NEW: production-build probe (no __sse) asserting
  the progressive swap fires (network response listener), correct byte
  size, no clouds/night/specular requests, zero console errors.
- Suites: prodboot 10/10 on preview and live, tex8kprobe preview+live,
  hazeprobe visual pass (all v10.0.4 fixes hold on the new texture),
  earthtest 14, nightlights both passes, haloshots PASS, v1003probe 18,
  smoke 22 — all green.

### v10.0.6 — Earth normal map + Black Marble night texture (2026-07-14)
- NORMAL MAP wired: SSS 8K earth normal map (the .jpg download URL
  serves an HTML page — the .tif works; 9.5MB TIF → 3.9MB JPEG q95
  4:4:4). Source is DIRECTX-convention: measured +G on the SOUTH-facing
  Himalayan front band (G=131 avg 26.5-28°N) — green channel inverted at
  conversion so the shipped normal.jpg is OpenGL/three convention
  (post-flip S-slope G=123.5). Re-derive from the TIF when replacing.
  Verified in-app: shadowed north faces along the Himalayan front under
  a low western sun (tests/normalcal.mjs — wired/flipY/off comparison,
  now a permanent calibration tool).
- TWO LATENT ENGINE BUGS fixed while wiring: (1) the textures.normal
  path (never exercised — no body shipped a normal map before) ran
  normal maps through _prepSurfaceTexture's sRGB tag, which makes the
  GPU decode-skew every normal (128 → 0.22, not 0.5) — now explicitly
  NoColorSpace on both the primary and moon paths; (2) normal-map
  strength shared p.normalScale with the PROCEDURAL relief (uNormalScale
  — Earth's 0.8 is the V5b cloud-lump calibration), so a terrain-map
  bump would have doubled cloud relief — new cfg.normalMapScale key
  (falls back to normalScale); Earth ships normalScale 0.8 +
  normalMapScale 1.5.
- NIGHT TEXTURE wired: SSS 8K nightmap (byte-identical to the v5a file
  deleted in v10.0.5 — now actually WIRED, not dead weight). Terra style
  gained uNightMap/uUseNightMap; earth-lights.glsl branches: Black
  Marble texture path replaces the 22-gaussian model when the map is
  loaded, procedural path remains the pre-load fallback; lightning
  shared by both. KEY CALIBRATION: the map carries a ~13/255 dark-blue
  ocean/terrain cast — subtract a 0.02 LINEAR black floor BEFORE the
  pow(0.8)×1.4 contrast boost or the Sahara/Congo re-light at ~8% (the
  v10.0.4 false-glow class). Sampler is sRGB-tagged (texture2D returns
  linear). Measured: London 187 lum (was 113 procedural), Johannesburg
  184, Cape Town 122, Sahara 2.6 / Congo 0 / Kalahari 1.5 — real Black
  Marble distribution, dark land still ocean-dark, nightlights passes
  UNCHANGED thresholds with better margins.
- Cloud "transparency fix" from the brief: verified NO-OP — the alpha
  floor it targets doesn't exist (proven by the v10.0.4 diff-render:
  clear-zone coverage reaches true 0, the veil was Phong specular).
  The proposed <0.05 hard cutoff would band every cloud edge; skipped.
- Glint note: glint.mjs core count changed (3390px → 0 over-200 px) —
  A/B measured NOT the normal map (peak 212 on AND off, over-200 count
  slightly HIGHER with map on at both 9,000 and 2,113 km); it's the
  v10.0.5 darker NASA ocean + that probe's pinned sim-time cloud state.
  Suite still passes its own assertions.
- tex8kprobe extended: normal.jpg + night.jpg 200s asserted, dead check
  narrowed to clouds/specular. Suites: earthtest 14, nightlights both
  passes (no threshold changes), haloshots PASS, smoke 22, glint PASS,
  hazeprobe day-side byte-identical to v10.0.5 baseline, prodboot 10/10
  + tex8kprobe on preview AND live — all green.

### v10.0.7 — clouds occlude city lights (2026-07-14)
- The lights chunk now reads the ACTUAL per-fragment cloud coverage —
  no recomputed approximation, no uniform. Kyle's Option A (simplified
  fbm re-derivation) would visibly mismatch the real cloud field at the
  terminator (his own verify item) and Option B (scalar uniform) can't
  express per-fragment cover; the clean route exists because both
  chunks run in the SAME injected fragment shader: a shared global
  `gCloudCover` (declared in the terra apply alongside gDetailEmissive)
  is written by the clouds chunk and read by the lights chunk. ZERO new
  noise calls.
- Physics subtlety: the export is the PRE-nightFade geometric coverage
  (clamp(ec_cloud, 0, 0.92)) — the visual cloud layer fades to nothing
  in deep night (V5.1.2), but the deck is still opaque and must occlude
  the lights below. Attenuation mix(1.0, 0.10, cover/0.92): clear = full
  lights, full overcast = 10% diffuse warm glow. Applies to BOTH the
  Black Marble and the procedural fallback paths; lightning exempt (it
  illuminates the deck from within). Aurora unaffected (emits above).
- tests/cloudocclude.mjs NEW: the Black Marble map is static, so any
  night-to-night variance in a city's luminance IS the occlusion —
  samples London at its darkest hour across 14 consecutive days.
  Measured [60.7..128.2] (was time-invariant before): clear nights full
  brightness, stormy nights ~47%. Asserts max > 45 and min < 0.6×max.
- nightlights.mjs passes UNCHANGED — and now shows the weather: London
  94 lum (cloud bank over Britain at the test hour), Milan 155, Jo'burg
  183 (clear). If a future run fails city-brightness marginally, check
  the weather at the test hour before suspecting the lights (the suite
  takes max over 5 cities, so all-clouded is vanishingly unlikely).
- Suites: cloudocclude PASS, nightlights both passes, earthtest 14,
  haloshots PASS (night halo 0px), smoke 22, prodboot 10/10 live +
  tex8kprobe live — all green.

### v10.0.8 — Earth terrain normal map disabled (2026-07-14)
- Targeted revert of the v10.0.6 normal MAP only (bug #77): universal
  horizontal cloud banding across the disc on real hardware, all
  browsers (Kyle confirmed; the initial clean desktop check was a stale
  cache). Headless SwiftShader does NOT reproduce it — hazeprobe pixels
  were byte-identical with the map on/off at all four altitudes, so
  this joins the #9/#27/#56 hardware-eyeball class and headless can't
  gate the revisit.
- Disable is CONFIG-driven, not an engine edit (the brief said
  "renderer.js only", but the textures.normal path is generic and
  data-driven by design — hard-disabling it in the engine would also
  block future moon normal maps): `normal:` removed from earth.js
  textures, so nothing loads and material.normalMap is null (verified
  by normalcal). normalMapScale 1.5 stays in config, unused, for the
  revisit. The corrected OpenGL-convention file (green pre-inverted
  from the DirectX SSS .tif — do NOT lose this derivation) moved
  UNDEPLOYED to textures-src/earth/normal_gl_8k.jpg; dist assets 90→89.
- Black Marble night texture + v10.0.7 cloud occlusion UNTOUCHED and
  re-verified: nightlights both passes (same values), cloudocclude
  [60.7..128.1].
- normalcal.mjs now also asserts the map is OFF (EXPECT_NORMAL_MAP
  flag — flip to true when revisiting); tex8kprobe asserts normal.jpg
  is NOT requested (flip back to a 200 assertion after the fix).
- Suites: normalcal, earthtest 14, hazeprobe (day-side identical to
  v10.0.5 baseline), nightlights ×2, haloshots, smoke 22, cloudocclude,
  prodboot 10/10 + tex8kprobe on preview AND live — all green.
- NOTE: the brief was titled v10.0.7, but 10.0.7 had already shipped
  (cloud occlusion, f8e70c7) — this is 10.0.8.

### v10.0.9 — LIVE+pause time lurch fix; orbit-line reports measured (2026-07-14)
- Bug #79 "time panel pointer capture" — NOT a pointer issue (measured:
  instrumented probe shows slider drag fires slider:input, timeIndex
  changes, camera theta frozen, panel stays open; the camera's canvas
  handler already guards e.target !== dom, so panel events physically
  cannot pan it). REAL root cause, reproduced headless by forcing LIVE
  on (webdriver keeps it off — that's why suites never saw it): with
  LIVE active, ui.update() forces timeIndex back to 1× every frame, and
  because the live resync skips while paused, the first speed
  interaction after a pause drift-snapped the clock forward by the
  whole pause duration (measured: 10× click after 5 s pause → 6.2 s
  lurch + silent revert to 1×). The lurching globe is what read as
  "camera pans" during slider drags; the snap is the "preset jumps time
  forward". FIX: ui.userSetTimeIndex() — any explicit non-1× speed
  choice drops LIVE first (1× keeps LIVE; it IS real time). All user
  speed paths routed through it: TIME panel presets + slider, tray ⏸,
  Space/Comma/Period keys. Presets/datepicker already did setLive(false)
  — this closes the last paths.
- Bug #78 "orbit lines through globe" — NOT REPRODUCED, and the
  prescribed state was already true (depthTest true, renderOrder 0,
  built-in LineBasicMaterial carries the logdepth chunks).
  tests/bug78far.mjs proves it: camera exactly in the moon-orbit plane
  (camY frac 0), far-arc-only test ring renders 2,724 px with ZERO
  inside the 86 px disc. What reads as "through the globe" is the NEAR
  arc legitimately crossing in FRONT of the disc — correct geometry.
  Shipped: depthWrite:false on orbit lines (transparent-object hygiene
  only, per the brief). If the hardware sighting persists, it needs a
  screenshot + altitude to chase further.
- PROBE LESSON (cost half this session): radiusUnits is ALREADY
  world-units — multiplying by getWorldScale again (mesh.scale IS the
  radius) inflated the silhouette 6,500× and made two probes report
  false bleed-through inside a disc that wasn't there. nightlights'
  boundingSphere.radius × worldScale is the correct pattern.
- Guards NEW: bug79live.mjs (LIVE+pause+preset must stick at 10×, live
  drops, no lurch), bug79probe.mjs (panel event integrity + camera
  frozen), bug78far.mjs (far-arc occlusion, exact orbit-plane framing).
- Suites: bug79live, bug79probe, bug78far, smoke 22, earthtest 14,
  v5b 18, orbitdir PASS, nightlights both passes, haloshots PASS,
  prodboot 10/10 preview + live — all green.

### v10.0.10 — insertion dropdown, time ladder, pause/support icons, night clouds (2026-07-14)
- ORBIT INSERTION (Item 1): body button grid → "Target Body" <select>
  over the primary + ALL moons (BODIES-panel source; the old grid only
  offered n-body moons, hiding Saturn's Kepler family from insertion).
  New full-width "⬤ Enter Orbit" button (btn-primary #0077CC) above the
  telemetry: setMode('insertion', body) FIRST, then setInsertion with
  the panel's current altitude/inc/geosync (v6 house rule — entry
  re-derives altitude), then userSetTimeIndex(1) (1×, drops LIVE via the
  bug #79 funnel). onInsertionChange now syncs the select. Themed
  .ins-body-select CSS added.
- TIME LADDER (Item 2): TIME_STEPS [0,1,10,100,1000,10000] →
  [0,1,5,50,500]. Labels are GENERATED from values, so buttons now read
  5×/50×/500× — Kyle's "labels stay the same" cannot literally hold
  with halved values; displayed labels stay HONEST instead. Tooltip
  copy de-Jupiterized ("…how fast moons orbit and planets rotate") and
  per-step tips rewritten (5 entries). Ripples fixed: curated presets
  (Io/GRS index 2 = 5×, Triple Shadow index 3 = 50× — notify text
  updated; Moon Alignment index 5→4 = 500×, notify updated), saved-
  preset restore already guards indexOf() < 0. TRADE-OFF flagged: Moon
  Alignment at 500× shows resonance pulses in ~10 min wall instead of
  ~30 s at the old 10,000× — if that hurts, the preset needs a
  jump-to-next-conjunction instead of raw speed (backlog candidate).
- Suites re-anchored to the new ladder: smoke + saturntest hotspot/orbit
  loops 40→800 iters (same 20,000 sim-s window at 500×), resonance
  4,000→80,000 steps (same ~23-day search), toast.mjs rewritten to
  hourly jumpToSimSeconds bursts (500× can't make events imminent in
  wall time), physbench top-step index, tooltip.mjs time-tip line,
  v1003probe preset speeds (5×/5×/50×/50×/500×), bug79live wording
  (assertion index unchanged — Kyle's flag pre-empted).
- PAUSE ICON (Item 3): now shows the ACTION (⏸ while playing = click to
  pause; ▶ while paused = click to resume) — flip of the v10.0.1 spec,
  updated at both writers (initial render + update() sync; the tray
  onclick routes through userSetTimeIndex).
- SUPPORT ICON (Item 4): ☕ → ♥, .kofi-btn class + tooltip unchanged.
- NIGHT CLOUDS (Item 5, parallel worker): faint earthshine cloud
  silhouettes on the night side — COLOR-ONLY gDetailEmissive add
  (vec3(0.55,0.62,0.75) × 0.085 × gCloudCover × (1−nightFade)); the
  diffuse path renders to 0/255 under the night ambient and any height
  term would resurrect the #48/#55 relief streaks. Gain ACES-calibrated
  (the tonemap toe crushes ~6× vs linear estimates: 0.02 → 1.5/255):
  0.085 → dense decks 5-11/255, UNDER the nightlights DARK_CAP 13, clear
  gaps stay 0.0; (1−nightFade) is exactly 0 on the day side — hazeprobe
  day pixels byte-identical. City-light occlusion curve softened:
  el_atten now mix(1.0, 0.10, smoothstep(0.18, 0.95, cover/0.92)) — thin
  scattered cloud no longer stripes the Black Marble field along the
  cloud-zone latitude seams (occluded cities up ~7-10 lum); full
  overcast still transmits ~10%. Kyle's "day-side banding from
  gCloudCover": NOT reproducible headless AND architecturally impossible
  (el_atten lives inside the night>0.001 gate; day pixels unchanged
  since v10.0.5) — any hardware day-side banding is a different
  phenomenon (bug #77 eyeball class), report with screenshot+altitude.
  Guard NEW: tests/nightclouds.mjs (before/after night-ocean patch grid;
  asserts faint band 1.5-13, max ≤ cap). Shots:
  tests/shots/nightclouds-{ocean,europe}-{before,after}.png.
  cloudocclude margin note: softened curve thins worst-night dimming to
  ~42% — guard factor relaxed 0.6→0.65 (asserts occlusion EXISTS, not
  curve depth); if it ever flakes, deepen mid-curve to
  smoothstep(0.15, 0.90, t).
- Guard NEW: tests/v10010probe.mjs (11 checks: ladder values, 5 buttons,
  icon action-semantics through pause/resume, ♥, dropdown contents on
  Earth/Jupiter/Saturn incl. Kepler moons, Enter Orbit → insertion mode
  on Moon at 1×).

### v10.0.11 — insertion panel close behavior, night-lights gain; #84/#85 measured not-bugs (2026-07-15)
- MEASURE-FIRST RESULTS (all four claims probed headless before touching code):
  - Bug #84 "orbit lines accumulate on date jump" — NOT REPRODUCIBLE.
    isLine count constant (4) across 10 date jumps (30-day and 365-day,
    with and without rendered frames between). Structurally impossible:
    _buildOrbitLines() runs exactly once, in the renderer constructor
    (renderer.js:84); no rebuild path exists anywhere, so there is
    nothing to dispose. No code change. If the hardware sighting
    persists, it needs a screenshot + repro steps — it is not line
    accumulation.
  - Bug #85 "time multipliers ~92× too fast" — NOT A BUG. Measured
    1.0014 sim-s/wall-s at timeIndex 1; insertion at 400 km computes
    periodS 5,545 s (92.4 min) and a MEASURED 92.7 wall-min per orbit at
    1×. G, velKmS (7.67 km/s), and simDt application all correct. The
    "ISS orbit in ~1 wall-minute" sighting is explained by bug #86:
    opening the TIME panel silently kicked the camera OUT of insertion
    back into orbit/cinematic mode — whose camera revolution is a
    COSMETIC 60 sim-s per rev by design (camera.js _poseOrbit, Orbit
    Speed slider) — so what was timed was the orbit-mode camera sweep,
    not the insertion orbit. Ladder [0,1,5,50,500] UNCHANGED (it was
    recalibrated deliberately in v10.0.10; bug79live assertions stand).
    Time-slider tooltip updated to Kyle's copy ("At 1× time runs in real
    time — one orbit takes as long as it really would").
- Bug #86 (REAL, fixed): the OI panel's close handler fired the
  preModeOI camera restore on EVERY close path — including the panel
  manager closing it because TIME/NAV/any other panel took the slot, and
  the click-away/Escape/swipe dismiss. Now the restore fires ONLY on an
  explicit ✕ click (transient _insExplicitClose flag set by the ✕
  handler around closeAllPanels; no persistent state needed — the close
  handler only needs to know "was this the ✕?"). Enter Orbit now also
  CLOSES the panel on commit and stays in the new orbit. Reopen path
  added: re-selecting the insertion mode button while already in
  insertion reopens the panel (setMode short-circuits on same
  mode+target, so _activateMode handles it) — sliders reflect live state
  via the existing onInsertionChange sync. Suite re-anchor: v5b's
  "outside click closes OI + returns camera mode" asserted the old-spec
  behavior — updated to "camera stays in insertion" (18/18).
  Guard NEW: tests/v10011probe.mjs (5 checks: ✕ reverts, Enter Orbit
  commits+closes, mode button reopens, TIME open keeps orbit+altitude,
  overlay dismiss keeps orbit).
- Bug #87 (fixed): Black Marble night lights read as a uniform bright
  wash — the pow(0.8) ×1.4 contrast boost LIFTED the faint inter-city
  sprawl. Now pow(1.2) ×1.2: faint sprawl pushed down ~3× (at 0.05
  linear) while city cores keep ~2/3 brightness. nightlights.mjs both
  passes green on EXISTING thresholds (cities 91–156 vs dark ≤7, caps
  untouched): London 91, Paris 131, Milan 134, Cairo 100, Moscow 71,
  Johannesburg 156; Sahara/Congo/Atlantic 0–7. cloudocclude guard factor
  0.65→0.70 (measured: el_atten unchanged in-shader, but the ACES toe
  compresses the occluded/clear PIXEL ratio at the dimmer city level —
  min/max 0.653 vs 0.62 at the old gain; the guard asserts occlusion
  exists, not curve depth).
- Bug #88 (night-side banding after date jump): #84 produced no code
  change, so there is nothing it could have fixed. No banding observed
  headless (nightlights/nightclouds/cloudocclude grids all clean) —
  joins the bug #77 hardware-eyeball class; needs a screenshot +
  altitude if it persists on hardware.
- Suites: v10011probe 5/5 NEW, bug79live PASS, bug79probe PASS,
  v10010probe 11/11, smoke 22, earthtest 14, v5b 18 (1 re-anchored),
  nightlights both passes, nightclouds PASS, cloudocclude PASS (factor
  0.70), orbitdir PASS, haloshots PASS.

### v10.0.12 — insertion→orbit bearing, bounded cloud shear, SPD affordances (2026-07-15)
- MEASURE-FIRST RESULTS:
  - SPD slider — MECHANISM WORKS (measured: slider input → orbSpeedMult
    1→4, orbit advance rate scales exactly 4× and 1× = 2π/60 rad/s to
    4 decimals). The likely hardware repro is dragging SPD while in
    INSERTION mode — much more common since v10.0.11 keeps users in
    insertion — where the camera rate is the real sqrt(GM/r) by design,
    or while paused (_simDelta = 0 freezes the sweep). Shipped
    affordances, not a mechanism change: one-shot notify when SPD is
    dragged in insertion ("applies to Orbit mode…") or while paused;
    watch-event 0.2 clamps now re-sync the slider UI (they silently
    desynced it); tooltip + panel copy corrected ("independent of
    simulation time" was wrong — it SCALES with sim speed and freezes
    on pause; it never CHANGES sim time).
  - Bug #89 (REAL, fixed): "orbit reverses after insertion→orbit". NOT
    a sign/convention bug — the advance is always theta -= (prograde,
    orbitdir-verified) and ins.phase never feeds orbTheta. Measured
    root cause: setMode('orbit') hard-reset orbTheta/orbPhi to 0.5/1.25,
    so the transition blend swept the camera SIDEWAYS to that arbitrary
    bearing — from insertion, a measured −104.9° westward lurch during
    the 0.9 s blend (reads as retrograde), then normal +22.6° east. A
    second O press short-circuits setMode (same mode+target), no new
    sweep — which is why it "fixed it". FIX: orbit/system entry derives
    orbTheta/orbPhi from the camera's current bearing (same math as
    flyToFeature; phi clamped 0.05..π−0.05, degenerate fallback
    0.5/1.25). Post-fix: theta error 0.000 rad, +10.2° east during the
    blend, +40.9° after. The pull-back to 4-radii framing stays radial.
  - Bug #90 (REAL, fixed — this is Kyle's "cloud streaks on time
    change"): REPRODUCED headless at uTime ≈ 1e6 — dayside clouds shear
    into pencil-thin zonal dashed filaments along the subtropical belts
    (lat 16–38°, exactly ec_zonal's speed-transition band). NOT float32
    precision (ec_t ≤ 30 has ~1e-7 relative error) and NOT the brief's
    "large dt into the noise in one frame" (the shader is a pure
    function of uTime; a jump is a single-frame snap — measured
    post-jump frames identical to film grain, 73–249 px). Root cause:
    ec_zonal's differential rotation ang = t·speed(lat) accumulates
    UNBOUNDED shear across the 0..1e6 uTime wrap — clean early, sheared
    to filaments by late wrap. Time changes "cause" it because a date
    jump relocates uTime anywhere in the wrap and high multipliers
    traverse it quickly (500× crosses the full wrap in ~33 wall-min).
    FIX: split the motion — rigid mean rotation (t·0.45) may grow freely
    (rotating the sampling frame never distorts), the differential part
    oscillates bounded: (speed−0.45)·sin(0.8t)/0.8 ≈ t·speed for small
    t, so launch/early-wrap rendering is unchanged. Filament detector:
    983 (pre-fix) → 215 (post-fix) at uTime 999,900; threshold 500 in
    the guard. NOTE: the pre-existing 1e6 wrap pop (full weather change
    every 11.6 sim-days) is untouched.
  - PROBE TRAP (cost an hour): canvas.toDataURL between rAF ticks on the
    non-preserveDrawingBuffer WebGL canvas returns garbage frames (pure
    white/black) — the house double-RAW-render-in-one-evaluate rule
    applies to ALL pixel grabs, not just diff-renders.
  - STALE SERVER TRAP: the v10.0.11 session's vite (port 5175) survived
    its TaskStop — kill the PID holding the port, or version-string
    checks fail against the stale __APP_VERSION__ bake.
- Guard NEW: tests/v10012probe.mjs (7 checks: SPD reaches
  orbSpeedMult, rate scales 4×, insertion-mode SPD notify, orbit-entry
  theta = camera bearing, no westward transition sweep, prograde after,
  ≤500 streak filaments at uTime 999,900).
- Suites: v10012probe 7/7 NEW, orbitdir PASS (all four conventions
  re-verified post-#89), smoke 22, earthtest 14, v5b 18, v10011probe
  5/5, v10010probe 11/11, bug79live PASS, nightlights both passes,
  nightclouds PASS, cloudocclude PASS, hazeprobe PASS, hurricane PASS
  (6.6, still organic), glint PASS, presets PASS, haloshots PASS.

| # | Issue | Status | Prompt File |
|---|-------|--------|-------------|
| 1 | Jupiter limb halo looks like solid ring, not atmospheric scatter | Resolved v4 | — |
| 2 | Surface stationary during orbit (camera doesn't advance along path) | Resolved v3b | V3b_ORBIT_FIX.md |
| 3 | Texture resolution exhaustion on zoom | Resolved v3 | V3_DETAIL_SHADERS.md |
| 4 | Io volcanic plumes not parented to moon — float over surface during rotation | Resolved v4 | — |
| 5 | GRS vortex detail not discoverable | Resolved v4 | — |
| 6 | instructions.md in wrong location | Resolved v4 | — |
| 7 | Moons appear egg-shaped / oval | Resolved v4 | — |
| 8 | Io plume particles render as white squares up close | Resolved v4b | V4b_PROMPT.md |
| 9 | Sharpness calibration done from headless screenshots — Callisto crater darkness and Io frost speckle may need real-hardware tuning. Knobs: normalScale in jupiter.js, gDetailHeight in detailShaders.js. (v4b anti-shimmer pass softened the worst of it — re-review.) | Needs review | — |
| 10 | Ko-fi handle still placeholder YOUR_HANDLE in src/config.js | Fix before launch | — |
| 11 | Sliders don't update live while dragging (real cause: altitude slider re-tweening per input event, not a change-vs-input listener issue) | Resolved v4b | V4b_PROMPT.md |
| 12 | Io and Europa flickering artifacts (real cause: sub-pixel procedural noise shimmer from the v4 sharpness pass, not z-fighting — no separate detail mesh exists) | Resolved v4b | V4b_PROMPT.md |
| 13 | Moon atmosphere halos uniform regardless of sun direction (Ganymede, Io; Europa had none) | Resolved v4b | V4b_PROMPT.md |
| 14 | Hole in Metis/Adrastea at close zoom (real causes: 24×12-segment spheres + camera near plane at 50 km clipping bodies whose zoom floors sit 20 km up) | Resolved v4b | V4b_PROMPT.md |
| 15 | Inclination slider discoverability — dragging outside Orbit Insertion silently did nothing | Resolved v4c | V4c_PROMPT.md |
| 16 | No free look while orbiting (hold Alt / two-finger drag) | Resolved v4c | V4c_PROMPT.md |
| 17 | UI layout — controls scattered, time display too prominent, no single home | Resolved v4c (three-zone redesign) | V4c_PROMPT.md |
| 18 | Ring depth sort — lit ring band crossed Jupiter's dark side (real cause: ring material not eclipsed inside the planet's shadow cylinder; depth flags were already correct) | Resolved v4c | V4c_PROMPT.md |
| 19 | Surface mode not release-ready (needs realistic starfield + ground rendering) — hidden from UI, implementation kept for V5 | Resolved v4d | V4d_PROMPT.md |
| 21 | Right-edge stack emoji icons look generic/inconsistent across platforms | Resolved v4d (text labels) | V4d_PROMPT.md |
| 22 | Altitude/Inclination/Speed sliders buried inside the CAM panel | Resolved v4d (ALT/INC/SPD peer buttons) | V4d_PROMPT.md |
| 23 | "Camera Speed" naming unclear | Resolved v4d (renamed Orbit Speed) | V4d_PROMPT.md |
| 24 | Inclination plane change lurched the camera (planet appeared to shift sideways) | Resolved v4d (line-of-nodes anchored at current bearing) | V4d_PROMPT.md |
| 25 | Polar orbit at 90° reported as not working — could not be reproduced; measured -89.7°..+90° latitude sweep both before and after the v4d change (verify on hardware) | Resolved v4d (verified) | V4d_PROMPT.md |
| 27 | Earth/Moon shader calibration done from headless screenshots — cloud zone coverage, city-light brightness, moon crater relief may need real-hardware tuning. v5a added the tooling: `__sse.renderer.logShaderState()` in dev builds lists live uniforms + all knob locations. | Needs review | V5_PROMPT.md |
| 28 | Earth textures: 8K daymap WIRED in v5a (progressive diffuseHigh swap). night.jpg / clouds.jpg / specular.jpg were never wired (procedural by design) and were DELETED in v10.0.5 (−16.7MB deploy weight; re-download via earth.js source URLs if ever needed). diffuse_8k upgraded to NASA BMNG July in v10.0.5. NASA CGI Moon Kit still manual (expired TLS cert at svs.gsfc.nasa.gov, URL in earth.js). | Resolved v10.0.5 | — |
| 26 | Replace Ko-fi with Stripe for donations — create 3 Stripe Payment Links ($5 Explorer / $10 Supporter / $25 Mission Commander), update KOFI_URL in src/config.js, update donation button to show tier picker popup, update README and landing page references. Optionally keep free Ko-fi page as secondary community presence with Saturn funding goal. | Fix before launch | — |
| 29 | Multiple panels open simultaneously — overlap and confusion | Resolved v5b (central panel manager — one panel globally, stack + OI + body card + audio flyout) | V5b_PROMPT.md |
| 30 | Click outside panel to close | Resolved v5b (transparent dismiss overlay below all UI; swipe dismisses on touch; drag works immediately after) | V5b_PROMPT.md |
| 31 | Orbital Insertion panel has no close button / cannot be dismissed | Resolved v5b (✕ button; any dismissal returns camera to the pre-insertion mode) | V5b_PROMPT.md |
| 32 | Camera panning inconsistent on Earth ("ocean areas") — measured real cause: the HIDDEN body info card (opacity 0) swallowed pointerdown in a fixed bottom-center region via the `#ui-root > *` pointer-events ID-specificity override (3rd occurrence); there is no ocean mesh and picking never sees overlay meshes | Resolved v5b (visibility:hidden + ID-specificity rule) | V5b_PROMPT.md |
| 33 | Radiation warning showed "Extreme radiation environment" at 74,000 km over Earth (Jupiter logic hardcoded) | Resolved v5b (config-driven radiationWarning.zones — Earth Van Allen belts + reentry band; Jupiter blanket zone kept) | V5b_PROMPT.md |
| 34 | Earth night side nearly black / lakes pure black at 382 km; day-side black cloud lumps at grazing sun | Resolved v5b (per-system nightAmbient 0x8899bb×0.18, terminator bleed widened + night limb scatter, Earth normalScale 2.0→0.8 — cloud relief was the lump cause; ocean shader + colorSpace measured innocent) | — |
| 35 | Midwest land renders olive/yellow-green — measured: that IS the source July Blue Marble palette (Wisconsin texture sample rgb(79,97,49)), pipeline faithful. For tan/brown farmland swap a September BMNG monthly variant (noted in earth.js) | Data choice — texture variant, not a bug | — |
| 36 | Orbit direction reversed — all bodies orbited east to west (retrograde). Real cause: orbit mode +sin convention (theta must decrease for prograde) vs insertion -sin (phase increases = prograde). Fix: orbTheta += → -=, forward-tilt travel vector negated, cinematic auto-orbit flipped. Insertion untouched — GeoSync holding station proved it already prograde. Measured: orbit +21.4°E, insertion 0° +36.3°E, retrograde -51.6°W, GeoSync 0.00°. | Resolved d3d5968 | — |
| 37 | _poseSurface uses +sin lon — mirrored vs east-positive convention. | Resolved V7 — removed with Surface mode (code deleted, mode permanently retired) | — |
| 38 | Earth day/night terminator wrong — sun direction never calibrated. Three compounding problems: uncalibrated placeholder direction (anti-phased seasons), epoch rotation phase not tied to UTC, coarse sidereal day (23.934h → 150° drift by 2026). Fix: true equatorial sun at epoch, rotationPhaseAtEpochDeg config knob, sidereal day 23.93446959h. Subsolar point within 3° of real sun. Night ambient reduced: 0x8899bb×0.18 → 0x445566×0.08, city gain 0.4→0.5. | Resolved 91d241d | — |
| 39 | LIVE mode showed stale time after tab hidden — UTC pipeline was already correct (no getHours() anywhere). Real cause: requestAnimationFrame pauses when tab hidden, 60s resync counted active-tab frame time only, so stall time persisted for up to 60s after tab restored. Appeared as timezone offset equal to hidden duration. Fix: wall-clock based resync — drift >2s snaps on first frame back, Date.now()-based 60s cadence otherwise. Verified: 2-hour stall recovers within one frame. | Resolved — same commit as date picker | — |
| 40 | Date picker had no time input — users could only set date, not time of day. Fix: native <input type="time" step="1"> row below calendar. Apply button commits date+time together as one ISO Z instant. Pre-filled with current sim HH:MM:SS UTC. Apollo 11 test: July 20 1969 + 20:17:00 → lands on epoch exactly. AM/PM display is browser locale cosmetic — value is 24h UTC. | Resolved — same commit as LIVE fix | — |
| 41 | Hurricane vortex stripes — ec_hurricane used pure sin(ang_spiral*3.5); terminator relief shading exposed a machined spiral rose. Fixed: fbm arm-phase modulation + radial de-centering + outward contrast fade; eyewall coherence kept. Day-side spiral harmonic 13.1 → 4.1 (tests/hurricane.mjs). | Resolved v5c (52c1026) | V5c_PROMPT.md |
| 42 | Cloud confetti below ~2,000 km + sun glint blob. Fixed: LAYER 5 puff converted additive → domain-warped edge erosion (decks solid, edges ragged); glint sharpness altitude-scaled 6000→150 with rim dither + capped core, footprint 450 km → 157 km at 2,113 km (tests/glint.mjs). | Resolved v5c (c5f8b46) | V5c_PROMPT.md |
| 43 | City light dots-in-rows at 2,113 km (real cause: snoise(vObjPos×250) peaks align along simplex lattice — NOT HYG stars. HYG already had depthTest, depthWrite:false, renderOrder:-1; disc pixel count unchanged when toggled). Fix: domain-warp speckle + per-dot brightness variation → irregular clusters. depthTest:true made explicit as regression lock. | Resolved bcac126 | — |
| 44 | LIVE off by default, hidden in TIME panel (real finding: 🔴 button was already in HUD; only default needed flipping). Both systems now open at current UTC on fresh load. LIVE defaults off under navigator.webdriver to avoid fighting headless suite time jumps. | Resolved bcac126 | — |
| 45 | Voyager preset latently broken — used bare simSeconds=0 write, never moved n-body moons (documented gotcha, masked until LIVE defaulted to 0). Now exits LIVE and does proper jumpToSimSeconds. | Resolved bcac126 | — |
| 46 | Apollo 11 preset missing from Earth SAVE panel — added as Earth-only curated preset, now the only way back to the 1969 epoch. | Resolved bcac126 | — |
| 47 | City lights too dim at night — gain 0.5→0.7, three dominant gaussians 1.00→1.20, region clamp 1.15→1.35. nightlights guard: city 87 vs dark 14. | Resolved bcac126 | — |
| 48 | Cloud streaking on night side — smoothstep(-0.3, 0.1, sunDot) night fade. Deep night renders no cloud layer (eliminates relief-shading streaks). Terminator clouds still catch last light. | Resolved bcac126 | — |
| 49 | Jupiter curated SAVE presets appeared on Earth. Fixed: per-system scope tags in ui.js + filter on system.slug; four NEW Earth presets built (ISS Orbit View, Earthrise, City Lights at Night, Aurora from Orbit — the prompt assumed they existed; they didn't). tests/presets.mjs 28 checks. | Resolved v5c (6f9541c) | V5c_PROMPT.md |
| 50 | Aurora curtains render as rings of DOTS at 4,500 km (snoise curtain sampling turns pointillist) — pre-existing v5 worker-shader quality, surfaced by the new Aurora from Orbit preset. Related: Earth seen from the Moon in Earthrise reads small and veiled (true angular size + Rayleigh shell at extreme minification) — physical, but a tele-FOV shot or shader distance fade could polish both. | Needs review (with #27) | — |
| 51 | Mars crater donuts at 1,291 km (hardware-confirmed by Kyle). Real cause: the RELIEF rim ridge, not rim paint (paint was already removed in v6) — craterProfile's positive rim drew rings via derivative shading. Fixed: min(c, 0) depressions only + hash-thinned to 35%/25% of cells; texture dominates, craters read as sparse subtle dark pits. | Resolved v6.0.1 (4d37d74) | — |
| 53 | Valles Marineris rendered near-black at low altitude (measured min luminance 0 at 1,291 km). Cause: -0.42 noise-modulated relief + step-banded strata paint stacking. Fixed: depth -0.10 with ±15% floor noise, softened strata, varied dust-filled floor — canyon min lum 23, mean 66 vs terrain 63-82, internal structure visible. | Resolved v6.0.1 (4d37d74) | — |
| 54 | Dust caterpillar/lattice rows at low altitude + veil too heavy inside the layer. Fixed: dust field coordinates domain-warped (same fix class as Earth city-light dots #43); veil thinned to 35% below 1,000 km, full by 5,000 km. 100% storm from global distance still a featureless orange sphere (verified). | Resolved v6.0.1 (4d37d74) | — |
| 55 | Mars craters visible as glowing orange blobs on the NIGHT side at 736 km (hardware-confirmed). Forensics: dots died with sun light off and uNormalScale=0, NOT with dust killed — relief-perturbed normals caught sun from below the local horizon, bloom amplified the lit fragments. Fixed v6.0.2: per-chunk night fade (surface + polar height/color deltas × smoothstep(-0.08, 0.15, sunDot)) + high-frequency layers (crater bowls, regolith grain) additionally fade with sun elevation (0.2..0.55) — they sparkled as isolated glints under ANY grazing light. Dust exempt per spec. Deep night 2,285 bright px → 0; terminator dark half 1,469 → 0; day unchanged. Residual: mid-morning (sunDot ~0.35) grain reads as soft lit-bump flecks — matter of taste, knob is ms_grazeFade + grain amplitude in mars-surface.glsl (joins #9/#27 eyeball pass). | Resolved v6.0.2 (c3efcf2) | — |
| 52 | Phobos/Deimos cylindrical texture maps — no directly fetchable public URLs (Albers references David Seal / Phil Stooke pages without files). Color-only ellipsoids + cratered detail shipped. Manual fetch + wiring when sourced; URLs noted in mars.js. | Manual follow-up | V6_MARS.md |
| 56 | Saturn-system shader calibration done from headless screenshots — ring brightness/scatter balance, kronos band strength, hexagon subtlety, Enceladus stripe contrast, Iapetus ridge seam may need real-hardware tuning (joins the #9/#27 eyeball-pass class). Knobs: uOpacityScale + litFace in saturn-rings.glsl, band mix factors in saturn-clouds.glsl, en_stripe/ia_ridge amplitudes. | Needs review | V7_SATURN.md |
| 57 | Hyperion/Phoebe texture maps — irregular bodies with no fetchable cylindrical maps (same class as #52). Color-only + procedural cratered detail shipped; Hyperion's sponge-pit look would need a dedicated treatment. | Manual follow-up | V7_SATURN.md |
| 58 | Saturn F ring omitted — the SSS ring strip ends at the A ring outer edge (measured alpha floor), and a procedural F ring on a separate thin annulus wasn't worth the draw call for a barely-visible feature. Revisit if a better Cassini radial profile (Björn Jónsson) is sourced. | Data choice — revisit with better source | V7_SATURN.md |
| 59 | Telephoto zoom reveals texture resolution limits — at narrow FOV (10°) planet textures and starfield cubemap show magnification blur (same pixels covering more screen area — equivalent to digital zoom on a phone). Planet fix requires quadtree tile streaming (SpaceEngine approach, weeks of work). Starfield could be improved with 8K cubemap swap but doesn't help planets. Decision: accept as known limitation for launch. Zoom is still a major win for Earthrise and Saturn ring views. | Won't fix — known limitation (v10.0.3: starfield half improved with the 6000×3000 ESO original — that IS ESO's max downloadable; 8K+ needs zoomify tile stitching or NASA's synthetic starmap_2020, a visual-character change) | — |
| 68 | Physics CPU optimization — measured and closed. Architecture: one PhysicsEngine per page load, switchSystem is a full navigation so inactive systems never run physics. Active system cost: 2.0 µs worst case (Jupiter, 4 n-body moons) — already 250× under the 0.5ms target. Fix B (every 6th frame) would cause 4° position jumps at 10,000× speed — visible regression for zero measurable gain. CPU/GPU load lives in the render loop, not physics. Documented in physbench.mjs and tests/README. Won't fix. | Won't fix — measured, no gain | — |
| 61 | Saturn ring particles removed — snow-globe appearance on real hardware. Geometry ring disc retained (looks excellent). | Resolved v7.0.1 | — |
| 62 | Saturn cloud bands too flat/drab on real hardware — insufficient contrast between zones and belts. Fixed: per-latitude color palette (cream zones, brown belts, blue-grey polar), band contrast increased from 4% to 11-13%, terminator widened via shaderParams. | Resolved v7.0.1 | — |
| 60 | Thin-atmosphere halos render as thick rings wrapping the night side (hardware-confirmed by Kyle: Earth at ~3,000 km, Io at ~370 km). Cause: soft fresnel pow + wide lit gate on all thin-atmosphere shells, plus Earth's v5b night-scatter alpha floor keeping the halo alive on the night limb. Fixed v7.0.2: per-body fresnelPower/thickness/intensity config, universal tight lit gate (−0.05..0.20), Earth night-scatter term removed, ISS horizon arc opt-in via horizonGlow. Titan/Saturn exempt. Guard: tests/haloshots.mjs (diff-render probe). | Resolved v7.0.2 | — |
| 61 | tests/stack.mjs stale since v7 — 4 checks assert the pre-v7 world (6 stack buttons vs 9 with ALT/INC/SPD, "camera panel + 7 modes", Saturn "Coming Soon" toast though Saturn is built, Tab cycle count). Share/preset/?view= checks still green and meaningful. Refresh the assertions. | Needs fix (test-only) | — |
| 62 | Cloudflare zone auto-injects Web Analytics beacon (static.cloudflareinsights.com/beacon.min.js) on app.solarexplorer.co — blocked by our CSP script-src 'self' (console error on every load, no functional impact). Kyle to decide: disable RUM injection in the Cloudflare dashboard or allow the host in CSP script-src + connect-src. (v10.0.2 note: the privacy stance is now "anonymous usage stats only" via cookieless GA4 — Cloudflare RUM is redundant with it; disabling still recommended.) workers.dev is unaffected. | Needs decision | — |
| 63 | app.solarexplorer.co serves plain HTTP without redirecting to HTTPS — "Always Use HTTPS" is OFF on the solarexplorer.co zone. Costs -20 on MDN Observatory (custom domain scores B 75 vs workers.dev A+ 125; the pre-GA4 "A+ 130" memory was the workers.dev host). Wrangler token has zone:read only — Kyle must toggle: dashboard → solarexplorer.co → SSL/TLS → Edge Certificates → Always Use HTTPS. Expected score after: A+ (120; the remaining -5 is SRI on gtag.js, unavoidable — Google rotates its content). HSTS header itself added to public/_headers in v10.0.2. | Needs Kyle (2-click dashboard toggle) | — |
| 63 | V8 shader calibration done from headless screenshots — Miranda corona groove strength, Triton cantaloupe density, Mercury crater speckle, Venus lightning subtlety, Uranus ring visibility, Neptune GDS/companion balance may need real-hardware tuning (joins the #9/#27/#56 eyeball-pass class). Knobs: groove/dimple amplitudes in miranda-surface.glsl / triton-surface.glsl, mc_sparse gates in mercury-surface.glsl, vn_flash duty in venus-clouds.glsl, rings.png alpha values (regenerate strip), np_gds mixes in neptune-clouds.glsl. ALSO (v8.0.1): Moon wrinkle-ridge patches read as dark spidery squiggles at ~2,500 km (relief shading under normalScale 2.5; knobs: wRegion/wrinkles in moon-detail.glsl LAYER 2). | Needs review | V8_REMAINING_PLANETS.md |
| 64 | Mercury terminator longitude: the circular ephemeris cannot track e = 0.206 — subsolar longitude oscillates ±23° (equation of center) around the mean-longitude anchor every 88-day year. Zero-mean by construction; fine for lighting. Refine when the ephemeris gains eccentricity (same item as the Mars ±10° note in mars.js). | Data choice — ephemeris eccentricity is a backlog item | — |
| 65 | Pluto/Charon not built — the V8 prompt scoped Mercury/Venus/Uranus/Neptune only. | Resolved v10 — full binary system live; barycenter physics NOT needed (Keplerian Charon + equal periods = mutual lock by construction; only Pluto's ~2,110 km wobble is unmodeled) | V10_PLUTO.md |
| 66 | V9 Sun shader calibration done from headless screenshots — granulation cell scale/contrast, corona streamer balance vs polar plumes, chromosphere rim strength, prominence subtlety, flare frequency/brightness may need real-hardware tuning (joins the #9/#27/#56/#63 eyeball-pass class). Knobs: uGranScale/limbDarkeningCoeff/supergranulationAmp in sun.js photosphere block, dtlFreqFade freqs + 1.35 gain in sun-photosphere.glsl, baseOpacity/activityScale in the corona block, prominence opacity/tubeR in renderer._buildProminences, flare probability constant 0.0025 in _updateSolarFlares. | Needs review | V9_SUN.md |
| 67 | V10 Pluto/Charon shader calibration done from headless screenshots — Sputnik tone-mosaic strength (0.04 in pluto-surface.glsl LAYER 1), mountain/bladed relief amplitudes, haze ring gain (4.0 + pow 2.5 in pluto-atmosphere.glsl) vs day-side rim (intensity 0.5 in pluto.js), Mordor mottling, Serenity Chasma depth, plutoshine 0.035 may need real-hardware tuning (joins the eyeball-pass class). Screenshot tool: tests/plutoshots.mjs (6 views incl. the backlit crescent). | Needs review | V10_PLUTO.md |
| 68 | Physics CPU optimization — measured and closed. Architecture: one PhysicsEngine per page load, switchSystem is a full navigation so inactive systems never run physics. Active system cost: 2.0 µs worst case (Jupiter, 4 n-body moons) — already 250× under 0.5ms target. Fix B (every 6th frame) would cause 4° position jumps at 10,000× speed — visible regression for zero measurable gain. CPU/GPU load lives in the render loop, not physics. Documented in physbench.mjs. | Won't fix — measured, no gain | — |
| 69 | 3 stale test suites — tray/tooltip/stack fail identically on clean HEAD (asserting Saturn shows "Coming Soon" toast, 6 stack buttons vs today's 9, etc.) — v4c-era selectors. Not regressions. | Fix when convenient — selector refresh | — |
| 70 | Atmosphere gradients — all planet halos were flat uniform bands. Fixed v10.0.3: 3-stop gradient (colorLow/colorMid/colorHigh) on all thin-atmosphere bodies using view-ray impact-parameter height axis (not fresnel which only spans 0.7-1.0 across visible halo). Earth fresnel 5→4, opacity 0.5→0.65. Mars effective opacity +25%, Saturn +22%, Pluto day haze +25%. Titan/Venus exempt. | Resolved 8501dce | — |
| 71 | Jupiter preset speeds — Io Volcano Flyby and GRS Close Pass inherited stale 1000× speed. Fixed: both now 10×, Triple Moon Shadow 100× (no 50× step), Voyager 100×. | Resolved 8501dce | — |
| 72 | Starfield cubemap too low resolution — was 4000×2000. Upgraded to ESO original 6000×3000 (7.9MB, 1.5× linear sharper). ESO's downloadable ceiling is 6000×3000 — the 800Mpix GigaGalaxy version exists as zoomify tiles only. True 8K+ requires tile stitching or switching to NASA synthetic starmap (changes visual character). See bug #59. | Partially resolved 8501dce — at ESO ceiling | — |
| 73 | Stars too bright relative to lit planets. Fixed v10.0.3: HYG star sprites ×0.8, panorama sky 0xd9d9d9 (~15% perceived), procedural fallback 0.95→0.80. toneMappingExposure (1.1, global) deliberately not touched — would dim planets. | Resolved 8501dce | — |
| 74 | Earth surface details look hazy at certain distances/angles. ROOT CAUSE (diff-render measured): hardcoded gas-giant Phong specular (0x332211, shininess 8) washing land+ocean at every altitude. NOT the atmosphere shell, NOT a cloud alpha floor. Earth now sets cfg.specular 0x000000. | Resolved v10.0.4 | — |
| 75 | Earth clouds fade out above ~40,000 km (blend 0.11) and vanish at 50,000+ — no Blue Marble from high altitude. detail.activationKm 50,000→2,000,000, fullKm 500→100,000. | Resolved v10.0.4 | — |
| 76 | False city-light glow over dark Africa (Sahara/Congo/Kalahari) — ungated rural term in earth-lights.glsl. Gated by region density; South Africa (Gauteng/Cape Town) population entries added. nightlights.mjs now asserts dark land ≤ 5%. | Resolved v10.0.4 | — |
| 77 | Earth terrain normal map disabled in v10.0.8 — caused universal cloud banding (horizontal stripe artifacts across disc) on real hardware, all browsers; headless SwiftShader does not reproduce. Root cause undiagnosed. To revisit: restore textures-src/earth/normal_gl_8k.jpg → public/textures/earth/normal.jpg, re-add `normal:` to earth.js, start with normalMapScale 0.1 and measure disc appearance before increasing. Suspect interaction between terrain ridge normals and the cloud relief shader path (dtlPerturbNormal stacks on the map-perturbed normal); also candidate: JPEG q95 row artifacts amplified ×1.5. normalcal.mjs is the calibration tool (flip EXPECT_NORMAL_MAP); tex8kprobe normal.jpg assertion must flip back to 200. | Open — hardware eyeball pass needed | — |
| 78 | Orbit lines "visible through globe". NOT a depth-test failure — far arc correctly occluded (bug78far.mjs, zero pixels inside disc with camera exactly in the orbit plane). Near arc crossing IN FRONT of the disc is correct geometry. Shipped depthWrite:false hygiene on orbit line material. If the hardware sighting persists, capture screenshot + altitude. | Resolved v10.0.9 (measured; hygiene only) | — |
| 79 | TIME panel "pointer capture" — speed slider "pans camera", presets "jump time". NOT pointer events (panel event flow measured clean). Root cause: LIVE mode forced 1× every frame + paused-skip resync drift-snapped the clock forward by the pause duration on the first speed interaction. Fix: ui.userSetTimeIndex() drops LIVE before any non-1× speed change; TIME panel, tray ⏸, Space/Comma/Period all routed through it. Guard: bug79live.mjs. | Resolved v10.0.9 | — |
| 84 | Orbit lines "accumulate duplicates on date jump". NOT REPRODUCED — isLine count constant (4) across 10 date jumps; _buildOrbitLines runs once in the renderer constructor, no rebuild path exists, nothing to dispose. Needs screenshot + repro if the hardware sighting persists. | Not reproducible — measured, no code change | — |
| 85 | Time multipliers "~92× too fast; ISS orbit in ~1 wall-minute at 1×". NOT A BUG — measured 1.0014 sim-s/wall-s at 1× and 92.7 wall-min per insertion orbit at 400 km (periodS 5,545 s, v 7.67 km/s). The sighting was the orbit/cinematic-mode COSMETIC camera rev (60 sim-s per rev by design) after bug #86 silently kicked the camera out of insertion. Ladder unchanged; tooltip copy updated. | Not a bug — measured; explained by #86 | — |
| 86 | Orbit Insertion panel close fired the preModeOI camera restore on EVERY close path — opening TIME/NAV (panel manager), click-away, Escape, swipe all reverted the camera out of insertion. Now the restore fires ONLY on explicit ✕; Enter Orbit closes the panel and stays in the committed orbit; re-selecting the insertion mode button reopens the panel. Guard: v10011probe.mjs; v5b outside-click check re-anchored. | Resolved v10.0.11 | — |
| 87 | Black Marble night lights a uniform bright wash — pow(0.8)×1.4 boost lifted faint inter-city sprawl. Now pow(1.2)×1.2: sprawl down ~3×, city cores keep ~2/3 brightness; nightlights.mjs green on existing thresholds; cloudocclude factor 0.65→0.70 (ACES pixel-ratio shift at dimmer gain, el_atten unchanged). Hardware eyeball pass welcome (joins #9/#27 class). | Resolved v10.0.11 | — |
| 88 | Night-side banding after date jump — #84 was not reproducible and produced no code change, so nothing was fixed by it; no banding in any headless grid (nightlights/nightclouds/cloudocclude). Joins the bug #77 hardware-eyeball class: needs screenshot + altitude. (v10.0.12 note: if the sighting was DAYSIDE-adjacent cloud streaking, bug #90's unbounded ec_zonal shear is the likely culprit — now fixed.) | Not reproduced headless — #77 class; possibly #90 | — |
| 89 | Orbit direction "reverses" after insertion→orbit (O after I), second O press fixes it. Measured: not a sign bug — setMode('orbit') hard-reset orbTheta to 0.5 and the transition blend swept the camera −104.9° west to get there (reads retrograde); second press short-circuits. Fixed: orbit/system entry derives theta/phi from the camera's current bearing. Guard: v10012probe. | Resolved v10.0.12 | — |
| 90 | Earth cloud streaks after time changes (hardware + reproduced headless at uTime→1e6): ec_zonal differential rotation t·speed(lat) accumulated unbounded shear across the 1e6-s uTime wrap, drawing pencil-thin zonal filaments at the subtropical belts. Date jumps relocate uTime in the wrap (streaks appear "randomly"); 500× traverses the wrap in ~33 wall-min. Fixed: rigid mean rotation + bounded oscillating differential (sin(0.8t)/0.8). Filaments 983→215; guard threshold 500 (v10012probe). | Resolved v10.0.12 | — |
| 91 | SPD slider "not working" — mechanism measured intact (rate scales exactly, 1× = 2π/60). Real-world confusion: SPD has no effect in insertion mode (physics-locked rate, by design) or while paused; users now stay in insertion far more since v10.0.11. Shipped one-shot explainer notifies + watch-event clamp slider re-sync + corrected copy. | Resolved v10.0.12 (affordances; mechanism was never broken) | — |

---

## Backlog — Features

| # | Feature | Notes |
|---|---------|-------|
| 1 | KTX2 compressed textures | Add Basis encoder to build pipeline for faster mobile loading |
| 2 | WebGPU renderer upgrade | When postprocessing library adds WebGPU support |
| 3 | Moon 8K texture upgrades | Jupiter already at SSS's max (8K). Galilean moon candidates need GeoTIFF conversion: Björn Jónsson (bjj.is/3d/planetary-maps), USGS Astrogeology. Priority: Europa, Io, Ganymede, Callisto. URLs noted in renderer.js. |
| 4 | Release preparation — supporting pages | Add About page (project story, AI-built in 48hrs narrative, tech stack, author bio linking to ITprojectMGMT.com and LinkedIn), Contact page (kyle@itprojectmgmt.com), Legal/Disclaimer page (NASA texture credits and CC BY 4.0 attribution, Solar System Scope CC BY 4.0, Björn Jónsson public domain credits, no warranty disclaimer, not affiliated with NASA or any space agency), Privacy Policy (no tracking, no user data collected, localStorage only for user preferences, no cookies, no analytics). All pages accessible from a minimal persistent footer. Style matches brand. Mobile-friendly. |
| 5 | ~~Release preparation — security hardening~~ | DONE v7 (1a): CSP + XFO + XCTO + Referrer-Policy + Permissions-Policy + COOP + CORP via public/_headers (Workers Static Assets); security.txt; embed URL sanitization; npm audit clean; no secrets in source (audited); localStorage holds prefs only. NOT done: SRI on Google Fonts (their CSS is dynamically generated per-UA — SRI hashes won't hold; CSP style-src/font-src pinning covers the risk); ISS API rate limiting (feature not built). Observatory scan on the live URL logged below. |
| 6 | Sharpness calibration eyeball pass | Bug #9 — review relief/crater/speckle strength on real hardware; knobs: normalScale in jupiter.js, gDetailHeight weights in detailShaders.js |
| 7 | ~~Sun — basic corona visuals~~ | DONE v9 — far exceeded: the Sun is a full navigable system (photosphere granulation with differential rotation, corona streamers + polar plumes, chromosphere, sunspot lifecycle, flares, prominences, solar activity slider). |
| 8 | System-wide labels | Toggle exists in the Display panel (v4c stub) — implement with the Solar System Orrery view. |
| 9 | Velocity vectors | Toggle exists in the Display panel (v4c stub) — draw per-moon velocity arrows in System View. |
| 10 | Steve Albers attribution — confirm before launch | Check renderer.js and config files for any runtime fetches from stevealbers.net (grep -r "stevealbers" src/). If textures downloaded locally, add Steve Albers credit to legal/credits page. His Galilean moon maps are non-commercial use by permission — attribution required. Compiled from NASA/JPL + Björn Jónsson data. |
| 11 | Google Analytics (cookieless) — add after launch | DONE v10.0.2 — see Version History. Cookieless via consent-mode denial (not the legacy storage:'none' fields, which GA4 ignores). Per-system page_view + preset_launch events. |
| 12 | ~~Zoom / Telephoto View (FOV control)~~ | DONE v7 (3c): OPTICS section in VIEW panel (log slider 5–90°), 🔭 tray toggle 48°↔10° (normal is the renderer's 48° — 75° would oval-stretch spheres, v2 lesson), sse-fov persisted, Earthrise preset auto-telephoto, Through-the-Rings at 25°. NOT built: Alt+scroll-wheel FOV (slider + toggle cover the use cases; add on request). |
| 13 | Ko-fi → Stripe for donations | Create 3 Stripe Payment Links ($5 Explorer / $10 Supporter / $25 Mission Commander), update KOFI_URL in src/config.js, update donation button to show tier picker popup, update README and landing page references. Fix before public launch. |
| 14 | Custom domain URL update — app.solarexplorer.co | Update src/config.js APP_URL to https://app.solarexplorer.co. Update wrangler.toml routes. Grep and replace all hardcoded solar-system-explorer.kyle-d06.workers.dev URLs in codebase. Verify share URL generator uses new domain. Landing page (solarexplorer.co) also needs its Launch Explorer links updated to app.solarexplorer.co — coordinate with landing page chat. |
| 15 | instructions.md location wrong | .claude/instructions.md says PROJECT_LOG.md is at repo root but it actually lives in Docs/. Update instructions.md path reference. Also update any other path references that may be wrong. |
| 16 | Callisto + Jupiter horizon curated preset | The Callisto/Jupiter telephoto shot (Callisto surface in foreground, Jupiter above horizon, Milky Way background) is one of the best views in the simulator. Add as a curated preset in jupiter.js. Position: low orbit over Callisto, Alt+drag tilted to show Jupiter above the horizon, telephoto FOV ~10°. |
| 17 | Disable Cloudflare RUM beacon (bug #62) | Cloudflare dashboard → Speed → Optimization → Real User Monitoring → Disable. Now redundant with GA4. Also flip "Always Use HTTPS" in SSL/TLS → Edge Certificates to restore Observatory A+ on app.solarexplorer.co. |
| 18 | Planetshine — reflected parent planet light on moon night sides | Additive ambient pass on moon surface shaders. uPlanetshineColor + uPlanetshineIntensity uniforms in surface-base.glsl. Per-body config. Intensities: Jupiter moons 3-8% blue-white, Saturn moons 4-10% pale gold, Uranus moons 2-3% cyan, Triton 2-3% deep blue, Phobos/Deimos 2-3% reddish. Moon earthshine exempt. ~30 min, next polish build. |
| 19 | ~~Physics CPU optimization~~ | MEASURED AND CLOSED — see bug #68. One PhysicsEngine per page, switchSystem is full navigation, active system costs 2µs worst case. |
| 20 | Wire SSS night texture for Earth city lights | DONE v10.0.6 — Black Marble replaces 22-gaussian procedural model. night.jpg (byte-identical to the file deleted in v10.0.5 as dead weight — now actually wired). London 187 luminance (was 113), Sahara 2.6/Congo 0. |

Completed in v4c (removed from backlog): ghost time display, date
picker + LIVE toggle, icon-stack Mission Control redesign (Camera /
Time / Bodies / Presets / Display / Help panels), label split
toggles, curated + saved presets with URL sharing, event toasts with
Watch, bottom tray, audio flyout redesign, ring shadow fix, free
look, inclination auto-switch, per-system lazy chunks.

Completed in v4 (removed from backlog): fullscreen, presentation mode,
limb glow shader, retrograde inclination, GRS preset, zoom floor,
dynamic version display, altitude + inclination sliders in Mission
Control. Completed in v4b: GRS button off the body card, expanded body
cards, resonance visualization, Camera Speed rename, music collapse,
brand icons, tooltips.

---

## Backlog — Future Systems

### Priority Order
```
V5  — Earth + Moon — DONE (city lights, auroras, Apollo sites; ISS mode → V5.1)
V6  — Mars — DONE (Olympus Mons, Valles Marineris, dust storms, polar caps,
      Phobos + Deimos; surface landing experience dropped with Surface mode)
V7  — Saturn — DONE (textured ring system + Cassini Division, ring shadows
      both directions, fly-through particles, Titan haze, Enceladus geysers
      + tiger stripes, Iapetus two-tone, Mimas/Tethys/Dione/Rhea, chaotic
      Hyperion, retrograde Phoebe, telephoto optics, security hardening)
V8  — Mercury + Venus + Uranus + Neptune — DONE (all 8 planets live;
      Triton retrograde + geysers, Miranda coronae, Venus super-rotation,
      Uranus polar-sun geometry + narrow rings; Pluto NOT built — bug #65)
V9  — The Sun — DONE (first star system: photosphere granulation +
      differential rotation, corona, chromosphere, sunspots, flares,
      prominences, solar activity slider; isStar engine path)
V10 — Pluto + Charon — DONE (the dwarf-planet binary: mutual tidal lock
      by construction, Tombaugh Regio calibrated to the NH flyby epoch,
      blue backlit haze ring, Mordor Macula; 10 navigable systems)
V11 — Solar System Orrery view, inter-system hyperjump polish
```

### Build Order Decision — Mars Before Saturn
Mars chosen before Saturn for three reasons:
1. Mars is a solid surface planet — tests surface rendering techniques
   needed for Saturn's moons (Titan, Enceladus) on a simpler system
2. Token cost: Saturn (rings + Titan + 5 major moons) is ~2.5-3x Mars
3. Story arc: Jupiter → Earth → Mars → Saturn matches exploration history
   and gives two separate viral launch moments instead of one long build

Saturn ring system is the most complex single feature in the simulator.
Build it last when all foundations are solid.

### Earth Texture Notes
July Blue Marble (current): Wisconsin rgb(79,97,49) — olive-green farmland.
This is photographically accurate for July. For tan/brown farmland look,
swap September BMNG monthly variant (URL noted in earth.js).
NASA CGI Moon Kit: still blocked by expired TLS cert at svs.gsfc.nasa.gov.
Retry when NASA fixes. URL documented in earth.js.

### Competitive Context
NASA Eyes on the Solar System (eyes.nasa.gov) is the closest
comparable — 150+ missions, full solar system, accurate JPL data.
Our differentiator: cinematic immersion over breadth. NASA Eyes tells
you where the planets are. Solar System Explorer puts you there.
Their June 2026 release added embed options we already had. Our
procedural detail shaders, GeoSync clouds-below experience, and
generative audio have no equivalent in NASA Eyes.

| # | Feature | Notes |
|---|---------|-------|
| 1 | Saturn System | DONE v7 — see Version History. Remaining from spec: Hyperion/Phoebe maps (bug #57), F ring (bug #58), hardware eyeball pass (bug #56). |
| 2 | Earth + Moon System | DONE v5 — see Version History. Remaining from spec: ISS Mode (live position API), 8K/seasonal/night textures, lightning particles beyond the shader flashes. |
| 3 | Full Solar System Orrery | Camera Mode 8 (V key). All planets in correct orbital positions. Click any to travel. Scale-adjusted so all visible. Gateway to inter-system navigation. |
| 4 | Inter-System Navigation | System selector UI in Mission Control. Cinematic hyperjump sequence (8-12s, skippable). Runtime system switching with GPU memory management. Floating origin / scale switching between AU and km coordinate systems. |
| 5 | Mars System | DONE v6 — see Version History. Remaining from spec: MOLA elevation normal map (GeoTIFF manual step), Phobos/Deimos texture maps (bug #52). (Surface-landing experience dropped with Surface mode's V7 removal.) |
| 6 | Historic mission trajectories | Voyager 1&2, Cassini, Juno, Galileo animated paths |
| 7 | Time of day selector | Jump to specific simulated date/time |
| 8 | Multiplayer shared view | URL encodes camera position + time |
| 9 | VR support | WebXR for headset exploration |
| 10 | Resonance visualizer | Enhanced — already implemented basic version in v4b |
| 11 | Io volcanic event notifications | Random eruption alerts when near Io |
| 12 | ESO photographic starfield cubemap | DONE v5 — ESO eso0932a panorama on background sphere (procedural kept as fallback). |
| 13 | ~~Re-enable Surface camera mode~~ | REMOVED permanently in V7 — code deleted from camera.js/ui.js. A first-person ground experience would be a from-scratch rebuild (new backlog item if ever wanted). |
| 14 | HYG bright star catalog overlay | DONE v5 — 8,834 stars (mag < 6.5), B-V spectral colors, named-star labels. Constellation line toggle still open. |

---

## Earth + Moon System Spec (Built in v5 — kept as reference; unbuilt items noted in Known Bugs #28 and Backlog #2)

### Overview
Earth and Moon treated as a binary system in earth.js config.
Seamless navigation between them. Moon orbits Earth accurately.
Target experience: ISS quality — NASA 4K video from orbit.

### Earth Texture Stack (all NASA public domain)
- Day: Blue Marble Next Generation 8K (12 monthly variants for seasonal change)
- Night: Black Marble city lights 8K (NASA)
- Specular map: ocean vs land reflectivity
- Normal/elevation map: terrain height data
- Cloud layer: separate texture rotating independently of surface

### Earth Procedural Layers

**Atmosphere (all altitudes):**
- Rayleigh scattering limb glow — vivid blue-white, exponentially
  brighter at the very edge. Most recognizable Earth feature from space.
- Terminator atmospheric glow — lit side bleeds past geometric
  terminator. Soft orange-red at terminator line itself.

**Day side (activate below 50,000 km):**
- Animated cloud system: Simplex noise cloud layer rotating ~30%
  faster than surface (jet stream simulation)
- Hurricane vortex shader: same technique as GRS — spiral noise
  vortex features that slowly drift westward at tropical latitudes
- Ocean specular glint: blinding white sun reflection on ocean
  surface, moves correctly with camera angle (BRDF specular)
- Mountain shadow detail: normal map intensity increases at low alt
- Weather front streaks: elongated cloud noise at mid-latitudes

**Night side:**
- City lights texture (Black Marble) fades in past terminator
- Auroral oval: animated green/purple curtains at 65-70° latitude,
  visible from above as glowing rings around poles
- Lightning: occasional blue-white flashes in storm cloud regions
  (particle system, random, weighted toward tropics)

**ISS altitude — below 1,000 km:**
- Ocean wave normal perturbation + whitecap noise in wind regions
- Coastline atmospheric haze
- Storm system vortex detail visible in cloud layer
- Zoom floor: 200 km (ISS is at 408 km — natural reference point)

**Unique Earth features:**
- Earthshine: from Moon's night side, Earth's reflected light
  illuminates dark lunar surface in blue-grey glow
- Earthrise: Earth rises above lunar horizon as camera orbits Moon —
  dynamically rendered using Earth's full procedural texture
- ISS Mode: NASA open API gives real-time ISS position (updates
  every 5 seconds). "ISS Mode" button places camera at actual
  current ISS altitude and position — showing what an astronaut
  sees right now. Unique feature, no other web app has this.

### Moon Procedural Layers

**Source material:**
- NASA CGI Moon Kit: 8K color, displacement, normal maps
- LRO (Lunar Reconnaissance Orbiter): 100m/pixel global, 0.5m
  selected regions, complete LOLA elevation data

**High altitude (10,000 km to 1,000 km):**
- Multi-scale cratering (same technique as Callisto, more variety)
- Mare vs highland detection from base texture luminance:
  Mare (dark): smooth, subtle ripple texture, dark basalt
  Highland (bright): dense small craters, ancient rough terrain
- Crater ray system: Tycho rays (1,500 km), Copernicus rays —
  bright white streaks fading with distance from impact point

**Mid altitude (1,000 km to 100 km):**
- Terminator enhancement: craters near day/night boundary show
  extreme long shadow fingers — changes in real time with sun angle
- Regolith sparkle: opposition surge effect — glowing halo around
  camera shadow when sun is directly behind viewer
- Crater chain detail: secondary craters form visible strings
- Rilles: sinuous channels from ancient lava flows

**Low altitude (100 km to 10 km):**
- Boulder fields around crater rims
- Lava tube skylights in mare regions: dark pit features
- Colour variation: olivine (green), pyroclastic glass (dark orange),
  fresh highland material (bright white)
- Permanently shadowed regions near poles: absolute black with
  subtle blue ice sheen (confirmed water ice — Chandrayaan data)

**Very low altitude (10 km to 1 km):**
- Individual boulder shadows
- Crater interior detail: central peaks, terraced walls, floor fractures
- Zoom floor: 1 km (best zoom floor of any body — LRO data supports it)

**Apollo Landing Sites (all 6):**
- Precise coordinates known and marked
- Below 50 km: subtle equipment markers (descent stages still there,
  LRO photographed them)
- Info panel: mission name, crew, date, key achievement
- "Apollo Tour" preset: visits all 6 sites in chronological order
  with cinematic transitions and mission facts
  Apollo 11: Mare Tranquillitatis (0.67°N, 23.47°E) — Jul 20 1969
  Apollo 12: Oceanus Procellarum (3.01°S, 23.42°W) — Nov 19 1969
  Apollo 14: Fra Mauro (3.65°S, 17.47°W) — Feb 5 1971
  Apollo 15: Hadley-Apennine (26.13°N, 3.63°E) — Jul 30 1971
  Apollo 16: Descartes (8.97°S, 15.50°E) — Apr 21 1972
  Apollo 17: Taurus-Littrow (20.19°N, 30.77°E) — Dec 11 1972

### Inter-System Navigation Spec

**System Selector UI:**
Navigation bar in Mission Control panel showing all available systems.
Current system: Primary Blue #0077CC highlight.
Built systems: fully clickable.
Unbuilt systems: Light Gray #D9D9D9 with lock icon — shows roadmap.

**Cinematic Hyperjump Sequence (8-12 seconds, skippable):**
1. Camera pulls back from current system dramatically (2s)
2. Current planet shrinks to a dot against starfield (1s)
3. Solar system orrery briefly visible — glowing line traces
   path to destination planet (2s)
4. Camera accelerates toward destination — subtle star motion,
   not Star Wars warp (2s)
5. Destination grows from dot to fill screen (2s)
6. Cinematic arrival pan reveals new system (2s)

**Runtime System Switching:**
- Dispose all current system geometries and textures before loading new
- GPU memory must not grow unbounded across system switches
- Loading screen with destination planet facts during asset load
- Three.js scene graph fully cleared between systems

**Floating Origin / Scale System:**
Solar system scale: AU coordinate units
Planetary system scale: km coordinate units, centered on planet
Transition: seamless unit switch as camera crosses system boundary
Camera near/far planes adjusted per scale context
Prevents floating point precision artifacts at large distances

---

## Deployment Checklist

Before each deploy:
- [ ] `npm run build` succeeds with no errors
- [ ] `npm run preview` verified at localhost:4173
- [ ] DONATE_URL / SITE_URL correct in src/config.js
- [ ] R2 texture URL updated in src/config.js (if textures changed)
- [ ] README live URL updated
- [ ] PROJECT_LOG.md updated with session changes

Deploy command: `npm run deploy` (runs `npx wrangler deploy` — Workers, not Pages)
Do NOT use: `wrangler pages publish` or `wrangler pages deploy` — wrong deployment type.

---

## Instructions for Claude Code

At the START of every session:
1. Read this file (PROJECT_LOG.md) for full project context
2. Read any prompt .md files referenced in the session instructions
3. Note the current version and known bugs before starting work

At the END of every session:
1. Update the Version History section with what was built/fixed
2. Move completed bugs from Known Bugs to Version History
3. Add any new bugs discovered to Known Bugs
4. Add any new backlog items discussed to Backlog
5. Update the live URL if it changed
6. Commit: `docs: update PROJECT_LOG.md`

This file is the single source of truth for project state.
Always keep it current.
