// V10 Pluto screenshot calibration probes — the five signature views, taken
// through the real preset flow. Output to tests/shots/ (gitignored) or
// SHOT_DIR. Companion to plutotest.mjs; eyeball pass tool for bug #67-class
// hardware review.
import puppeteer from 'puppeteer-core';
import { mkdirSync } from 'fs';

const CHROME = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const BASE = process.env.SMOKE_URL || 'http://localhost:5173';
const OUT = process.env.SHOT_DIR || 'tests/shots';
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
await page.goto(`${BASE}/?system=pluto`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction('window.__sse && window.__sse.physics', { timeout: 60000 });
await page.waitForFunction(
  'document.getElementById("loading-screen").classList.contains("done")', { timeout: 60000 });

const settle = (n = 100) => page.evaluate((k) => {
  for (let i = 0; i < k; i++) window.__sse.cameraCtl.update(0.05);
}, n).then(() => new Promise((r) => setTimeout(r, 900)));

// Settled boot shot first (lit-hemisphere rule).
await settle(60);
await page.screenshot({ path: `${OUT}/pluto-boot.png` });
console.log('shot pluto-boot.png');

await page.evaluate(() => window.__sse.ui.setPresentation(true));
const clickPreset = (name) => page.evaluate((n) => {
  const b = [...document.querySelectorAll('.preset-row')].find((r) => r.textContent.includes(n));
  if (!b) throw new Error('preset not found: ' + n);
  b.click();
}, name);

for (const [name, file, frames] of [
  ['The Heart', 'pluto-heart.png', 120],
  ['Pluto + Charon', 'pluto-binary.png', 120],
  ['Blue Haze Crescent', 'pluto-crescent.png', 140],
  ['Mordor Macula', 'charon-mordor.png', 120],
]) {
  await clickPreset(name);
  await settle(frames);
  await page.screenshot({ path: `${OUT}/${file}` });
  console.log('shot', file);
}

// Terrain close-up: 400 km over the heart's edge (mosaic cells + mountains).
await page.evaluate(() => {
  const { ui, cameraCtl } = window.__sse;
  cameraCtl.flyToFeature('Pluto', { ...ui.system.primary.navPresets[0], altitudeKm: 400 });
});
await settle(160);
await page.screenshot({ path: `${OUT}/pluto-close.png` });
console.log('shot pluto-close.png');

console.log('errors:', errors.length, errors.slice(0, 3));
await browser.close();
process.exit(errors.length ? 1 : 0);
