// v10.0.14 — NAV panel cross-links probe.
//   SMOKE_URL=http://127.0.0.1:8788 node tests/navlinks.mjs
// The links reuse the .body-row / .body-chev pattern of the travel rows on
// purpose, so this asserts they are styled BY that shared rule (same computed
// font/size as a real body row) rather than merely carrying the class name.
import puppeteer from 'puppeteer-core';

const CHROME = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const BASE = process.env.SMOKE_URL || 'http://127.0.0.1:5175';

let pass = 0, fail = 0;
const failures = [];
function check(name, ok, detail = '') {
  if (ok) { pass++; console.log(`  ok  ${name}`); }
  else { fail++; failures.push(name); console.log(`FAIL  ${name} ${detail}`); }
}

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: 'new',
  args: ['--use-gl=angle', '--enable-unsafe-swiftshader', '--window-size=1280,900'],
});
const page = await browser.newPage();
await page.goto(`${BASE}/?system=jupiter`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(
  'document.getElementById("loading-screen").classList.contains("done")',
  { timeout: 90000 },
);

// Open the NAV panel by clicking the real stack button — window.__sse is
// DEV-only and this suite runs against a production build behind wrangler.
await page.click('button.stack-btn[data-panel="bodies"]');
await new Promise((r) => setTimeout(r, 400));

const info = await page.evaluate(() => {
  const rows = [...document.querySelectorAll('.bodies-list .body-row')];
  const texts = rows.map((r) => r.textContent);
  const map = rows.find((r) => r.textContent.includes('Solar System Map'));
  const home = rows.find((r) => r.textContent.includes('Solar Explorer Home'));
  const list = document.querySelector('.bodies-list');
  const kids = [...list.children];
  // Compare against a plain travel row — NOT the active system's row, which
  // carries .current (white + bold) and would be the wrong baseline.
  const jup = rows.find((r) => !r.classList.contains('current')
    && !/Solar System Map|Solar Explorer Home/.test(r.textContent));
  const cs = (e) => e && getComputedStyle(e);
  return {
    texts,
    hasMap: !!map, hasHome: !!home,
    mapIdx: map ? kids.indexOf(map) : -1,
    homeIdx: home ? kids.indexOf(home) : -1,
    lastTwo: kids.slice(-2).every((k) => k.classList.contains('body-row')),
    dividerBeforeMap: map && kids[kids.indexOf(map) - 1]
      ? getComputedStyle(kids[kids.indexOf(map) - 1]).borderTopWidth : null,
    mapChev: !!map?.querySelector('.body-chev'),
    homeChev: !!home?.querySelector('.body-chev'),
    mapFont: cs(map)?.fontSize, jupFont: cs(jup)?.fontSize,
    mapFamily: cs(map)?.fontFamily, jupFamily: cs(jup)?.fontFamily,
    mapColor: cs(map)?.color, jupColor: cs(jup)?.color,
    anyTargetBlank: !!(map?.getAttribute?.('target') || home?.getAttribute?.('target')),
  };
});

check('NAV: Solar System Map row present', info.hasMap);
check('NAV: Solar Explorer Home row present', info.hasHome);
check('NAV: both links are the last two rows', info.lastTwo && info.homeIdx === info.mapIdx + 1,
  `map ${info.mapIdx}, home ${info.homeIdx}`);
check('NAV: divider sits directly above the links', info.dividerBeforeMap === '1px', info.dividerBeforeMap);
check('NAV: chevrons match body rows', info.mapChev && info.homeChev);
check('NAV: font size matches a real body row', info.mapFont === info.jupFont, `${info.mapFont} vs ${info.jupFont}`);
check('NAV: font family matches a real body row', info.mapFamily === info.jupFamily);
check('NAV: colour matches a real body row', info.mapColor === info.jupColor, `${info.mapColor} vs ${info.jupColor}`);
check('NAV: no target=_blank (same tab)', !info.anyTargetBlank);

// Map link navigates to the map at "/" in the SAME tab.
const before = (await browser.pages()).length;
await Promise.all([
  page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 30000 }),
  page.evaluate(() => [...document.querySelectorAll('.bodies-list .body-row')]
    .find((r) => r.textContent.includes('Solar System Map')).click()),
]);
const after = (await browser.pages()).length;
const url = page.url();
const body = await page.content();
check('NAV: Map link lands on "/"', new URL(url).pathname === '/' && !new URL(url).searchParams.has('system'), url);
check('NAV: Map link reaches the solar map page', body.includes('Choose Your Destination'));
check('NAV: Map link opened in the same tab', after === before, `${before} -> ${after} tabs`);

await browser.close();
console.log(`\n${pass} passed, ${fail} failed${fail ? ' — ' + failures.join(', ') : ''}`);
process.exit(fail ? 1 : 0);
