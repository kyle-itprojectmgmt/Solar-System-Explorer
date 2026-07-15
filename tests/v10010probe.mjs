// v10.0.10 guard: insertion dropdown + Enter Orbit, TIME_STEPS ladder,
// pause-icon action semantics, ♥ support icon.
import puppeteer from 'puppeteer-core';

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const BASE = process.env.SMOKE_URL || 'http://localhost:5175';

const browser = await puppeteer.launch({
  executablePath: CHROME, headless: 'new',
  args: ['--use-gl=angle', '--enable-unsafe-swiftshader', '--window-size=1280,800'],
});
let pass = 0, fail = 0;
const check = (n, ok, d = '') => {
  if (ok) { pass++; console.log(`  ok  ${n}`); } else { fail++; console.log(`FAIL  ${n} ${d}`); }
};

const boot = async (system) => {
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 800 });
  await page.goto(`${BASE}/?system=${system}`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction('window.__sse && window.__sse.physics', { timeout: 60000 });
  await page.waitForFunction(
    'document.getElementById("loading-screen").classList.contains("done")', { timeout: 60000 });
  await new Promise((r) => setTimeout(r, 1500));
  return page;
};

// ---- Earth: full item sweep ---------------------------------------------------
{
  const page = await boot('earth');
  const r = await page.evaluate(() => {
    const { physics, cameraCtl, ui } = window.__sse;
    const out = {};
    out.steps = [...Array(5)].map((_, i) => { physics.setTimeIndex(i); return physics.timeMultiplier; });
    physics.setTimeIndex(1);
    out.stepCount = document.querySelectorAll('[data-time-index]').length;
    out.labels = [...document.querySelectorAll('[data-time-index]')].map((b) => b.textContent);
    // pause icon: playing -> shows ⏸ (the action)
    ui.update(0.016);
    out.iconPlaying = ui.pauseBtn.textContent;
    ui.userSetTimeIndex(0);
    ui.update(0.016);
    out.iconPaused = ui.pauseBtn.textContent;
    ui.userSetTimeIndex(1);
    ui.update(0.016);
    out.iconResumed = ui.pauseBtn.textContent;
    out.kofi = document.querySelector('.kofi-btn')?.textContent;
    // insertion dropdown
    out.options = [...ui.insBodySelect.options].map((o) => o.value);
    out.defaultSel = ui.insBodySelect.value;
    // Enter Orbit: set some panel state then click
    ui.insBodySelect.value = 'Moon';
    document.querySelector('.ins-enter-btn').click();
    out.modeAfter = cameraCtl.mode;
    out.bodyAfter = cameraCtl.ins.body;
    out.timeIndexAfter = physics.timeIndex;
    return out;
  });
  check('TIME_STEPS = [0,1,5,50,500]', JSON.stringify(r.steps) === '[0,1,5,50,500]', JSON.stringify(r.steps));
  check('5 speed buttons (no 10,000x)', r.stepCount === 5 && !r.labels.some((l) => l.includes('10,000')), JSON.stringify(r.labels));
  check('pause icon shows action (playing->⏸, paused->▶, resumed->⏸)',
    r.iconPlaying === '⏸' && r.iconPaused === '▶' && r.iconResumed === '⏸',
    `${r.iconPlaying}/${r.iconPaused}/${r.iconResumed}`);
  check('support icon is ♥', r.kofi === '♥', r.kofi);
  check('Earth dropdown = Earth + Moon', JSON.stringify(r.options) === '["Earth","Moon"]', JSON.stringify(r.options));
  check('default selection = primary', r.defaultSel === 'Earth');
  check('Enter Orbit -> insertion mode on Moon at 1x',
    r.modeAfter === 'insertion' && r.bodyAfter === 'Moon' && r.timeIndexAfter === 1,
    JSON.stringify({ m: r.modeAfter, b: r.bodyAfter, t: r.timeIndexAfter }));
  await page.close();
}

// ---- Jupiter + Saturn: dropdown covers ALL moons (kepler included) -------------
for (const [system, primary, mustInclude] of [
  ['jupiter', 'Jupiter', ['Io', 'Europa', 'Ganymede', 'Callisto', 'Amalthea']],
  ['saturn', 'Saturn', ['Titan', 'Enceladus', 'Iapetus', 'Mimas', 'Phoebe']],
]) {
  const page = await boot(system);
  const r = await page.evaluate(() => ({
    options: [...window.__sse.ui.insBodySelect.options].map((o) => o.value),
    hasEnter: !!document.querySelector('.ins-enter-btn'),
  }));
  check(`${system}: dropdown starts with primary + includes kepler moons`,
    r.options[0] === primary && mustInclude.every((m) => r.options.includes(m)),
    JSON.stringify(r.options));
  check(`${system}: Enter Orbit button present`, r.hasEnter);
  await page.close();
}

console.log(`\n${pass} passed, ${fail} failed`);
await browser.close();
process.exit(fail ? 1 : 0);
