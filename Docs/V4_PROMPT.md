# Solar System Explorer — V4 Session Prompt
# Overnight build — ambitious but safe scope only.
# Save to Docs/V4_PROMPT.md in the repository.

---

## HOW TO START THIS SESSION

```bash
cd C:\dev\Solar-System-Explorer
git pull origin main
git status   ← must show clean working tree before proceeding
claude --fable
```

Then say:
"Read .claude/instructions.md, then PROJECT_LOG.md, then
Docs/V4_PROMPT.md. Implement everything in the priority order
listed. Commit and push source files after every group before
moving to the next."

---

## CONTEXT

V3b is complete and live at:
https://solar-system-explorer.kyle-d06.workers.dev

This session implements all low and medium risk backlog items.
High risk items (Earth system, inter-system navigation, solar
system orrery) are intentionally excluded — they go in V5.

Work through groups in strict order. Each group must be fully
committed and pushed before starting the next. Deploy after
Group 3 and again after Group 4.

---

## CRITICAL REMINDERS

1. After every feature: git add -A → git diff --cached --name-only
   → verify .js files staged → git commit → git push origin main
2. git show HEAD --name-only must show source files, not just .md
3. Deploy: npx wrangler deploy (NOT wrangler pages anything)
4. Verify dist has 5-6 chunked files before deploying
5. Verify live URL in incognito after every deploy

---

## GROUP 1 — INFRASTRUCTURE
Do these first. Other groups depend on them.
Commit: `infra: v4 session setup — version bump + instructions fix`

### 1a — Fix instructions.md location (Bug #6)
Move instructions.md from Docs/ to .claude/:
```bash
# Claude Code should run:
git mv Docs/instructions.md .claude/instructions.md
```
The .claude/ directory is where Claude Code auto-reads it.
Verify .claude/instructions.md exists and Docs/instructions.md
is gone from git.

### 1b — Bump version to 4.0.0
In package.json, change:
  "version": "0.1.0"
To:
  "version": "4.0.0"

### 1c — Dynamic version display on loading screen
vite.config.js already has __APP_VERSION__ defined from
readFileSync('package.json'). Wire it to the loading screen.

In index.html, change the static subtitle:
  <p class="loading-subtitle">Jupiter System — v1.0</p>
To:
  <p id="loading-version" class="loading-subtitle">Jupiter System</p>

In src/main.js, add after the boot() function starts:
  const verEl = document.getElementById('loading-version');
  if (verEl) verEl.textContent =
    `Jupiter System — v${__APP_VERSION__}`;

Declare the global in src/vite-env.d.js or add to the top of
main.js:
  /* global __APP_VERSION__ */

Verify: loading screen shows "Jupiter System — v4.0.0" on
localhost before committing.

### 1d — Verify vite.config.js is correct
Confirm vite.config.js matches the spec in instructions.md
exactly — has manualChunks, readFileSync, __APP_VERSION__,
emptyOutDir: true. If anything is missing, fix it now.

Run npm run build and verify dist/assets has 5-6 chunked files
including three-[hash].js and main-[hash].js before proceeding.

---

## GROUP 2 — BUG FIXES
Isolated fixes with no dependencies on each other.
Commit after each individual fix.

### 2a — Fix Io volcanic plumes not parented to moon (Bug #4)
Volcanic plume particle systems currently float over the surface
during rotation because they are added to the scene in world
space instead of as children of Io's mesh.

Fix in src/engine/renderer.js (or wherever plumes are created):

WRONG pattern (current):
  scene.add(plumeMesh);
  plumeMesh.position.set(worldX, worldY, worldZ);

CORRECT pattern:
  ioMesh.add(plumeMesh);  // parent to Io's mesh
  plumeMesh.position.set(localX, localY, localZ); // local coords

Convert volcano geographic coordinates to local sphere coordinates:
  function latLonToLocal(lat, lon, radius) {
    const phi = (90 - lat) * DEG2RAD;
    const theta = (lon + 180) * DEG2RAD;
    return new THREE.Vector3(
      -radius * Math.sin(phi) * Math.cos(theta),
       radius * Math.cos(phi),
       radius * Math.sin(phi) * Math.sin(theta)
    );
  }

