// Sharpness-pass visual verification: screenshots at spec altitudes.
// Settles transitions via cameraCtl.update() (headless ~4 fps).
import puppeteer from 'puppeteer-core';
import { mkdirSync } from 'fs';

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const URL = process.env.SMOKE_URL || 'http://localhost:5175';
const OUT = new globalThis.URL('./shots/', import.meta.url).pathname.slice(1);
mkdirSync(OUT, { recursive: true });

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: 'new',
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
// Let the hi-res Jupiter texture swap land.
await new Promise((r) => setTimeout(r, 5000));

const SHOTS = [
  ['jupiter-50000', 'Jupiter', 50000], ['jupiter-20000', 'Jupiter', 20000],
  ['jupiter-5000', 'Jupiter', 5000], ['jupiter-1500', 'Jupiter', 1500],
  ['europa-10000', 'Europa', 10000], ['europa-500', 'Europa', 500],
  ['io-5000', 'Io', 5000], ['io-500', 'Io', 500],
  ['ganymede-800', 'Ganymede', 800],
  ['callisto-500', 'Callisto', 500],
];

for (const [name, body, altKm] of SHOTS) {
  await page.evaluate(({ body, altKm }) => {
    const { cameraCtl, renderer, physics } = window.__sse;
    cameraCtl.setMode('orbit', body);
    cameraCtl.orbSpeedMult = 0; // hold position for the shot
    const entry = renderer.bodyMeshes.get(body);
    cameraCtl.orbDist = entry.radiusUnits + altKm / 1000;
    cameraCtl.distTween = null;
    // Face the lit side: put the camera on the sun side of the body.
    const d = renderer.sunDir;
    cameraCtl.orbTheta = Math.atan2(d.z, d.x);
    cameraCtl.orbPhi = Math.PI / 2 - 0.15;
    for (let i = 0; i < 60; i++) cameraCtl.update(0.05); // settle blend
    renderer.update(physics, 0.016, 1);
  }, { body, altKm });
  await new Promise((r) => setTimeout(r, 1200)); // let a few frames render
  await page.screenshot({ path: `${OUT}${name}.png` });
  console.log(`shot ${name}`);
}

const shaderErrors = errors.filter((e) => /shader|program|glsl|compile/i.test(e));
console.log(`\nconsole errors: ${errors.length} (shader-related: ${shaderErrors.length})`);
if (errors.length) console.log(errors.slice(0, 6).join('\n---\n'));
await browser.close();
process.exit(shaderErrors.length ? 1 : 0);
