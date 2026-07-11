# Solar System Explorer — V4b Session Prompt
# Bug fixes + UI enhancements from hardware review.
# Jupiter system only — no new systems, no engine architecture changes.
# Save to Docs/V4b_PROMPT.md

---

## HOW TO START THIS SESSION

```bash
cd C:\dev\Solar-System-Explorer
git pull origin main
git status   ← must show clean working tree
claude --fable
```

Then say:
"Read .claude/instructions.md, then PROJECT_LOG.md, then
Docs/V4b_PROMPT.md. Implement everything in priority order.
Commit and push source files after every group."

---

## CONTEXT

V4 is complete and live. This session fixes real-hardware bugs
discovered during review and adds UI polish before public launch.
All changes are confined to ui.js, renderer.js, detailShaders.js,
and jupiter.js config. No engine architecture changes. No new
planetary systems.

Work through groups in order. Commit and push after each group.
Deploy after Group 3. Final deploy after Group 4.

---

## GROUP 1 — SLIDER BUG FIXES (Quick wins, do first)
Commit: `fix: sliders use input event for live drag updates`

### 1a — Fix all sliders to update live while dragging
All sliders currently use the 'change' event which only fires on
release. Change ALL slider event listeners in ui.js from:
  element.addEventListener('change', handler)
To:
  element.addEventListener('input', handler)

This applies to EVERY slider in the app without exception:
- Altitude slider (Mission Control)
- Inclination slider (Mission Control)
- Time/speed slider
- Volume slider (audio)
- Orbital Speed / Camera Speed slider
- Chase Height slider
- Any other slider found in ui.js

After the fix, dragging any slider should produce immediate
live motion — camera moves, time changes, volume changes as
the slider moves, not just when released.

Verify: drag the altitude slider slowly from max to min over
Jupiter in Orbit mode. Camera should descend smoothly in real
time as the slider moves.

### 1b — Rename "Orbital Speed" to "Camera Speed"
Find the Orbital Speed / Orbit Camera slider label in ui.js.
Rename to "Camera Speed" in the UI display.
The underlying variable name in code can stay the same.

---

## GROUP 2 — VISUAL BUG FIXES
Commit after each individual fix.

### 2a — Fix Io and Europa flickering artifacts (Bug #12)
Z-fighting between the base mesh sphere and the procedural detail
shader geometry at nearly identical depth causes flickering on
Io and Europa specifically.

Fix in detailShaders.js and/or renderer.js:
- For the detail shader overlay geometry, add polygonOffset:
  ```javascript
  material.polygonOffset = true;
  material.polygonOffsetFactor = -1;
  material.polygonOffsetUnits = -1;
  ```
- Alternatively, scale the detail mesh outward by 0.1%:
  detailMesh.scale.setScalar(1.001);

Test both Io and Europa from multiple distances and angles.
Flickering must be completely eliminated — not reduced, eliminated.
Verify the fix doesn't cause visible gap between base and detail
mesh at any distance.

Commit: `fix: Io and Europa z-fighting — polygonOffset on detail shader mesh`

### 2b — Fix atmospheric halos to respond to sun direction (Bug #13)
Ganymede currently shows a uniform halo ring regardless of sun
direction — the same issue Jupiter had before the v4 limb glow fix.

Apply the same directional atmospheric scattering shader used for
Jupiter's limb glow to ALL bodies that have an atmosphere flag.

Bodies needing this fix:
- Ganymede: thin oxygen atmosphere + magnetosphere glow
  Color: very faint blue-green #88CCFF, thin, subtle
- Europa: trace oxygen/ozone atmosphere
  Color: very faint blue-white #AADDFF, extremely thin
- Io: thin sulfur dioxide atmosphere
  Color: very faint yellow-white #FFFFCC, thin

The shader must:
- Only show glow on the LIT side (dot product of normal with
  sun direction must be positive)
- Feather out gradually — not a hard edge
- Be significantly thinner/fainter than Jupiter's glow
  (these are thin exospheres, not thick atmospheres)
