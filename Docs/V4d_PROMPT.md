# Solar System Explorer — V4d Session Prompt
# UI polish + orbital mechanics fixes.
# Small focused session — 5 items only.
# Save to Docs/V4d_PROMPT.md

---

## HOW TO START

```bash
cd C:\dev\Solar-System-Explorer
git pull origin main
git status   ← must show clean working tree
claude --fable
```

Say: "Read .claude/instructions.md, then PROJECT_LOG.md, then
Docs/V4d_PROMPT.md. Implement in priority order. Commit and
push after every item."

---

## CONTEXT

v4.2.0 is live. This is a small focused session fixing the
orbital mechanics bugs in inclination and cleaning up the
right-edge icon stack UI. Bump version to 4.2.1.

All changes are in ui.js, style.css, and camera.js only.
No engine, physics engine, shader, or texture changes.

---

## ITEM 1 — Fix Inclination Orbital Mechanics (Critical)
Two related bugs in camera.js _poseInsertion():

BUG A — Inclination shifts Jupiter sideways instead of
tilting the orbital plane:
The current implementation is rotating in the wrong reference
frame, causing the planet to appear to shift off-center when
inclination is non-zero. Jupiter must always remain centered
regardless of inclination. Only the camera's orbital PATH
should tilt — not the scene, not the view direction.

BUG B — 90° inclination does not produce polar orbit:
At 90° the camera should orbit directly over the poles
(camera passes over north pole, then south pole, then north
again). Currently it inserts equatorially regardless of the
inclination value.

ROOT CAUSE — The tilt axis is wrong:
The orbital plane must tilt around the LINE OF NODES — the
intersection of the orbital plane with Jupiter's equatorial
plane. For a circular orbit at phase angle θ, the line of
nodes is perpendicular to the phase direction:

```javascript
// WRONG — tilts around world X axis regardless of phase:
local.applyAxisAngle(new THREE.Vector3(1, 0, 0), inc);

// CORRECT — tilt axis is perpendicular to the phase direction:
const lineOfNodes = new THREE.Vector3(
  Math.sin(ins.phase),
  0,
  -Math.cos(ins.phase)
).normalize();
local.applyAxisAngle(lineOfNodes, inc);

// Also apply same correction to tangent vector:
tangent.applyAxisAngle(lineOfNodes, inc);
```

