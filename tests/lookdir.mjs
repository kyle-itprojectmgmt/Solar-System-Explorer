// Orbit Insertion framing verification: the planet must be centered and
// prominent on entry from every path, at every inclination — never small
// in a corner with the rings arcing across the frame.
import puppeteer from 'puppeteer-core';
import { mkdirSync } from 'fs';

const CHROME = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const URL = process.env.SMOKE_URL || 'http://localhost:5175';
const OUT = new globalThis.URL('./shots/', import.meta.url).pathname.slice(1);
mkdirSync(OUT, { recursive: true });

const browser = await puppeteer.launch({
  executablePath: CHROME, headless: 'new',
  args: ['--use-gl=angle', '--enable-unsafe-swiftshader', '--window-size=1280,800'],
});
const page = await browser.newPage();
await page.setViewport({ width: 1280, height: 800 });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
await page.goto(URL, { waitUntil: 'domcontentloaded' });
await page.waitForFunction('window.__sse', { timeout: 60000 });
await page.waitForFunction(
  'document.getElementById("loading-screen").classList.contains("done")', { timeout: 60000 });

let pass = 0, fail = 0;
const check = (n, ok, d = '') => {
  if (ok) { pass++; console.log(`  ok  ${n}`); } else { fail++; console.log(`FAIL  ${n} ${d}`); }
};

const res = await page.evaluate(() => {
  const { cameraCtl, physics, renderer, THREE } = window.__sse;
  physics.setTimeIndex(0);
  const rows = [];
  const measure = (label) => {
    for (let i = 0; i < 30; i++) cameraCtl.update(0.05);
    const cam = cameraCtl.camera;
    cam.updateMatrixWorld(true);
    cam.matrixWorldInverse.copy(cam.matrixWorld).invert();
    const center = renderer.bodyWorldPos('Jupiter', new THREE.Vector3());
    const dist = cam.position.distanceTo(center);
    const angDiaDeg = 2 * THREE.MathUtils.radToDeg(
      Math.asin(Math.min(1, renderer.bodyRadius('Jupiter') / dist)));
    const p = center.clone().project(cam);
    // The planet's projected radius in NDC-y units (48° vertical FOV).
    const ndcRadius = Math.tan(THREE.MathUtils.degToRad(angDiaDeg / 2))
      / Math.tan(THREE.MathUtils.degToRad(24));
    rows.push({
      label,
      ndc: [+p.x.toFixed(2), +p.y.toFixed(2)],
      offCenter: +Math.hypot(p.x, p.y).toFixed(2),
      ndcRadius: +ndcRadius.toFixed(2),
      angDiaDeg: +angDiaDeg.toFixed(1),
      behind: p.z > 1,
    });
  };
  const scenarios = [
    ['system', () => { cameraCtl.setMode('system'); }],
    ['orbit', () => {
      cameraCtl.setMode('orbit', 'Jupiter');
      cameraCtl.orbSpeedMult = 0;
      cameraCtl.orbDist = renderer.bodyRadius('Jupiter') * 3;
    }],
    ['free-eq', () => {
      cameraCtl.setMode('free');
      cameraCtl.blend = 1;
      const c = renderer.bodyWorldPos('Jupiter', new THREE.Vector3());
      cameraCtl.camera.position.set(c.x + 40, c.y + 5, c.z - 150);
      cameraCtl.fromPos.copy(cameraCtl.camera.position);
    }],
  ];
  for (const inc of [0, 40, 90, -40]) {
    for (const [name, setup] of scenarios) {
      setup();
      for (let i = 0; i < 30; i++) cameraCtl.update(0.05);
      cameraCtl.ins.incDeg = inc;
      cameraCtl.setMode('insertion', 'Jupiter');
      measure(`${name} inc${inc}`);
    }
  }
  return rows;
});

for (const r of res) {
  // Acceptable framing: the planet's center is near the view center, OR
  // the planet is so close that its disk covers the view center (the
  // low-altitude horizon view). Never small-in-a-corner.
  const framed = (r.offCenter <= 0.4 || r.ndcRadius > r.offCenter + 0.1) && !r.behind;
  check(`${r.label}: planet framed (off ${r.offCenter}, disk r ${r.ndcRadius})`, framed, JSON.stringify(r.ndc));
}
const sys0 = res.find((r) => r.label === 'system inc0');
check('system-view entry: planet fills ~half the view (>= 20°)',
  sys0.angDiaDeg >= 20, `${sys0.angDiaDeg}°`);

// Visual: the reported scenario — enter insertion at 0° from system view.
await page.evaluate(() => {
  const { cameraCtl } = window.__sse;
  cameraCtl.setMode('system');
  for (let i = 0; i < 30; i++) cameraCtl.update(0.05);
  cameraCtl.ins.incDeg = 0;
  cameraCtl.setMode('insertion', 'Jupiter');
  for (let i = 0; i < 40; i++) cameraCtl.update(0.05);
});
await new Promise((r) => setTimeout(r, 1200));
await page.screenshot({ path: `${OUT}insertion-entry.png` });

console.log(`\n${pass} passed, ${fail} failed; errors: ${errors.length}`);
if (errors.length) console.log(errors.slice(0, 4).join('\n'));
await browser.close();
process.exit(fail || errors.length ? 1 : 0);
