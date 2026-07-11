# Solar System Explorer — V2 Session Prompt
# Paste this entire file to Claude Code / Fable to continue the build.

---

## CONTEXT

V1 is built and committed (b1fcdf2, 26 files). It is verified working at
http://localhost:5173. This prompt covers all fixes and new features for
the v2 session. Work through them in the priority order listed. Commit
after each major section with a descriptive message.

---

## PRIORITY 1 — BUG FIX: Jupiter Oval / Elliptical Appearance

Jupiter appears oval in the viewport. Investigate and fix both causes:

**Cause A — Aspect ratio / resize handler:**
Ensure the camera's `aspect` ratio and `renderer.setSize()` are both
updated correctly in the window resize event listener. The camera
projection matrix must be updated with `camera.updateProjectionMatrix()`
after every aspect change. Verify this fires correctly on load AND on
every resize event.

**Cause B — Oblate spheroid over-exaggeration:**
Jupiter's polar flattening is only 6.5% in reality. The Y-scale of
Jupiter's mesh must be exactly `0.9353` relative to its X/Z scale
(polar radius 66,854 / equatorial radius 71,492 = 0.9353). It should
look almost spherical — just very slightly flattened — never noticeably
oval. If the current scale is more aggressive than 0.9353, correct it.

Verify the fix visually at multiple viewport sizes including mobile.
Commit: `fix: correct Jupiter oval distortion — aspect ratio + oblate scale`

---

## PRIORITY 2 — BUG FIX: Chase Mode Reliability

Chase mode (H key) is unreliable. Audit and fix all of the following:

**Target persistence:**
The chased body reference must be stored and never go null when switching
camera modes or clicking different bodies. Chase should remember the last
chased body if no new target is selected after pressing H.

**Update order:**
Camera chase position must be calculated AFTER the physics engine updates
body positions each frame, not before. Ensure the chase camera update
happens at the end of the render loop, never before physics step.

**Smooth spring follow:**
Use exponential lerp (not direct position set) for both position and
lookAt target:
```javascript
// Run every frame in chase mode
cameraCurrentPos.lerp(cameraTargetPos, 0.05);
camera.position.copy(cameraCurrentPos);
lookAtCurrent.lerp(lookAtTarget, 0.08);
camera.lookAt(lookAtCurrent);
```

**Orbital-direction offset:**
The chase camera must sit BEHIND the moon relative to its direction of
travel, not behind it in a fixed world-space direction. Calculate the
chase offset from the moon's current velocity vector cross the up vector,
not a hardcoded axis. This ensures the camera always trails correctly
regardless of where in the orbit the moon is.

**Test all bodies:**
Verify Chase works reliably and smoothly on:
- Io (fastest, closest — most likely to jitter)
- Callisto (slowest, farthest)
- Jupiter itself (large target, slow rotation)

Commit: `fix: chase cam reliability — spring follow + orbital direction offset`

---

## PRIORITY 3 — NEW FEATURE: Altitude Control

Add intuitive altitude adjustment across all camera modes.

**Scroll wheel / pinch zoom (primary control):**
In ALL camera modes, scroll wheel zooms toward/away from the current
target body. Enforce minimum altitude floors (never clip inside surface):
- Jupiter: 500 km above cloud tops minimum
- Galilean moons: 10 km above surface minimum
- Inner moons: 5 km above surface minimum
- No maximum altitude limit

Zoom speed scales logarithmically — fast when far, fine-grained when
close. Formula: `zoomDelta *= Math.log10(currentDistance + 1) * 0.1`

**Altitude HUD indicator:**
Show when within 50,000 km of any body:
- Text: `ALT: 1,240 km` 
- Font: Montserrat, Light Blue #66B2FF
- Position: top center of screen
- Updates every frame

**Altitude preset buttons in side panel (when a body is targeted):**
| Button | Altitude |
|--------|----------|
| Distant | 100,000 km |
| Near | 10,000 km |
| Low Orbit | 500 km |
| Skim | 50 km |

Smooth animated camera transition (1.5 seconds, ease-in-out) when
clicking altitude presets.

**Surface feature labels at low altitude:**
Below 500 km over any Galilean moon, show named surface feature labels
as subtle floating text in the 3D scene (billboard sprites, fade in
below 500 km, fade out above):

