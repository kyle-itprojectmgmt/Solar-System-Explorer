# Solar System Explorer — Claude Code Standing Instructions
# Place this file at: .claude/instructions.md
# Read at the start of EVERY session. Update PROJECT_LOG.md at the end
# of EVERY session. Never skip either.

---

## Repository

Root: C:\dev\Solar-System-Explorer
Live: https://solar-system-explorer.kyle-d06.workers.dev
Host: Cloudflare Worker (workers.dev URL — NOT Cloudflare Pages)
Textures: Cloudflare R2 (zero egress fees)

---

## Structure

src/engine/        Core renderer, physics, camera, audio, UI, shaders
src/data/systems/  Planetary system configs (jupiter.js, saturn.js stub)
src/engine/glsl/   Shared GLSL libraries (simplex noise, etc.)
public/textures/   Local dev textures (production serves from R2)
.claude/           This file and session prompt .md files
Docs/              Versioned prompt files (MASTER_PROMPT.md, V2, V3, etc.)
PROJECT_LOG.md     Living document — single source of truth

---

## CRITICAL — Git Discipline (Source Code Has Been Lost Before)

Source code was lost across v1–v3b because Claude Code committed only
documentation files. ALL work must be committed properly every session.

### Session Start — Pull Latest
ALWAYS begin every session with:
  git pull origin main
  git status  ← must show clean working tree before starting work

If working tree is not clean at session start — STOP and report.
Never start work on top of uncommitted changes from a prior session.

### After Every Feature or Bug Fix — Commit Immediately
Do NOT wait until end of session. After every completed task:

  git add -A
  git status   ← review what is staged BEFORE committing

VERIFY the staged files include actual source code (.js, .glsl, .css):
  git diff --cached --name-only

If only .md files appear — source code was NOT staged. Fix it:
  git add src/ public/ index.html vite.config.js
  git diff --cached --name-only  ← verify source files now appear

Then commit:
  git commit -m "[area]: [description]"

VERIFY source files appear in the commit:
  git show HEAD --name-only

If only .md files appear in the commit — the commit is wrong.
Amend it immediately:
  git add src/ public/ index.html
  git commit --amend --no-edit

### After Every Commit — Push Immediately
  git push origin main

Never accumulate local commits without pushing. If the session ends
without pushing, the work is at risk. Push after every commit.

### End of Session — Final Verification
  git status          ← must show clean working tree
  git log --oneline -5  ← verify recent commits have source files
  git show HEAD --name-only  ← verify .js files in latest commit

---

## Deploy Commands

CRITICAL: This project is a Cloudflare WORKER, NOT Cloudflare Pages.

Local dev:      npm run dev      → http://localhost:5173 (hot reload)
Test build:     npm run build    → builds to /dist
Preview build:  npm run preview  → http://localhost:4173
Production:     npx wrangler deploy  ← THE ONLY CORRECT DEPLOY COMMAND

NEVER use:
  wrangler pages publish   ← prompts to create new project (WRONG)
  wrangler pages deploy    ← wrong deployment type (WRONG)
  npm run deploy           ← check package.json first, may be wrong

Deploy sequence (always in this order):
  1. npm run build
  2. Verify dist/assets has multiple chunked files:
       three-[hash].js        ← ~533KB Three.js chunk
       postprocessing-[hash].js  ← ~76KB
       main-[hash].js         ← your source code ~89KB+
     If only 4 files with index-DCcom_7B.js — build is wrong, stop.
  3. npm run preview → verify at localhost:4173
  4. npx wrangler deploy
  5. Open live URL in incognito window to bypass browser cache
  6. Verify specific v3b+ features work (not just loading screen)

### Verifying Production Has Latest Code
Do NOT trust the loading screen version number alone.
In browser DevTools → Sources → find main-[hash].js → Ctrl+F
Search for 'geosync' — if found, v3b+ is confirmed deployed.
Search for 'detailShaders' — if found, v3 is confirmed deployed.

