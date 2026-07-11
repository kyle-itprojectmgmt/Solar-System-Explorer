// 3e verification: resonance lines, alignment detection, HUD readout.
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
await page.waitForFunction('window.__sse', { timeout: 60000 });
await page.waitForFunction(
  'document.getElementById("loading-screen").classList.contains("done")', { timeout: 60000 });
await new Promise((r) => setTimeout(r, 1500));

const res = await page.evaluate(() => {
  const { cameraCtl, renderer, physics } = window.__sse;
  cameraCtl.setMode('system');
  // Enable the resonance checkbox like a user would.
  const rows = [...document.querySelectorAll('.toggle-row')];
  const resRow = rows.find((r) => /Resonance/.test(r.textContent));
  const cb = resRow.querySelector('input');
  if (!cb.checked) cb.click();
  for (let i = 0; i < 40; i++) cameraCtl.update(0.05);
  renderer.update(physics, 0.016, 1);

  const visible = renderer.resonance.visible;
  const startPct = renderer.resonanceInfo.pct;

  // Drive sim time at 10,000x until an Io–Europa pair conjunction pulses.
  physics.setTimeIndex(5);
  let pulsed = false, steps = 0, elapsed = 1;
  const pulseColors = [];
  while (steps < 4000 && !pulsed) {
    physics.update(0.05);
    elapsed += 0.05;
    if (steps % 5 === 0) {
      renderer.update(physics, 0.05, elapsed);
      for (const line of renderer.resonanceLines) {
        if (line.material.color.getHex() === 0x0077cc && line.material.opacity > 0.4) {
          pulsed = true;
          pulseColors.push(line.material.opacity.toFixed(2));
        }
      }
    }
    steps++;
  }
  physics.setTimeIndex(0);
  renderer.update(physics, 0.016, elapsed);
  const ui = document.querySelector('.resonance-hud');
  return {
    visible, startPct, pulsed, steps,
    hudText: ui?.textContent, hudVisible: ui?.style.display !== 'none',
    pct: renderer.resonanceInfo.pct,
  };
});
// One UI frame so the HUD text refreshes post-eval.
await new Promise((r) => setTimeout(r, 800));
const hud = await page.evaluate(() => document.querySelector('.resonance-hud')?.textContent);
console.log(JSON.stringify({ ...res, hudNow: hud }));
await page.screenshot({ path: `${OUT}resonance.png` });
console.log(`errors: ${errors.length}`);
if (errors.length) console.log(errors.slice(0, 4).join('\n'));
await browser.close();