- Be absent on the night side limb

Remove any existing uniform halo sphere approach for these bodies
before applying the new shader — do not layer them.

Verify from multiple sun angles: glow visible on lit side only,
absent on night side, thin and feathered not a solid ring.

Commit: `fix: directional atmospheric halos for Ganymede, Europa, Io`

### 2c — Fix hole in Metis and Adrastea at close zoom (Bug #14)
Two causes — fix both:

CAUSE A — Low-poly geometry:
Inner moons (Metis, Adrastea, Amalthea, Thebe) currently use
a default sphere geometry with too few segments. At close range
the polygon faces become visible.

In the renderer, when building inner moon meshes, use higher
subdivision:
  // Instead of default SphereGeometry(r, 16, 16)
  // Use: SphereGeometry(r, 64, 64) for inner moons

Add a geometry quality property to the body config in jupiter.js:
  { name: 'Metis', ..., geometrySegments: 64 }

CAUSE B — Zoom floor not enforced for inner moons:
Verify the zoom floor hardKm values from the body config are
actually being applied for inner moons in camera.js _floorDist().
Inner moon floors: Metis 20km, Adrastea 20km, Amalthea 50km,
Thebe 50km. The hard stop must prevent the camera entering the
geometry at any zoom level.

Verify: zoom all the way in to Metis and Adrastea. Should stop
before any hole or geometry artifact is visible. No polygon faces
should be visible at the zoom floor.

Commit: `fix: inner moon geometry segments + zoom floor enforcement`

### 2d — Fix Io plume particle white squares (Bug #8)
Io volcanic plume particles render as white squares because the
particle system is using the default PointsMaterial without a
sprite texture — it renders raw points as squares.

Fix in renderer.js or wherever Io plumes are created:
Create a small circular sprite texture programmatically using
a canvas:
  ```javascript
  const canvas = document.createElement('canvas');
  canvas.width = 64; canvas.height = 64;
  const ctx = canvas.getContext('2d');
  const gradient = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  gradient.addColorStop(0, 'rgba(255, 240, 200, 1)');
  gradient.addColorStop(0.4, 'rgba(255, 200, 100, 0.6)');
  gradient.addColorStop(1, 'rgba(255, 180, 50, 0)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 64, 64);
  const sprite = new THREE.CanvasTexture(canvas);

  // Apply to plume PointsMaterial:
  material.map = sprite;
  material.transparent = true;
  material.depthWrite = false;
  material.sizeAttenuation = true;
  ```

The plume particles should look like soft glowing orange-yellow
sparks, not white squares. Verify from orbit and close range.

Commit: `fix: Io plume particles — circular sprite replaces white squares`

---

## GROUP 3 — UI ENHANCEMENTS
Commit after each item. Deploy after this entire group.

### 3a — Expand body info cards (Feature #15)
Body info cards currently show minimal data. Expand each card
to include comprehensive information. All data must be stored
in jupiter.js config under each body entry — not hardcoded in ui.js.

Add to jupiter.js config for each body:

Jupiter:
  diameterKm: 142984,
  massKg: 1.898e27,
  surfaceGravity: 24.79,        // m/s²
  surfaceTempRange: [-108, -108], // °C (cloud top)
  orbitalPeriodDays: 4332.59,   // around sun
  rotationPeriodHours: 9.925,
  notableFeatures: [
    'Great Red Spot — storm raging 350+ years',
    'Strongest magnetic field of any planet',
    'More than twice the mass of all other planets combined',
    '4 large Galilean moons + 91 smaller moons',
  ],
  moreInfo: {
    grsSize: '16,000 km wide — larger than Earth',
    magneticField: '20,000x stronger than Earth\'s',
    rings: '4-component faint ring system discovered 1979',
    radiation: 'Radiation belts lethal to unshielded spacecraft',
  }

