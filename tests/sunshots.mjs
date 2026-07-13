// V9 visual calibration probe: screenshots of the Sun at spec vantage
// points for eyeball review. Writes tests/shots/sun-*.png.
// Run against `npm run dev`.
import puppeteer from 'puppeteer-core';
import { mkdirSync } from 'fs';

const CHROME = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const BASE = process.env.SMOKE_URL || 'http://localhost:5173';
mkdirSync(new URL('./shots', import.meta.url), { recursive: true });

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: 'new',
  args: ['--use-gl=angle', '--enable-unsafe-swiftshader', '--window-size=1280,800'],
});
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('PAGEERROR', String(e).slice(0, 200)));
await page.goto(`${BASE}/?system=sun`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction('window.__sse && window.__sse.physics', { timeout: 60000 });
await page.waitForFunction(
  'document.getElementById("loading-screen").classList.contains("done")', { timeout: 60000 });

// Presentation mode: clean frames.
await page.evaluate(() => window.__sse.ui.setPresentation(true));

async function settle(frames = 40) {
  await page.evaluate((n) => {
    const { cameraCtl } = window.__sse;
    for (let i = 0; i < n; i++) cameraCtl.update(0.05);
  }, frames);
  await new Promise((r) => setTimeout(r, 700)); // let a few real frames render
}

async function shot(name) {
  await page.screenshot({ path: new URL(`./shots/${name}.png`, import.meta.url).pathname.slice(1) });
  console.log(`shot: ${name}`);
}

// Force full sunspot visibility fast: activity 1.0, run wall-clock blends.
await page.evaluate(() => {
  window.__sse.ui.activitySlider.value = '1';
  window.__sse.ui.activitySlider.oninput();
});
await new Promise((r) => setTimeout(r, 2500)); // spot spawn blend ~1.5 s wall

// 1. Corona view — insertion 500,000 km.
await page.evaluate(() => {
  const { cameraCtl } = window.__sse;
  cameraCtl.setMode('insertion', 'Sun');
  cameraCtl.setInsertion({ body: 'Sun', altitudeKm: 500000, incDeg: 20, locked: false });
});
await settle();
await shot('sun-corona-500k');

// 2. Photosphere close-up — 100,000 km.
await page.evaluate(() => {
  window.__sse.cameraCtl.setInsertion({ altitudeKm: 100000, incDeg: 0 });
});
await settle();
await shot('sun-photosphere-100k');

// 3. Mid view — 250,000 km (granulation + spots + limb darkening).
await page.evaluate(() => {
  window.__sse.cameraCtl.setInsertion({ altitudeKm: 250000 });
});
await settle();
await shot('sun-mid-250k');

// 4. Solar-minimum comparison at 500,000 km (polar plumes, no spots).
await page.evaluate(() => {
  window.__sse.ui.activitySlider.value = '0';
  window.__sse.ui.activitySlider.oninput();
});
await new Promise((r) => setTimeout(r, 2500));
await page.evaluate(() => {
  window.__sse.cameraCtl.setInsertion({ altitudeKm: 500000, incDeg: 75 });
});
await settle();
await shot('sun-minimum-polar-500k');

// 5. Wide view — 2,000,000 km (full corona extent against the starfield).
await page.evaluate(() => {
  window.__sse.ui.activitySlider.value = '0.75';
  window.__sse.ui.activitySlider.oninput();
  window.__sse.cameraCtl.setInsertion({ altitudeKm: 2000000, incDeg: 0 });
});
await settle();
await shot('sun-wide-2m');

await browser.close();
console.log('done');
