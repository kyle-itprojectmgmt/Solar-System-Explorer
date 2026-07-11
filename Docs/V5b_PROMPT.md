# Solar System Explorer — V5b Session Prompt
# Panel UX fixes + camera panning fix
# Save to Docs/V5b_PROMPT.md

---

## HOW TO START

```bash
cd C:\dev\Solar-System-Explorer
git pull origin main
git status   ← must show clean working tree
claude --fable
```

Say: "Read .claude/instructions.md, then PROJECT_LOG.md, then
Docs/V5b_PROMPT.md. Implement in priority order.
Commit and push after every item."

---

## CONTEXT

v5.1.0 is live. This session fixes panel UX issues and the
camera panning bug on Earth. All changes are in ui.js and
renderer.js only. No shader, physics, or config changes.
Version bump to 5.1.1.

---

## ITEM 1 — One Panel Open at a Time (Global Rule)

Currently multiple panels can be open simultaneously:
right-stack panels (CAM/TIME/NAV/SAVE/VIEW/HELP/ALT/INC/SPD),
Orbital Insertion panel, body info cards, and the audio flyout
can all be open at once causing overlaps on any screen size.

**Rule: only one panel open at a time, globally, always.**

In ui.js, create a single panel manager:

```javascript
// Central panel registry
const panelRegistry = new Map(); // id → { open, close } functions
let activePanelId = null;

function registerPanel(id, openFn, closeFn) {
  panelRegistry.set(id, { open: openFn, close: closeFn });
}

function openPanel(id) {
  // Close currently active panel first
  if (activePanelId && activePanelId !== id) {
    const current = panelRegistry.get(activePanelId);
    current?.close();
  }
  activePanelId = id;
  panelRegistry.get(id)?.open();
  showDismissOverlay();
}

function closeAllPanels() {
  if (activePanelId) {
    panelRegistry.get(activePanelId)?.close();
    activePanelId = null;
  }
  hideDismissOverlay();
}
```

Register ALL panels with this manager:
  registerPanel('cam', openCamPanel, closeCamPanel)
  registerPanel('time', openTimePanel, closeTimePanel)
  registerPanel('nav', openNavPanel, closeNavPanel)
  registerPanel('save', openSavePanel, closeSavePanel)
  registerPanel('view', openViewPanel, closeViewPanel)
  registerPanel('help', openHelpPanel, closeHelpPanel)
  registerPanel('alt', openAltPanel, closeAltPanel)
  registerPanel('inc', openIncPanel, closeIncPanel)
  registerPanel('spd', openSpdPanel, closeSpdPanel)
  registerPanel('orbital-insertion', openOIPanel, closeOIPanel)
  registerPanel('body-info', openBodyInfo, closeBodyInfo)
  registerPanel('audio', openAudioPanel, closeAudioPanel)

Replace ALL panel toggle logic with calls to openPanel(id).
The bottom tray itself (music icon, screenshot, eye, Ko-fi)
is NOT a panel — it's always visible, exempt from this rule.

Verify: open CAM → click TIME → CAM closes, TIME opens.
Open Orbital Insertion → click NAV → OI closes, NAV opens.
Never two panels visible at once.

Commit: `fix: one panel open at a time — global panel manager`

---

## ITEM 2 — Click Outside Panel to Close

After closing one panel by opening another, users also need to
close the active panel by clicking on the 3D scene (outside
all panels and the bottom tray).

Add a transparent dismiss overlay:

```javascript
const dismissOverlay = document.createElement('div');
dismissOverlay.id = 'dismiss-overlay';
dismissOverlay.style.cssText = `
  position: fixed;
  inset: 0;
  z-index: 999;
  background: transparent;
  display: none;
  cursor: default;
`;
document.body.appendChild(dismissOverlay);

function showDismissOverlay() {
  dismissOverlay.style.display = 'block';
}
function hideDismissOverlay() {
  dismissOverlay.style.display = 'none';
}

// Click anywhere outside → close all panels
dismissOverlay.addEventListener('pointerdown', (e) => {
  // Let the click pass through to the 3D canvas for camera
  // interaction — stop the overlay from swallowing the event
  e.stopPropagation();
  closeAllPanels();
});

// Mobile: swipe in any direction also dismisses
let touchStartX = 0, touchStartY = 0;
dismissOverlay.addEventListener('touchstart', e => {
  touchStartX = e.touches[0].clientX;
  touchStartY = e.touches[0].clientY;
}, { passive: true });
dismissOverlay.addEventListener('touchend', e => {
  const dx = e.changedTouches[0].clientX - touchStartX;
  const dy = e.changedTouches[0].clientY - touchStartY;
  if (Math.abs(dx) > 20 || Math.abs(dy) > 20) closeAllPanels();
}, { passive: true });
```

