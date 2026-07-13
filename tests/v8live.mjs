// V8 live verification — all 8 systems on app.solarexplorer.co with
// cache-bust, zero console errors, v8.0.0 version, CSP header present.
import puppeteer from 'puppeteer-core';

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const BASE = 'https://app.solarexplorer.co';
const bust = Date.now();

let pass = 0, fail = 0;
const check = (n, ok, d = '') => {
  console.log(`${ok ? ' ok ' : 'FAIL'} ${n}${d ? ` — ${d}` : ''}`); ok ? pass++ : fail++;
};

// CSP header check
const res = await fetch(`${BASE}/?cb=${bust}`);
const csp = res.headers.get('content-security-policy') || '';
check('CSP header present on live', csp.includes("default-src 'self'"), csp.slice(0, 60));

// Served bundle carries v8 feature strings
const html = await res.text();
const mainJs = html.match(/assets\/main-[\w-]+\.js/)?.[0];
const js = await (await fetch(`${BASE}/${mainJs}?cb=${bust}`)).text();
check('live bundle: v8 detail styles present',
  ['hermes', 'aphrodite', 'ouranos', 'poseidon'].every((s) => js.includes(s)));

const browser = await puppeteer.launch({
  executablePath: CHROME, headless: 'new',
  args: ['--use-gl=angle', '--enable-unsafe-swiftshader', '--window-size=1280,800'],
});
for (const sys of ['jupiter', 'earth', 'mars', 'saturn', 'mercury', 'venus', 'uranus', 'neptune']) {
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto(`${BASE}/?system=${sys}&cb=${bust}`, { waitUntil: 'domcontentloaded' });
  try {
    await page.waitForFunction(
      'document.getElementById("loading-screen").classList.contains("done")', { timeout: 90000 });
    await new Promise((r) => setTimeout(r, 3000));
    const ver = await page.$eval('#loading-version', (e) => e.textContent);
    // The Cloudflare RUM beacon CSP block is known bug #62 — not a V8 regression.
    const real = errors.filter((e) => !e.includes('cloudflareinsights'));
    check(`${sys}: live at v8.0.1, zero console errors`,
      ver.includes('v8.0.1') && real.length === 0,
      `${ver.trim()} | ${real.slice(0, 2).join(' | ')}`);
  } catch (e) {
    check(`${sys}: live`, false, String(e).slice(0, 100));
  }
  await page.close();
}
await browser.close();
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