---

## Vite Build Configuration

vite.config.js MUST include manualChunks or the build produces only
21 modules (missing all source code) with identical hash every time.
The correct vite.config.js:

  import { defineConfig } from 'vite'
  import { readFileSync } from 'fs'
  const pkg = JSON.parse(readFileSync('./package.json', 'utf-8'))

  export default defineConfig({
    root: '.',
    base: '/',
    define: { __APP_VERSION__: JSON.stringify(pkg.version) },
    build: {
      outDir: 'dist',
      emptyOutDir: true,
      target: 'esnext',
      rollupOptions: {
        input: { main: './index.html' },
        output: {
          manualChunks: {
            three: ['three'],
            postprocessing: ['postprocessing']
          }
        }
      }
    },
    server: { port: 5173 }
  })

If build produces only 4 files or same hash every time:
  1. Verify vite.config.js has manualChunks as above
  2. rd /s /q dist  (Windows) or rm -rf dist  (Mac/Linux)
  3. npm run build
  4. Verify dist/assets now has 5-6 files with different hashes

Do NOT include @cloudflare/vite-plugin — it hijacks the build and
causes the 21-module problem. It must not appear in package.json
devDependencies or vite.config.js imports.

---

## Multi-Worker Conflict Prevention

When multiple workers are spawned in parallel, file conflicts cause
merge issues and lost work. Follow these rules strictly:

### Before Spawning Workers
1. Orchestrator commits and pushes all shared infrastructure first:
     git add -A && git commit -m "infra: shared dependencies"
     git push origin main
2. Each worker gets an exclusive file list — no overlaps
3. Workers must NOT touch: PROJECT_LOG.md, vite.config.js,
   package.json, index.html, src/config.js, src/main.js,
   src/engine/glsl/simplex.glsl — orchestrator owns these

### Worker Branch Strategy
Each worker operates on a named branch:
  git checkout -b worker/[feature-name]
  # ... do work, commit ...
  git push origin worker/[feature-name]

Orchestrator merges worker branches sequentially:
  git checkout main
  git merge worker/io-shader --no-ff
  git merge worker/europa-shader --no-ff
  # resolve any conflicts before merging next branch
  git push origin main

### Worker File Ownership (Shader Sessions)
  Orchestrator: src/engine/glsl/simplex.glsl (build first, push before workers start)
  Worker 1:     src/engine/shaders/io-detail.glsl + io entries in jupiter.js
  Worker 2:     src/engine/shaders/europa-detail.glsl + europa entries
  Worker 3:     src/engine/shaders/ganymede-detail.glsl + ganymede entries
  Worker 4:     src/engine/shaders/callisto-detail.glsl + callisto entries

### After Merging All Workers
  git log --oneline -10  ← verify all worker commits present
  npm run build          ← must succeed with no errors
  npm run preview        ← visual verify all features work together
  npx wrangler deploy    ← deploy integrated result
  git show HEAD --name-only  ← verify source files in final commit

---

## Living Document

- Location: Docs/PROJECT_LOG.md (in Docs/ folder — NOT repo root)
- Read at the START of every session before touching any code
- Update at the END of every session:
  - Add completed items to Version History with commit hash
  - Move resolved bugs from Known Bugs to Version History
  - Add any new bugs discovered to Known Bugs
  - Add any new backlog items discussed
- Commit living doc WITH source code — never as a separate commit
- PROJECT_LOG.md is the single source of truth for project state

---

## Commit Format

[area]: [what changed] ([feature/bug ref if applicable])

Areas: engine, physics, camera, audio, ui, shaders, config,
       textures, deploy, docs, infra

Examples:
  shaders: add Io procedural volcanic surface detail
  camera: fix chase mode spring follow + orbital direction offset
  ui: replace altitude presets with continuous logarithmic slider
  deploy: fix vite manualChunks — production now bundles source code
  docs: update PROJECT_LOG.md — v4 complete

---

## Validation Before Marking Any Task Complete

