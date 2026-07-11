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

**Mission Control Panel (Tab key):**
Camera mode switcher, time controls, body selector, orbital paths
toggle, body labels toggle, ring visibility toggle, eclipse event
ticker with countdown, altitude presets (Distant/Near/Low Orbit/Skim),
orbital speed slider (Orbit mode), chase height slider (Chase mode)

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

---

## Known Bugs / In Progress

| # | Issue | Status | Prompt File |
|---|-------|--------|-------------|
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
| 8 | Io plume particles render as white squares up close — particle material issue, not parenting | Backlog | — |
| 9 | Sharpness calibration done from headless screenshots — Callisto crater darkness and Io frost speckle may need real-hardware tuning. Knobs: normalScale in jupiter.js, gDetailHeight in detailShaders.js | Needs review | — |
| 10 | Ko-fi handle still placeholder YOUR_HANDLE in src/config.js | Fix before launch | — |
| 11 | All sliders (inclination, altitude, orbit camera, time) use change event — no live update while dragging, catches up on release. Fix: change all slider addEventListener('change') to addEventListener('input') across ui.js | Bug — easy fix | — |
| 12 | Io and Europa flickering artifacts — z-fighting between base mesh and procedural detail shader geometry at nearly identical depth. Fix: increase polygonOffset on detail shader material or scale detail mesh outward by 0.1% | Bug | — |
| 13 | Ganymede atmosphere halo uniform ring regardless of sun direction — needs same directional atmospheric scattering shader applied to Jupiter in v4. Also apply to Europa (thin O2/O3 atmosphere) and Io (thin SO2 atmosphere). All bodies with atmosphere flag must respond to sun direction | Bug | — |
| 14 | Hole forms in Metis and Adrastea at super close zoom — geometry too low-poly at near distances + zoom floor not enforced tightly enough for inner moons. Fix: (1) increase sphere subdivisions for inner moons in config, (2) enforce zoom floor hard stop for all bodies including inner moons | Bug | — |

---

## Backlog — Features

