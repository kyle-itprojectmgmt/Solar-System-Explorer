// v8.0.1 fix-batch guard — INC-no-mode-switch, lit-hemisphere entry,
// pause/play tray button (+ Space + LIVE interplay). Night-side detail
// discipline has its own suite (moonnight.mjs, GATE=1).
// Run against `npm run dev` (SMOKE_URL, default :5175).
import puppeteer from 'puppeteer-core';

const CHROME = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const BASE = process.env.SMOKE_URL || 'http://localhost:5175';

let pass = 0, fail = 0;
const check = (name, ok, detail = '') => {
  console.log(`${ok ? ' ok ' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
  ok ? pass++ : fail++;
};

const browser = await puppeteer.launch({
  executablePath: CHROME, headless: 'new',
  args: ['--use-gl=angle', '--enable-unsafe-swiftshader', '--window-size=1280,800'],
});

async function boot(system) {
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.setViewport({ width: 1280, height: 800 });
  await page.goto(`${BASE}/?system=${system}`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction('window.__sse && window.__sse.physics', { timeout: 60000 });
  await page.waitForFunction(
    'document.getElementById("loading-screen").classList.contains("done")', { timeout: 60000 });
  await new Promise((r) => setTimeout(r, 1500));
  return { page, errors };
}

// -- Group 1: INC slider behavior (on Jupiter) ---------------------------------
{
  const { page, errors } = await boot('jupiter');
  const s = await page.evaluate(() => {
    const { cameraCtl, ui } = window.__sse;
    const toasts = [];
    const orig = ui.notify.bind(ui);
    ui.notify = (m) => { toasts.push(m); orig(m); };
    const out = {};

    // In ORBIT mode: drag INC — mode must stay orbit, no toast, phi moves.
    cameraCtl.setMode('orbit', 'Jupiter');
    const phi0 = cameraCtl.orbPhi;
    ui.mcIncSlider.value = 60; ui.mcIncSlider.oninput();
    out.orbitMode = cameraCtl.mode;
    out.orbitPhiMoved = Math.abs(cameraCtl.orbPhi - phi0) > 0.1;
    out.orbitPhi = cameraCtl.orbPhi;
    out.toastsAfterOrbit = toasts.length;

    // In INSERTION mode: drag INC — stays insertion, incDeg applied.
    cameraCtl.setMode('insertion', 'Jupiter');
    ui.mcIncSlider.value = -35; ui.mcIncSlider.oninput();
    out.insMode = cameraCtl.mode;
    out.insInc = cameraCtl.ins.incDeg;
    out.toastsAfterIns = toasts.length;

    // From FREE mode: drag INC — switches to insertion WITH one toast.
    cameraCtl.setMode('free');
    ui.mcIncSlider.value = 20; ui.mcIncSlider.oninput();
    out.freeMode = cameraCtl.mode;
    out.freeToast = toasts.filter((t) => t.includes('Switched to Orbit Simulation')).length;
    ui.notify = orig;
    return out;
  });
  check('INC in orbit mode: stays orbit, phi follows, NO toast',
    s.orbitMode === 'orbit' && s.orbitPhiMoved && s.toastsAfterOrbit === 0,
    `mode=${s.orbitMode} phi=${s.orbitPhi?.toFixed(2)} toasts=${s.toastsAfterOrbit}`);
  check('INC in insertion mode: stays insertion, incDeg applied, no toast',
    s.insMode === 'insertion' && s.insInc === -35 && s.toastsAfterIns === 0,
    `mode=${s.insMode} inc=${s.insInc}`);
  check('INC from free mode: switches to insertion with ONE toast',
    s.freeMode === 'insertion' && s.freeToast === 1, `mode=${s.freeMode} toasts=${s.freeToast}`);
  check('INC group: zero console errors', errors.length === 0, errors.slice(0, 2).join('|'));
  await page.close();
}

// -- Group 2: pause/play button + Space + LIVE (on Jupiter) ---------------------
{
  const { page, errors } = await boot('jupiter');
  const s = await page.evaluate(async () => {
    const { physics, ui } = window.__sse;
    const out = {};
    out.btnExists = !!ui.pauseBtn && ui.pauseBtn.dataset.tray === 'pause';
    // Tray order: 📷 then ⏸ then 👁.
    const kids = [...ui.tray.children].map((c) => c.dataset?.tray || c.className);
    out.order = kids.join(',');
    out.between = kids.indexOf('pause') === kids.indexOf('screenshot') + 1
      && kids.indexOf('presentation') === kids.indexOf('pause') + 1;

    // Click pauses; icon + HUD reflect it; resume restores prior speed.
    physics.setTimeIndex(3); // 50x (index 3 on the v10.0.10 ladder)
    ui.pauseBtn.click(); ui.update(0.016);
    out.pausedAfterClick = physics.paused;
    out.iconPaused = ui.pauseBtn.textContent;
    out.hudPaused = ui.multEl.textContent;
    ui.pauseBtn.click(); ui.update(0.016);
    out.resumedIndex = physics.timeIndex;
    out.iconPlaying = ui.pauseBtn.textContent;

    // Space toggles too (input-guarded handler on window).
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Space', bubbles: true }));
    ui.update(0.016);
    out.spacePaused = physics.paused;
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Space', bubbles: true }));
    ui.update(0.016);
    out.spaceResumed = !physics.paused && physics.timeIndex === 3;

    // LIVE + pause: pausing must STICK (LIVE sync suspended), resume re-syncs.
    ui.setLive(true); ui.update(0.016);
    ui.pauseBtn.click();
    ui.update(0.016); ui.update(0.016);
    out.livePauseSticks = physics.paused;
    ui.pauseBtn.click(); ui.update(0.016);
    const nowS = (Date.now() - physics.epochMs) / 1000;
    out.liveResyncs = !physics.paused && Math.abs(physics.simSeconds - nowS) < 5;
    ui.setLive(false);
    return out;
  });
  check('pause button exists between 📷 and 👁', s.btnExists && s.between, s.order);
  // v10.0.10: icon shows the ACTION — paused → ▶ (click resumes).
  check('click pauses: icon ▶ (action), HUD PAUSED',
    s.pausedAfterClick && s.iconPaused === '▶' && s.hudPaused === 'PAUSED',
    `icon=${s.iconPaused} hud=${s.hudPaused}`);
  check('resume restores prior speed (50x) with icon ⏸ (action)',
    s.resumedIndex === 3 && s.iconPlaying === '⏸', `idx=${s.resumedIndex}`);
  check('Space pauses and resumes at prior speed', s.spacePaused && s.spaceResumed);
  check('LIVE: pause sticks (sync suspended), resume re-syncs to now',
    s.livePauseSticks && s.liveResyncs);
  check('pause group: zero console errors', errors.length === 0, errors.slice(0, 2).join('|'));
  await page.close();
}

// -- Group 3: lit-hemisphere entry on ALL 8 systems ------------------------------
for (const sys of ['jupiter', 'earth', 'mars', 'saturn', 'mercury', 'venus', 'uranus', 'neptune']) {
  const { page, errors } = await boot(sys);
  const s = await page.evaluate(() => {
    const { physics, renderer, cameraCtl, THREE } = window.__sse;
    // Settle the cinematic pose for this frame.
    cameraCtl.update(0.016);
    const sunW = new THREE.Vector3(physics.sunDir.x, physics.sunDir.y, physics.sunDir.z)
      .applyQuaternion(renderer.root.quaternion).normalize();
    const target = renderer.system.primary.name;
    const center = renderer.bodyWorldPos(target, new THREE.Vector3()).clone();
    const camDir = renderer.camera.position.clone().sub(center).normalize();
    return { mode: cameraCtl.mode, dot: camDir.dot(sunW) };
  });
  check(`${sys}: opens on the LIT hemisphere (cam·sun > 0.15)`,
    s.mode === 'cinematic' && s.dot > 0.15, `mode=${s.mode} dot=${s.dot?.toFixed(2)}`);
  if (errors.length) check(`${sys}: console errors`, false, errors[0]);
  await page.close();
}

await browser.close();
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