Shaders / visuals:
  Open http://localhost:5173, navigate to the affected body,
  verify the feature visually at the altitudes specified in the task.
  Do not mark complete based on code alone — visual confirmation required.
  Run npm run build and verify in npm run preview before marking done.

Camera modes:
  Test the specific mode on at least two bodies (one inner, one outer).
  Verify smooth transition in and out of the mode.

Physics changes:
  Run at 1x and 10,000x time speed. Confirm no drift or instability.
  Verify eclipse events still trigger correctly after any physics change.

Audio:
  Cycle through all 7 sound modes. Confirm crossfade works.
  Check localStorage persistence by reloading the page.

UI changes:
  Test on both desktop (wide) and mobile (narrow) viewport.
  Verify no elements overlap or get cut off.
  Verify brand colors and fonts match style guide.

Deploy verification:
  After npx wrangler deploy, open live URL in INCOGNITO window.
  Search for feature-specific string in DevTools Sources to confirm
  latest code is deployed, not browser-cached v1.
  Check browser console — zero errors required before marking done.

---

## Stopping Rules — Stop and Report to User Immediately

1. Any item requiring architectural decision not in PROJECT_LOG.md
2. Any conflict with a prior decision in PROJECT_LOG.md
3. Any unexpected finding during implementation — do not improvise
4. Any shader compilation error requiring structural changes to
   the shared GLSL library (other shaders depend on it)
5. npm run build fails with errors
6. npx wrangler deploy fails
7. Physics change causes orbital instability or moon escape
8. Any change that puts Jupiter-specific logic outside jupiter.js
9. Performance drops below 30 FPS on desktop tier
10. Any audio change that breaks localStorage persistence
11. git push fails or conflicts with remote — stop and report
12. dist/assets shows only 4 files after build (manualChunks broken)
13. Worker branch merge produces conflicts — stop, do not force merge

---

## Do Not

- Improvise on unexpected findings — stop and report
- Hard-code Jupiter-specific logic outside src/data/systems/jupiter.js
- Commit without staging source files (verify with git diff --cached)
- Commit without pushing immediately after
- Deploy without verifying dist has multiple chunked files
- Use wrangler pages publish or wrangler pages deploy (wrong type)
- Include @cloudflare/vite-plugin in package.json or vite.config.js
- Re-read the same file multiple times in a session
- Modify shared GLSL noise library without checking all dependents
- Change camera.updateProjectionMatrix() call placement
- Alter TEXTURE_BASE_URL logic
- Remove uDetailBlend = 0 fast-path in shaders
- Change geosync time accumulator without verifying surface lock
- Let workers touch shared files (vite.config.js, package.json,
  index.html, src/config.js, src/main.js, simplex.glsl)
- Merge worker branches without resolving conflicts first
- Deploy worker branch output — always merge to main first

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
Do not attempt WebGPU migration — backlog item, pending library support.

**Orbit camera:**
Camera orbital angle and body texture rotation must reference the
same time accumulator for GeoSync. Never separate these update paths.

**Vite build:**
vite.config.js must always include manualChunks splitting three and
postprocessing. Without this, build produces 21 modules and source
code is not bundled. Never remove manualChunks.

---

## Known Gotchas

**Source code not committed (has caused full session loss):**
git show HEAD --name-only must show .js files, not just .md files.
If only docs appear in commits, source was never staged. See git
discipline section above for recovery steps.

**ShaderMaterial + Logarithmic Depth Buffer (v7 Titan orange donut):**
Raw THREE.ShaderMaterial silently loses depth testing under the log
depth buffer. Symptom: mesh renders as flat billboard in front of
everything. Fix: set material.extensions = { logDepthBuf: true } and
material.defines = { USE_LOGDEPTHBUF: '' } on every raw ShaderMaterial.
OR use onBeforeCompile injection into MeshStandardMaterial — inherits
log-depth automatically. Check this FIRST when any new shader renders
incorrectly at depth. Applies to: atmosphere spheres, ring discs,
particle materials, any BackSide mesh.

