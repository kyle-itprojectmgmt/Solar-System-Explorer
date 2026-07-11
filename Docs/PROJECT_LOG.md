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
**Deploy:** `npm run deploy` → Cloudflare Pages via Wrangler

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

### v3 — Procedural Detail Shaders (Complete — deployed 2026-07-10)
Commits: 2091c7a (infra), 9be0608 (Jupiter), 193093c (Io), 5a971a5
(Europa), 7729be3 (Ganymede), 1317e3a (Callisto)
- Shared GLSL Simplex noise library (2D/3D, ridged, fBm 2–4 octaves,
  cellular/crater helpers; mobile tier drops one octave)
- onBeforeCompile injection into MeshPhongMaterial; bodies opt in via
  config `detail: { style, activationKm, fullKm, params }`; blend is 0
  above activation altitude (no visual cost when far)
- Jupiter: zone/belt cloud turbulence with altitude-staged octaves,
  latitude-stretched wisps, GRS spiral vortex (anchored to scanned map
  UV, differs between 2K and 4K maps), blue-grey limb haze <10,000 km
- Io: sulfur palette zones, stretched lava flows, cellular calderas
  with sulfur rims, pulsing hot-spot emissive <200 km, SO2 frost
- Europa: domain-warped 3-scale crack network, ice-plain flexing,
  Voronoi chaos rafts, near-subliminal pulsing ocean glow <1,000 km
- Ganymede: luminance-split dark regolith/craters vs grooved bands,
  polar aurora emissive <2,000 km; added Osiris + Gilgamesh labels
- Callisto: 4-octave crater-on-crater fields, bright ice crater
  floors, Valhalla multi-ring basin anchored to scanned map UV;
  added Lofn + Burr labels
- Green "Surface Detail Active" dot in body info panel
- Fixed: DoF focused on body center, blurring every low-altitude view
  (now focuses on the near surface)
- Fixed: quality tier used maxTouchPoints, demoting touchscreen
  laptops to tablet tier (now uses pointer:coarse media query)
- Verified per body at spec altitudes; ~50–60 fps at full detail even
  in software GL; all v1/v2 regression checks passing

### v3b — Orbit Surface Movement Fix (In Progress)
- Fixed: Orbit mode — camera advances along path, surface sweeps beneath
- Fixed: Orbit Insertion non-geosync — camera moves at orbital velocity
- Fixed: GeoSync synchronization — texture and camera locked to same timer
- Fixed: Chase mode angle — surface visible below, Jupiter ahead
- Added: Surface speed HUD readout
- Added: Orbital Speed slider (Orbit mode)
- Added: Chase Height slider (Chase mode)

---

## Known Bugs / In Progress

| # | Issue | Status | Prompt File |
|---|-------|--------|-------------|
| 1 | Jupiter limb halo looks like solid ring, not atmospheric scatter | Backlog | — |
| 2 | Surface stationary during orbit (camera doesn't advance along path) | Queued (v3b, not started) | V3b_ORBIT_FIX.md |
| 3 | ~~Texture resolution exhaustion on zoom~~ | RESOLVED in v3 — procedural detail shaders | V3_DETAIL_SHADERS.md |

---

## Backlog — Features

| # | Feature | Notes |
|---|---------|-------|
| 1 | Full screen mode | TV/presentation mode, hide all UI |
| 2 | Hide all text / clean display mode | Big screen / screenshot mode |
| 3 | Jupiter limb glow fix | Replace solid halo with proper atmospheric scattering shader — feathered, lit-side only, color transitions warm orange to transparent |
| 4 | KTX2 compressed textures | Add Basis encoder to build pipeline for faster mobile loading |
| 5 | WebGPU renderer upgrade | When postprocessing library adds WebGPU support |

---

## Backlog — Future Systems

| # | Feature | Notes |
|---|---------|-------|
| 1 | Saturn System | saturn.js config, particle ring system, Titan atmosphere shader, Enceladus geysers |
| 2 | Full Solar System view | Zoom out to all planets, click any to enter |
| 3 | Historic mission trajectories | Voyager 1&2, Cassini, Juno, Galileo animated paths |
| 4 | Polar orbit presets | One-click polar orbit over any body |
| 5 | Time of day selector | Jump to specific simulated date/time |
| 6 | Multiplayer shared view | URL encodes camera position + time |
| 7 | VR support | WebXR for headset exploration |
| 8 | Resonance visualizer | 1:2:4 Io/Europa/Ganymede animation in System View |
| 9 | Io volcanic event notifications | Random eruption alerts when near Io |

---

## Deployment Checklist

Before each deploy:
- [ ] `npm run build` succeeds with no errors
- [ ] `npm run preview` verified at localhost:4173
- [ ] Ko-fi handle updated in src/config.js
- [ ] R2 texture URL updated in src/config.js (if textures changed)
- [ ] README live URL updated
- [ ] PROJECT_LOG.md updated with session changes

Deploy command: `npm run deploy`

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
