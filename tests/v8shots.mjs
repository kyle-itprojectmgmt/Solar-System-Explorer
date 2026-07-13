// V8 visual verification — screenshots of the four new systems at spec
// altitudes (tests/shots/v8-*.png). Presentation mode off; UI visible is
// fine, the subject is the body rendering.
import puppeteer from 'puppeteer-core';
import { mkdirSync } from 'fs';

const CHROME = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const BASE = process.env.SMOKE_URL || 'http://localhost:5175';
mkdirSync('tests/shots', { recursive: true });

const browser = await puppeteer.launch({
  executablePath: CHROME, headless: 'new',
  args: ['--use-gl=angle', '--enable-unsafe-swiftshader', '--window-size=1280,800'],
});

const SHOTS = [
  { system: 'mercury', body: 'Mercury', altKm: 3000, name: 'mercury-3000' },
  { system: 'mercury', body: 'Mercury', altKm: 800, name: 'mercury-terminator-800', sunSide: false },
  { system: 'venus', body: 'Venus', altKm: 12000, name: 'venus-12000' },
  { system: 'uranus', body: 'Uranus', altKm: 120000, name: 'uranus-global-rings' },
  { system: 'uranus', body: 'Miranda', altKm: 300, name: 'miranda-300' },
  { system: 'neptune', body: 'Neptune', altKm: 30000, name: 'neptune-30000' },
  { system: 'neptune', body: 'Triton', altKm: 500, name: 'triton-500' },
];

let currentSystem = null, page = null;
for (const shot of SHOTS) {
  if (shot.system !== currentSystem) {
    if (page) await page.close();
    page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 800 });
    await page.goto(`${BASE}/?system=${shot.system}`, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction('window.__sse && window.__sse.physics', { timeout: 60000 });
    await page.waitForFunction(
      'document.getElementById("loading-screen").classList.contains("done")', { timeout: 60000 });
    await new Promise((r) => setTimeout(r, 2500));
    currentSystem = shot.system;
  }
  await page.evaluate((body, altKm) => {
    const { physics, renderer, cameraCtl, ui } = window.__sse;
    ui.setPresentation(true);
    physics.setTimeIndex(0);
    cameraCtl.setMode('orbit', body);
    cameraCtl.orbSpeedMult = 0;
    cameraCtl.setAltitudeDirect(altKm);
    for (let i = 0; i < 80; i++) cameraCtl.update(0.05);
    renderer.update(physics, 0.016, 1);
  }, shot.body, shot.altKm);
  await new Promise((r) => setTimeout(r, 1500));
  await page.screenshot({ path: `tests/shots/v8-${shot.name}.png` });
  console.log(`shot v8-${shot.name}.png`);
}
if (page) await page.close();
await browser.close();
