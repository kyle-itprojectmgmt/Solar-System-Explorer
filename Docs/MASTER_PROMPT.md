# Solar System Explorer — Claude Code / Fable Master Prompt

---

## How to Run Claude Code

### Standard Claude Code (terminal):
```bash
cd C:\dev\Solar-System-Explorer
claude
```

### With Fable (extended context, longer sessions):
```bash
cd C:\dev\Solar-System-Explorer
claude --fable
```

Always run from inside the `Solar-System-Explorer` folder so Claude Code
has full access to your project files.

---

## THE PROMPT

Build a photorealistic, immersive, first-person 3D Jupiter System Simulator
as a hosted single-page web app. This is v1 of a Solar System Explorer — the
architecture must support future expansion to Saturn, the full solar system,
and beyond. The user experience is: you are a space probe exploring the
Jovian system, seeing it as Voyager saw it.

---

## TECH STACK

- **Three.js** (latest) with **WebGPU renderer**, falling back to WebGL
- **Vite** build system (already initialized in this project)
- **Vanilla JavaScript** — no framework
- **Cloudflare Pages** deployment target (wrangler.toml already configured)
- **Cloudflare R2** for texture hosting in production
- **Web Audio API** for generative soundscapes
- **postprocessing** library for bloom, lens flare, depth of field
- **KTX2/Basis Universal** compressed textures for production performance

Install any required npm packages as needed.

---

## ARCHITECTURE REQUIREMENT — SOLAR SYSTEM SCALABILITY

This is critical. The engine must be fully data-driven. Jupiter and its
moons are defined in a config file at `/src/data/systems/jupiter.js`, not
hard-coded into rendering or physics logic. The engine reads any valid system
config and builds the scene dynamically.

### Folder structure:
```
/src
  /engine          ← never changes (renderer, physics, camera, audio, UI)
    renderer.js
    physics.js
    camera.js
    audio.js
    ui.js
    postfx.js
  /data
    /systems
      jupiter.js   ← active system config for v1
      saturn.js    ← stub only, empty template for future
  /textures        ← local dev textures (production serves from R2)
  main.js          ← entry point, loads active system config
```

### System config schema — design to support:
- Primary body: radius, mass, texture paths, axial tilt, rotation period,
  atmosphere parameters (glow color, thickness, scattering), feature flags
- Ring system: array of rings each with inner/outer radius, opacity,
  color, thickness, tilt
- Arbitrary number of orbiting bodies with full Keplerian orbital elements
- Per-body feature flags object: `{ volcanicPlumes, subsurfaceGlow,
  ringSystem, atmosphericGlow, greatRedSpot }`
- A `SYSTEM_CONFIG` constant at the top of `main.js` pointing to the
  active system — switching systems must be a one-line change

### Texture path pattern:
```
/textures/{body-slug}/diffuse.ktx2
/textures/{body-slug}/normal.ktx2
/textures/{body-slug}/specular.ktx2
```

A single `TEXTURE_BASE_URL` constant controls whether textures load from
local `/public/textures/` (development) or Cloudflare R2 URL (production).
Switching to production is a one-line change.

No Jupiter-specific logic should appear outside `jupiter.js`. A future
developer must be able to drop in `saturn.js` with the correct schema and
have it render correctly with zero engine changes.

---

## JUPITER SYSTEM CONFIG (`/src/data/systems/jupiter.js`)

Use accurate NASA JPL data throughout.

### Jupiter (primary body):
- Radius: 71,492 km
- Mass: 1.898 × 10²⁷ kg
- Rotation period: 9.925 hours (fastest rotation in solar system)
- Axial tilt: 3.13°
- Atmosphere: ammonia cloud bands, Great Red Spot (animated, rotates
  with planet), equatorial bulge visible
- Limb glow: warm orange-tan atmospheric scattering
- Texture: 8K diffuse + normal map (NASA public domain)
- Feature flags: `{ greatRedSpot: true, atmosphericGlow: true,
  equatorialBulge: true }`

### Jupiter's Ring System (4 components, all rendered):

All rings are semi-transparent, additive-blended meshes. Nearly invisible
face-on, dramatically backlit when Sun is behind Jupiter. This is a
cinematic moment — emphasize it.

