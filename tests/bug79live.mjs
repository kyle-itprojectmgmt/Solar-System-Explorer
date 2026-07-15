// Bug #79 guard: LIVE mode + pause + speed-preset click.
// ROOT CAUSE (measured pre-fix): with LIVE on, ui.update() forces
// timeIndex back to 1× and drift-snaps the clock; pausing stopped the
// resync, so the first speed interaction after a pause lurched sim time
// forward by the whole pause duration (read as "preset jumps time" /
// "camera pans" on hardware — pointer events were never at fault).
// Headless never saw it because LIVE defaults OFF under webdriver.
// FIX: ui.userSetTimeIndex — any explicit non-1× speed choice drops LIVE.
// This guard asserts: pausing while LIVE turns LIVE off, and a subsequent
// speed-preset click (index 2 = 5× on the v10.0.10 ladder) STICKS
// (no forced revert to 1×, no clock lurch).
import puppeteer from 'puppeteer-core';

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const BASE = process.env.SMOKE_URL || 'http://localhost:5175';

const browser = await puppeteer.launch({
  executablePath: CHROME, headless: 'new',
  args: ['--use-gl=angle', '--enable-unsafe-swiftshader', '--window-size=1280,800'],
});
const page = await browser.newPage();
await page.setViewport({ width: 1280, height: 800 });
await page.goto(`${BASE}/?system=earth`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction('window.__sse && window.__sse.physics', { timeout: 60000 });
await page.waitForFunction(
  'document.getElementById("loading-screen").classList.contains("done")', { timeout: 60000 });
await new Promise((r) => setTimeout(r, 2000));

// Turn LIVE on (as a real browser boot would), open TIME panel, pause.
await page.evaluate(() => window.__sse.ui.setLive(true));
await page.click('.stack-btn[data-panel="time"]');
await new Promise((r) => setTimeout(r, 500));
const t0 = await page.evaluate(() => {
  const content = [...document.querySelector('.stack-panel').children]
    .find((c) => getComputedStyle(c).display !== 'none');
  content.querySelector('[data-time-index="0"]').click(); // ⏸ pause
  return { simSeconds: window.__sse.physics.simSeconds,
    timeIndex: window.__sse.physics.timeIndex,
    live: window.__sse.ui.liveMode };
});
console.log('paused while LIVE:', JSON.stringify(t0));

await new Promise((r) => setTimeout(r, 5000)); // let wall clock run ahead

const t1 = await page.evaluate(() => {
  const content = [...document.querySelector('.stack-panel').children]
    .find((c) => getComputedStyle(c).display !== 'none');
  const before = window.__sse.physics.simSeconds;
  content.querySelector('[data-time-index="2"]').click(); // 10x preset
  return { before, afterClick: window.__sse.physics.simSeconds,
    timeIndex: window.__sse.physics.timeIndex };
});
await new Promise((r) => setTimeout(r, 1200)); // let update() frames run
const t2 = await page.evaluate(() => ({
  simSeconds: window.__sse.physics.simSeconds,
  timeIndex: window.__sse.physics.timeIndex,
  live: window.__sse.ui.liveMode,
}));
const jump = t2.simSeconds - t1.before;
console.log('clicked index 2 (5x):', JSON.stringify(t1));
console.log('1.2 s later :', JSON.stringify(t2));
console.log(`sim advance after preset click: ${jump.toFixed(1)} s; ` +
  `timeIndex ${t2.timeIndex} (want 2 = 5x, sticking); live ${t2.live} (want false)`);
// Post-fix: pausing dropped LIVE, so the chosen speed sticks and only its
// legit advancement occurs (~6 sim-s in 1.2 wall-s at 5x; a regression
// shows either timeIndex reverting to 1 or live still true).
const pass = t0.live === false && t2.timeIndex === 2 && t2.live === false;
console.log(pass ? 'PASS' : 'FAIL: LIVE lurch regression (bug #79)');
await browser.close();
process.exit(pass ? 0 : 1);