CRITICAL: The overlay must NOT block camera interaction with
the 3D scene. Use pointer-events carefully:
- When overlay is visible (panel open): overlay intercepts
  clicks, closeAllPanels(), then the camera drag should still
  work. After closeAllPanels(), hide the overlay so subsequent
  drags go directly to the canvas.
- When no panel is open: overlay is display:none, zero impact.

The overlay sits at z-index 999, below all panels (z-index
1000+) so clicking a panel still works — only clicks that
miss all panels reach the overlay.

Verify:
1. Open CAM panel → click on the 3D scene → CAM closes
2. Open ALT slider → adjust → click scene → ALT closes
3. Open audio flyout → click scene → flyout closes
4. After closing with outside click, camera drag still works
   immediately (no dead zone where overlay blocked the canvas)

Commit: `fix: click outside panel to dismiss — transparent overlay`

---

## ITEM 3 — Orbital Insertion Panel Close Button + Dismiss

The Orbital Insertion (OI) panel has no close button and
cannot be dismissed by clicking outside. It's also not
registered in the panel manager from Item 1.

Fixes:

**3a — Add ✕ close button to OI panel header:**
In the ORBITAL INSERTION panel title row, add a ✕ button
on the right side of the header:
```html
<div class="oi-header">
  <span class="oi-title">ORBITAL INSERTION</span>
  <button class="panel-close-btn" id="oi-close">✕</button>
</div>
```
Style: same as other panel close buttons if they exist,
or: Lato 14px, color #D9D9D9, background none, border none,
cursor pointer, hover color #FFFFFF, padding 4px 8px.

**3b — Close behavior:**
When OI panel closes (via ✕ button OR clicking outside via
the dismiss overlay):
  1. Hide the OI panel
  2. Switch camera to the previous mode:
     - If previous mode was Orbit → switch to Orbit
     - If previous mode was Free Fly → switch to Free Fly
     - If no previous mode (first action on load) → Free Fly
  3. Track previous mode: when setMode('insertion') is called,
     save the prior mode in a variable (e.g. `this.preModeOI`)

**3c — Register OI with panel manager:**
```javascript
registerPanel('orbital-insertion',
  () => {
    document.getElementById('oi-panel').style.display = 'block';
    showDismissOverlay();
  },
  () => {
    document.getElementById('oi-panel').style.display = 'none';
    // Switch back to previous mode
    const prev = cameraCtl.preModeOI || 'free';
    cameraCtl.setMode(prev, cameraCtl.lastTarget);
  }
);
```

**3d — OI panel opens via openPanel(), not directly:**
When camera switches to insertion mode (pressing I, clicking
Orbit Insertion in CAM panel, or dragging INC slider):
  1. Save current mode as `cameraCtl.preModeOI`
  2. Call `openPanel('orbital-insertion')` (closes any other
     open panel first via the manager)

Verify:
1. Click Orbit Insertion in CAM → OI panel opens, CAM closes
2. Click ✕ on OI panel → OI closes, camera returns to previous mode
3. Click scene while OI open → OI closes, camera returns
4. Open OI → open NAV panel → OI closes (one panel rule)
5. After OI closes via ✕, pressing I re-opens it cleanly

Commit: `fix: orbital insertion panel — close button + dismiss on outside click`

---

## ITEM 4 — Camera Panning Inconsistent on Earth

Camera drag to look around only responds when clicking on
space or certain land areas, not reliably on ocean areas.
This is a pointer event / raycasting conflict.

**Root cause investigation:**
The ocean shader likely adds a transparent or semi-transparent
mesh on top of the Earth sphere. This mesh may be intercepting
pointer events, causing inconsistent raycast hits.

In renderer.js, find where the ocean material is created.
Ensure the ocean mesh has:
```javascript
oceanMesh.raycast = () => {}; // disable raycasting on ocean
// OR:
oceanMesh.userData.noRaycast = true;
```

