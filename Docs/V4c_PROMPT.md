# Solar System Explorer — V4c Session Prompt
# Major UI redesign + bug fixes.
# Save to Docs/V4c_PROMPT.md

---

## HOW TO START

```bash
cd C:\dev\Solar-System-Explorer
git pull origin main
git status   ← must show clean working tree
claude --fable
```

Say: "Read .claude/instructions.md, then PROJECT_LOG.md, then
Docs/V4c_PROMPT.md. Implement in priority order. Commit and
push after every group."

---

## CONTEXT

V4b is complete at v4.1.0. This session is the largest UI
redesign since v1. It replaces the current Mission Control panel
architecture with a cleaner icon-stack system and consolidates
all persistent controls into a bottom center tray.

All changes are in ui.js, style.css, and src/config.js.
No engine, physics, or shader changes in this session.

Bump version to 4.2.0 at session start in package.json.

---

## ARCHITECTURE OVERVIEW — READ BEFORE CODING

The new UI has three zones:

ZONE 1 — TOP LEFT (minimal)
  Subtle time/date ghost text only. No panel, no box.

ZONE 2 — RIGHT EDGE (icon stack)
  Vertical pill of 6 icon buttons. Click → panel flies out left.
  One panel open at a time. This replaces Mission Control.

ZONE 3 — BOTTOM CENTER (persistent tray)
  Fixed pill. All media/utility controls. Never moves.

The current Mission Control panel is REPLACED entirely.
Do not keep the old panel — build the new system from scratch.
Preserve all functionality — nothing is removed, only reorganized.

---

## GROUP 1 — INFRASTRUCTURE + VERSION BUMP
Commit: `infra: v4.2.0 bump + Ko-fi handle reminder`

- Bump package.json version to "4.2.0"
- Check src/config.js for YOUR_HANDLE placeholder in KOFI_URL.
  If still placeholder, add a console.warn() in dev mode:
  console.warn('Ko-fi handle not set — update KOFI_URL in config.js')
  Do NOT change the URL value — leave for Kyle to update manually.

---

## GROUP 2 — BUG FIXES (isolated, do first)
Commit after each fix.

### 2a — Ring depth sorting bug (Backlog #21)
Rings appear as a flat disc cutting through Jupiter's dark side
on certain camera angles. This is a depth/transparency sorting issue.

Fix in renderer.js:
- Set renderOrder on Jupiter mesh: renderOrder = 0
- Set renderOrder on all ring meshes: renderOrder = 1
- Ensure ring materials have:
  transparent = true
  depthWrite = false
  depthTest = true
- For the halo ring (torus geometry) add:
  side = THREE.DoubleSide
- Test from multiple angles especially low inclinations where
  rings cross the planet disc. Rings must appear behind Jupiter
  on the far side and in front on the near side.

Commit: `fix: ring depth sort — rings no longer clip through Jupiter`

### 2b — Free look while orbiting (Backlog #22)
In Orbit, Chase, and Orbit Insertion modes the camera is locked
nadir-pointing. Users cannot look sideways or behind while
maintaining their orbital position.

Fix in camera.js:
- Add a `freeLookActive` boolean flag
- Desktop: hold Alt key sets freeLookActive = true
  Release Alt sets freeLookActive = false and restores nadir
- Mobile: two-finger drag (when in orbit mode) activates free look
  Single finger still orbits/pans normally
- When freeLookActive:
  Mouse drag adjusts camera yaw/pitch freely (same as Free Fly)
  Camera position does NOT change — only orientation
  A subtle "🔓 Free Look" indicator appears top-right while active
- When released:
  Smooth 0.5s transition back to nadir-pointing orientation
  Indicator fades out

Add tooltip to the mode indicator: "Hold Alt to look around freely
while maintaining orbital position"

Commit: `feat: free look in orbit — hold Alt to look around`

### 2c — Inclination auto-switch to Orbit Insertion (Backlog #23)
Dragging the inclination slider while NOT in Orbit Insertion mode
silently does nothing. Users assume it's broken.

Fix in ui.js:
- On inclination slider input event, check current camera mode
- If mode is NOT 'insertion':
  Automatically call cameraCtl.setMode('insertion', lastTarget)
  Then apply the inclination value
  Show brief toast: "Switched to Orbit Insertion for inclination"