Io:
  diameterKm: 3643,
  massKg: 8.93e22,
  surfaceGravity: 1.796,
  surfaceTempRange: [-143, 1600], // °C (-143 surface, 1600 volcanic)
  orbitalPeriodDays: 1.769,
  orbitalDistanceKm: { min: 420000, max: 423000 },
  rotationPeriodHours: 42.46,   // tidally locked
  tidallyLocked: true,
  notableFeatures: [
    'Most volcanically active body in the solar system',
    'Tidal heating from Jupiter\'s gravity drives volcanism',
    'Surface resurfaced by lava every few thousand years',
    'Over 400 active volcanoes',
  ],
  moreInfo: {
    tidalHeating: 'Jupiter\'s tidal forces generate ~100TW of heat',
    atmosphere: 'Thin SO₂ atmosphere from volcanic outgassing',
    plumes: 'Volcanic plumes reach 500km into space',
  }

Europa:
  diameterKm: 3122,
  massKg: 4.80e22,
  surfaceGravity: 1.315,
  surfaceTempRange: [-160, -220],
  orbitalPeriodDays: 3.551,
  orbitalDistanceKm: { min: 664000, max: 678000 },
  rotationPeriodHours: 85.23,
  tidallyLocked: true,
  notableFeatures: [
    'Subsurface ocean 100km deep beneath ice shell',
    'Best candidate for extraterrestrial life in solar system',
    'Surface ice cracks reveal tidal flexing activity',
    'Europa Clipper mission currently en route (arrives 2030)',
  ],
  moreInfo: {
    ocean: 'More liquid water than all of Earth\'s oceans combined',
    iceShell: 'Ice shell 10-30km thick over liquid ocean',
    habitability: 'Hydrothermal vents likely on ocean floor',
  }

Ganymede:
  diameterKm: 5268,
  massKg: 1.48e23,
  surfaceGravity: 1.428,
  surfaceTempRange: [-203, -121],
  orbitalPeriodDays: 7.155,
  orbitalDistanceKm: { min: 1069000, max: 1071000 },
  rotationPeriodHours: 171.7,
  tidallyLocked: true,
  notableFeatures: [
    'Largest moon in the solar system — bigger than Mercury',
    'Only moon with its own magnetic field and auroras',
    'Ancient dark terrain and younger grooved terrain',
    'JUICE mission en route, arrives 2034',
  ],
  moreInfo: {
    magnetosphere: 'Aurora ovals visible from orbit at poles',
    terrain: 'Two terrain types separated by sharp geological boundary',
    size: 'Diameter 5,268km — exceeds Mercury\'s 4,879km',
  }

Callisto:
  diameterKm: 4821,
  massKg: 1.08e23,
  surfaceGravity: 1.235,
  surfaceTempRange: [-193, -108],
  orbitalPeriodDays: 16.689,
  orbitalDistanceKm: { min: 1869000, max: 1897000 },
  rotationPeriodHours: 400.5,
  tidallyLocked: true,
  notableFeatures: [
    'Most heavily cratered object in the solar system',
    'Surface unchanged for ~4 billion years',
    'Valhalla impact basin — rings spread 1,900km from center',
    'Lowest radiation of any Galilean moon — best for crewed base',
  ],
  moreInfo: {
    age: 'Surface is a record of 4 billion years of impacts',
    valhalla: 'Largest multi-ring impact structure in solar system',
    future: 'Proposed site for human outpost due to low radiation',
  }

Inner moons (Metis, Adrastea, Amalthea, Thebe):
Add basic data: diameterKm (approximate), discoveredYear,
discoveredBy, notableFeatures (ring source, shepherd moon role).

UI card layout:
- Header: body name + type badge (Gas Giant / Volcanic Moon /
  Ice Moon / Ancient Moon etc.)
- Key stats grid: Diameter, Mass, Gravity, Temp Range
- For moons: Orbital Distance (min-max), Orbital Period
- Notable Features: bullet list, 3-4 items
- "More Info ▾" expandable section: shows moreInfo content
- All data from jupiter.js config — ui.js only reads and renders

