# Solar System Explorer — Claude Code Standing Instructions
# Place this file at: .claude/instructions.md
# Read at the start of EVERY session. Update PROJECT_LOG.md at the end
# of EVERY session. Never skip either.

---

## Repository

Root: C:\dev\Solar-System-Explorer
Live: solar-system-explorer.kyle-d06.workers.dev
Host: Cloudflare Pages ($5/mo plan, unlimited bandwidth)
Textures: Cloudflare R2 (zero egress fees)

---

## Structure

src/engine/        Core renderer, physics, camera, audio, UI, shaders
src/data/systems/  Planetary system configs (jupiter.js, saturn.js stub)
src/engine/glsl/   Shared GLSL libraries (simplex noise, etc.)
public/textures/   Local dev textures (production serves from R2)
.claude/           This file and any session prompt .md files
PROJECT_LOG.md     Living document — single source of truth

---

## Living Document

- Location: PROJECT_LOG.md (repo root)
- Read at the START of every session before touching any code
- Update at the END of every session:
  - Add completed items to Version History with commit hash
  - Move resolved bugs from Known Bugs to Version History
  - Add any new bugs discovered to Known Bugs
  - Add any new backlog items discussed
- Commit living doc update WITH every code commit — never separate
- PROJECT_LOG.md is the single source of truth for project state

---

## Commit Format

[area]: [what changed] ([feature/bug ref if applicable])

Areas: engine, physics, camera, audio, ui, shaders, config,
       textures, deploy, docs

Examples:
  shaders: add Io procedural volcanic surface detail
  camera: fix chase mode spring follow + orbital direction offset
  physics: fix geosync texture-camera time accumulator sync
  engine: upgrade Jupiter texture to 16K Solar System Scope
  docs: update PROJECT_LOG.md
  deploy: push v3 procedural shaders to Cloudflare Pages

---

## Deploy Commands

Local dev:    npm run dev          → http://localhost:5173
Test build:   npm run preview      → http://localhost:4173
Production:   npm run deploy       → Cloudflare Pages via Wrangler
Staging:      npm run deploy:preview → preview URL for review

ALWAYS run npm run build before npm run deploy.
ALWAYS verify npm run preview locally before deploying to production.
NEVER deploy with TypeScript errors or console errors in preview.

---

## Validation Before Marking Any Task Complete

Shaders / visuals:
  Open http://localhost:5173, navigate to the affected body,
  verify the feature visually at the altitudes specified in the task.
  Do not mark complete based on code alone — visual confirmation required.

Camera modes:
  Test the specific mode on at least two bodies (one inner, one outer).
  Verify smooth transition in and out of the mode.

Physics changes:
  Run at 1x and 10,000x time speed. Confirm no drift or instability.
  Verify eclipse events still trigger correctly after any physics change.

Audio:
  Cycle through all 7 sound modes. Confirm crossfade works.
  Check localStorage persistence by reloading the page.

Deploy:
  After npm run deploy, open the live Cloudflare Pages URL and
  confirm the feature works in production, not just localhost.
  Check browser console for errors in production build.

---

## Stopping Rules — Stop and Report to User Immediately

1. Any item that requires an architectural decision not covered
   by PROJECT_LOG.md or the session prompt
2. Any conflict with a prior decision documented in PROJECT_LOG.md
3. Any unexpected finding during implementation — do not improvise
4. Any shader compilation error that requires structural changes
   to the shared GLSL library (other shaders depend on it)
5. npm run build fails with errors
6. wrangler deploy fails
7. A physics change causes orbital instability or moon escape
8. Any change that would break the data-driven engine architecture
   (Jupiter-specific logic appearing outside jupiter.js)
9. Performance drops below 30 FPS on desktop tier after a change
10. Any change to audio system that breaks localStorage persistence

---

## Do Not

- Improvise on unexpected findings — stop and report
- Hard-code Jupiter-specific logic outside src/data/systems/jupiter.js
- Commit without updating PROJECT_LOG.md
- Deploy without running npm run build and npm run preview first
- Re-read the same file multiple times in a session — read once,
  reference in memory
- Modify the shared GLSL noise library without checking all shaders
  that depend on it
- Change camera.updateProjectionMatrix() call placement — it must
  fire on every resize event or Jupiter goes oval
- Alter the texture TEXTURE_BASE_URL logic — dev vs production
  path switching is intentional, do not simplify it away
- Remove the uDetailBlend = 0 fast-path in shaders — it is a
  deliberate performance optimization for far-away views
- Change the geosync time accumulator without verifying surface
  lock still works (texture rotation and camera orbit must stay
  in sync)

---

## Architecture Rules — Never Violate

**Data-driven engine:**
All body data lives in /src/data/systems/{system}.js.
No body-specific logic in /src/engine/.
Switching systems = changing SYSTEM_CONFIG in src/config.js only.

**Texture paths:**
All texture loading goes through TEXTURE_BASE_URL from src/config.js.
Local dev: /public/textures/{body-slug}/
Production: Cloudflare R2 URL/textures/{body-slug}/
Never hardcode texture paths elsewhere.

**Shader activation:**
All procedural detail shaders must be fully disabled (uDetailBlend = 0)
above their activation altitude. No GPU cost when camera is far away.