Similarly check the atmosphere mesh, cloud mesh, and aurora
mesh — ALL overlay meshes on Earth must have raycasting
disabled. Only the base Earth sphere should participate in
raycasting for click/drag detection.

In the raycast body detection function, filter out any mesh
whose userData.noRaycast is true.

The camera drag system works via pointer events on the canvas
element — verify this is NOT going through a raycast at all
(it shouldn't need to). The inconsistency may be that some
overlay meshes have pointer-events enabled and are swallowing
drag events before they reach the canvas handler.

Specifically check:
1. Does the atmosphere sphere have a DOM element / CSS
   pointer-events interaction? It shouldn't.
2. Are any Earth overlay meshes using `interactive: true`
   or similar Three.js interaction flags?
3. Is the ocean glint mesh added to the scene as a separate
   object with its own event handling?

The fix should ensure:
- Camera drag (pointer down → move → up) works uniformly
  everywhere on screen regardless of what's under the cursor
- Body info card (click on a planet/moon) works correctly
- Raycasting for body selection skips all overlay meshes

Verify on Earth:
1. Drag over ocean → camera rotates smoothly
2. Drag over land → camera rotates smoothly
3. Drag over space → camera rotates smoothly
4. Click on Moon label → Moon body card opens (raycast works)
5. Drag on Jupiter system → still works (no regression)

Commit: `fix: Earth camera panning — disable raycasting on overlay meshes`

---

## ITEM 5 — Radiation Warning Threshold (Earth-specific)

The "⚠️ Extreme radiation environment" warning shows at
74,000 km over Earth. This was written for Jupiter's radiation
belts. Earth's thresholds are different:

Earth radiation zones:
  Inner Van Allen belt: ~1,000-6,000 km altitude
  Outer Van Allen belt: ~13,000-60,000 km altitude
  Below 400 km (reentry): extreme heat/drag, not radiation

Update the radiation warning logic to use per-body thresholds
from the system config. In earth.js, add:
```javascript
radiationWarning: {
  zones: [
    { minKm: 1000, maxKm: 6000, label: '⚠️ Inner Van Allen belt' },
    { minKm: 13000, maxKm: 60000, label: '⚠️ Outer Van Allen belt' },
    { minKm: 0, maxKm: 400, label: '⚠️ Reentry altitude' },
  ]
}
```

In the Orbital Insertion HUD, replace the hardcoded Jupiter
radiation logic with a check against the active system's
radiationWarning zones. Show the zone label when altitude
is within a defined zone. Show nothing outside all zones.

For Jupiter in jupiter.js add:
```javascript
radiationWarning: {
  zones: [
    { minKm: 0, maxKm: 500000, label: '⚠️ Extreme radiation environment' }
  ]
}
```
(Jupiter's entire inner system is dangerous — keep current behavior)

Commit: `fix: radiation warning per-body zone config — Earth Van Allen belts`

---

## FINAL STEPS

Version bump to 5.1.1 in package.json.

Update PROJECT_LOG.md:
  - Add v5b to Version History with commit hashes
  - Mark bugs #29, #30, #31, #32 as resolved
  - Note bug #33 (radiation warning) as resolved

```bash
npm run build
npm run preview
```

Full verify at localhost:4173:
  [ ] One panel at a time — opening any panel closes others
  [ ] Click scene closes active panel
  [ ] Camera drag works after panel close (no dead zone)
  [ ] OI panel has ✕ close button
  [ ] OI closes on ✕ and returns to previous camera mode
  [ ] OI closes on outside click
  [ ] Earth camera drag works over ocean, land, and space
  [ ] Van Allen belt warning shows at 1,000-6,000 km over Earth
  [ ] No radiation warning at 74,000 km over Earth
  [ ] Jupiter still shows radiation warning at all altitudes
  [ ] All existing features still work on both systems
  [ ] Zero console errors

```bash
npx wrangler deploy
```

Verify live URL in incognito.

Commit: `docs: v5b complete — PROJECT_LOG.md updated`
Push: `git push origin main`

---

## STYLE GUIDE

Montserrat headings | Lato body
Primary Blue: #0077CC | Light Blue: #66B2FF
White: #FFFFFF | Light Gray: #D9D9D9
Dark Gray: #4D4D4D at 85% opacity | Space Black: #050510