Commit: `feat: expand body info cards with comprehensive data from config`

### 3b — Remove GRS button from Jupiter body info card (Feature #14)
In ui.js, find the body info card for Jupiter and remove the
"Great Red Spot" navigation button from it.
The GRS button stays in the Orbit Insertion panel — only remove
it from the body info card.
Verify: click Jupiter, body card opens, no GRS button visible.
GRS button still present and working in Orbit Insertion panel.

Commit: `ui: remove GRS button from Jupiter body card — keep in Orbit Insertion only`

### 3c — Music player minimize toggle (Feature #18)
Add a collapse/expand button to the music player panel header.
A chevron (▾/▴) or minus/plus icon in the top-right of the
"🎵 Player" header bar.

Collapsed state shows ONLY:
- The sound mode icon row (7 icons)
- The volume slider

Hidden when collapsed:
- Spotify URL input + Load button
- YouTube URL input + Load button
- Any expanded embed player

Collapsed state saved to localStorage as 'sse-music-collapsed'.
Default: expanded.

Collapsing the music player is INDEPENDENT of presentation mode
(P key). Presentation mode hides everything including the music
player. Music player collapse only hides the URL input section.

Verify: collapse music player → only icons + volume visible.
Press P → everything including collapsed music player hides.
Reload page → music player remembers collapsed state.

Commit: `ui: music player collapse toggle — independent of presentation mode`

### 3d — Spotify and YouTube brand icons (Feature #19)
Replace the current generic icons for Spotify and YouTube sound
modes with official brand-accurate SVG icons.

Spotify icon (mode 6):
  SVG path for the Spotify logo (three curved lines / sound waves
  over a circle). Color: #1DB954 (Spotify green) on the button
  background. Background when active: dark with green border.

YouTube icon (mode 7):
  SVG path for the YouTube play button (red rounded rectangle
  with white triangle). Color: #FF0000 (YouTube red).
  Background when active: dark with red border.

Both icons should be inline SVG in the HTML/JS — not external
image files (avoids loading overhead and works offline).

The other 5 audio mode icons should remain styled consistently
with the existing design.

Also verify Spotify and YouTube modes work end-to-end:
- Paste a valid Spotify playlist URL → click Load → player
  appears and can play
- Paste a valid YouTube playlist URL → click Load → player
  appears and can play
- Fix any broken functionality found during verification

Commit: `ui: Spotify green + YouTube red brand icons for music modes`

### 3e — Resonance lines improvement (Feature #16)
The current resonance lines checkbox shows simple orbital path
lines — not a meaningful resonance visualization.

Implement proper 1:2:4 resonance visualization:

When "Resonance lines" is checked in the Display section:
1. Draw subtle connecting lines between Io, Europa, and Ganymede
   that animate to show their gravitational relationship
2. Calculate the current resonance phase angles from physics
   simulation — how far each moon is through its orbital period
   relative to the others
3. When moons approach alignment (within 15° of resonance
   conjunction), highlight the connecting lines in Primary Blue
   #0077CC with a glow effect — they "pulse" when aligned
4. Add a small "Resonance" HUD indicator showing the current
   alignment percentage: "Resonance: 73% aligned"
5. At 10,000x time speed the alignments happen frequently and
   visually — this should be dramatic

The visualization must make the 1:2:4 ratio intuitively obvious:
for every 4 Io orbits, Europa completes exactly 2, Ganymede
exactly 1. Showing this visually is the goal.

Update the checkbox tooltip to explain:
"Shows the gravitational resonance between Io, Europa, and
Ganymede. They orbit Jupiter in a precise 1:2:4 ratio — for
every orbit Ganymede completes, Europa completes 2 and Io
completes 4. Lines pulse when moons align."

Commit: `feat: resonance lines — proper 1:2:4 visualization with alignment detection`

### Deploy after Group 3
```bash
npm run build
# Verify dist has 5-6 chunked files
npm run preview
# Verify all Group 3 features work
npx wrangler deploy
# Verify live URL in incognito
```

