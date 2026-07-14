// v10.0.1 guard — donate URL, HELP About section, persistent #site-link,
// physics sanity (no physics change shipped; premise of the "pause inactive
// systems" fix was false — one PhysicsEngine per page, see physbench.mjs).
// Run: SMOKE_URL=http://localhost:5175 node tests/about.mjs
import puppeteer from 'puppeteer-core';
import { readFileSync } from 'fs';

const CHROME = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const BASE = process.env.SMOKE_URL || 'http://localhost:5175';
const VERSION = JSON.parse(readFileSync('package.json', 'utf8')).version;
const SYSTEMS = ['sun', 'jupiter', 'earth', 'mars', 'saturn',
  'mercury', 'venus', 'uranus', 'neptune', 'pluto'];

let pass = 0, fail = 0;
const failures = [];
function check(name, ok, detail = '') {
  if (ok) { pass++; console.log(`  ok  ${name}`); }
  else { fail++; failures.push(name); console.log(`FAIL  ${name} ${detail}`); }
}

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: 'new',
  args: ['--use-gl=angle', '--enable-unsafe-swiftshader', '--window-size=1280,800'],
});
const page = await browser.newPage();
await page.setViewport({ width: 1280, height: 800 });
const consoleErrors = [];
page.on('pageerror', (e) => consoleErrors.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()); });