| Ring | Inner Radius (km) | Outer Radius (km) | Color | Opacity |
|------|-------------------|-------------------|-------|---------|
| Halo | 92,000 | 122,500 | Blue-neutral, diffuse torus | 0.08 |
| Main | 122,500 | 129,000 | Reddish, narrow, brightest | 0.15 |
| Gossamer (Amalthea) | 129,000 | 182,000 | Orange dust, wide | 0.04 |
| Gossamer (Thebe) | 129,000 | 226,000 | Faint green-grey, widest | 0.02 |

The halo ring is a torus geometry. The others are flat ring geometries.
Rings should cast subtle shadow on Jupiter's cloud tops when geometry aligns.

### Galilean Moons (accurate orbital elements):

| Moon | Semi-major axis (km) | Period (days) | Radius (km) | Features |
|------|----------------------|---------------|-------------|----------|
| Io | 421,700 | 1.769 | 1,821 | volcanicPlumes, sulfur plains |
| Europa | 671,100 | 3.551 | 1,560 | iceCracks, subsurfaceGlow |
| Ganymede | 1,070,400 | 7.155 | 2,634 | largest moon in solar system |
| Callisto | 1,882,700 | 16.689 | 2,410 | ancient cratered dark terrain |

### Inner Moons (ring source moons, simpler rendering):
- Metis: 127,969 km, tiny, ring source
- Adrastea: 128,980 km, tiny, ring source
- Amalthea: 181,366 km, reddish, elongated shape
- Thebe: 221,900 km, ring source

### Sun:
- Distance from Jupiter: 5.2 AU
- Rendered as a distant intense point light + lens flare
- Direction is fixed relative to scene (not modeled as orbiting body in v1)
- Correct illumination angle for all bodies

---

## PHYSICS ENGINE

- **N-body gravitational simulation** using Verlet integration
- Accurate orbital mechanics for all Galilean moons
- Inner moons use simplified Keplerian orbits (performance)
- Time controls: Pause / 1x / 10x / 100x / 1,000x / 10,000x
- Time multiplier UI: slider + keyboard shortcuts (`,` slower, `.` faster,
  `Space` pause/resume)
- Simulated date/time display (start from Voyager 1 Jupiter flyby:
  March 5, 1979)
- Moon shadow/eclipse calculations — when a moon passes into Jupiter's
  shadow, darken it dramatically. This is one of the most visually
  stunning moments in the simulation.
- Jupiter axial tilt applied to all orbital plane calculations
- Io/Europa/Ganymede orbital resonance (1:2:4) should be visually apparent
  when time is accelerated

---

## CAMERA SYSTEM — 6 MODES

All modes switchable via UI panel and keyboard shortcuts. Smooth GSAP or
Tween.js transitions between modes (0.8 second ease-in-out).

### Mode 1 — Cinematic Auto (startup default)
- Scripted slow dramatic pans that run on page load
- Sequence: pull back to reveal full system → slow orbit around Jupiter
  → dive toward Io → pull back again → drift near Europa
- Each movement takes 8–15 seconds with smooth easing
- Transfers control to Free Fly on any keypress or touch
- Loops indefinitely if user doesn't interact
- Key: `C`

### Mode 2 — Free Fly
- WASD + mouse drag, full 6DOF movement
- Scroll wheel / pinch: movement speed multiplier
- Shift: boost speed 5x
- This is the primary exploration mode
- Key: `F`

### Mode 3 — Orbit
- Click / tap any body to smoothly transition camera to orbit it
- Mouse drag orbits around selected body
- Scroll zooms toward/away from body
- Body name shown in HUD when orbiting
- Key: `O` then click target

### Mode 4 — Surface
- "Land" on any moon surface
- First-person horizon view from the surface
- Watch Jupiter rise and set as moon rotates
- Watch other moons arc across the sky
- Correct scale — Jupiter should fill a huge portion of the sky from Io
- Touch/drag to look around
- Key: `S` then click target moon

### Mode 5 — Chase
- Lock camera behind a selected moon, travel with it in its orbit
- Slight lag/spring follow for cinematic feel
- Good for watching Jupiter loom as the moon approaches
- Key: `H` then click target

