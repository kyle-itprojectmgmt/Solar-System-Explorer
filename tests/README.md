# Headless smoke + visual tests

Verification suite for the v4 feature set. Not wired into package.json to
keep the dependency tree clean — puppeteer-core is installed ad hoc.

## Setup

```bash
npm install --no-save puppeteer-core
npm run dev          # note the port vite picks (5173 may be taken)
```

## Run

```bash
# functional suite — 22 checks (parenting, shapes, retrograde inclination,
# altitude slider, presentation mode, GRS preset, zoom floors, console errors)
SMOKE_URL=http://localhost:5173 node tests/smoke.mjs

# screenshot sweep at spec altitudes over all five detail-shader bodies
SMOKE_URL=http://localhost:5173 node tests/visual.mjs

# Jupiter limb glow from day / terminator / night / insertion horizon
SMOKE_URL=http://localhost:5173 node tests/limb.mjs

# v4b additions:
node tests/flicker.mjs    # temporal shimmer probe (mean |pixel diff| under tiny rotation)
node tests/moonlimb.mjs   # directional moon halos (lit side only)
node tests/metis.mjs      # inner moon zoom floor + geometry
node tests/card.mjs       # expanded body info cards; no GRS button on card
node tests/music.mjs      # music collapse persistence + Spotify/YouTube embeds
node tests/resonance.mjs  # 1:2:4 conjunction pulse + HUD readout
node tests/tooltip.mjs    # tooltip hover behavior (7 checks)
```

