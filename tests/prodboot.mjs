// Production-build probe: every system boots with zero console errors and
// the loading screen completes (no __sse in prod — DOM/console only).
import puppeteer from 'puppeteer-core';
import { readFileSync } from 'fs';

const VERSION = JSON.parse(readFileSync('package.json', 'utf8')).version;

const CHROME = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const BASE = process.env.PROBE_URL || 'http://localhost:4173';

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: 'new',
  args: ['--use-gl=angle', '--enable-unsafe-swiftshader', '--window-size=1280,800'],
});
let fail = 0;
for (const sys of ['sun', 'jupiter', 'earth', 'mars', 'saturn', 'mercury', 'venus', 'uranus', 'neptune', 'pluto']) {
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  try {
    await page.goto(`${BASE}/?system=${sys}`, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(
      'document.getElementById("loading-screen").classList.contains("done")', { timeout: 90000 });
    const ver = await page.evaluate(() =>
      document.getElementById('loading-version')?.textContent || '');
    const ok = errors.length === 0 && ver.includes(VERSION);
    console.log(`${ok ? '  ok' : 'FAIL'}  ${sys}  ${ver}  errors=${errors.length}${errors.length ? ' | ' + errors.slice(0, 2).join(' | ') : ''}`);
    if (!ok) fail++;
  } catch (e) {
    console.log(`FAIL  ${sys}  ${String(e).slice(0, 120)}`);
    fail++;
  }
  await page.close();
}
await browser.close();
console.log(fail ? `${fail} FAILED` : 'ALL SYSTEMS OK');
process.exit(fail ? 1 : 0);
