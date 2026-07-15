// V5b: panel manager, dismiss overlay, OI close button, panning, radiation zones.
import puppeteer from 'puppeteer-core';

const CHROME = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const BASE = process.env.SMOKE_URL || 'http://localhost:5175';

let pass = 0, fail = 0;
const check = (n, ok, d = '') => {
  if (ok) { pass++; console.log(`  ok  ${n}`); } else { fail++; console.log(`FAIL  ${n} ${d}`); }
};

const browser = await puppeteer.launch({
  executablePath: CHROME, headless: 'new',
  args: ['--use-gl=angle', '--enable-unsafe-swiftshader', '--window-size=1280,800'],
});
const page = await browser.newPage();
await page.setViewport({ width: 1280, height: 800 });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });

await page.goto(`${BASE}/?system=earth`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction('window.__sse && window.__sse.physics', { timeout: 60000 });
await page.waitForFunction(
  'document.getElementById("loading-screen").classList.contains("done")', { timeout: 60000 });
await new Promise((r) => setTimeout(r, 2000));

// Count visible "panels" (stack panel container, OI, info card, audio flyout).
const visiblePanels = () => page.evaluate(() => {
  // (position:fixed elements have offsetParent === null — use computed style.)
  const vis = (e) => e && getComputedStyle(e).display !== 'none' && !e.classList.contains('hidden');
  const out = [];
  if (vis(document.querySelector('.stack-panel'))) out.push('stack');
  if (vis(document.querySelector('.insertion-panel'))) out.push('oi');
  const info = document.querySelector('.info-panel');
  if (info && !info.classList.contains('hidden')) out.push('info');
  if (vis(document.querySelector('.audio-flyout'))) out.push('audio');
  return out;
});
const stackBtn = (id) => `.stack-btn[data-panel="${id}"]`;

// -- Item 1: one panel at a time -----------------------------------------------
await page.click(stackBtn('camera'));
check('CAM opens', (await visiblePanels()).join() === 'stack');
await page.click(stackBtn('time'));
const t = await page.evaluate(() => ({
  panels: [...document.querySelectorAll('.stack-content')].filter((c) => c.style.display !== 'none').length,
  active: document.querySelector('.stack-btn.active')?.dataset.panel,
}));
check('TIME replaces CAM (one stack content, TIME active)', t.panels === 1 && t.active === 'time', JSON.stringify(t));

await page.click('.tray-music');
check('audio flyout closes stack panel', (await visiblePanels()).join() === 'audio', (await visiblePanels()).join());
await page.click(stackBtn('bodies'));
check('NAV closes audio flyout', (await visiblePanels()).join() === 'stack');

// Insertion mode opens OI and closes NAV.
await page.keyboard.press('KeyO');
await new Promise((r) => setTimeout(r, 300));
check('I opens OI, closes NAV (one panel rule)', (await visiblePanels()).join() === 'oi', (await visiblePanels()).join());

// -- Item 3: OI close button returns to previous camera mode --------------------
const pre = await page.evaluate(() => window.__sse.cameraCtl.preModeOI);
await page.click('#oi-close');
await new Promise((r) => setTimeout(r, 300));
const afterClose = await page.evaluate(() => ({
  mode: window.__sse.cameraCtl.mode,
  oiVisible: document.querySelector('.insertion-panel').style.display !== 'none',
}));
check(`OI ✕ closes panel and returns to previous mode (${pre})`,
  !afterClose.oiVisible && afterClose.mode === pre, JSON.stringify(afterClose));

// Re-open cleanly via I after ✕.
await page.keyboard.press('KeyO');
await new Promise((r) => setTimeout(r, 300));
check('I re-opens OI cleanly after ✕', (await visiblePanels()).join() === 'oi');

// -- Item 2: click on the scene dismisses --------------------------------------
// (640,300) is over the planet/scene — NOT over the left-side OI panel.
await page.mouse.click(640, 300);
await new Promise((r) => setTimeout(r, 300));
const afterOutside = await page.evaluate(() => ({
  mode: window.__sse.cameraCtl.mode,
  panels: document.querySelector('.insertion-panel').style.display !== 'none',
  overlay: document.getElementById('dismiss-overlay').style.display,
}));
// v10.0.11 (bug #86): only the explicit ✕ restores the pre-insertion
// camera mode — click-away now closes the PANEL but keeps the camera in
// its insertion orbit (the user was mid-configuration, not cancelling).
check('outside click closes OI + camera stays in insertion + hides overlay',
  !afterOutside.panels && afterOutside.mode === 'insertion' && afterOutside.overlay === 'none',
  JSON.stringify(afterOutside));

// Camera drag works immediately after dismissing (no dead zone).
await page.evaluate(() => {
  const { cameraCtl } = window.__sse;
  cameraCtl.setMode('orbit', 'Earth');
  cameraCtl.orbSpeedMult = 0;
  for (let i = 0; i < 30; i++) cameraCtl.update(0.05);
});
await page.click(stackBtn('camera'));
await page.mouse.click(640, 400); // dismiss over the planet
await new Promise((r) => setTimeout(r, 200));
const th0 = await page.evaluate(() => window.__sse.cameraCtl.orbTheta);
await page.mouse.move(640, 400);
await page.mouse.down();
for (let i = 1; i <= 8; i++) await page.mouse.move(640 + i * 10, 400);
await page.mouse.up();
const th1 = await page.evaluate(() => {
  for (let i = 0; i < 10; i++) window.__sse.cameraCtl.update(0.05);
  return window.__sse.cameraCtl.orbTheta;
});
check('camera drag works immediately after outside-click dismiss', Math.abs(th1 - th0) > 1e-4,
  `dTheta=${(th1 - th0).toFixed(5)}`);

// Body info card participates in the manager.
await page.evaluate(() => window.__sse.ui.showInfo('Moon'));
const infoOpen = await page.evaluate(() =>
  !document.querySelector('.info-panel').classList.contains('hidden'));
await page.mouse.click(200, 200);
await new Promise((r) => setTimeout(r, 200));
const infoClosed = await page.evaluate(() =>
  document.querySelector('.info-panel').classList.contains('hidden'));
check('body card opens then dismisses on outside click', infoOpen && infoClosed);

// -- Item 4 regression: no dead zone at old hidden-card footprint ---------------
const th2 = await page.evaluate(() => window.__sse.cameraCtl.orbTheta);
await page.mouse.move(640, 700);
await page.mouse.down();
for (let i = 1; i <= 8; i++) await page.mouse.move(640 + i * 10, 700);
await page.mouse.up();
const th3 = await page.evaluate(() => {
  for (let i = 0; i < 10; i++) window.__sse.cameraCtl.update(0.05);
  return window.__sse.cameraCtl.orbTheta;
});
check('drag over old dead zone (hidden card footprint) rotates camera',
  Math.abs(th3 - th2) > 1e-4, `dTheta=${(th3 - th2).toFixed(5)}`);

// -- Item 5: Earth radiation zones ----------------------------------------------
const rad = await page.evaluate(() => {
  const { cameraCtl, ui } = window.__sse;
  const read = () => document.querySelector('.ins-warn')?.textContent || '';
  cameraCtl.setMode('insertion', 'Earth');
  const out = {};
  for (const [key, alt] of [['inner', 3000], ['outer', 30000], ['gap', 74000],
    ['iss', 408], ['reentry', 300], ['low-gap', 8000]]) {
    cameraCtl.setInsertion({ body: 'Earth', altitudeKm: alt, locked: false });
    ui.update(0.016); // the HUD refreshes in the render loop
    out[key] = read();
  }
  return out;
});
check('1,000–6,000 km shows Inner Van Allen belt', /Inner Van Allen/.test(rad.inner), rad.inner);
check('13,000–60,000 km shows Outer Van Allen belt', /Outer Van Allen/.test(rad.outer), rad.outer);
check('74,000 km shows NO radiation warning', rad.gap === '', rad.gap);
check('ISS altitude (408 km) shows no warning', rad.iss === '', rad.iss);
check('300 km shows Reentry altitude', /Reentry/.test(rad.reentry), rad.reentry);
check('8,000 km belt gap shows no warning', rad['low-gap'] === '', rad['low-gap']);

const realErrors = errors.filter((e) => !/favicon/i.test(e));
check('zero console errors', realErrors.length === 0, realErrors.slice(0, 3).join(' | '));

console.log(`\n${pass} passed, ${fail} failed`);
await browser.close();
process.exit(fail ? 1 : 0);