### Mode 6 — System View
- Pull back to see full system
- Orbital path lines shown (toggleable)
- All body labels visible
- Good for understanding the system scale
- Key: `G`

---

## VISUALS — PHOTOREALISTIC

### Rendering pipeline:
- WebGPU renderer (Three.js r165+) with WebGL fallback
- Post-processing via `postprocessing` library:
  - **Bloom** on Jupiter's limb glow, Io's volcanic hotspots, sun
  - **Lens flare** from sun direction
  - **Depth of field** subtle, focused on primary target
  - **Film grain** very subtle, adds cinematic texture
  - **Vignette** subtle edge darkening

### Jupiter:
- PBR material with 8K diffuse texture (NASA Cassini/Hubble maps)
- Animated cloud band rotation (Great Red Spot rotates with planet)
- Atmospheric limb scattering shader — warm orange-tan glow at edges
- Equatorial bulge (Jupiter is oblate, not a perfect sphere — use
  ellipsoid geometry: equatorial radius 71,492 km, polar 66,854 km)
- Reflected light from Jupiter softly illuminates moon night sides
  (ambient contribution, not full raytracing)

### Moons:
- **Io**: sulfur yellow-orange plains, active volcanic hotspots that
  glow in the dark side, 2–3 particle plume effects from active volcanoes
  (Pele, Loki, Prometheus regions)
- **Europa**: blue-white ice, reddish crack network (linea), subtle
  subsurface ocean glow effect visible on night side
- **Ganymede**: two-toned — ancient dark terrain (Galileo Regio) and
  lighter grooved regions, subtle magnetosphere glow
- **Callisto**: darkest, most heavily cratered, ancient surface,
  Valhalla impact basin visible

### Starfield:
- High-resolution cubemap starfield OR procedural star field with
  ~10,000 stars
- Milky Way band visible and correctly oriented
- Stars do not twinkle (space, no atmosphere)

### Eclipse events:
- When a moon enters Jupiter's shadow cone: smooth darkening transition
- When a moon transits Jupiter's face: shadow dot visible on cloud tops
- These events should be highlighted with a subtle HUD notification:
  "Io entering eclipse..."
- At 10,000x time acceleration these happen frequently — very dramatic

### Io volcanic plumes:
- 2–3 particle systems at correct geographic locations
- Umbrella-shaped plume, reaches ~300 km altitude
- Subtle sulfur dioxide color (pale yellow-white)
- Visible from space when approaching Io

---

## AUDIO SYSTEM

Master volume slider in UI. Sound mode saved to localStorage.
Smooth 2-second crossfade when switching modes.

### Mode 1 — Silent
All audio off.

### Mode 2 — Voyager Radio
Web Audio API procedural generation mimicking NASA Voyager plasma wave
recordings. Crackling, tonal, alien electromagnetic interference.
Use oscillators, filtered noise, and slow random modulation.

### Mode 3 — Deep Space Ambient
Web Audio API generative ambient. Layered sine wave drones at
harmonically related frequencies, slow filter sweeps, convolution reverb
with long decay, subtle randomization so it never repeats identically.
Brian Eno / Apollo aesthetic. Evolves continuously.

### Mode 4 — Psychedelic Journey
Generative micro-tonal pads. Multiple detuned oscillators creating
slow beating patterns, binaural-adjacent stereo movement via panning
LFOs, evolving filter cutoffs, occasional tonal swells. Designed for
long hypnotic sessions. Carbon Based Lifeforms / Stellardrone aesthetic.
This is the "stoner stare" mode — it should be genuinely mesmerizing.

### Mode 5 — Cosmic Electronic
Slow-pulse generative beat, sub-bass drone, filtered synth arpeggios
at low tempo. Solar Fields / Klaus Schulze aesthetic. More rhythmic
than Mode 4 but still slow and cosmic.

### Mode 6 — Spotify Playlist
Collapsed drawer UI in bottom corner. Spotify iFrame embed.
User pastes a Spotify playlist URL — saved to localStorage.
Volume synced to master slider.
Collapsed by default, expands on click.

### Mode 7 — YouTube Playlist
Same as Mode 6 but YouTube IFrame API.
Skinned to match UI aesthetic.
Separate from Spotify — both available as options.