Volcano positions (lat, lon):
  Pele:       -18.8°,  255.3°W  (convert: lon = 360 - 255.3 = 104.7°E)
  Loki:        19.0°,  308.8°W  (lon = 51.2°E)
  Prometheus: -2.9°,   153.8°W  (lon = 206.2°E)

Also apply the same parenting fix to:
  - Io volcanic hotspot glow meshes (night side heat signatures)
  - Any other per-body decorators added to Io in the scene

Verify: run at 10,000x time speed, confirm plumes stay fixed
on Io's surface as it rotates. They should NOT drift.

Commit: `fix: parent Io volcanic plumes to moon mesh — stops drift during rotation`

### 2b — Fix surface feature labels parenting (related to Bug #4)
Surface feature labels (Pele Volcano, Conamara Chaos, etc.) are
billboard sprites that must also be parented to their respective
moon mesh, not added to the scene directly.

Apply the same latLonToLocal() fix to all surface feature label
sprites. Each label's position must be in the moon's local
coordinate space, and the sprite must be a child of that moon's
mesh group.

Verify: at low altitude over Europa, "Conamara Chaos" label
should stay fixed on the surface during rotation.

Commit: `fix: parent surface feature labels to moon meshes`

### 2c — Fix egg-shaped / oval moons (Bug #7)
Two separate causes — fix both:

CAUSE A — Aspect ratio not updating globally:
The window resize handler must update the camera aspect ratio
AND call camera.updateProjectionMatrix(). Add a guard in the
render loop to catch any missed resize events:

  // In the render loop, check every frame:
  const aspect = window.innerWidth / window.innerHeight;
  if (Math.abs(camera.aspect - aspect) > 0.001) {
    camera.aspect = aspect;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  }

CAUSE B — Amalthea shape:
Amalthea is a real irregular body (not spherical). Its correct
dimensions are 250 × 146 × 128 km. In jupiter.js config for
Amalthea, replace the single radius value with explicit radii:
  radii: { x: 125, y: 73, z: 64 }  // km, half-dimensions

In the renderer, when building Amalthea's geometry, use
THREE.SphereGeometry then scale the mesh:
  mesh.scale.set(
    cfg.radii.x / cfg.radii.x,  // 1.0
    cfg.radii.y / cfg.radii.x,  // 0.584
    cfg.radii.z / cfg.radii.x   // 0.512
  )

The Galilean moons (Io, Europa, Ganymede, Callisto) must be
PERFECT SPHERES — they are large enough for hydrostatic
equilibrium. Verify their config has a single radius value
and no scale distortion is applied.

Jupiter's oblate scale must remain exactly Y = 0.9353.

Verify: view all bodies from multiple angles and viewport sizes.
No body should appear oval except Amalthea (which is intentionally
elongated but correctly proportioned).

Commit: `fix: egg-shaped moons — global aspect ratio guard + Amalthea correct ellipsoid`

---

## GROUP 3 — UI IMPROVEMENTS
Commit after each item. Deploy after this entire group.

### 3a — Inclination slider: extend to -90° to +90° (Backlog #11)
Currently the inclination slider in the Orbit Insertion panel
runs 0° to 90°. Extend it to -90° to +90° with center = 0°.

UI changes in src/engine/ui.js (or wherever the slider is):
  - Change slider min from 0 to -90
  - Change slider max remains 90
  - Change slider default value from 0 to 0 (center — verify
    this renders correctly at center position)
  - Update label: show "-90° (retrograde)" at left end,
    "0° (equatorial)" at center, "90° (polar)" at right end
  - Display current value as "Inclination: 45°" or
    "Inclination: -30° (retrograde)" when negative

Physics changes in src/engine/camera.js _poseInsertion():
  Negative inclination reverses orbital direction.
  The inclination is already applied as:
    const inc = THREE.MathUtils.degToRad(ins.incDeg);
    const X = new THREE.Vector3(1, 0, 0);
    local.applyAxisAngle(X, inc);
  Negative inc naturally reverses the orbit plane — verify this
  produces correct retrograde orbit direction visually.

