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

---

## Known Bugs / In Progress

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
| 28 | Earth textures: 8K daymap WIRED in v5a (progressive diffuseHigh swap). night.jpg / clouds.jpg / specular.jpg downloaded (8K) but not yet wired into materials — lights are procedural by design (v5a Item 3). NASA CGI Moon Kit still manual (expired TLS cert at svs.gsfc.nasa.gov, URL in earth.js). | Partially resolved v5a | — |
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
| 59 | Telephoto zoom reveals texture resolution limits — at narrow FOV (10°) planet textures and starfield cubemap show magnification blur (same pixels covering more screen area — equivalent to digital zoom on a phone). Planet fix requires quadtree tile streaming (SpaceEngine approach, weeks of work). Starfield could be improved with 8K cubemap swap but doesn't help planets. Decision: accept as known limitation for launch. Zoom is still a major win for Earthrise and Saturn ring views. | Won't fix — known limitation | — |
| 60 | Thin-atmosphere halos render as thick rings wrapping the night side (hardware-confirmed by Kyle: Earth at ~3,000 km, Io at ~370 km). Cause: soft fresnel pow + wide lit gate on all thin-atmosphere shells, plus Earth's v5b night-scatter alpha floor keeping the halo alive on the night limb. Fixed v7.0.2: per-body fresnelPower/thickness/intensity config, universal tight lit gate (−0.05..0.20), Earth night-scatter term removed, ISS horizon arc opt-in via horizonGlow. Titan/Saturn exempt. Guard: tests/haloshots.mjs (diff-render probe). | Resolved v7.0.2 | — |

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
| 7 | Sun — basic corona visuals | Sun sits in the Bodies panel (v4c) with a Solar Observatory stub toast. Remaining: subtle corona glow shader, slow sunspot texture, occasional flare particles. Full Solar Observatory mode = V6+. |
| 8 | System-wide labels | Toggle exists in the Display panel (v4c stub) — implement with the Solar System Orrery view. |
| 9 | Velocity vectors | Toggle exists in the Display panel (v4c stub) — draw per-moon velocity arrows in System View. |
| 10 | Steve Albers attribution — confirm before launch | Check renderer.js and config files for any runtime fetches from stevealbers.net (grep -r "stevealbers" src/). If textures downloaded locally, add Steve Albers credit to legal/credits page. His Galilean moon maps are non-commercial use by permission — attribution required. Compiled from NASA/JPL + Björn Jónsson data. |
| 11 | Google Analytics (cookieless) — add after launch | Add GA4 with anonymized IP and no cookies (consent-free mode). GA4 supports cookieless measurement via gtag config: { anonymize_ip: true, cookie_flags: 'SameSite=None;Secure', storage: 'none' }. Page views, session counts, country breakdown, device type — no PII or cookies — compatible with Privacy Policy. Add to CSP connect-src: www.google-analytics.com. Implement after public launch once privacy policy confirmed. |
| 12 | ~~Zoom / Telephoto View (FOV control)~~ | DONE v7 (3c): OPTICS section in VIEW panel (log slider 5–90°), 🔭 tray toggle 48°↔10° (normal is the renderer's 48° — 75° would oval-stretch spheres, v2 lesson), sse-fov persisted, Earthrise preset auto-telephoto, Through-the-Rings at 25°. NOT built: Alt+scroll-wheel FOV (slider + toggle cover the use cases; add on request). |
| 13 | Ko-fi → Stripe for donations | Create 3 Stripe Payment Links ($5 Explorer / $10 Supporter / $25 Mission Commander), update KOFI_URL in src/config.js, update donation button to show tier picker popup, update README and landing page references. Fix before public launch. |

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
V8  — Outer solar system (Uranus, Neptune, Triton, Pluto)
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
- [ ] Ko-fi handle updated in src/config.js
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