await page.goto(`${BASE}/?system=jupiter`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction('window.__sse && window.__sse.physics', { timeout: 60000 });
await page.waitForFunction(
  'document.getElementById("loading-screen").classList.contains("done")',
  { timeout: 60000 });

// -- 1. Donate button --------------------------------------------------------
const donate = await page.$eval('.kofi-btn', (a) => ({
  href: a.href, target: a.target, rel: a.rel,
}));
check('donate button → solarexplorer.co/support',
  donate.href === 'https://solarexplorer.co/support', JSON.stringify(donate));
check('donate opens in new tab (noopener)',
  donate.target === '_blank' && /noopener/.test(donate.rel));

// -- 2. HELP About section ----------------------------------------------------
const about = await page.evaluate((v) => {
  window.__sse.ui.togglePanel('help');
  const root = document.querySelector('.help-about');
  if (!root) return { present: false };
  const link = root.querySelector('.help-about-link');
  const helpVisible = root.checkVisibility();
  const divider = !!document.querySelector('.help-divider');
  return {
    present: true, helpVisible, divider,
    title: root.querySelector('.help-section-title')?.textContent,
    desc: root.querySelector('.help-about-desc')?.textContent || '',
    meta: root.querySelector('.help-about-meta')?.textContent || '',
    privacy: root.querySelector('.help-about-privacy')?.textContent || '',
    link: link && { href: link.href, target: link.target, rel: link.rel, text: link.textContent },
    titleColor: getComputedStyle(root.querySelector('.help-section-title')).color,
    privacyStyle: getComputedStyle(root.querySelector('.help-about-privacy')).fontStyle,
  };
}, VERSION);
check('About section present + visible in HELP panel',
  about.present && about.helpVisible && about.divider, JSON.stringify(about));
check('About title styled (ABOUT, #66B2FF)',
  about.title === 'ABOUT' && about.titleColor === 'rgb(102, 178, 255)', about.titleColor);
check('description mentions 8 planets / Sun / Pluto / 30+ moons',
  /8 planets/.test(about.desc) && /Pluto/.test(about.desc) && /30\+ moons/.test(about.desc));
check(`meta shows v${VERSION} · Built by Kyle Ewing`,
  about.meta === `v${VERSION} · Built by Kyle Ewing`, about.meta);
check('About link → https://solarexplorer.co/ in new tab',
  about.link && about.link.href === 'https://solarexplorer.co/' &&
  about.link.target === '_blank' && /noopener/.test(about.link.rel) &&
  /solarexplorer\.co/.test(about.link.text), JSON.stringify(about.link));
check('privacy line italic', /No cookies · Anonymous usage stats only/.test(about.privacy) && about.privacyStyle === 'italic');
await page.evaluate(() => window.__sse.ui.closeAllPanels());

// -- 3. HUD site link ---------------------------------------------------------
const site = await page.evaluate(() => {
  const a = document.getElementById('site-link');
  if (!a) return { present: false };
  const cs = getComputedStyle(a);
  const inGhost = !!a.closest('.hud-ghost');
  window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyP', bubbles: true }));
  const hiddenInPresentation = !a.checkVisibility();
  window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyP', bubbles: true }));
  const backAfter = a.checkVisibility();
  return {
    present: true, inGhost, hiddenInPresentation, backAfter,
    href: a.href, target: a.target, rel: a.rel, text: a.textContent,
    display: cs.display, fontSize: cs.fontSize, color: cs.color,
  };
});
check('#site-link under the ghost clock', site.present && site.inGhost, JSON.stringify(site));
check('#site-link → https://solarexplorer.co/ in new tab',
  site.href === 'https://solarexplorer.co/' && site.target === '_blank' &&
  /noopener/.test(site.rel) && site.text === 'solarexplorer.co');
check('#site-link styled (block, 11px, 50% gray)',
  site.display === 'block' && site.fontSize === '11px' &&
  site.color === 'rgba(217, 217, 217, 0.5)', `${site.display} ${site.fontSize} ${site.color}`);
check('#site-link hides in presentation mode and returns',
  site.hiddenInPresentation && site.backAfter);

// -- 4. Physics sanity (no change shipped — orbits must still advance) --------
const phys = await page.evaluate(() => {
  const { physics } = window.__sse;
  const io = physics.getBody('Io');
  const a0 = Math.atan2(-io.pos.z, io.pos.x);
  const s0 = physics.simSeconds;
  physics.setTimeIndex(4); // 1000x
  for (let i = 0; i < 60; i++) physics.update(1 / 60);
  physics.setTimeIndex(1);
  const a1 = Math.atan2(-io.pos.z, io.pos.x);
  return { dSim: physics.simSeconds - s0, dAng: Math.atan2(Math.sin(a1 - a0), Math.cos(a1 - a0)) };
});
check('Io advances prograde at 1000x', phys.dSim > 900 && phys.dAng > 1e-4, JSON.stringify(phys));

const ver = await page.$eval('#loading-version', (e) => e.textContent);
check(`loading screen shows v${VERSION}`, ver.includes(`v${VERSION}`), ver);

// -- 5. Triton retrograde on Neptune + About/site-link on a second system -----
const p2 = await browser.newPage();
const errs2 = [];
p2.on('pageerror', (e) => errs2.push(String(e)));
p2.on('console', (m) => { if (m.type() === 'error') errs2.push(m.text()); });
await p2.goto(`${BASE}/?system=neptune`, { waitUntil: 'domcontentloaded' });
await p2.waitForFunction('window.__sse && window.__sse.physics', { timeout: 60000 });
const nep = await p2.evaluate(() => {
  const { physics } = window.__sse;
  const ang = (b) => Math.atan2(-b.pos.z, b.pos.x);
  const triton = physics.getBody('Triton');
  const proteus = physics.getBody('Proteus');
  const t0 = ang(triton), pr0 = ang(proteus);
  physics.setTimeIndex(4);
  for (let i = 0; i < 120; i++) physics.update(1 / 60);
  const norm = (a) => Math.atan2(Math.sin(a), Math.cos(a));
  return {
    dTriton: norm(ang(triton) - t0),
    dProteus: norm(ang(proteus) - pr0),
    siteLink: !!document.getElementById('site-link'),
    about: !!document.querySelector('.help-about'),
  };
});
check('Triton retrograde vs Proteus prograde on Neptune',
  nep.dTriton * nep.dProteus < 0 && nep.dProteus > 0, JSON.stringify(nep));
check('site-link + About present on Neptune too', nep.siteLink && nep.about);
await p2.close();

// -- 6. Zero console errors across all 10 systems ------------------------------
for (const slug of SYSTEMS) {
  const p = await browser.newPage();
  const errs = [];
  p.on('pageerror', (e) => errs.push(String(e)));
  p.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
  await p.goto(`${BASE}/?system=${slug}`, { waitUntil: 'domcontentloaded' });
  await p.waitForFunction(
    'window.__sse && document.getElementById("loading-screen").classList.contains("done")',
    { timeout: 60000 });
  const real = errs.filter((e) => !/favicon|404/i.test(e));
  check(`zero console errors on ${slug}`, real.length === 0, real.slice(0, 2).join(' | '));
  await p.close();
}

const realErrors = consoleErrors.filter((e) => !/favicon|404/i.test(e));
check('zero console errors on primary page', realErrors.length === 0, realErrors.slice(0, 3).join(' | '));

await browser.close();
console.log(`\n${pass} passed, ${fail} failed${fail ? ' — ' + failures.join(', ') : ''}`);
process.exit(fail ? 1 : 0);
