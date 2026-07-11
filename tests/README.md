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