---

## UI DESIGN

### Brand / Style Guide:
Apply consistently across ALL UI elements:

**Typography:**
- **Headings / labels / mode names:** Montserrat (Google Fonts)
- **Body text / data / readouts:** Lato (Google Fonts)
- Import both from Google Fonts in index.html

**Color palette:**
- Primary Blue: `#0077CC` — used for active states, selected bodies,
  key interactive elements
- Light Blue Accent: `#66B2FF` — buttons, highlights, hover states,
  orbital path lines
- White: `#FFFFFF` — primary text on dark backgrounds
- Light Gray: `#D9D9D9` — secondary text, dividers, inactive states
- Dark Gray: `#4D4D4D` — panel backgrounds at ~85% opacity
- Space Black: `#050510` — scene background, deep space

**UI aesthetic:**
- All panels: Dark Gray `#4D4D4D` at 85% opacity, subtle `#0077CC`
  border (1px, 30% opacity), 8px border radius
- Minimal blur backdrop filter on panels
- Text: White primary, Light Gray secondary
- Active/selected: Primary Blue `#0077CC` background or Light Blue
  `#66B2FF` text
- Buttons: Primary Blue background, White text, Light Blue hover
- The overall feel: mission control meets deep space — professional,
  clean, not cluttered

### HUD Elements (always visible, minimal):

**Top left:**
- Simulated date/time (Montserrat, small, Light Gray)
- Current time multiplier (e.g., "1,000x")

**Top right:**
- Camera mode indicator
- Active body name (when orbiting/chasing/surface)

**Bottom left:**
- Sound mode selector (icon row)
- Master volume slider

**Bottom right:**
- Ko-fi donate button (subtle, floating)
  `☕ Support this project` — links to Ko-fi page
- Screenshot button (camera icon) — hides all UI, captures frame,
  re-shows UI. Downloaded as `solar-system-explorer-[timestamp].png`

### Collapsible Side Panel (right edge, toggle with `Tab`):
- Camera mode switcher (6 buttons with icons and keyboard shortcut labels)
- Time controls (slider + preset buttons)
- Body selector (click to focus camera on that body)
- Orbital paths toggle
- Body labels toggle
- Ring visibility toggle
- Eclipse event ticker (upcoming events with countdown)

### Body Info Panel (appears on click/tap of any body):
- Body name (Montserrat heading, Primary Blue)
- Key stats: radius, mass, orbital period, distance from Jupiter
- 2–3 fascinating facts
- "Set as target" button
- Dismiss on click outside or `Escape`

### Loading Screen:
- Space Black background
- Jupiter texture preview blurred in background
- Montserrat title: "Solar System Explorer"
- Lato subtitle: "Jupiter System — v1.0"
- Progress bar in Primary Blue
- Rotating Jupiter facts while loading:
  - "Jupiter is so large that 1,300 Earths could fit inside it"
  - "Jupiter's Great Red Spot is a storm that has raged for over 350 years"
  - "Io is the most volcanically active body in the solar system"
  - "Europa may harbor a liquid water ocean beneath its icy surface"
  - "Jupiter's rings were discovered by Voyager 1 in 1979"
  - "Ganymede is larger than the planet Mercury"
  - "Jupiter completes a full rotation in under 10 hours"
  - "The Galilean moons were discovered by Galileo in 1610"

---

## MOBILE SUPPORT

Adaptive quality tiers — auto-detected on load, can be overridden:

| Tier | Detection | Textures | Shadows | Post-FX | Target FPS |
|------|-----------|----------|---------|---------|------------|
| Desktop | No touch / high GPU | 8K Jupiter, 4K moons | Full | All enabled | 60 |
| Tablet | Touch + medium GPU | 4K Jupiter, 2K moons | Simplified | Bloom only | 60 |
| Mobile | Touch + low GPU | 2K Jupiter, 1K moons | Off | Minimal | 30–60 |

### Touch controls:
- One finger drag: look / rotate camera
- Two finger pinch: zoom in/out
- Two finger drag: pan
- Double tap body: snap focus (Orbit mode)
- Long press: info panel
- Swipe up from bottom edge: camera mode switcher

