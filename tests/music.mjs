// 3c/3d verification: brand icons, embed flow, collapse persistence.
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
await page.goto(URL, { waitUntil: 'domcontentloaded' });
await page.waitForFunction('window.__sse', { timeout: 60000 });
await page.waitForFunction(
  'document.getElementById("loading-screen").classList.contains("done")', { timeout: 60000 });

const r1 = await page.evaluate(() => {
  const sp = document.querySelector('.brand-spotify');
  const yt = document.querySelector('.brand-youtube');
  const spSvg = !!sp?.querySelector('svg');
  const ytSvg = !!yt?.querySelector('svg');
  sp.click(); // opens the drawer via onEmbedRequest
  const drawer = document.querySelector('.embed-drawer');
  const expanded = !drawer.classList.contains('collapsed');
  const input = drawer.querySelector('.embed-input');
  input.value = 'https://open.spotify.com/playlist/37i9dQZF1DX4sWSpwq3LiO';
  drawer.querySelector('.btn').click(); // Load
  const iframe = drawer.querySelector('iframe');
  const src = iframe?.src || '';
  // collapse + persist
  drawer.querySelector('.embed-head').click();
  return {
    spSvg, ytSvg, expanded,
    embedOk: /open\.spotify\.com\/embed\/playlist\/37i9dQZF1DX4sWSpwq3LiO/.test(src),
    collapsedSaved: localStorage.getItem('sse-music-collapsed'),
    collapsedNow: drawer.classList.contains('collapsed'),
    volumeVisible: !!document.querySelector('.vol-slider'),
  };
});
console.log('spotify flow:', JSON.stringify(r1));
await page.screenshot({ path: `${OUT}music-collapsed.png` });

// Reload: collapse state must persist; youtube embed must work.
await page.reload({ waitUntil: 'domcontentloaded' });
await page.waitForFunction('window.__sse', { timeout: 60000 });
await page.waitForFunction(
  'document.getElementById("loading-screen").classList.contains("done")', { timeout: 60000 });
const r2 = await page.evaluate(() => {
  document.querySelector('.brand-youtube').click();
  const drawer = document.querySelector('.embed-drawer');
  const collapsedAfterReload = drawer.classList.contains('collapsed');
  const input = drawer.querySelector('.embed-input');
  input.value = 'https://www.youtube.com/playlist?list=PLOzDu-MXXLliO9fBNZOQTBDddoA3FzZUo';
  drawer.querySelector('.btn').click();
  const src = drawer.querySelector('iframe')?.src || '';
  return {
    collapsedAfterReload,
    ytEmbedOk: /youtube\.com\/embed\/videoseries\?list=PLOzDu/.test(src),
  };
});
console.log('youtube flow:', JSON.stringify(r2));
console.log(`errors: ${errors.length}`);
if (errors.length) console.log(errors.slice(0, 4).join('\n'));
await browser.close();
