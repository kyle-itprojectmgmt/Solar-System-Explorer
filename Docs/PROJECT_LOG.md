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
Altitude-based blend: `uDetailBlend = smoothstep(farDist, nearDist, uAltitude)`
All shaders disabled above activation altitude — zero GPU cost when far.
Uniforms: `uTime`, `uAltitude`, `uDetailBlend` passed every frame.

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
| 4 | Surface | S | Click moon, first-person horizon view |
| 5 | Chase | H | Trails moon above/behind, surface visible below |
| 6 | System View | G | Full system, orbital path lines |
| 7 | Orbit Insertion | I | Physically accurate orbit, GeoSync preset |

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
| 26 | Replace Ko-fi with Stripe for donations — create 3 Stripe Payment Links ($5 Explorer / $10 Supporter / $25 Mission Commander), update KOFI_URL in src/config.js, update donation button to show tier picker popup, update README and landing page references. Optionally keep free Ko-fi page as secondary community presence with Saturn funding goal. | Fix before launch | — |

---

## Backlog — Features

| # | Feature | Notes |
|---|---------|-------|
| 1 | KTX2 compressed textures | Add Basis encoder to build pipeline for faster mobile loading |
| 2 | WebGPU renderer upgrade | When postprocessing library adds WebGPU support |
| 3 | Moon 8K texture upgrades | Jupiter already at SSS's max (8K). Galilean moon candidates need GeoTIFF conversion: Björn Jónsson (bjj.is/3d/planetary-maps), USGS Astrogeology. Priority: Europa, Io, Ganymede, Callisto. URLs noted in renderer.js. |
| 4 | Release preparation — supporting pages | Add About page (project story, AI-built in 48hrs narrative, tech stack, author bio linking to ITprojectMGMT.com and LinkedIn), Contact page (kyle@itprojectmgmt.com), Legal/Disclaimer page (NASA texture credits and CC BY 4.0 attribution, Solar System Scope CC BY 4.0, Björn Jónsson public domain credits, no warranty disclaimer, not affiliated with NASA or any space agency), Privacy Policy (no tracking, no user data collected, localStorage only for user preferences, no cookies, no analytics). All pages accessible from a minimal persistent footer. Style matches brand. Mobile-friendly. |
| 5 | Release preparation — security hardening | Before any public promotion or LinkedIn post: (1) Content Security Policy headers via Cloudflare Worker — restrict script-src to self, block inline scripts and eval; (2) Add /.well-known/security.txt with contact info; (3) Subresource Integrity (SRI) on Google Fonts CDN links; (4) Security response headers: X-Frame-Options SAMEORIGIN, X-Content-Type-Options nosniff, Referrer-Policy strict-origin-when-cross-origin, Permissions-Policy restricting unused browser APIs; (5) Audit all source code for exposed secrets, API keys, or tokens before public release; (6) Review localStorage usage — confirm no sensitive data stored; (7) Rate limiting on ISS position API endpoint when built; (8) HTTPS-only already enforced by Cloudflare. Run Mozilla Observatory scan and target A+ rating before launch. |
| 6 | Sharpness calibration eyeball pass | Bug #9 — review relief/crater/speckle strength on real hardware; knobs: normalScale in jupiter.js, gDetailHeight weights in detailShaders.js |
| 7 | Sun — basic corona visuals | Sun sits in the Bodies panel (v4c) with a Solar Observatory stub toast. Remaining: subtle corona glow shader, slow sunspot texture, occasional flare particles. Full Solar Observatory mode = V6+. |
| 8 | System-wide labels | Toggle exists in the Display panel (v4c stub) — implement with the Solar System Orrery view. |
| 9 | Velocity vectors | Toggle exists in the Display panel (v4c stub) — draw per-moon velocity arrows in System View. |

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
V5  — Earth + Moon (ISS mode, city lights, auroras, Apollo sites)
V6  — Mars (solid surface, Olympus Mons, Valles Marineris, landing)
V7  — Saturn + Rings + Titan + Enceladus + Iapetus
V8  — Outer solar system (Uranus, Neptune, Triton, Pluto)
```

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
| 1 | Saturn System | saturn.js config, particle ring system, Titan atmosphere shader, Enceladus geysers |
| 2 | Earth + Moon System | See full spec below. Binary system — Earth and Moon together. ISS altitude experience, procedural clouds, city lights, auroras, Earthrise, Apollo landing sites. |
| 3 | Full Solar System Orrery | Camera Mode 8 (V key). All planets in correct orbital positions. Click any to travel. Scale-adjusted so all visible. Gateway to inter-system navigation. |
| 4 | Inter-System Navigation | System selector UI in Mission Control. Cinematic hyperjump sequence (8-12s, skippable). Runtime system switching with GPU memory management. Floating origin / scale switching between AU and km coordinate systems. |
| 5 | Mars System | Best solid-surface planet for landing experience. MOLA elevation data, Olympus Mons (3x Everest height), Valles Marineris (length of USA), polar ice caps, dust storms, Phobos and Deimos moons. Surface landing with Earth as blue dot in sky. |
| 6 | Historic mission trajectories | Voyager 1&2, Cassini, Juno, Galileo animated paths |
| 7 | Time of day selector | Jump to specific simulated date/time |
| 8 | Multiplayer shared view | URL encodes camera position + time |
| 9 | VR support | WebXR for headset exploration |
| 10 | Resonance visualizer | Enhanced — already implemented basic version in v4b |
| 11 | Io volcanic event notifications | Random eruption alerts when near Io |
| 12 | ESO photographic starfield cubemap | Replace current procedural random starfield with ESO public domain panoramic photograph mapped as skybox cubemap. Stars in correct positions, Milky Way photographically accurate, Southern Cross visible only when looking south. 30-minute swap. Add alongside Earth system (V5) where realistic starfield matters most for surface viewing. |
| 13 | Re-enable Surface camera mode | Surface mode hidden in v4d — re-enable with V5 when realistic starfield (cubemap), HYG bright star catalog overlay, constellation lines, and proper ground-level rendering are in place. |
| 14 | HYG bright star catalog overlay | 9,000 brightest stars (magnitude < 6.5) from HYG database as colored point sprites. Correct positions, spectral colors (O-class blue-white through M-class deep red), correct brightness. Named stars get labels when body labels enabled. Constellation line toggle. Add with V5 Earth system. |

---

## Earth + Moon System Spec (Future Build)

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