---

## GROUP 4 — TOOLTIPS
Large scope but entirely contained in ui.js.
Commit: `feat: tooltip system — hover help for all UI controls`

### 4a — Implement tooltip system
Create a single reusable tooltip component in ui.js:

```javascript
class Tooltip {
  constructor() {
    this.el = document.createElement('div');
    this.el.className = 'sse-tooltip';
    this.el.style.cssText = `
      position: fixed;
      background: rgba(77,77,77,0.95);
      color: #D9D9D9;
      font-family: 'Lato', sans-serif;
      font-size: 12px;
      padding: 6px 10px;
      border-radius: 6px;
      border: 1px solid rgba(0,119,204,0.3);
      pointer-events: none;
      z-index: 9999;
      max-width: 220px;
      line-height: 1.4;
      display: none;
      white-space: normal;
    `;
    document.body.appendChild(this.el);
  }

  attach(element, text) {
    let timer;
    element.addEventListener('mouseenter', (e) => {
      timer = setTimeout(() => {
        this.el.textContent = text;
        this.el.style.display = 'block';
        this.position(e);
      }, 500);
    });
    element.addEventListener('mousemove', (e) => this.position(e));
    element.addEventListener('mouseleave', () => {
      clearTimeout(timer);
      this.el.style.display = 'none';
    });
    // Mobile long-press
    let touchTimer;
    element.addEventListener('touchstart', () => {
      touchTimer = setTimeout(() => {
        this.el.textContent = text;
        this.el.style.display = 'block';
      }, 600);
    });
    element.addEventListener('touchend', () => {
      clearTimeout(touchTimer);
      setTimeout(() => this.el.style.display = 'none', 1500);
    });
  }

  position(e) {
    const x = Math.min(e.clientX + 12, window.innerWidth - 240);
    const y = Math.max(e.clientY - 36, 8);
    this.el.style.left = x + 'px';
    this.el.style.top = y + 'px';
  }
}
const tooltip = new Tooltip();
```

### 4b — Apply tooltips to all controls

SOUND MODE ICONS (apply in order):
  Silent:            "No audio — complete silence"
  Voyager Radio:     "Procedural plasma wave sounds inspired by NASA Voyager recordings"
  Deep Space Ambient: "Generative ambient drone — evolves continuously, never repeats"
  Psychedelic Journey: "Slow evolving micro-tonal pads — designed for long hypnotic sessions"
  Cosmic Electronic: "Slow-pulse generative electronic — rhythmic but cosmic"
  Spotify:           "Connect your Spotify playlist — paste URL and click Load"
  YouTube:           "Connect your YouTube playlist — paste URL and click Load"

CAMERA MODE BUTTONS:
  Cinematic:    "Auto-scripted cinematic pans — press any key to take control"
  Free Fly:     "Full 6DOF flight — WASD to move, mouse to look, Shift for boost"
  Orbit:        "Orbit around a body — click any body to target it"
  Surface:      "Land on a moon surface — watch Jupiter rise and set"
  Chase:        "Follow a moon from behind — see its surface and Jupiter ahead"
  System View:  "Pull back to see the full Jupiter system with orbital paths"
  Orbit Insertion: "Insert into a physically accurate orbit — set altitude, inclination, and geosync"

TIME CONTROLS:
  Pause (‖):    "Pause simulation — freeze all orbital motion"
  1x:           "Real time — 1 second of simulation per second"
  10x:          "10× faster — see moons drift visibly"
  100x:         "100× faster — moon orbits become apparent"
  1,000x:       "1,000× faster — watch eclipses and resonances"
  10,000x:      "10,000× faster — full orbital cycles in minutes"
  Time slider:  "Controls simulation speed — how fast moons orbit and Jupiter rotates"

DISPLAY CHECKBOXES:
  Orbital paths:  "Show orbital path lines for all moons"
  Body labels:    "Show name labels on Jupiter and all moons"
  Rings:          "Show Jupiter's four-component ring system"
  Resonance lines: "Show the gravitational 1:2:4 resonance between Io, Europa, and Ganymede — lines pulse when moons align"

