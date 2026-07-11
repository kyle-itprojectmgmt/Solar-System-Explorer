// G3/G4 verification: bottom tray + audio flyout.
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

const res = await page.evaluate(() => {
  const out = {};
  const tray = document.querySelector('.bottom-tray');
  out.tray = !!tray;
  out.trayButtons = tray.querySelectorAll('.tray-btn').length; // music, shot, eye, kofi
  out.trayVol = !!tray.querySelector('.tray-vol');
  // Music flyout
  tray.querySelector('.tray-music').click();
  const fly = document.querySelector('.audio-flyout');
  out.flyoutOpen = fly.style.display !== 'none';
  out.genOptions = fly.querySelectorAll('.af-select option').length;
  out.streamRows = fly.querySelectorAll('.af-stream').length;
  // Generative mode via dropdown
  const sel = fly.querySelector('.af-select');
  sel.value = 'voyager';
  sel.dispatchEvent(new Event('change'));
  out.musicGlow = tray.querySelector('.tray-music').classList.contains('audio-active');
  // Spotify row expands
  const spHead = fly.querySelector('.af-stream-head.brand-spotify');
  spHead.click();
  out.spotifyExpanded = spHead.parentElement.querySelector('.af-stream-body').style.display !== 'none';
  // Mute toggle
  const mute = fly.querySelectorAll('.af-row .tray-btn')[0];
  mute.click();
  out.mutedVol = window.__sse ? +document.querySelector('.tray-vol').value : -1;
  mute.click();
  out.unmutedVol = +document.querySelector('.tray-vol').value;
  // Escape closes
  window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Escape', bubbles: true }));
  out.escClosed = fly.style.display === 'none';
  // Presentation via tray eye: everything hides except the eye
  const eye = tray.querySelector('[data-tray="presentation"]');
  eye.click();
  out.presOn = document.body.classList.contains('presentation-mode');
  out.eyeVisible = eye.checkVisibility();
  out.musicHidden = !tray.querySelector('.tray-music').checkVisibility();
  out.hudHidden = !document.querySelector('.hud-topleft').checkVisibility();
  out.eyeSlash = eye.textContent === '🚫';
  eye.click();
  out.presOff = !document.body.classList.contains('presentation-mode');
  return out;
});
console.log(JSON.stringify(res, null, 1));
await page.screenshot({ path: `${OUT}tray.png` });
console.log(`errors: ${errors.length}`);
if (errors.length) console.log(errors.slice(0, 4).join('\n'));
await browser.close();
