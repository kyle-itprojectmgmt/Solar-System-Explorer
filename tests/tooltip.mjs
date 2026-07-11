// Group 4 verification: tooltips appear after ~500ms hover with correct text.
import puppeteer from 'puppeteer-core';

const CHROME = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const URL = process.env.SMOKE_URL || 'http://localhost:5175';

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

let pass = 0, fail = 0;
async function hoverCheck(selector, expectRe, label) {
  const ok = await page.evaluate(async ({ selector, expectSrc }) => {
    const el = document.querySelector(selector);
    if (!el) return `no element ${selector}`;
    const r = el.getBoundingClientRect();
    el.dispatchEvent(new MouseEvent('mouseenter', { clientX: r.x + 4, clientY: r.y + 4, bubbles: false }));
    await new Promise((res) => setTimeout(res, 700));
    const tip = document.querySelector('.sse-tooltip');
    const shown = tip.style.display === 'block';
    const text = tip.textContent;
    const inView = parseFloat(tip.style.left) >= 0 && parseFloat(tip.style.left) <= innerWidth - 200;
    el.dispatchEvent(new MouseEvent('mouseleave'));
    const hidden = tip.style.display === 'none';
    if (!shown) return 'not shown';
    if (!new RegExp(expectSrc).test(text)) return `wrong text: ${text}`;
    if (!inView) return 'off-screen';
    if (!hidden) return 'did not hide';
    return true;
  }, { selector, expectSrc: expectRe.source });
  if (ok === true) { pass++; console.log(`  ok  ${label}`); }
  else { fail++; console.log(`FAIL  ${label}: ${ok}`); }
}

await hoverCheck('[data-cam-mode="orbit"]', /Orbit around a body/, 'camera mode tooltip');
await hoverCheck('[data-audio-mode="voyager"]', /plasma wave/, 'audio mode tooltip');
await hoverCheck('[data-time-index="5"]', /10,000× faster/, 'time button tooltip');
await hoverCheck('.brand-spotify', /Spotify playlist/, 'spotify tooltip');
await hoverCheck('.fs-btn', /fullscreen/i, 'fullscreen tooltip');
await hoverCheck('.presentation-btn', /Hide all UI/, 'presentation tooltip');
await hoverCheck('.kofi-btn', /Support this project/, 'ko-fi tooltip');

const titles = await page.evaluate(() =>
  [...document.querySelectorAll('[data-audio-mode], .fs-btn, .presentation-btn')]
    .filter((b) => b.hasAttribute('title')).length);
console.log(`native titles remaining on tooltipped controls: ${titles}`);
console.log(`\n${pass} passed, ${fail} failed; errors: ${errors.length}`);
await browser.close();
process.exit(fail || errors.length ? 1 : 0);