`CHROME_PATH` overrides the browser binary (defaults to the standard
Windows Chrome install path). Screenshots land in `tests/shots/` (or the
script's own directory) — git-ignored.

## Testing rules (learned in v3b, do not relearn)

- Headless Chrome renders this scene at ~4 fps. Assert against
  `physics.simSeconds` / direct state, **never wall clock**.
- Settle camera transitions by calling `cameraCtl.update(dt)` in a loop,
  not by sleeping.
- The `window.__sse` handle (physics, renderer, cameraCtl, THREE) exists
  in dev builds only — these tests must run against `npm run dev`, not
  `npm run preview`.
- Zoom-floor resistance is asymptotic: assert convergence into the band
  above `hardKm`, not exact arrival at it.

# v4c additions:
node tests/freelook.mjs   # Alt free-look + inclination auto-switch
node tests/tray.mjs       # bottom tray + audio flyout (17 checks)
node tests/datepicker.mjs # ghost clock, calendar highlight + time-row Apply
                          # (V5.1.2), Apollo date+time exact jump, LIVE mode
                          # + tab-stall wall-clock resync (18 checks)
node tests/stack.mjs      # icon stack: 6 panels, presets, ?view= URL sharing (23 checks)
node tests/toast.mjs      # event toasts + Watch navigation

# v4d additions:
node tests/incline.mjs    # inclination mechanics: latitude sweeps, centering, plane-change continuity
node tests/v4d.mjs        # text labels, ALT/INC/SPD panels, Surface hidden (13 checks)

# orbit-insertion hotfix guards:
node tests/incroll.mjs    # INC drag: no view roll, no scene rotation (6 checks)
node tests/polesnap.mjs   # insertion entry: no pole snap, node solved through camera (7 checks)
node tests/lookdir.mjs    # adaptive forward tilt + far-entry framing (13 checks)
node tests/bands.mjs      # orbit-plane-normal up: bands horizontal at all phases
node tests/incmeasure.mjs # geometry table: lat = sin(phase)·sin(inc), both signs (6 checks)
node tests/ringfloor.mjs  # minInsertionAltKm floor + GeoSync/GRS exemptions (7 checks)

# v5 additions:
SMOKE_URL=http://localhost:5173 node tests/earthtest.mjs
# Earth+Moon end-to-end (14 checks): terra/luna shaders compile + blend,
# Rayleigh shell, Apollo markers, ephemeris seasons, Moon orbit radius,
# NAV travel rows, date jumps. Earth loads via ?system=earth.

# v5b additions:
SMOKE_URL=http://localhost:5173 node tests/v5b.mjs
# Panel manager (one open globally, outside-click dismiss, OI close button
# returning to the pre-insertion camera mode), panning dead-zone regression,
# per-body radiation zones (Van Allen belts). 18 checks.

# LIVE-by-default guard (V5.1.2):
SMOKE_URL=http://localhost:5173 node tests/livedefault.mjs
# Fresh REAL-USER load (navigator.webdriver spoofed off, isolated browser
# context per system) opens Jupiter AND Earth in LIVE at the current UTC;
# Voyager/Apollo 11 SAVE presets jump to their epochs and exit LIVE (and
# survive the drift-snap); HYG stars visible in the sky at 50,000 km and
# never on the planet disc (changed-pixel diff on star-layer toggle).
# NOTE: under automation (navigator.webdriver) LIVE defaults OFF so the
# suites' time jumps and pauses aren't fought by the LIVE drift-snap — an
# explicit localStorage 'sse-live-mode' always wins. The "stars on the
# surface" report was the city-light speckle grid (simplex-lattice dot
# rows), fixed by domain-warping the speckle in earth-lights.glsl.

# v9 additions (The Sun — first star system):
SMOKE_URL=http://localhost:5173 node tests/sunskeleton.mjs
# Phase-1 gate (15 checks): isStar build path, true-scale 696-unit radius,
# no directional light, NAV travel row, activity slider + persistence,
# config-driven 5M km ALT ceiling, zero console errors both directions.
SMOKE_URL=http://localhost:5173 node tests/suntest.mjs
# Full sun suite (28 checks): limb darkening (analytic disc projection —
# the insertion forward tilt offsets the disc, never guess pixel coords),
# granulation patch spread, sunspot count vs activity slider, corona
# diff-render visible at 500k km / occluded at 50k km, chromosphere rim,
# flare spawn+cleanup, 4 curated presets, cross-system regression.
# NOTE: diff-render probes MUST use the haloshots.mjs technique (pause
# physics + raw renderer.render + readPixels twice in ONE evaluate) — the
# postfx film grain is temporal and defeats screenshot-pair diffs.
SMOKE_URL=http://localhost:5173 node tests/sunshots.mjs
# Calibration screenshots (corona 500k, photosphere 100k, mid 250k,
# solar-minimum polar, wide 2M) → tests/shots/sun-*.png for eyeball review.

# sun-calibration hotfix guard:
SMOKE_URL=http://localhost:5173 node tests/suncal.mjs
# Subsolar point (geographic lat/lon) vs the real sun at 4 UTC dates
# (epoch, live-bug instant, solstice, equinox); ±3° lat / ±4° lon — the
# circular-orbit model has no equation of time. Requires the calibrated
# earth.js star.direction + rotationPhaseAtEpochDeg + full-precision
# sidereal day (23.93446959 h — 23.934 drifts ~150° of longitude over
# the 57 years between the 1969 epoch and today).

# orbit-direction hotfix guard:
SMOKE_URL=http://localhost:5173 node tests/orbitdir.mjs
# Measures GEOGRAPHIC longitude drift under the camera (east-positive, via
# the pixel-verified nightlights toLocal convention) — never raw angle signs.
# Orbit mode + insertion 0° must drift EAST (prograde), insertion −51.6°
# WEST (retrograde), GeoSync stationary. NOTE: the two position formulas use
# OPPOSITE conventions: insertion (cos φ, −sin φ) → phase INCREASES for
# prograde; orbit mode (cos θ, +sin θ) → orbTheta DECREASES for prograde.

# v5a additions:
SMOKE_URL=http://localhost:5173 node tests/nightlights.mjs
# City-light placement guard: finds a sim hour with Paris in night, aims
# the camera at it, projects known lat/lons (cities vs Sahara/Atlantic)
# and samples screenshot pixels. Passes when the brightest city is > 3x
# the brightest dark reference. NOTE: the sim's rotation phase at epoch
# is arbitrary — never assume UTC maps to real subsolar longitude; aim
# the camera at a body-frame lat/lon instead.