MISSION CONTROL SLIDERS:
  Altitude slider:    "Camera altitude above the surface — drag to fly closer or further"
  Inclination slider: "Orbital tilt — 0° equatorial, 90° polar, negative values = retrograde orbit"
  Camera Speed:       "How fast the camera orbits the target — independent of simulation time"
  Chase Height:       "Camera height above the chased moon — from surface-skim to wide overview"

ORBIT INSERTION PANEL:
  GeoSync toggle:     "Lock camera to body rotation — clouds appear stationary below"
  Jupiter GeoSync btn: "Jump to geosynchronous orbit — 160,000 km above Jupiter's clouds"
  GRS button (Orbit Insertion only): "Navigate to the Great Red Spot — Jupiter's ancient storm"

FOOTER / CORNER BUTTONS:
  Screenshot:         "Capture a clean screenshot — hides UI, saves image, restores UI"
  Presentation mode:  "Hide all UI for TV or big-screen display — press P again to restore"
  Fullscreen:         "Enter fullscreen — press F11 or Escape to exit"
  Ko-fi / Support:    "Enjoyed exploring the cosmos? Support this project"
  ? (help):           "Show keyboard shortcuts and control reference"

PRESETS:
  Voyager 1 Flyby:    "Recreate the Voyager 1 flyby of Jupiter — March 5, 1979"

Verify: hover over every listed control, confirm tooltip appears
after ~500ms and shows the correct text. Check that tooltips
don't appear off-screen on small viewports.

---

## GROUP 5 — FINAL STEPS

### 5a — Update package.json version
Change version to "4.1.0" to reflect this point release.

### 5b — Update PROJECT_LOG.md
Add v4b to Version History with all commit hashes.
Mark resolved bugs: #8, #11, #12, #13, #14.
Note Ko-fi handle still needs updating (Bug #10).

### 5c — Final build and deploy
```bash
npm run build
npm run preview
# Regression test:
# - All sliders update live while dragging
# - Io/Europa no flickering at any angle
# - Ganymede halo fades on night side
# - Metis/Adrastea no hole at close zoom
# - Io plumes look like glowing sparks not white squares
# - Body cards show full data with More Info expansion
# - No GRS button on Jupiter body card
# - Music player collapses to icon row + volume
# - Spotify icon is green, YouTube icon is red
# - Resonance lines show pulse on alignment
# - All tooltips appear correctly
# - Version shows v4.1.0 on loading screen
npx wrangler deploy
```

Open live URL in incognito. Verify. Check console for zero errors.

### 5d — Commit and push
```bash
git add -A
git diff --cached --name-only  ← verify source files
git commit -m "docs: v4b complete — PROJECT_LOG.md updated"
git push origin main
git show HEAD --name-only
```

---

## PRIORITY ORDER IF TIME RUNS OUT

1. Group 1 (slider fixes) — must complete, highest user impact
2. Group 2a (z-fighting) — visual bug, easy fix
3. Group 2b (atmospheric halos) — visual quality
4. Group 3a (body cards) — content richness
5. Group 3c (music minimize) — UX polish
6. Group 3d (brand icons) — identity
7. Group 2c (inner moon geometry) — edge case
8. Group 2d (Io plume sprites) — cosmetic
9. Group 3b (remove GRS from card) — minor
10. Group 3e (resonance lines) — medium complexity
11. Group 4 (tooltips) — large scope, do last

Deploy whatever is complete. Never leave a group half-built.

---

## STYLE GUIDE REMINDER

Headings: Montserrat | Body: Lato
Primary Blue: #0077CC | Light Blue: #66B2FF
White: #FFFFFF | Light Gray: #D9D9D9
Dark Gray: #4D4D4D at 85% opacity | Space Black: #050510
Spotify Green: #1DB954 | YouTube Red: #FF0000