Cap pixel ratio at 2x maximum on all devices.
Use `navigator.maxTouchPoints` and GPU tier detection library for
auto-detection.

---

## PERFORMANCE TARGETS

- 60 FPS on mid-range laptop (desktop tier)
- 30+ FPS on mid-range smartphone (mobile tier)
- Initial load under 5 seconds on broadband (textures lazy-loaded,
  show loading screen with facts while loading)
- Textures loaded progressively — show low-res placeholder first,
  swap to high-res when loaded
- Use KTX2 compressed textures for production
- Three.js LOD system for bodies far from camera
- Dispose geometries/materials when not needed
- Target under 100 draw calls per frame

---

## DEPLOYMENT CONFIGURATION

### Local development:
```bash
npm run dev       # http://localhost:5173 — hot reload
npm run preview   # http://localhost:4173 — test production build locally
```

### Deploy to Cloudflare Pages:
```bash
npm run deploy    # builds and deploys to production
npm run deploy:preview  # deploys to preview URL for staging
```

### Environment config in `src/config.js`:
```javascript
export const TEXTURE_BASE_URL = import.meta.env.DEV
  ? '/textures'
  : 'https://pub-XXXX.r2.dev/textures'; // swap XXXX for real R2 URL

export const SYSTEM_CONFIG = 'jupiter'; // one-line change to switch systems
```

### Texture organization on R2:
```
/textures/jupiter/diffuse.ktx2
/textures/jupiter/normal.ktx2
/textures/io/diffuse.ktx2
/textures/europa/diffuse.ktx2
/textures/ganymede/diffuse.ktx2
/textures/callisto/diffuse.ktx2
```

---

## DONATE / TIP INTEGRATION

Ko-fi floating button in bottom-right corner of the scene (above screenshot
button). Subtle, never intrusive:
- Icon: ☕
- Text: "Support this project"
- Style: Dark Gray panel, Light Blue accent border, Montserrat font
- Links to: https://ko-fi.com/YOUR_HANDLE (placeholder, easily updated)
- Opens in new tab

---

## SCREENSHOT FEATURE

Camera icon button in UI:
1. Fade out all UI elements (0.3s)
2. Render one clean frame
3. Capture via `renderer.domElement.toBlob()`
4. Download as `solar-system-explorer-YYYY-MM-DD-HH-MM-SS.png`
5. Fade UI back in (0.3s)

---

## BONUS FEATURES (implement if capacity allows, in priority order)

1. **Eclipse event ticker** — calculate next 5 upcoming eclipse/transit
   events and show countdown in side panel. "Io eclipse in 4m 32s"

2. **Speed-of-light indicator** — small HUD element showing current
   light-travel time from Jupiter to Earth: "Signal delay: 43 minutes"
   (updates with simulated date)

3. **Voyager mode preset** — button that sets date to March 5, 1979,
   positions camera on approximate Voyager 1 flyby trajectory, plays
   Voyager Radio audio, and runs a slow cinematic flyby sequence

4. **Io volcanic event notifications** — occasional popups: "Volcanic
   eruption detected at Pele region" when camera is near Io

5. **Resonance visualizer** — in System View mode, show a subtle
   visualization of the 1:2:4 orbital resonance between Io, Europa,
   and Ganymede

---

## README UPDATE

After building, update README.md:
- Replace `#` placeholder links with actual Cloudflare Pages URL
- Add real Ko-fi link if available
- Keep the LinkedIn/Substack placeholders (to be filled in by user)

---

## FINAL NOTES FOR CLAUDE CODE

- Commit working code frequently with descriptive commit messages
- If a feature is too complex for one session, implement a clean stub
  that can be expanded later
- Prioritize: (1) core scene with Jupiter + moons orbiting, (2) Free
  Fly camera, (3) photorealistic textures, (4) time controls, (5) all
  other features in order listed
- The cinematic opening and photorealistic visuals are the viral hook —
  prioritize these over feature completeness
- All UI text uses the Kyle Ewing / ITprojectMGMT brand typography and
  colors specified above
- The experience should feel like a NASA mission control meets deep space
  exploration — professional, awe-inspiring, and technically impressive
