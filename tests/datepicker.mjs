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

  // Open picker, type a year, pick day 15 — V5.1.2: a day click only
  // HIGHLIGHTS; Apply commits date + time together.
  document.querySelector('.ghost-date').click();
  const dp = document.querySelector('.date-picker');
  out.pickerOpen = dp.style.display !== 'none';
  out.timePrefilled = /^\d\d:\d\d(:\d\d)?$/.test(dp.querySelector('.dp-time').value);
  const yearInput = dp.querySelector('.dp-year');
  yearInput.value = 1994; // comet SL9 year
  yearInput.dispatchEvent(new Event('change'));
  out.title1994 = dp.querySelector('.dp-title').textContent.includes('1994');
  const day15 = [...dp.querySelectorAll('.dp-day')].find((b) => b.textContent === '15');
  day15.click();
  out.stillOpenAfterDayClick = dp.style.display !== 'none';
  out.daySelected = [...dp.querySelectorAll('.dp-day')]
    .find((b) => b.textContent === '15').classList.contains('selected');
  out.notJumpedYet = Math.abs(physics.simSeconds - simBefore) < 60;
  dp.querySelector('.dp-apply').click();
  out.pickerClosed = dp.style.display === 'none';
  out.jumpedYears = Math.abs(physics.simSeconds - simBefore) > 86400 * 365 * 10;
  out.moonMoved = Math.abs(moonAngle() - angBefore) > 1e-3;
  out.simDate = physics.simDate.toISOString().slice(0, 10);

  // Combined date + time: Apollo 11 landing == the system epoch, so
  // 1969-07-20 + 20:17:00 must land at simSeconds ~ 0 exactly.
  document.querySelector('.ghost-date').click();
  yearInput.value = 1969;
  yearInput.dispatchEvent(new Event('change'));
  const navs = dp.querySelectorAll('.dp-nav'); // [<<, <, >, >>]
  for (let i = 0; i < 24
    && !dp.querySelector('.dp-title').textContent.startsWith('July'); i++) {
    navs[2].click();
  }
  out.title1969 = dp.querySelector('.dp-title').textContent === 'July 1969';
  dp.querySelector('.dp-time').value = '20:17:00';
  [...dp.querySelectorAll('.dp-day')].find((b) => b.textContent === '20').click();
  dp.querySelector('.dp-apply').click();
  // (Runs on the default Jupiter system — compare against ITS epoch.)
  const apolloS = (Date.parse('1969-07-20T20:17:00Z') - physics.epochMs) / 1000;
  out.apolloExact = Math.abs(physics.simSeconds - apolloS) < 1;
  out.apolloSimSeconds = +physics.simSeconds.toFixed(1);

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
  // Simulate a tab-hidden stall: knock the LIVE clock 2 h behind the wall
  // clock. The wall-clock drift check must snap it back within a frame
  // (the old accumulated-dt timer took 60 s of ACTIVE tab time).
  physics.jumpToSimSeconds(physics.simSeconds - 7200);
  return out;
});
await new Promise((r) => setTimeout(r, 600));
const after2 = await page.evaluate(() => {
  const { physics } = window.__sse;
  const out = {};
  out.stallRecovered = Math.abs(
    physics.epochMs + physics.simSeconds * 1000 - Date.now()) < 5000;
  document.querySelector('.ghost-live').click(); // off
  out.liveOff = !document.querySelector('.ghost-live').classList.contains('on');
  return out;
});
await page.screenshot({ path: `${OUT}ghost-time.png` });
const all = { ...res, ...after, ...after2 };
console.log(JSON.stringify(all, null, 1));
console.log(`errors: ${errors.length}`);
if (errors.length) console.log(errors.slice(0, 4).join('\n'));
await browser.close();
const MUST = ['ghost', 'pickerOpen', 'timePrefilled', 'title1994',
  'stillOpenAfterDayClick', 'daySelected', 'notJumpedYet', 'pickerClosed',
  'jumpedYears', 'moonMoved', 'title1969', 'apolloExact', 'liveOn',
  'liveLocked', 'liveSaved', 'lockRestored', 'stallRecovered', 'liveOff'];
const failed = MUST.filter((k) => !all[k]);
console.log(failed.length || errors.length
  ? `FAIL: ${failed.join(', ')}` : 'PASS');
process.exit(failed.length || errors.length ? 1 : 0);