Io: "Pele Volcano", "Loki Patera", "Prometheus Volcano"
Europa: "Conamara Chaos", "Thera Macula", "Pwyll Crater"
Ganymede: "Galileo Regio", "Nicholson Regio", "Uruk Sulcus"
Callisto: "Valhalla Impact Basin", "Asgard Basin", "Heimdall Crater"

**Enhanced surface detail at low altitude:**
- Below 5,000 km: increase normal map intensity by 1.5x for more
  visible surface texture
- Below 1,000 km: add subtle atmospheric haze at limb for bodies
  with atmosphere (Io has thin SO₂ atmosphere — faint yellow-white haze)
- Below 500 km: tilt camera 15° toward surface nadir for dramatic
  low-pass feel

Commit: `feat: altitude control — scroll zoom, HUD readout, presets, surface labels`

---

## PRIORITY 4 — NEW FEATURE: Camera Mode 7 — Orbit Insertion
(keyboard shortcut: I)

Add a 7th camera mode "Orbit Insertion" that places the viewer into a
physically accurate orbit around any body in the system.

**UI panel (appears when mode I is activated):**
Three controls:
1. Parent body selector (Jupiter, Io, Europa, Ganymede, Callisto)
2. Altitude slider (10 km to 500,000 km, logarithmic scale)
3. Inclination slider (0° equatorial to 90° polar)
4. "Lock to body rotation" toggle — when ON = geosynchronous orbit

**Physics:**
Calculate orbital velocity for circular orbit:
`v = sqrt(GM / r)` where r = body radius + altitude

Camera follows this orbit with nadir-pointing orientation (always
looking down at the surface below).

**Jupiter GeoSync preset button** — one click sets:
- Parent body: Jupiter
- Orbital radius: 160,000 km from Jupiter's center
- Period: locked to Jupiter's 9.925-hour rotation exactly
- Camera: nadir-pointing, cloud bands appear completely stationary below
- The Great Red Spot should be visually lockable — user can position
  camera above it and it stays fixed below them

**GeoSync HUD display:**
```
ORBITAL INSERTION
Altitude:    88,508 km above clouds
Velocity:    12.6 km/s
Period:      9h 55m 30s
Inc:         3.1° (equatorial)
⚠️  Extreme radiation environment
```

**What the user sees in Jupiter GeoSync:**
- Cloud bands perfectly still below — only the texture's own animated
  turbulence moves
- Jupiter's rings curving away to the horizon below and around
- Stars drifting slowly overhead
- Moons arcing across the sky at their natural speeds
- At 10,000x: Io laps the viewer every few simulated hours, sun rises
  and sets every ~10 simulated hours

**Orbit Insertion for moons:**
Same mechanics work for any moon. Example: Europa low orbit at 50 km
altitude gives a dramatic view of the ice crack network below with
Jupiter hanging huge in the sky ahead.

Add "Orbit Insertion" button to the Mission Control side panel between
Chase and System View.

Commit: `feat: orbit insertion mode — geosync Jupiter + arbitrary moon orbits`

---

## PRIORITY 5 — NEW FEATURE: Controls Reference Help Overlay

Add an in-app help overlay toggled by the `?` key (and a `?` button
in the Mission Control panel header).

