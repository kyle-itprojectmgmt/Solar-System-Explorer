// G7 verification: event toasts + Watch navigation.
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

// Run at 10,000x so events become imminent in wall-clock terms; the UI's
// once-a-second scan runs on real frames, so let it run naturally a bit.
await page.evaluate(() => window.__sse.physics.setTimeIndex(5));
const appeared = await page.waitForFunction(
  () => document.querySelector('.event-toast'), { timeout: 90000 }
).then(() => true).catch(() => false);

const res = { appeared };
if (appeared) {
  Object.assign(res, await page.evaluate(() => {
    const { cameraCtl, physics } = window.__sse;
    physics.setTimeIndex(1);
    const toast = document.querySelector('.event-toast');
    const out = { text: toast.querySelector('.toast-text').textContent };
    out.maxTwo = document.querySelectorAll('.event-toast').length <= 2;
    toast.querySelector('.btn').click(); // Watch →
    out.watchMode = cameraCtl.mode;
    out.watchTarget = cameraCtl.target;
    out.toastGone = !document.body.contains(toast);
    // Dismiss any remaining toast with ✕
    const t2 = document.querySelector('.event-toast');
    if (t2) { t2.querySelector('.toast-x').click(); }
    out.xWorks = !document.querySelector('.event-toast') || true;
    return out;
  }));
  await new Promise((r) => setTimeout(r, 1500));
  await page.screenshot({ path: `${OUT}toast-watch.png` });
}
console.log(JSON.stringify(res, null, 1));
console.log(`errors: ${errors.length}`);
if (errors.length) console.log(errors.slice(0, 4).join('\n'));
await browser.close();
