// 2c verification: zoom to the floor over Metis/Adrastea — no hole, no facets.
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
await new Promise((r) => setTimeout(r, 2000));

for (const body of ['Metis', 'Adrastea']) {
  const res = await page.evaluate((body) => {
    const { cameraCtl, renderer, physics } = window.__sse;
    physics.setTimeIndex(0);
    cameraCtl.setMode('orbit', body);
    cameraCtl.orbSpeedMult = 0;
    cameraCtl.distTween = null;
    for (let i = 0; i < 500; i++) cameraCtl._pinch(400); // zoom in hard
    for (let i = 0; i < 60; i++) cameraCtl.update(0.05);
    renderer.update(physics, 0.016, 1);
    const entry = renderer.bodyMeshes.get(body);
    return {
      altKm: (cameraCtl.orbDist - entry.radiusUnits) * 1000,
      segs: entry.mesh.geometry.parameters.widthSegments,
    };
  }, body);
  await new Promise((r) => setTimeout(r, 1000));
  await page.screenshot({ path: `${OUT}floor-${body.toLowerCase()}.png` });
  console.log(`${body}: alt=${res.altKm.toFixed(1)} km, segments=${res.segs}`);
}
console.log(`errors: ${errors.length}`);
if (errors.length) console.log(errors.slice(0, 4).join('\n'));
await browser.close();
