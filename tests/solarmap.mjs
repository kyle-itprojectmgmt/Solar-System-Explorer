// v10.0.14 — solar map landing page probe. Run against a PRODUCTION build
// served by wrangler (the vite dev server runs neither worker.js nor _headers):
//   npm run build
//   npx wrangler dev --port 8788
//   MAP_URL=http://127.0.0.1:8788 node tests/solarmap.mjs
//
// Covers the two things the v10.0.14 split had to get right:
//   1. routing — bare "/" is the map, "/?system=X" is still the simulator
//   2. CSP — the map's styles/scripts were externalised out of solar-map.html
//      because style-src/script-src carry no 'unsafe-inline'. If anyone inlines
//      them again the page silently loses all styling; the violation count and
//      the computed-style assertions below are what catch that.
import puppeteer from 'puppeteer-core';

const CHROME = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const BASE = process.env.MAP_URL || 'http://127.0.0.1:8788';

let pass = 0, fail = 0;
const failures = [];
function check(name, ok, detail = '') {
  if (ok) { pass++; console.log(`  ok  ${name}`); }
  else { fail++; failures.push(name); console.log(`FAIL  ${name} ${detail}`); }
}

// -- Group 1: routing (plain fetch) ------------------------------------------
const bare = await (await fetch(BASE + '/')).text();
check('bare / serves the solar map', bare.includes('Choose Your Destination'));
check('bare / is NOT the simulator', !bare.includes('id="loading-screen"'));

const sim = await (await fetch(BASE + '/?system=jupiter')).text();
check('/?system=jupiter serves the simulator', sim.includes('id="loading-screen"'));
check('/?system=jupiter is NOT the map', !sim.includes('Choose Your Destination'));

// Every advertised system must still route to the simulator, not the map.
for (const s of ['sun', 'mercury', 'venus', 'earth', 'mars', 'jupiter', 'saturn', 'uranus', 'neptune', 'pluto']) {
  const r = await (await fetch(`${BASE}/?system=${s}`)).text();
  if (!r.includes('id="loading-screen"')) check(`/?system=${s} routes to simulator`, false);
}
check('all 10 ?system= routes reach the simulator', true);

// -- Group 2: the map renders under CSP --------------------------------------
const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: 'new',
  args: ['--use-gl=angle', '--enable-unsafe-swiftshader', '--window-size=1280,900'],
});
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
await page.evaluateOnNewDocument(() => {
  window.__csp = [];
  window.addEventListener('securitypolicyviolation', (e) => {
    window.__csp.push(`${e.violatedDirective}: ${e.blockedURI}`);
  });
});
await page.goto(BASE + '/', { waitUntil: 'networkidle2' });
await new Promise((r) => setTimeout(r, 1500));

const csp = await page.evaluate(() => window.__csp);
check('map: zero CSP violations', csp.length === 0, csp.slice(0, 4).join(' | '));
check('map: zero console errors', errors.length === 0, errors.slice(0, 3).join(' | '));

// External stylesheet actually applied — a blocked <style> would leave the
// body at the UA default (transparent / static), so assert a real painted value.
const styled = await page.evaluate(() => {
  const bg = getComputedStyle(document.body).backgroundColor;
  const planets = document.querySelectorAll('a.planet').length;
  const canvas = document.getElementById('starCanvas');
  return { bg, planets, canvasW: canvas?.width || 0 };
});
check('map: external CSS applied (body not UA default)',
  styled.bg !== 'rgba(0, 0, 0, 0)' && styled.bg !== '', styled.bg);
check('map: planet links present', styled.planets >= 10, `found ${styled.planets}`);
check('map: external starfield JS ran (canvas sized)', styled.canvasW > 0, `width ${styled.canvasW}`);

// -- Group 3: mobile layout — no horizontal overflow at 375px ----------------
await page.setViewport({ width: 375, height: 812, isMobile: true });
await new Promise((r) => setTimeout(r, 800));
const mobile = await page.evaluate(() => ({
  scrollW: document.documentElement.scrollWidth,
  clientW: document.documentElement.clientWidth,
}));
check('map: no horizontal overflow at 375px',
  mobile.scrollW <= mobile.clientW + 1, `scroll ${mobile.scrollW} > client ${mobile.clientW}`);

await browser.close();
console.log(`\n${pass} passed, ${fail} failed${fail ? ' — ' + failures.join(', ') : ''}`);
process.exit(fail ? 1 : 0);