**Design:**
- Dark overlay (Space Black #050510 at 90% opacity) covers the scene
- Centered card in Dark Gray #4D4D4D with Primary Blue #0077CC border
- Title: "CONTROLS" in Montserrat, Primary Blue
- Close with `Escape`, `?`, or clicking outside the card
- Scrollable on mobile

**Content — two columns:**

LEFT COLUMN — KEYBOARD:
```
CAMERA MODES
C    Cinematic (auto)
F    Free Fly
O    Orbit (click body)
S    Surface (click body)
H    Chase (click body)
G    System View
I    Orbit Insertion

NAVIGATION
W A S D    Move (Free Fly)
Shift      Speed boost 5×
,  .       Time slower / faster
Space      Pause / Resume

INTERFACE
Tab        Mission Control panel
?          This help screen
Escape     Close panels
```

RIGHT COLUMN — MOUSE & TOUCH:
```
MOUSE
Drag            Look / rotate
Scroll wheel    Zoom / altitude
Click body      Focus / info panel

TOUCH
1 finger drag   Look / rotate
2 finger pinch  Zoom
2 finger drag   Pan
Double tap      Focus body
Long press      Body info panel
Swipe up        Mission Control

ALTITUDE PRESETS
(In side panel when body targeted)
Distant    100,000 km
Near        10,000 km
Low Orbit      500 km
Skim            50 km
```

BOTTOM of card:
```
Pro tip: Press Space to pause, then drag to explore any moment in time.
```

Style consistently with brand: Montserrat headers, Lato body text,
#66B2FF accent color for key labels, #D9D9D9 for descriptions.

Also add a small `?` icon button to the Mission Control panel header
that opens the same overlay.

Commit: `feat: controls help overlay — keyboard shortcut ? + panel button`

---

## PRIORITY 6 — CREATE: FUTURE_ENHANCEMENTS.md

Create `/FUTURE_ENHANCEMENTS.md` in the project root documenting planned
future work. Do not build any of these — document only:

```markdown
# Future Enhancements — Solar System Explorer

## Completed
- [x] Insert Viewer into Orbit (v2 — Orbit Insertion mode, Camera Mode 7)

## Planned

### High Priority
- [ ] Saturn System — drop in saturn.js config, rings as particle system,
      Titan with thick atmosphere shader, Enceladus geyser plumes
- [ ] Full Solar System view — zoom out to see all planets, click any to
      enter that system
- [ ] Historic mission trajectories — Voyager 1 & 2, Cassini, Juno, Galileo
      probe paths rendered as animated trajectory lines with mission facts

### Medium Priority  
- [ ] WebGPU renderer upgrade — currently WebGL for postprocessing 
      compatibility; migrate when postprocessing library adds WebGPU support
- [ ] KTX2 compressed textures — currently JPEG; add Basis encoder to 
      build pipeline for faster mobile loading
- [ ] Polar orbit presets — one-click polar orbit over any body
- [ ] Time of day selector — jump to specific simulated date/time
- [ ] Multiplayer / shared view — share a URL that opens the exact same
      camera position and time for someone else

### Lower Priority
- [ ] VR support — WebXR for headset exploration
- [ ] Resonance visualizer — animated diagram showing 1:2:4 Io/Europa/
      Ganymede orbital resonance in System View
- [ ] Io volcanic event notifications — random eruption alerts when near Io
- [ ] Europa subsurface ocean flythrough — speculative interior cross-section
- [ ] Sound reactive visuals — audio waveform subtly modulates star brightness

### Notes
- All new planetary systems use the same data-driven engine config schema
- SYSTEM_CONFIG one-line switch in src/config.js
- TEXTURE_BASE_URL one-line switch for R2 vs local textures
```

Commit: `docs: add FUTURE_ENHANCEMENTS.md`

---

## FINAL TASKS FOR THIS SESSION

After all features are built and committed:

1. **Run a full smoke test** — open http://localhost:5173 and verify:
   - Jupiter looks spherical (not oval) at all viewport sizes
   - Chase mode works reliably on Io, Europa, and Callisto
   - Scroll wheel adjusts altitude in all camera modes
   - ALT readout appears when within 50,000 km of any body
   - Altitude preset buttons animate smoothly
   - Camera Mode 7 (I key) opens Orbit Insertion panel
   - Jupiter GeoSync preset locks clouds stationary below camera
   - ? key opens controls overlay
   - All existing v1 features still work (cinematic, audio, eclipse ticker,
     screenshot, Ko-fi button, Voyager mode)

2. **Build for production:**
   ```bash
   npm run build
   npm run preview
   ```
   Verify production build at http://localhost:4173 — no console errors.

3. **Deploy:**
   ```bash
   npm run deploy
   ```

4. **Final commit:**
   `chore: v2 complete — oval fix, chase fix, altitude control, orbit insertion, help overlay`

---

## STYLE GUIDE REMINDER

All UI elements must use:
- Headings: Montserrat
- Body / data: Lato  
- Primary Blue: #0077CC (active states, borders, key actions)
- Light Blue Accent: #66B2FF (highlights, HUD readouts, hover)
- White: #FFFFFF (primary text)
- Light Gray: #D9D9D9 (secondary text, inactive)
- Dark Gray: #4D4D4D at 85% opacity (panel backgrounds)
- Space Black: #050510 (scene background)

The feel: NASA mission control meets deep space. Professional, minimal,
awe-inspiring. Never cluttered.