Apply this fix so that:
- 0° inclination = equatorial orbit (camera orbits around
  Jupiter's equator, Jupiter centered)
- 45° inclination = tilted orbit (camera orbital path tilted
  45° from equatorial plane, Jupiter still centered)
- 90° inclination = polar orbit (camera passes over poles,
  Jupiter still centered)
- -45° inclination = retrograde tilted orbit
- -90° inclination = retrograde polar orbit

Verify by:
1. Set inclination to 0° — confirm equatorial orbit, Jupiter centered
2. Set inclination to 90° — confirm camera passes over north/south
   poles, Jupiter remains centered in view
3. Set inclination to -90° — confirm retrograde polar orbit
4. At all inclinations: Jupiter must remain centered, never shift
   sideways

Commit: `fix: inclination orbital mechanics — correct line-of-nodes
tilt axis, polar orbit at 90°`

---

## ITEM 2 — Replace Emoji Icons with Text Labels (Right Edge Stack)
The current right-edge icon stack uses emoji (🎥⏱🪐⭐👁❓) which
look generic and inconsistent across platforms/OS.

Replace with short uppercase text labels in Montserrat font.
The buttons should look like professional mission control labels,
not a mobile app.

Current → New labels:
  🎥 Camera     →  CAM
  ⏱ Time        →  TIME
  🪐 Bodies      →  NAV
  ⭐ Presets     →  SAVE
  👁 Display     →  VIEW
  ❓ Help        →  HELP

Button styling for text labels:
  Font: Montserrat, 10px, weight 600, letter-spacing 0.08em
  Color: #D9D9D9 (inactive), #FFFFFF (active/hover)
  Button size: keep same dimensions (44px wide or current width)
  Active state: Primary Blue #0077CC background, white text
  Hover state: Light Blue #66B2FF text, no background change
  The vertical pill container styling stays the same

Remove all emoji from these buttons entirely.
Update tooltips to match: "CAM — Camera modes and controls" etc.

Verify: all 6 buttons show text labels cleanly, active state
highlighted correctly, tooltips appear on hover.

Commit: `ui: replace emoji icons with text labels on right edge stack`

---

## ITEM 3 — Separate Altitude, Inclination, Orbit Speed Buttons
Currently Altitude, Inclination, and Camera Speed (being renamed
Orbit Speed) are sliders nested inside the CAM panel below the
camera mode list. They should be their own peer-level buttons
in the right edge stack.

Add 3 new buttons to the right edge stack below HELP:
  ALT    — Altitude control
  INC    — Inclination control
  SPD    — Orbit Speed control

Each button opens its own focused single-control panel showing:
- The slider for that control
- Current value readout
- Brief description of what it does

ALT panel:
  Title: ALTITUDE
  Slider: logarithmic, 50 km to 500,000 km (same as current)
  Readout: "ALT: 4,680 km" in Light Blue #66B2FF
  Description: "Camera altitude above surface"
  Min/max labels: "50 km" and "500,000 km"

INC panel:
  Title: INCLINATION
  Slider: -90° to +90°, center = 0°
  Readout: "0° equatorial" / "45°" / "90° polar" / "-45° retrograde"
  Labels: "-90° retro" | "0° equatorial" | "90° polar"
  Description: "Orbital plane tilt — switch to Orbit Insertion
  to activate" (shown as a subtle note if not in Orbit Insertion)

SPD panel:
  Title: ORBIT SPEED
  Slider: same range as current Camera Speed slider
  Readout: "1.00×"
  Description: "Camera orbit speed — independent of simulation time"

Remove Altitude, Inclination, and Camera Speed sliders from
inside the CAM panel. The CAM panel now shows only the 7 camera
mode rows (Cinematic, Free Fly, Orbit, Surface, Chase, Orbit
Insertion, System View).

Update the right edge stack — new order top to bottom:
  CAM
  TIME
  NAV
  SAVE
  VIEW
  HELP
  ─── (divider)
  ALT
  INC
  SPD

The divider is a subtle 1px horizontal line separating the
navigation controls from the parameter controls.

Commit: `ui: ALT INC SPD as own panel buttons in right edge stack`

---

## ITEM 4 — Rename Camera Speed to Orbit Speed
Find all occurrences of "Camera Speed" in ui.js, style.css,
and any other files. Replace with "Orbit Speed" everywhere:
- Panel label
- Slider label
- Tooltip text
- Any aria labels or test IDs

Commit: `ui: rename Camera Speed → Orbit Speed throughout`

(Note: this may already be done as part of Item 3 above —
if so, skip as a separate commit and fold into Item 3.)

---

## ITEM 5 — Remove Surface Camera Mode
The Surface mode is not ready for public release. It requires
a realistic starfield (coming in V5), proper ground-level
texture rendering, and correct horizon geometry before it
creates a good experience.

In ui.js, remove the Surface row from the CAM panel list.
Remove the S keyboard shortcut binding for Surface mode.
Keep all the underlying camera.js code intact — do not delete
the Surface mode implementation, just hide it from the UI.
It will be re-enabled in V5 when the full surface experience
is ready.

Verify: CAM panel shows 6 modes (no Surface), pressing S key
does nothing.

Commit: `ui: hide Surface camera mode — re-enable in V5`

---

## FINAL STEPS

Bump package.json version to "4.2.1"

Update PROJECT_LOG.md:
- Add v4d to Version History
- Mark bugs #19 (Surface removed), #21 (text labels),
  #22 (ALT/INC/SPD separate), #23 (Orbit Speed rename),
  #24 and #25 (inclination physics) as resolved

```bash
npm run build
npm run preview
```

Regression check:
- [ ] Inclination 0° = equatorial orbit, Jupiter centered
- [ ] Inclination 90° = camera passes over poles
- [ ] Inclination -90° = retrograde polar orbit
- [ ] Jupiter never shifts sideways at any inclination
- [ ] Right edge stack shows CAM TIME NAV SAVE VIEW HELP ALT INC SPD
- [ ] All text labels render cleanly in Montserrat
- [ ] ALT INC SPD each open focused single-control panels
- [ ] Surface mode removed from CAM panel and S key
- [ ] All existing features still work

```bash
npx wrangler deploy
```

Commit: `docs: v4d complete — PROJECT_LOG.md updated`
Push: `git push origin main`

---

## STYLE GUIDE

Montserrat headings (use for button text labels)
Lato body text
Primary Blue: #0077CC | Light Blue: #66B2FF
White: #FFFFFF | Light Gray: #D9D9D9
Dark Gray: #4D4D4D at 85% opacity