- This makes the intent clear — dragging inclination implies
  wanting to orbit at that angle

Commit: `fix: inclination slider auto-switches to Orbit Insertion mode`

---

## GROUP 3 — BOTTOM CENTER TRAY
The unified fixed control tray. Replaces scattered bottom controls.
Commit: `feat: unified bottom center control tray`

### Design
Fixed position: bottom center of viewport.
Never moves regardless of UI state or mode.
Dark pill shape: background rgba(20,20,40,0.85), border-radius 32px,
1px border rgba(0,119,204,0.3).
Opacity 0.6 at rest, 1.0 on hover. Smooth transition 0.3s.
Always above the 3D scene (z-index 1000).

### Contents — left to right:
```
[🎵] [──────vol──────] [📷] [👁] [☕]
```

**🎵 Music icon:**
- Subtle music note icon, same style as other icons
- Click → audio panel expands UPWARD from the tray
- Audio panel design (see Group 4)
- Icon glows Primary Blue #0077CC when audio is active (not silent)

**Volume slider:**
- Compact horizontal slider, ~120px wide
- Light Blue #66B2FF thumb
- Shows current volume level
- Always visible (not inside audio panel)
- Updates in real time

**📷 Screenshot button:**
- Camera icon
- Same behavior as current: hides UI, captures, restores
- Tooltip: "Capture screenshot — hides UI for clean image"

**👁 Presentation mode button:**
- Eye icon
- Same behavior as current P key: hides ALL UI
- Fixed position — never moves
- When presentation mode active: icon shows as eye-slash
- Tooltip: "Presentation mode — hides all UI. Press P or
  click again to restore."

**☕ Ko-fi button:**
- Heart/coffee icon
- Opens Ko-fi URL in new tab
- Tooltip: "Enjoyed exploring? Support this project"

### Remove from their current locations:
- The floating Ko-fi button (bottom right) → now in tray
- The screenshot button (bottom right) → now in tray
- The floating eye/presentation button → now in tray
- The entire current audio Player panel → replaced by Group 4

---

## GROUP 4 — AUDIO PANEL REDESIGN
Expands upward from the 🎵 icon in the bottom tray.
Commit: `feat: audio panel redesign — compact expandable from tray`

### Panel design
Appears above the tray when 🎵 is clicked.
Dark panel, same styling as tray.
Width: ~280px. Positioned centered above the music icon.
Animated slide-up from tray (0.3s ease-out).
Close: click 🎵 again, click elsewhere, or press Escape.

### Panel contents (top to bottom):

**Row 1 — Mute toggle:**
🔇 / 🔊 icon button. Mutes/unmutes all audio.
Shows current state clearly.

**Row 2 — Generative sounds dropdown:**
Label: "Space Sounds ▾"
Dropdown options:
  — None (silent generative) —
  Voyager Radio
  Deep Space Ambient
  Psychedelic Journey
  Cosmic Electronic
Selecting an option activates that generative mode.
Tracks TBD — these are placeholder names for now.