Verify: set inclination to -45°, confirm camera orbits in the
opposite direction to a +45° orbit. At -90° camera should orbit
over poles in retrograde direction.

Commit: `ui: extend inclination slider to -90–90° with retrograde support`

### 3b — Replace altitude presets with continuous slider (Backlog #10)
Remove the four preset buttons (Distant 100,000 km / Near 10,000 km /
Low Orbit 500 km / Skim 50 km) from the Mission Control panel.

Replace with a continuous logarithmic altitude slider:
  - Range: 50 km (minimum, body-dependent floor) to 500,000 km
  - Scale: logarithmic — equal slider distance = equal zoom factor
  - Current altitude shown as readout: "ALT: 12,450 km"
    in Light Blue #66B2FF, Lato font, next to the slider
  - Slider updates in real time as camera moves (reads from
    camera's actual current altitude, not just on drag)
  - Dragging the slider moves the camera to that altitude with
    the same smooth 1.5s animation as the old presets used

Logarithmic mapping:
  const logMin = Math.log10(50);
  const logMax = Math.log10(500000);
  const altKm = Math.pow(10, logMin + sliderValue * (logMax - logMin));

The slider should appear in the Mission Control panel under
ALTITUDE section, replacing the four buttons. Show it whenever
any body is targeted (orbit, chase, insertion, surface modes).

Also add inclination slider here (from 3a) so both altitude
and inclination live in Mission Control, not buried in the
Orbit Insertion panel. The Orbit Insertion panel can keep its
own controls but Mission Control should have quick access.

Verify: drag slider from min to max, confirm smooth camera
movement across the full range. Verify slider position updates
as camera moves via scroll wheel.

Commit: `ui: replace altitude presets with continuous log slider in Mission Control`

### 3c — Fullscreen + Presentation Mode (Backlog #1 + #2)
Two separate features, one commit:

FULLSCREEN (F11 key + button in UI):
  - Toggles browser fullscreen via document.documentElement
    .requestFullscreen() / document.exitFullscreen()
  - Small fullscreen icon button in top-right corner of scene
    (not in Mission Control — always visible)
  - Keyboard shortcut: F11
  - On fullscreen enter: hide browser chrome, expand canvas
  - On fullscreen exit: restore normal layout
  - Works on mobile via touch on the fullscreen button

PRESENTATION MODE (P key + button in UI):
  - Hides ALL UI elements: Mission Control panel, HUD text,
    sound controls, Ko-fi button, ALT readout, body labels,
    everything except the 3D scene
  - A single small discrete icon remains visible to exit
    (bottom-right corner, very subtle — just an eye icon)
  - P key or clicking the eye icon restores all UI
  - Designed for: TV/big screen display, screenshot capture,
    showing to an audience without UI clutter
  - Combine with fullscreen for ultimate presentation:
    F11 then P = pure immersive space, no UI at all

The screenshot button should automatically enter Presentation
Mode, capture, then exit (this replaces the current hide/show
UI logic in the screenshot function).

Store presentation mode state in a boolean, not CSS classes on
individual elements — toggle a single class on the root element:
  document.body.classList.toggle('presentation-mode')
  Then in CSS: .presentation-mode .hud,
               .presentation-mode .mission-control,
               etc. { display: none; }

Verify: P key hides all UI, scene is pure 3D. P again restores.
F11 goes fullscreen. Both together = full presentation mode.
Test on mobile that touch still works in presentation mode.

Commit: `ui: fullscreen (F11) + presentation mode (P key) for TV/big screen`

### 3d — GRS Navigation Preset (Backlog #7)
The Great Red Spot procedural vortex detail exists but is
impossible to find without knowing Jupiter's rotation state.
Add a "Jump to GRS" button to fix discoverability.

Add button in two places:
1. Jupiter body info panel (appears when you click Jupiter)
2. Orbit Insertion panel when Jupiter is selected

Button label: "🔴 Great Red Spot"
Button style: Primary Blue #0077CC, Montserrat font

When clicked:
1. If not already in Orbit Insertion or Orbit mode over Jupiter,
   switch to Orbit mode targeting Jupiter
2. Set altitude to 20,000 km (within GRS procedural detail range)
3. Calculate Jupiter's current rotation angle from physics.primaryRotation
4. Calculate the camera longitude that places it directly above
   the GRS latitude (23°S) and the GRS's current longitude
   (GRS rotates slightly slower than Jupiter's bulk rotation —
   use the longitude offset already calculated in the Jupiter
   shader for the GRS vortex position)
5. Smoothly transition camera to that position over 2 seconds
6. Show subtle notification: "Navigating to Great Red Spot..."

The GRS longitude in the shader is the same offset used to
anchor the vortex in detailShaders.js — read that value to
find the current GRS position rather than hardcoding it.

Verify: click button, camera moves to 20,000 km above the GRS,
the red vortex spiral is clearly visible in the procedural layer.

Commit: `ui: GRS navigation preset — jump to Great Red Spot button`

### Deploy after Group 3
```bash
npm run build
# Verify dist/assets has 5-6 chunked files
npm run preview
# Verify all Group 3 features work at localhost:4173
npx wrangler deploy
# Verify live URL in incognito
```

---

## GROUP 4 — VISUAL IMPROVEMENTS
More complex. Do these last so Group 3 is safely deployed first.
If any item in Group 4 causes build failure, skip it, commit
everything before it, and report.

### 4a — Detail-Aware Zoom Floor with Resistance (Backlog #8)
Currently the camera can zoom infinitely close to any body,
eventually passing through the surface into a blurry void.
Add a resistance system that prevents zooming past the point
where detail runs out.

Add to each body's config in jupiter.js:
  detailFloor: {
    softKm: X,   // resistance starts here
    hardKm: Y    // absolute minimum, zoom stops here
  }

Per-body values:
  Jupiter:   { softKm: 3000, hardKm: 1500 }
  Io:        { softKm: 300,  hardKm: 150  }
  Europa:    { softKm: 300,  hardKm: 150  }
  Ganymede:  { softKm: 400,  hardKm: 200  }
  Callisto:  { softKm: 600,  hardKm: 300  }
  Amalthea:  { softKm: 100,  hardKm: 50   }
  Metis:     { softKm: 50,   hardKm: 20   }
  Adrastea:  { softKm: 50,   hardKm: 20   }
  Thebe:     { softKm: 100,  hardKm: 50   }

Resistance zoom implementation in camera.js _pinch():
  function getZoomResistance(altKm, softKm, hardKm) {
    if (altKm > softKm) return 1.0;  // full speed above soft floor
    if (altKm <= hardKm) return 0.0; // hard stop at floor
    // Quadratic resistance between soft and hard floor
    const t = (altKm - hardKm) / (softKm - hardKm);
    return t * t;
  }

Multiply zoom delta by resistance factor before applying.
At hardKm the resistance is 0 — camera cannot move closer.

HUD feedback:
  When altitude drops below softKm for current nearest body,
  show a subtle one-time message (fades in, holds 3s, fades out):
    "Maximum surface detail reached"
  Style: Light Gray #D9D9D9, Lato, small, centered top of screen
  Below the ALT readout.

  When altitude reaches hardKm exactly, the ALT readout pulses
  once in Light Blue #66B2FF — a gentle signal that the floor
  has been reached.

Per-body floors must be read from body config, never hardcoded
in the engine. The engine reads detailFloor from whatever system
config is loaded — fully data-driven.

Verify: zoom into Jupiter, confirm resistance increases below
3,000 km and camera stops at 1,500 km. Test all Galilean moons.
Verify "Maximum surface detail reached" message appears once.

Commit: `feat: detail-aware zoom floor with quadratic resistance per body`

### 4b — Jupiter Limb Glow Fix (Bug #1)
The current limb halo looks like a solid uniform ring — it is
a scaled-up sphere with a solid color material placed behind
Jupiter. Replace with a proper atmospheric scattering shader.

Remove the current halo sphere approach entirely.

Implement as a custom ShaderMaterial on a slightly larger sphere
(Jupiter radius * 1.025) that renders BEHIND Jupiter:
  depthWrite: false
  side: THREE.BackSide
  transparent: true
  blending: THREE.AdditiveBlending

Fragment shader:
  - Calculate the angle between the fragment's surface normal
    and the direction to the camera (fresnel-style rim lighting)
  - The limb glow is strongest at 90° (grazing angle) and
    falls off to zero at center
  - Only apply on the LIT side: dot product of fragment normal
    with sun direction must be positive (or slightly negative
    for atmospheric refraction bleed)
  - Color gradient:
    Near limb edge:  warm orange-tan #C8824A, opacity 0.6
    Mid limb:        pale yellow-white #E8D4A0, opacity 0.3
    Inner falloff:   transparent, opacity 0.0
  - Falloff curve: pow(fresnel, 3.0) for sharp atmospheric edge
  - The glow should feather out over about 2-3% of Jupiter's
    radius — very thin, not a thick ring

The result should look like:
  - A thin warm atmospheric haze at the very edge of the disk
  - Invisible on the night side limb
  - Brightest at the terminator where atmosphere catches sunlight
  - Feathered/diffuse — NOT a solid colored band

Test by viewing Jupiter from multiple angles including:
  - Face-on (glow visible all around lit hemisphere edge)
  - Edge-on (glow visible on both sides of terminator)
  - Night side (glow should be absent or very faint)
  - From orbit insertion at 20,000 km (horizon glow visible)

The existing tan/orange halo sphere MUST be removed before
adding the new shader — do not layer them.

Commit: `fix: Jupiter limb glow — replace solid halo with atmospheric scattering shader`

---

## GROUP 5 — FINAL STEPS

### 5a — Update PROJECT_LOG.md
Add v4 to Version History with all commit hashes.
Mark resolved bugs as resolved.
Remove completed backlog items.
Note any items skipped and why.

### 5b — Final build and deploy
```bash
npm run build
# Verify dist has 5-6 chunked files
# Verify main-[hash].js is larger than previous sessions
npm run preview
# Full regression test:
# - Loading screen shows "Jupiter System — v4.0.0"
# - All 7 camera modes work
# - Orbit Insertion inclination goes -90 to +90
# - Altitude slider works in Mission Control
# - F11 enters fullscreen
# - P key hides all UI
# - GRS button navigates to Great Red Spot
# - Io plumes stay on surface during rotation
# - No moons appear oval
# - Zoom stops at detail floor with resistance
# - Jupiter limb glow is feathered, not solid ring
# - Eclipse events still work
# - All audio modes still work
# - Screenshot still works
npx wrangler deploy
```

Open live URL in incognito. Verify all features. Check browser
console — zero errors required.

### 5c — Commit everything
```bash
git add -A
git diff --cached --name-only  ← verify source files present
git commit -m "docs: v4 complete — PROJECT_LOG.md updated"
git push origin main
git log --oneline -10  ← verify all commits pushed
git show HEAD --name-only  ← verify source files in commit
```

---

## PRIORITY ORDER IF TIME RUNS OUT

If the session ends before completing everything, stop cleanly
at the end of whichever group is in progress. Deploy what's done.
Never leave a group half-built.

Priority:
1. Group 1 (infrastructure) — must complete
2. Group 2 (bug fixes) — high priority
3. Group 3a + 3b (inclination + altitude sliders) — high priority
4. Group 3c (fullscreen + presentation) — medium priority
5. Group 3d (GRS preset) — medium priority
6. Group 4a (zoom floor) — lower priority
7. Group 4b (limb glow) — lowest priority, most complex

---

## STYLE GUIDE REMINDER

All new UI elements:
  Headings:     Montserrat
  Body/data:    Lato
  Primary Blue: #0077CC
  Light Blue:   #66B2FF
  White:        #FFFFFF
  Light Gray:   #D9D9D9
  Dark Gray:    #4D4D4D at 85% opacity
  Space Black:  #050510

The overall feel must remain: NASA mission control meets deep
space. Professional, minimal, awe-inspiring. Never cluttered.
