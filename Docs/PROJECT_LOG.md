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
ticker with countdown, continuous log altitude slider (50 km–500,000 km,
live ALT readout), inclination slider (-90°..90°, synced with insertion
panel), orbital speed slider (Orbit mode), chase height slider (Chase mode)

**View controls (v4):**
Fullscreen — F11 or top-right button. Presentation mode — P or the
subtle bottom-right eye icon: hides all UI except the exit eye
(TV / big screen / screenshots; the screenshot button uses it).

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
Labels and volcanic plumes are parented to the moon MESH (not the group
or scene) so they ride the tidally-locked rotation — fixed in v3b/v4
(Bug #4), verified by the tests/ smoke suite.

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

### v3b — Orbit Surface Movement Fix (Complete — commits → 07793f3)
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

### v4 — Backlog Batch + Sharpness Pass (Complete — 2026-07-11, commits ba275a3 → e5672ea)
Per Docs/V4_PROMPT.md + Docs/V4_SHARPNESS_PASS.md (mid-session addition).
Deployed twice (after Group 3 and at session end). Live URL serves v4.

- Group 1 (ba275a3): version 4.0.0; loading screen reads version from
  package.json via __APP_VERSION__; instructions.md moved to .claude/
  (Bug #6); vite.config.js verified to spec; @cloudflare/vite-plugin
  purged from lockfile.
- Group 2 (67d9b1d, a77180b): Io plumes + night-side hotspots re-parented
  from the moon group to the mesh — tidal-lock rotation applies to the
  mesh, so they now stay pinned to the surface (Bug #4; verified at
  10,000x by hotspot bearing tracking mesh rotation). Surface feature
  labels were already mesh-parented since v3b (Bug #4 note) — verified,
  no change needed. Egg-shaped moons (Bug #7): render loop self-heals a
  stale camera aspect every frame; Amalthea now uses real half-dimensions
  radii {125, 73, 64} km from config instead of an arbitrary stretch;
  Galilean moons verified perfect spheres, Jupiter oblate Y 0.9351.
- Group 3 (504069a, 50ad071, e81b568, 13dcc1a): inclination slider
  -90°..+90° — negative = retrograde. Implementation note: a negative
  axis-angle tilt alone does NOT reverse travel direction, so the engine
  tilts by |inc| and reverses the phase advance + travel tangent;
  ground-track speed uses the signed rate. Altitude presets replaced by
  a continuous log slider (50 km–500,000 km) in Mission Control with a
  live ALT readout (camera drives slider; dragging drives camera);
  Mission Control also gained a quick-access inclination slider synced
  with the insertion panel. Fullscreen (F11 / top-right button) +
  Presentation Mode (P / eye icon; single body class hides all UI except
  the exit eye; screenshot uses it). GRS navigation preset: data-driven
  navPresets in jupiter.js anchored to the live uGrsUV shader uniform
  (survives hi-res texture swap); generic camera.flyToFeature; buttons in
  the Jupiter info panel + insertion panel (Bug #5).
- Group 0 sharpness pass (038f8f2, mid-session prompt): max anisotropy +
  trilinear filtering on every surface texture; per-body normalScale in
  config; Jupiter warm specular (shininess 8, #332211); bloom tightened
  (threshold 0.85 / smoothing 0.1 / intensity 0.8); altitude-staged
  dynamic fBm octaves (3→9 descending, mobile −2) with 1.5x/2x base
  frequencies; procedural relief now perturbs the shading normal via
  screen-space height gradients (dtlPerturbNormal in simplex.glsl) —
  derivative clamping prevents sub-pixel octaves shading as gravel.
  Jupiter 16K not publicly available (SSS caps at 8K, already shipped);
  moon 8K upgrade sources noted in renderer.js.
- Group 4 (d002009, e5672ea): detail-aware zoom floor — per-body
  detailFloor { softKm, hardKm } in config, quadratic resistance below
  soft, hard stop at floor (asymptotic convergence), HUD "Maximum
  surface detail reached" + ALT pulse. Jupiter limb glow (Bug #1):
  solid halo sphere replaced by an atmospheric scattering shader —
  fresnel³ rim, lit-side only, terminator-boosted, #C8824A → #E8D4A0 →
  transparent, colors data-driven from config. Verified from day side,
  terminator, night side (absent) and 20,000 km insertion.
- Testing: 22-check headless smoke suite (Puppeteer + system Chrome)
  committed under tests/ — covers parenting, shapes, aspect guard,
  retrograde inclination, altitude slider, presentation mode, GRS
  preset, zoom floors, console errors. Screenshot verification at spec
  altitudes for all five detail shaders.
- Known cosmetic items noted for future: Io plume particles render as
  squares up close (PointsMaterial has no sprite texture); sharpness
  calibration (crater darkness, Io frost speckle density) deserves an
  eyeball pass on real hardware — headless screenshots reviewed but
  desktop GPU + 60 fps motion may read differently.

---

## Known Bugs / In Progress

| # | Issue | Status | Prompt File |
|---|-------|--------|-------------|
| 1 | Jupiter limb halo looks like solid ring, not atmospheric scatter | Resolved v4 | V4_PROMPT.md |
| 2 | Surface stationary during orbit (camera doesn't advance along path) | Resolved v3b | V3b_ORBIT_FIX.md |
| 3 | Texture resolution exhaustion on zoom | Resolved v3 | V3_DETAIL_SHADERS.md |
| 4 | Io volcanic plumes not parented to moon — float over surface during rotation | Resolved v4 | V4_PROMPT.md |
| 5 | GRS vortex detail not discoverable — no way to navigate directly to GRS longitude | Resolved v4 | V4_PROMPT.md |
| 6 | instructions.md in Docs/ not .claude/ — move to .claude/instructions.md for auto-read | Resolved v4 | V4_PROMPT.md |
| 7 | Some moons appear egg-shaped / oval — aspect ratio bug not fully fixed for moon meshes, and/or Amalthea irregular shape scale over-exaggerated | Resolved v4 | V4_PROMPT.md |
| 8 | Io plume particles render as squares at close range (PointsMaterial has no sprite texture) | Backlog | — |

---

## Backlog — Features

| # | Feature | Notes |
|---|---------|-------|
| 1 | KTX2 compressed textures | Add Basis encoder to build pipeline for faster mobile loading |
| 2 | WebGPU renderer upgrade | When postprocessing library adds WebGPU support |
| 3 | Moon 8K texture upgrades | Jupiter already at SSS's max (8K). Galilean moon candidates need GeoTIFF conversion: Björn Jónsson (bjj.is/3d/planetary-maps), USGS Astrogeology. Priority: Europa, Io, Ganymede, Callisto. URLs noted in renderer.js. |
| 4 | Io plume particle sprites | Replace square PointsMaterial particles with a soft round sprite texture (Bug #8) |
| 5 | Sharpness calibration eyeball pass | v4 sharpness pass verified via headless screenshots — review crater darkness (Callisto/Ganymede), Io frost speckle density, and relief strength on real hardware at 60 fps; per-body tuning knobs: normalScale in jupiter.js, height weights in detailShaders.js |
| 6 | Ko-fi handle | src/config.js KOFI_URL still 'YOUR_HANDLE' placeholder — update before promoting the site |

Completed in v4 (removed from backlog): fullscreen mode, presentation/clean
display mode, Jupiter limb glow fix, inclination -90°..90° + retrograde,
GRS navigation preset, detail-aware zoom floor, dynamic version display,
continuous altitude slider, Mission Control inclination slider.

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
