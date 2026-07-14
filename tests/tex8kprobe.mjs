// v10.0.5 texture probe: on a production build (no __sse), confirm the
// progressive diffuse_8k swap actually fires — network-level assertion that
// diffuse_8k.jpg loads with 200 and the expected byte size — and that the
// three dead textures (clouds/night/specular) are never requested.
import puppeteer from 'puppeteer-core';

const CHROME = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const BASE = process.env.PROBE_URL || 'http://localhost:4173';

const browser = await puppeteer.launch({
  executablePath: CHROME, headless: 'new',
  args: ['--use-gl=angle', '--enable-unsafe-swiftshader', '--window-size=1280,800'],
});
const page = await browser.newPage();
const texHits = [];
page.on('response', (r) => {
  if (/textures\/earth\//.test(r.url())) {
    texHits.push({ url: r.url().split('/').pop(), status: r.status(),
      len: +(r.headers()['content-length'] || 0) });
  }
});
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });

await page.goto(`${BASE}/?system=earth`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(
  'document.getElementById("loading-screen").classList.contains("done")', { timeout: 90000 });
// The 8K swap is outside the loading manager — give it time to stream 5.8MB.
await new Promise((r) => setTimeout(r, 15000));

console.log('earth texture requests:', JSON.stringify(texHits, null, 1));
let fail = 0;
const check = (n, ok, d = '') => {
  if (ok) console.log(`  ok  ${n}`); else { fail++; console.log(`FAIL  ${n} ${d}`); }
};
const hit = (f) => texHits.find((t) => t.url === f);
check('diffuse.jpg loaded (boot map)', hit('diffuse.jpg')?.status === 200);
check('diffuse_8k.jpg loaded (progressive swap fired)', hit('diffuse_8k.jpg')?.status === 200,
  JSON.stringify(hit('diffuse_8k.jpg')));
check('diffuse_8k.jpg is the new 5.8MB file (not the old 4.4MB)',
  (hit('diffuse_8k.jpg')?.len ?? 0) > 5_500_000, `len=${hit('diffuse_8k.jpg')?.len}`);
check('normal.jpg loaded (v10.0.6 terrain relief)', hit('normal.jpg')?.status === 200,
  JSON.stringify(hit('normal.jpg')));
check('night.jpg loaded (v10.0.6 Black Marble lights)', hit('night.jpg')?.status === 200,
  JSON.stringify(hit('night.jpg')));
check('no dead-texture requests (clouds/specular)',
  !texHits.some((t) => /clouds|specular/.test(t.url)));
const realErrors = errors.filter((e) => !/favicon/i.test(e));
check('zero console errors', realErrors.length === 0, realErrors.slice(0, 3).join(' | '));

await browser.close();
console.log(fail ? `${fail} FAILED` : 'PASS');
process.exit(fail ? 1 : 0);