**Row 3 — Spotify:**
Spotify green icon (#1DB954) + "Spotify Playlist" label
Below: URL input + Load button (collapsed by default)
Click the row to expand/collapse the URL input
When a playlist is loaded: show playlist name or URL truncated

**Row 4 — YouTube:**
YouTube red icon (#FF0000) + "YouTube Playlist" label
Same expand/collapse pattern as Spotify

**Active indicator:**
Currently active audio mode has a subtle Primary Blue left border
or background highlight.

### Remove:
The current bottom-left Player panel entirely.
The current 7 audio mode icon buttons in the old location.
All old audio UI elements.

---

## GROUP 5 — TIME DISPLAY REDESIGN
Commit: `feat: time display — subtle ghost text, date picker, live toggle`

### HUD time display (top left)
Remove the current dark panel/box entirely.
Replace with pure ghost text — no background, no border:

```
1979-03-05  12:00:24 UTC
1,000×  ·  Signal delay: 50 min
```

Styling:
- Date/time: Lato, 11px, color #D9D9D9, opacity 0.5
- Time multiplier: Montserrat, 13px, color #66B2FF, opacity 0.8
  (slightly more prominent — it's actionable information)
- Signal delay: Lato, 10px, color #D9D9D9, opacity 0.4
- No background, no border, no padding box
- Position: top-left, 16px from edges
- Entire block fades to opacity 0.2 when Mission Control is open
  (reduces visual competition with the panels)

### Date picker
The date text is clickable. Click → date picker appears.

Date picker design:
- Floating panel near top-left, 280px wide
- Dark background matching other panels
- Month/year header with ← → navigation arrows
- Standard calendar grid (7 columns, weeks as rows)
- Large ◀◀ ▶▶ buttons for year jumping (skip 10 years)
- Year input field — user can type a year directly
- Range: 1950 to 2050
- Selected date highlighted in Primary Blue
- Today's simulated date highlighted with ring
- On date selection: physics engine jumps to that date,
  all moons reposition to correct orbital positions
- Close: click outside, Escape, or re-click the date text

### Live toggle
Small 🔴 button to the right of the date text.
When LIVE is active:
  - 🔴 pulses slowly (CSS animation)
  - Date/time shows current real-world UTC clock
  - Moons positioned for current real date/time
  - Time multiplier locked to 1x
  - Label changes to "🔴 LIVE"
When LIVE is inactive (default):
  - Shows simulated date starting from Voyager epoch
  - Time multiplier works normally
Toggle saves to localStorage 'sse-live-mode'.

---

## GROUP 6 — RIGHT EDGE ICON STACK (Mission Control Replacement)
This is the largest change. The current Mission Control panel is
replaced with a vertical stack of icon buttons on the right edge.
Commit after each sub-panel, final commit for integration.

### Icon stack design
Fixed to right edge, vertically centered.
6 icon buttons in a vertical pill:
  🎥 Camera
  ⏱ Time
  🪐 Bodies
  ⭐ Presets
  👁 Display
  ❓ Help

Each button: 44×44px, dark background, subtle border.
Active (panel open): Primary Blue #0077CC background.
Hover: Light Blue #66B2FF border.
Tooltip on hover showing panel name.

Clicking a button:
  If that panel is closed → open it (slide in from right edge)
  If that panel is open → close it
  Opening one panel closes any other open panel.

Panel container: fixed to right edge, slides out to the left.
Width: 280px. Same dark panel styling as before.
Panels are independent scroll containers if content overflows.

### 6a — Camera Panel
```
CAMERA
─────────────────────
🎬  Cinematic      C
✈️  Free Fly       F
🔄  Orbit          O
🌍  Surface        S
🏃  Chase          H
🌌  System View    G
🛸  Orbit Insertion I
─────────────────────
```
Vertical list. Each row: icon + label + keyboard shortcut badge.
Active mode: Primary Blue background row highlight.
Click any mode to switch (same as current buttons).
Keyboard shortcuts shown as small rounded badges.

### 6b — Time Panel
```
TIME
─────────────────────
‖   1×   10×   100×
1,000×    10,000×
────●──────────────  ← speed slider
─────────────────────
📅  1979-03-05  🔴
    [calendar opens on click]
─────────────────────
```
Speed buttons: same as current, styled consistently.
Speed slider: same as current.
Date row: shows current simulated date. Click → opens date picker
(same picker as built in Group 5).
Live toggle: 🔴 button, same as Group 5.
Both the HUD date and the Time panel date picker are synchronized.

### 6c — Bodies Panel
```
BODIES
─────────────────────
☀️  Sun              ›
● Mercury
● Venus
● Earth              ›
● Mars               ›
★ Jupiter  [HERE]
  ↳ Io
  ↳ Europa
  ↳ Ganymede
  ↳ Callisto
  ↳ Metis
  ↳ Adrastea
  ↳ Amalthea
  ↳ Thebe
● Saturn             ›
● Uranus
● Neptune
● Pluto
─────────────────────
```

Current system (Jupiter) is expanded showing all moons.
★ icon for current system. Indented moon list below.
Click any moon → navigate to it (orbit mode).

Other planets: click → "Coming Soon — [Planet] system launching soon"
toast notification. No navigation yet.
Planets with future moon lists show › chevron.

Sun row: click → show Sun info card. Future: Solar Observatory mode.
Tooltip: "Solar Observatory — coming in a future update"

The › chevron on hover expands a sub-list of that planet's major moons
(names only, greyed out, "Coming Soon" if not built).

### 6d — Presets Panel
```
PRESETS
─────────────────────
CURATED
🌋 Io Volcano Flyby
🌑 Triple Moon Shadow
🔴 GRS Close Pass
🛸 Voyager 1979
💫 Moon Alignment
─────────────────────
MY PRESETS
[+ Save Current View]
─────────────────────
📍 [preset name]  🗑
📍 [preset name]  🗑
─────────────────────
```

CURATED section: clicking any preset executes it immediately.
Voyager 1979 = existing Voyager preset (moved from old location).
Other curated presets: implement as scripted camera + time sequences.

MY PRESETS section:
"Save Current View" button captures full state:
  { name (prompt user), sim: {date, timeMultiplier},
    camera: {mode, target, altitudeKm, incDeg, phase, yaw, pitch, locked},
    display: {rings, orbitalPaths, localLabels, systemLabels} }

Name prompt: simple text input appears inline, user types name,
press Enter or click ✓ to save. Escape to cancel.

Saved presets stored in localStorage 'sse-presets' as JSON array.
Max 20 presets. If at max, show "Delete a preset to save more."
Each preset row: 📍 [name] [🔗 share] [🗑 delete]

Share button (🔗):
  Encode preset as base64 JSON in URL query param: ?view=base64...
  Copy to clipboard.
  Show toast: "Link copied! Share this view with anyone."
  Anyone opening that URL arrives at exact same position/time/angle.
  On page load: check for ?view= param, load that preset automatically.

### 6e — Display Panel
```
DISPLAY
─────────────────────
LABELS
☑ Local labels
  (current system only)
☐ System-wide labels
  (all planets + Sun)
─────────────────────
VISUAL
☑ Rings
☑ Orbital paths
☐ Resonance lines
☐ Velocity vectors
─────────────────────
ALTITUDE PRESETS
  Distant  · 100,000 km
  Near     ·  10,000 km
  Low Orbit·     500 km
  Skim     ·      50 km
─────────────────────
```

Local labels: show names for Jupiter + its moons only (current behavior).
System-wide labels: show labels for all planets + Sun in scene
  (for future Solar System Orrery view — stub toggle now).
Altitude presets: quick-jump buttons (restore from old Mission Control).
  These were removed when the slider was added — bring them back
  as compact buttons in the Display panel.

### 6f — Help Panel
```
HELP  (? key)
─────────────────────
KEYBOARD SHORTCUTS
[full shortcuts list]
─────────────────────
MOUSE + TOUCH
[full controls list]
─────────────────────
TIPS
• Hold Alt to free-look
  while orbiting
• Click date to pick any
  year 1950-2050
• Share any view with 🔗
─────────────────────
```
Same content as current ? overlay but in the side panel format.
Keep the ? key shortcut working (opens this panel).

### Remove entirely:
The old Mission Control panel (right-side drawer).
The Tab key trigger for old Mission Control.
Tab key can now cycle through the 6 icon panels instead.

---

## GROUP 7 — UPCOMING EVENTS AS TOAST NOTIFICATIONS
Commit: `feat: upcoming events as toast notifications with Watch button`

Remove upcoming events from Mission Control (it no longer exists).
Implement as a toast notification system.

Toast appears at bottom-center, above the bottom tray.
Appears when an eclipse or transit is within 5 minutes at current
time multiplier (scale: at 1,000x, 5 sim-minutes = 0.3 wall-seconds
— adjust threshold so toasts feel timely not spammy).

Toast design:
```
🔔 Io eclipse begins in 4m 32s    [Watch →]  [✕]
```
Dark background, Primary Blue left border, Lato font.
Maximum 2 toasts visible at once (queue others).
Auto-dismiss after 30 seconds if not acted on.
[Watch →] button: camera smoothly transitions to optimal viewing
  position for that event type:
  Eclipse: pull back to see moon entering shadow, facing Jupiter
  Transit: position to see moon silhouette against Jupiter's face
[✕]: dismiss this notification.

---

## GROUP 8 — FINAL CLEANUP + VITE LAZY LOADING
Commit: `feat: per-system lazy loading in vite.config.js`

### 8a — Vite per-system lazy loading
Update vite.config.js rollupOptions manualChunks:

```javascript
manualChunks(id) {
  if (id.includes('/data/systems/')) {
    const name = id.split('/data/systems/')[1].replace('.js','');
    return `system-${name}`;
  }
  if (id.includes('three')) return 'three';
  if (id.includes('postprocessing')) return 'postprocessing';
}
```

Each system config becomes a separate lazy chunk.
Only the active system's config downloads on page load.
Future systems (earth.js, saturn.js) will only download when
the user travels to them.

Verify: npm run build shows system-jupiter.js and system-saturn.js
as separate chunks in dist/assets.

### 8b — PROJECT_LOG.md update
Add v4c to Version History with all commit hashes.
Mark resolved bugs: #15, #16, #18, #21, #22, #23.
Update backlog to reflect completed items.
Bump version history to v4.2.0.

Commit: `docs: v4c complete — PROJECT_LOG.md updated`

---

## GROUP 9 — DEPLOY + REGRESSION TEST

```bash
npm run build
# Verify dist/assets has system-jupiter.js as separate chunk
npm run preview
```

Full regression test at localhost:4173:
- [ ] Bottom tray visible, fixed at bottom center
- [ ] 🎵 expands audio panel upward with all modes
- [ ] 📷 screenshot works, hides and restores UI
- [ ] 👁 presentation mode hides everything including tray
       (tray shows only after P key or eye click restores)
- [ ] ☕ Ko-fi opens in new tab
- [ ] Right edge shows 6 icon buttons
- [ ] Clicking each icon opens its panel, closes others
- [ ] Camera panel: all 7 modes work, active highlighted
- [ ] Time panel: all speeds work, slider works
- [ ] Date picker: opens calendar, year spinner works,
       selecting date moves moons to correct positions
- [ ] 🔴 LIVE toggle switches to real clock
- [ ] Bodies panel: Jupiter highlighted, moons clickable,
       other planets show "Coming Soon" toast
- [ ] Presets: curated presets execute correctly,
       Save Current View prompts for name and saves,
       Share button generates URL and copies to clipboard,
       Opening ?view= URL restores that exact view
- [ ] Display: Local/System-wide label toggles work,
       Visual toggles work, altitude presets work
- [ ] Help panel: all shortcuts listed, Alt free-look tip shown
- [ ] Free look: hold Alt in orbit mode, camera rotates freely,
       release Alt returns to nadir
- [ ] Inclination slider: dragging while in Orbit mode
       auto-switches to Orbit Insertion
- [ ] Ring rendering: no disc clipping through Jupiter
- [ ] Toast notifications: advance time to near eclipse event,
       confirm toast appears and Watch button navigates correctly
- [ ] Time HUD: subtle ghost text, no panel box,
       date text is clickable
- [ ] All existing features still work (physics, audio,
       sharpness shaders, procedural detail, eclipse events)
- [ ] Zero console errors

```bash
npx wrangler deploy
```

Verify live URL in incognito window. Check all above items.

---

## PRIORITY ORDER IF TIME RUNS OUT

1. Group 2 (bug fixes — ring, free look, inclination) — must ship
2. Group 3 (bottom tray) — high impact
3. Group 5 (time display + date picker) — high impact
4. Group 6 (icon stack — at least Camera + Time + Bodies panels)
5. Group 4 (audio panel redesign)
6. Group 6 continued (Presets + Display + Help panels)
7. Group 7 (toast notifications)
8. Group 8 (lazy loading)

Deploy whatever is complete. Never leave a group half-built.
If a panel isn't ready, keep the old Mission Control for that
section rather than shipping a broken panel.

---

## STYLE GUIDE REMINDER

Montserrat headings | Lato body
Primary Blue: #0077CC | Light Blue: #66B2FF
White: #FFFFFF | Light Gray: #D9D9D9
Dark Gray: #4D4D4D at 85% opacity | Space Black: #050510
Spotify Green: #1DB954 | YouTube Red: #FF0000

Panel backgrounds: rgba(20,20,40,0.85) or #4D4D4D at 85%
Border: 1px rgba(0,119,204,0.3)
Border radius: 8px panels, 32px tray pill
All transitions: 0.3s ease
