// #79 precise probe: instrument the VISIBLE time-panel content (the shared
// .stack-panel holds every panel's content div; only one is displayed).
// Log which events actually fire on the time slider and a preset button
// under synthetic input, and whether timeIndex / camera state change.
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

await page.click('.stack-btn[data-panel="time"]');
await new Promise((r) => setTimeout(r, 600));

const state = await page.evaluate(() => {
  window.__evLog = [];
  const log = (tag) => (e) => window.__evLog.push(`${tag}:${e.type}`);
  const panel = document.querySelector('.stack-panel');
  // the visible content div
  const content = [...panel.children].find((c) => getComputedStyle(c).display !== 'none');
  const slider = content?.querySelector('input[type="range"]');
  const btn = content?.querySelector('[data-time-index="2"]');
  for (const [tag, eln] of [['slider', slider], ['btn', btn], ['panel', panel]]) {
    if (!eln) continue;
    for (const t of ['pointerdown', 'pointerup', 'click', 'input']) {
      eln.addEventListener(t, log(tag));
    }
  }
  document.addEventListener('pointerdown', log('doc-capture'), true);
  const r = (e) => { if (!e) return null; const b = e.getBoundingClientRect(); return { x: b.x + b.width / 2, y: b.y + b.height / 2, w: b.width, h: b.height }; };
  return {
    contentClass: content?.className, slider: r(slider), btn: r(btn),
    sliderValue: slider?.value,
    timeIndex: window.__sse.physics.timeIndex,
    camTheta: window.__sse.cameraCtl.orbTheta,
    panelOpenNow: getComputedStyle(panel).display,
  };
});
console.log('state:', JSON.stringify(state, null, 1));

if (state.slider && state.slider.w > 0) {
  await page.mouse.move(state.slider.x - state.slider.w * 0.35, state.slider.y);
  await page.mouse.down();
  await page.mouse.move(state.slider.x + state.slider.w * 0.35, state.slider.y, { steps: 6 });
  await page.mouse.up();
  await new Promise((r) => setTimeout(r, 300));
}
const afterDrag = await page.evaluate(() => ({
  events: window.__evLog.splice(0),
  timeIndex: window.__sse.physics.timeIndex,
  camTheta: window.__sse.cameraCtl.orbTheta,
  panelStillOpen: !!document.querySelector('.stack-panel') &&
    getComputedStyle(document.querySelector('.stack-panel')).display !== 'none',
}));
console.log('after slider drag:', JSON.stringify(afterDrag, null, 1));

if (state.btn) {
  await page.mouse.click(state.btn.x, state.btn.y);
  await new Promise((r) => setTimeout(r, 300));
}
const afterClick = await page.evaluate(() => ({
  events: window.__evLog.splice(0),
  timeIndex: window.__sse.physics.timeIndex,
  camTheta: window.__sse.cameraCtl.orbTheta,
}));
console.log('after preset click:', JSON.stringify(afterClick, null, 1));
// Guards: slider drag reaches the slider (input events + index change),
// the camera never moves (its canvas handler has an e.target guard), the
// panel stays open, and the preset button applies its index.
const pass =
  afterDrag.events.includes('slider:input') &&
  afterDrag.timeIndex !== state.timeIndex &&
  Math.abs(afterDrag.camTheta - state.camTheta) < 1e-6 &&
  afterDrag.panelStillOpen &&
  afterClick.timeIndex === 2 &&
  Math.abs(afterClick.camTheta - state.camTheta) < 1e-6;
console.log(pass ? 'PASS' : 'FAIL: time-panel pointer regression');
await browser.close();
process.exit(pass ? 0 : 1);