**Security headers — use public/_headers not wrangler.toml:**
The wrangler.toml [[headers]] block is NOT valid for Workers Static
Assets. Use public/_headers file instead. Format:
  /*
    Content-Security-Policy: ...
    X-Frame-Options: SAMEORIGIN
Verify via DevTools Network → response headers after deploy.
Current Observatory score: A+ (130) — maintain this.

**Production serving wrong version:**
Browser cache can serve stale JS even after deploy. Always verify
in incognito window. Search DevTools Sources for feature-specific
strings to confirm correct version is live.

**Build produces 21 modules / identical hash:**
Caused by missing manualChunks in vite.config.js OR by
@cloudflare/vite-plugin being present. Remove the plugin,
add manualChunks, delete dist, rebuild.

**Deploy prompts for new project name:**
Using wrong deploy command. ONLY use: npx wrangler deploy
Never use: wrangler pages publish / wrangler pages deploy

**Jupiter goes oval:**
camera.updateProjectionMatrix() must fire on every resize event.
Also verify Jupiter oblate scale is exactly 0.9353 on Y axis.

**Click events swallowed:**
Full-screen overlay layers must have pointer-events: none unless
they contain interactive elements.

**Halo ring shader crash:**
Shader uniforms must be declared before material is added to scene.

**HUD date malformed:**
Use UTC date methods only, never local. Handle month rollover from
March 5, 1979 Voyager start date.

**GeoSync drift:**
Camera phase must be pinned to body's actual rotation angle each
frame — not a separate accumulator. See camera.js _bodyRotationAngle().

**Headless Chrome smoke tests:**
Headless Chrome renders at ~4 FPS. Measure against sim-time, not
wall-clock. Call cameraCtl.update() directly to settle transitions.

**Texture loading order:**
Textures must be fully loaded before body mesh added to scene.
Use loader callbacks/promises, never synchronous load.

**Mobile pixel ratio:**
Cap renderer.setPixelRatio at 2.0 maximum on all devices.

---

## Token Efficiency

- Read PROJECT_LOG.md once at session start — do not re-read
- Read prompt .md files once — reference in memory
- When spawning sub-agents, pass only relevant PROJECT_LOG.md
  section + specific task spec — never the full document
- Prefer targeted file reads over whole-file reads
- Do not re-read unchanged files between tasks

---

## Cost Efficiency (Fable Budget Aware)

- Run /compact after each major completed feature
- Sequential execution preferred unless prompt requests parallel
- Sub-agent context: task spec + relevant log section only
- Haiku-tier workers: shader impl from spec, config data, docs, UI copy
- Orchestrator (Sonnet/Opus): architecture, integration, debugging

---

## Session Prompt Files

Prompt files live in Docs/ folder:
  Docs/MASTER_PROMPT.md       Original full build spec
  Docs/V2_PROMPT.md           Bug fixes + orbit insertion
  Docs/V3_DETAIL_SHADERS.md   Procedural detail shaders
  Docs/V3b_ORBIT_FIX.md       Orbit surface movement fixes
  Docs/V4_PROMPT.md           Backlog features batch (next session)
  FUTURE_ENHANCEMENTS.md      Documented future work (do not build)

Session start sequence:
  1. git pull origin main
  2. git status  ← verify clean
  3. Read .claude/instructions.md (this file)
  4. Read PROJECT_LOG.md
  5. Read session prompt file
  6. Begin work

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

  [ ] git status shows clean working tree
  [ ] git log --oneline -5 shows recent commits
  [ ] git show HEAD --name-only shows .js source files in latest commit
  [ ] All commits pushed to origin main
  [ ] npm run build succeeds with 5-6 chunked files in dist/assets
  [ ] Live URL verified in incognito window
  [ ] PROJECT_LOG.md updated (version history, bugs, backlog)
  [ ] No items left uncommitted or unpushed
