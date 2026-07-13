// Scratch: V10 visual calibration screenshots via the real preset flow.
import puppeteer from 'puppeteer-core';
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const OUT = process.env.SHOT_DIR || 'C:/Users/KYLEEW~1/AppData/Local/Temp/claude/C--dev-Solar-System-Explorer/72fe2cd1-929d-4e4f-9a95-0e3ab85da01f/scratchpad/shots';
import { mkdirSync } from 'fs';
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
await page.goto('http://localhost:5173/?system=pluto', { waitUntil: 'domcontentloaded' });
await page.waitForFunction('window.__sse && window.__sse.physics', { timeout: 60000 });
await page.waitForFunction(
  'document.getElementById("loading-screen").classList.contains("done")', { timeout: 60000 });
await page.evaluate(() => window.__sse.ui.setPresentation(true));

const settle = (n = 80) => page.evaluate((k) => {
  for (let i = 0; i < k; i++) window.__sse.cameraCtl.update(0.05);
}, n).then(() => new Promise((r) => setTimeout(r, 900)));

const clickPreset = (name) => page.evaluate((n) => {
  const rows = [...document.querySelectorAll('.preset-row')];
  const b = rows.find((r) => r.textContent.includes(n));
  if (!b) throw new Error('preset not found: ' + n);
  b.click();
}, name);

for (const [name, file, frames] of [
  ['The Heart', 'heart.png', 120],
  ['Pluto + Charon', 'binary.png', 120],
  ['Blue Haze Crescent', 'crescent.png', 140],
  ['Mordor Macula', 'mordor.png', 120],
]) {
  await clickPreset(name);
  await settle(frames);
  await page.screenshot({ path: `${OUT}/${file}` });
  console.log('shot', file);
}

// Close terrain pass: 400 km over the heart edge (mountains + cells).
await page.evaluate(() => {
  const { cameraCtl } = window.__sse;
  cameraCtl.setMode('insertion', 'Pluto');
  cameraCtl.setInsertion({ altitudeKm: 400, incDeg: 25 });
});
await settle(120);
await page.screenshot({ path: `${OUT}/close.png` });
console.log('shot close.png');

console.log('errors:', errors.length, errors.slice(0, 3));
await browser.close();
