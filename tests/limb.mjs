// 4b limb glow verification: Jupiter disk from day / terminator / night.
import puppeteer from 'puppeteer-core';
import { mkdirSync } from 'fs';

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
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
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });

await page.goto(URL, { waitUntil: 'domcontentloaded' });
await page.waitForFunction('window.__sse && window.__sse.physics', { timeout: 60000 });
await page.waitForFunction(
  'document.getElementById("loading-screen").classList.contains("done")', { timeout: 60000 });
await new Promise((r) => setTimeout(r, 3000));

const VIEWS = [
  ['limb-day', 0],            // camera on sun side: lit disk face-on
  ['limb-terminator', 1.5],   // side view: terminator down the middle
  ['limb-night', Math.PI],    // anti-sun: night side, glow should vanish
  ['limb-insertion', null],   // horizon view from 20,000 km insertion
];

for (const [name, offset] of VIEWS) {
  await page.evaluate(({ offset }) => {
    const { cameraCtl, renderer, physics } = window.__sse;
    if (offset === null) {
      cameraCtl.setMode('insertion', 'Jupiter');
      cameraCtl.setInsertion({ body: 'Jupiter', altitudeKm: 20000, incDeg: 0, locked: false });
      cameraCtl.ins.pitch = -0.35; // toward the horizon
    } else {
      cameraCtl.setMode('orbit', 'Jupiter');
      cameraCtl.orbSpeedMult = 0;
      const entry = renderer.bodyMeshes.get('Jupiter');
      cameraCtl.orbDist = entry.radiusUnits * 3.2;
      cameraCtl.distTween = null;
      const d = renderer.sunDir;
      cameraCtl.orbTheta = Math.atan2(d.z, d.x) + offset;
      cameraCtl.orbPhi = Math.PI / 2;
    }
    for (let i = 0; i < 60; i++) cameraCtl.update(0.05);
    renderer.update(physics, 0.016, 1);
  }, { offset });
  await new Promise((r) => setTimeout(r, 1200));
  await page.screenshot({ path: `${OUT}${name}.png` });
  console.log(`shot ${name}`);
}
console.log(`errors: ${errors.length}`);
if (errors.length) console.log(errors.slice(0, 4).join('\n'));
await browser.close();
