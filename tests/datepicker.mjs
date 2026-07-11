// G5 verification: ghost time text, date picker, LIVE toggle.
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
  const { physics, renderer } = window.__sse;
  const out = {};
  out.ghost = !!document.querySelector('.hud-ghost');
  out.noOldPanel = !document.querySelector('.hud-topleft');
  out.dateText = document.querySelector('.ghost-date').textContent;

  const moonAngle = () => {
    const b = physics.getBody('Io');
    return Math.atan2(-b.pos.z, b.pos.x);
  };
  const angBefore = moonAngle();
  const simBefore = physics.simSeconds;

  // Open picker, type a year, pick day 15.
  document.querySelector('.ghost-date').click();
  const dp = document.querySelector('.date-picker');
  out.pickerOpen = dp.style.display !== 'none';
  const yearInput = dp.querySelector('.dp-year');
  yearInput.value = 1994; // comet SL9 year
  yearInput.dispatchEvent(new Event('change'));
  out.title1994 = dp.querySelector('.dp-title').textContent.includes('1994');
  const day15 = [...dp.querySelectorAll('.dp-day')].find((b) => b.textContent === '15');
  day15.click();
  out.pickerClosed = dp.style.display === 'none';
  out.jumpedYears = Math.abs(physics.simSeconds - simBefore) > 86400 * 365 * 10;
  out.dateShows1994 = false; // set after a UI frame below
  out.moonMoved = Math.abs(moonAngle() - angBefore) > 1e-3;
  out.simDate = physics.simDate.toISOString().slice(0, 10);

  // LIVE toggle
  document.querySelector('.ghost-live').click();
  out.liveOn = document.querySelector('.ghost-live').classList.contains('on');
  out.liveYear = physics.simDate.getUTCFullYear();
  out.liveLocked = physics.timeIndex === 1;
  out.liveSaved = localStorage.getItem('sse-live-mode') === '1';
  physics.setTimeIndex(5); // try to break the lock — update() must restore it
  return out;
});
await new Promise((r) => setTimeout(r, 1200)); // a few UI frames
const after = await page.evaluate(() => {
  const { physics } = window.__sse;
  const out = {};
  out.lockRestored = physics.timeIndex === 1;
  document.querySelector('.ghost-live').click(); // off
  out.liveOff = !document.querySelector('.ghost-live').classList.contains('on');
  return out;
});
await page.screenshot({ path: `${OUT}ghost-time.png` });
console.log(JSON.stringify({ ...res, ...after }, null, 1));
console.log(`errors: ${errors.length}`);
if (errors.length) console.log(errors.slice(0, 4).join('\n'));
await browser.close();