**Renderer:**
Currently WebGL (not WebGPU) for postprocessing compatibility.
Do not attempt WebGPU migration — it is in the backlog pending
postprocessing library support. Document as Future Enhancement only.

**Orbit camera:**
Camera orbital angle and body texture rotation must reference the
same time accumulator for GeoSync to work correctly.
Never separate these update paths.

---

## Known Gotchas

**Jupiter goes oval:**
If camera aspect ratio is not updated on resize AND
camera.updateProjectionMatrix() is not called, Jupiter renders oval.
Both must fire in the window resize handler.

**Click events swallowed:**
If a full-screen label layer has pointer-events enabled, it blocks
all clicks to the 3D scene. Always set pointer-events: none on
overlay layers unless they contain interactive elements.

**Halo ring shader crash:**
The halo ring uses a torus geometry with a custom shader.
Shader uniforms must be declared before the material is added
to the scene or it crashes on init. Declare all uniforms upfront.

**HUD date malformed:**
The simulated date formatter must handle month rollover from the
Voyager start date (March 5, 1979). Off-by-one in month index
causes NaN display. Use UTC date methods only, never local.

**Postprocessing + WebGL:**
The postprocessing library requires WebGL renderer.
Do not switch to WebGPU renderer without verifying every
post-processing effect still works. This is a known blocker
for the WebGPU migration in the backlog.

**Texture loading order:**
Textures must be fully loaded before the body mesh is added
to the scene or the body flashes black on first render.
Always use loader callbacks / promises, never synchronous load.

**Mobile pixel ratio:**
Cap renderer.setPixelRatio at 2.0 maximum on all devices.
Uncapped pixel ratio on high-DPI mobile destroys performance.

**GeoSync drift:**
If texture rotation and camera orbit angle use separate deltaTime
accumulators they will drift apart over long sessions. Both must
reference the same master elapsed time variable.

---

## Token Efficiency

- Read PROJECT_LOG.md once at session start — do not re-read
  unless a specific lookup is needed later in the session
- Read prompt .md files once — reference in memory
- When spawning sub-agents, pass only the relevant section
  of PROJECT_LOG.md and the specific task spec, not full files
- Prefer targeted file reads (specific functions or sections)
  over whole-file reads when change scope is narrow
- Do not re-read unchanged files between tasks in a session

---

## Cost Efficiency (Fable Budget Aware)

- Run /compact after each major completed feature
- For isolated implementational tasks (single shader, single
  config entry, documentation) prefer sequential execution
  over parallel sub-agents unless session prompt explicitly
  requests parallelization
- Sub-agent context: task spec + relevant PROJECT_LOG.md
  section only — never pass the full living document to workers
- Haiku-tier workers appropriate for: shader implementation
  from complete spec, config data entry, documentation updates,
  surface feature label content, UI copy
- Orchestrator (Sonnet/Opus) required for: architecture decisions,
  shared infrastructure, integration, debugging, code review

---

## Multi-Agent Delegation (When Requested)

When the session prompt includes AGENT DELEGATION INSTRUCTIONS:

1. Complete all shared infrastructure first and commit before
   spawning any workers (workers depend on shared files)
2. Assign each worker only files it owns exclusively —
   no two workers touch the same file
3. Review all worker output before integrating
4. Orchestrator handles: shared libs, integration, review,
   PROJECT_LOG.md update, final commit
5. Workers handle: isolated shader files, individual config
   entries, documentation sections

Worker file ownership for shader sessions:
  Orchestrator: src/engine/glsl/simplex.glsl (shared dependency)
  Worker 1: src/engine/shaders/io-detail.glsl + io body config
  Worker 2: src/engine/shaders/europa-detail.glsl + europa body config
  Worker 3: src/engine/shaders/ganymede-detail.glsl + ganymede body config
  Worker 4: src/engine/shaders/callisto-detail.glsl + callisto body config

---

## Session Prompt Files

Prompt files live in the repo root and are named by version:
  MASTER_PROMPT.md    Original full build spec
  V2_PROMPT.md        Bug fixes + orbit insertion
  V3_DETAIL_SHADERS.md  Procedural detail shaders
  V3b_ORBIT_FIX.md    Orbit surface movement fixes
  FUTURE_ENHANCEMENTS.md  Documented future work (do not build)

At session start: read instructions.md → read PROJECT_LOG.md →
read the session prompt file → begin work.

---

## Style Guide (Quick Reference)

Full guide in PROJECT_LOG.md. Summary:
  Headings:     Montserrat (Google Fonts)
  Body/data:    Lato (Google Fonts)
  Primary Blue: #0077CC  — active states, borders
  Light Blue:   #66B2FF  — highlights, HUD readouts
  White:        #FFFFFF  — primary text
  Light Gray:   #D9D9D9  — secondary text
  Dark Gray:    #4D4D4D at 85% opacity — panel backgrounds
  Space Black:  #050510  — scene background

Brand source: ITprojectMGMT.com (Kyle Ewing)
Apply to ALL UI elements without exception.

---

## End of Session Checklist

Before ending any session:
  [ ] All committed code verified working in browser
  [ ] npm run build succeeds with no errors
  [ ] PROJECT_LOG.md updated with session changes
  [ ] Known Bugs updated (new bugs added, fixed bugs moved)
  [ ] Backlog updated if new items were discussed
  [ ] Living doc committed with same commit as final code change
  [ ] If deployed: live URL verified in production browser
