// 2b verification: moon limb glows must be lit-side only.
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
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
await page.goto(URL, { waitUntil: 'domcontentloaded' });
await page.waitForFunction('window.__sse && window.__sse.physics', { timeout: 60000 });
await page.waitForFunction(
  'document.getElementById("loading-screen").classList.contains("done")', { timeout: 60000 });
await new Promise((r) => setTimeout(r, 2500));

for (const [body, offset, tag] of [
  ['Ganymede', 0, 'day'], ['Ganymede', Math.PI, 'night'],
  ['Io', 1.5, 'terminator'], ['Europa', 0, 'day'],
]) {
  await page.evaluate(({ body, offset }) => {
    const { cameraCtl, renderer, physics } = window.__sse;
    physics.setTimeIndex(0);
    cameraCtl.setMode('orbit', body);
    cameraCtl.orbSpeedMult = 0;
    const entry = renderer.bodyMeshes.get(body);
    cameraCtl.orbDist = entry.radiusUnits * 3.0;
    cameraCtl.distTween = null;
    const d = renderer.sunDir;
    cameraCtl.orbTheta = Math.atan2(d.z, d.x) + offset;
    cameraCtl.orbPhi = Math.PI / 2;
    for (let i = 0; i < 60; i++) cameraCtl.update(0.05);
    renderer.update(physics, 0.016, 1);
  }, { body, offset });
  await new Promise((r) => setTimeout(r, 1000));
  await page.screenshot({ path: `${OUT}halo-${body.toLowerCase()}-${tag}.png` });
  console.log(`shot halo-${body.toLowerCase()}-${tag}`);
}
console.log(`errors: ${errors.length}`);
if (errors.length) console.log(errors.slice(0, 4).join('\n'));
await browser.close();
