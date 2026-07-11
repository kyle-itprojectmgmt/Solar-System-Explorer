// 3a/3b verification: expanded body cards; no GRS button on Jupiter card.
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
await page.waitForFunction('window.__sse && window.__sse.physics', { timeout: 60000 });
await page.waitForFunction(
  'document.getElementById("loading-screen").classList.contains("done")', { timeout: 60000 });
await new Promise((r) => setTimeout(r, 1500));

for (const body of ['Jupiter', 'Io', 'Metis']) {
  const res = await page.evaluate((body) => {
    const btns = [...document.querySelectorAll('.side-panel .btn')];
    btns.find((b) => b.textContent === body)?.click();
    const panel = document.querySelector('.info-panel');
    // Expand More Info if present
    panel.querySelector('.info-more-btn')?.click();
    return {
      hasGrsButton: [...panel.querySelectorAll('button')]
        .some((b) => /Great Red Spot/.test(b.textContent)),
      insPanelGrs: [...document.querySelectorAll('.insertion-panel button')]
        .some((b) => /Great Red Spot/.test(b.textContent)),
      badge: panel.querySelector('.info-badge')?.textContent,
      features: panel.querySelectorAll('.info-features li').length,
      moreRows: panel.querySelectorAll('.info-more dt').length,
    };
  }, body);
  await new Promise((r) => setTimeout(r, 600));
  await page.screenshot({ path: `${OUT}card-${body.toLowerCase()}.png` });
  console.log(`${body}: ${JSON.stringify(res)}`);
}
console.log(`errors: ${errors.length}`);
if (errors.length) console.log(errors.slice(0, 4).join('\n'));
await browser.close();