| # | Feature | Notes |
|---|---------|-------|
| 1 | Full screen mode | TV/presentation mode, hide all UI |
| 2 | Hide all text / clean display mode | Big screen / screenshot mode, combine with fullscreen |
| 3 | Jupiter limb glow fix | Replace solid halo with proper atmospheric scattering shader — feathered, lit-side only, color transitions warm orange to transparent |
| 4 | KTX2 compressed textures | Add Basis encoder to build pipeline for faster mobile loading |
| 5 | WebGPU renderer upgrade | When postprocessing library adds WebGPU support |
| 6 | Orbit Insertion inclination range fix | Extend inclination slider from 0–90° to -90°–90°. Slider center = 0° (equatorial). Negative = retrograde orbit. Label: "-90° (retrograde)" left, "0° (equatorial)" center, "90° (polar)" right. Physics: negative inclination reverses orbital direction. |
| 7 | GRS navigation preset | Add "Jump to Great Red Spot" button in Jupiter body info panel and/or Orbit Insertion panel. Rotates camera longitude to align with GRS position (23°S, current simulated longitude). Solves discoverability — GRS vortex detail exists but user has no way to find it without knowing Jupiter's rotation state. |
| 8 | Detail-aware zoom floor | Minimum zoom altitude adapts to where procedural detail + texture resolution runs out. Resistance zoom: quadratic taper below soft floor, hard stop at floor. Per-body floors stored in body config (not engine). Floors: Jupiter 1,500 km, Io 150 km, Europa 150 km, Ganymede 200 km, Callisto 300 km, inner moons 50 km. HUD feedback: "Maximum surface detail reached" fades in at soft floor, ALT readout pulses once at hard floor. |
| 9 | Dynamic version display on loading screen | Pull version from package.json via Vite define plugin. Loading screen subtitle reads "Jupiter System — v{version}" dynamically. Bump package.json version each session so loading screen always reflects current build. Add __APP_VERSION__ constant to vite.config.js. |
| 10 | Replace altitude presets with altitude slider in Mission Control | Remove Distant/Near/Low Orbit/Skim preset buttons from Mission Control panel. Replace with a continuous logarithmic altitude slider (10 km to 500,000 km). Slider in Mission Control right panel, always visible when a body is targeted. Current ALT value shown as readout next to slider. Logarithmic scale: fine-grained control at low altitude, fast movement at high altitude. |
| 11 | Add inclination slider to Mission Control right panel | Move inclination control out of Orbit Insertion panel into Mission Control right panel so it's always accessible. Range: -90° to +90°. Slider center = 0° (equatorial). Labels: "-90° retrograde" left, "0° equatorial" center, "90° polar" right. Negative = retrograde orbit (reverses orbital direction). Works in both Orbit mode and Orbit Insertion mode. |
| 12 | Release preparation — supporting pages | Add About page (project story, AI-built in 48hrs narrative, tech stack, author bio linking to ITprojectMGMT.com and LinkedIn), Contact page (kyle@itprojectmgmt.com), Legal/Disclaimer page (NASA texture credits and CC BY 4.0 attribution, Solar System Scope CC BY 4.0, Björn Jónsson public domain credits, no warranty disclaimer, not affiliated with NASA or any space agency), Privacy Policy (no tracking, no user data collected, localStorage only for user preferences, no cookies, no analytics). All pages accessible from a minimal persistent footer. Style matches brand. Mobile-friendly. |
| 13 | Release preparation — security hardening | Before any public promotion or LinkedIn post: (1) Content Security Policy headers via Cloudflare Worker — restrict script-src to self, block inline scripts and eval; (2) Add /.well-known/security.txt with contact info; (3) Subresource Integrity (SRI) on Google Fonts CDN links; (4) Security response headers: X-Frame-Options SAMEORIGIN, X-Content-Type-Options nosniff, Referrer-Policy strict-origin-when-cross-origin, Permissions-Policy restricting unused browser APIs; (5) Audit all source code for exposed secrets, API keys, or tokens before public release; (6) Review localStorage usage — confirm no sensitive data stored; (7) Rate limiting on ISS position API endpoint when built; (8) HTTPS-only already enforced by Cloudflare. Run Mozilla Observatory scan and target A+ rating before launch. |
| 14 | Remove GRS button from Jupiter body info card | GRS navigation already available in Orbit Insertion panel. Card button is redundant clutter. Remove from the body info panel only — keep in Orbit Insertion panel. |
| 15 | Expand body info cards with detailed data | Add to each body card: diameter (km), mass (kg, scientific notation), surface gravity (m/s²), orbital distance from parent (min/max km for elliptical orbits), orbital period, rotation period, surface temperature range, notable features list. Add expandable "More Info" section for longer content. Jupiter card: Great Red Spot stats, magnetic field, ring system summary. Moon cards: tidal locking status, geological activity level, potential habitability notes (Europa, Enceladus). |
| 16 | Resonance lines — improve or remove | DECISION: Keep and improve. Implement proper 1:2:4 resonance visualization showing Io/Europa/Ganymede position relationships in real time. Animated highlight when moons align. Tooltip explains what it shows. Do not remove — valuable scientific feature once properly explained. |
| 17 | Orbit Camera slider vs Time slider — clarify or consolidate | DECISION: Keep both. Rename "Orbit Camera" to "Camera Speed". Add tooltip: "How fast the camera orbits around the target — independent of simulation time." Tooltip on Time slider: "Controls simulation speed — how fast moons orbit, Jupiter rotates, and eclipses occur." |
| 18 | Music player — minimize/hide toggle independent of presentation mode | Music player panel needs its own collapse button (chevron or minus icon in panel header). Collapsed state: shows only the sound mode icon row and volume slider — no Spotify/YouTube URL input or expanded player. State saved to localStorage. Collapsing music player must be independent of P-key presentation mode which hides ALL UI. Expanded/collapsed state persists across page reloads. |
| 19 | Music player — official Spotify and YouTube brand icons and colors | Replace current generic headphone/play icons with official brand icons: Spotify icon (green #1DB954, official Spotify logo SVG), YouTube icon (red #FF0000, official YouTube play button logo SVG). Widely used in UIs for platform identification. Current icons are ambiguous — users won't know which connects to which service. Also verify Spotify and YouTube modes function correctly end-to-end: paste URL → load → play. Fix any broken functionality before launch. |
| 20 | Tooltip hover help for all UI controls | Add tooltip on hover (desktop, 500ms delay) and long-press (mobile, 600ms) for every icon and control. One sentence max per tooltip. Key tooltips needed: each sound mode icon (Silent / Voyager Radio / Deep Space Ambient / Psychedelic Journey / Cosmic Electronic / Spotify / YouTube), each camera mode button, time multiplier buttons, display checkboxes (Orbital paths, Body labels, Rings, Resonance lines — especially resonance since nobody knows what it does), altitude slider, inclination slider, GeoSync button, Voyager preset, screenshot button, Ko-fi button, presentation mode (P), fullscreen (F11). Style: Dark Gray #4D4D4D background, Light Gray #D9D9D9 text, Lato font, 8px border radius, appears after delay, disappears on mouseout/touchend. |

---

## Backlog — Future Systems

| # | Feature | Notes |
|---|---------|-------|
| 1 | Saturn System | saturn.js config, particle ring system, Titan atmosphere shader, Enceladus geysers |
| 2 | Earth + Moon System | See full spec below. Binary system — Earth and Moon together. ISS altitude experience, procedural clouds, city lights, auroras, Earthrise, Apollo landing sites. |
| 3 | Full Solar System Orrery | Camera Mode 8 (V key). All planets in correct orbital positions. Click any to travel. Scale-adjusted so all visible. Gateway to inter-system navigation. |
| 4 | Inter-System Navigation | System selector UI in Mission Control. Cinematic hyperjump sequence (8-12s, skippable). Runtime system switching with GPU memory management. Floating origin / scale switching between AU and km coordinate systems. |
| 5 | Historic mission trajectories | Voyager 1&2, Cassini, Juno, Galileo animated paths |
| 6 | Time of day selector | Jump to specific simulated date/time |
| 7 | Multiplayer shared view | URL encodes camera position + time |
| 8 | VR support | WebXR for headset exploration |
| 9 | Resonance visualizer | 1:2:4 Io/Europa/Ganymede animation in System View |
| 10 | Io volcanic event notifications | Random eruption alerts when near Io |

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
