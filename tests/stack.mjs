// G6 verification: icon stack, six panels, presets + URL sharing.
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

let pass = 0, fail = 0;
const check = (n, ok, d = '') => {
  if (ok) { pass++; console.log(`  ok  ${n}`); } else { fail++; console.log(`FAIL  ${n} ${d}`); }
};

const r = await page.evaluate(() => {
  const { cameraCtl, physics } = window.__sse;
  const out = {};
  const btns = document.querySelectorAll('.stack-btn');
  out.sixButtons = btns.length;
  out.oldPanelGone = !document.querySelector('.side-panel');

  const open = (id) => document.querySelector(`.stack-btn[data-panel="${id}"]`).click();
  const panelVisible = () => document.querySelector('.stack-panel').style.display !== 'none';

  // Camera panel
  open('camera');
  out.cameraOpen = panelVisible();
  out.modeRows = document.querySelectorAll('.mode-row').length;
  document.querySelector('.mode-row[data-cam-mode="system"]').click();
  out.modeSwitch = cameraCtl.mode === 'system';
  out.activeRow = document.querySelector('.mode-row[data-cam-mode="system"]').classList.contains('active');
  out.ghostDimmed = document.querySelector('.hud-ghost').classList.contains('dimmed');

  // One at a time
  open('time');
  out.onlyTime = document.querySelectorAll('.stack-content')[0].style.display === 'none';
  out.timeButtons = document.querySelectorAll('[data-time-index]').length;

  // Bodies
  open('bodies');
  const rows = [...document.querySelectorAll('.body-row')];
  out.bodyRows = rows.length;
  out.hereBadge = !!document.querySelector('.here-badge');
  out.moonRows = document.querySelectorAll('.moon-row:not(.ghost-moon)').length;
  rows.find((x) => x.textContent.includes('Saturn')).click();
  out.comingSoon = [...document.querySelectorAll('.notification')].some((n) => /Coming Soon — Saturn/.test(n.textContent));
  [...document.querySelectorAll('.moon-row')].find((m) => m.textContent.includes('Europa')).click();
  out.moonNav = cameraCtl.mode === 'orbit' && cameraCtl.target === 'Europa';

  // Presets: save + share
  open('presets');
  out.curatedRows = document.querySelectorAll('.preset-row').length;
  cameraCtl.setMode('insertion', 'Io');
  cameraCtl.setInsertion({ altitudeKm: 4321, incDeg: -33, locked: false });
  document.querySelector('.preset-save').click();
  const input = document.querySelector('.preset-namerow input');
  input.value = 'Test View';
  input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
  const stored = JSON.parse(localStorage.getItem('sse-presets') || '[]');
  out.saved = stored.length === 1 && stored[0].name === 'Test View';
  out.isoDate = typeof stored[0]?.sim?.date === 'string' && stored[0].sim.date.endsWith('Z');
  out.savedCam = stored[0]?.camera?.altitudeKm === 4321 && stored[0]?.camera?.incDeg === -33;

  // Restore after changing state
  cameraCtl.setMode('orbit', 'Callisto');
  physics.setTimeIndex(3);
  const item = [...document.querySelectorAll('.preset-item .preset-row')]
    .find((b) => b.textContent.includes('Test View'));
  item.click();
  out.restored = cameraCtl.mode === 'insertion' && cameraCtl.ins.body === 'Io'
    && Math.abs(cameraCtl.ins.altitudeKm - 4321) < 1 && cameraCtl.ins.incDeg === -33;

  // Share URL encoding round-trip (no clipboard in headless — test encode/decode)
  const enc = btoa(encodeURIComponent(JSON.stringify(stored[0])));
  const dec = JSON.parse(decodeURIComponent(atob(enc)));
  out.shareRoundTrip = dec.name === 'Test View';
  out.shareUrl = `${location.origin}${location.pathname}?view=${enc}`;

  // Display panel
  open('display');
  out.displayToggles = document.querySelectorAll('.stack-content .toggle-row').length;
  out.altPresetBtns = [...document.querySelectorAll('.stack-content .btn')]
    .filter((b) => /km$/.test(b.textContent)).length;

  // Help panel via ? key
  open('display'); // close
  window.dispatchEvent(new KeyboardEvent('keydown', { key: '?', bubbles: true }));
  out.helpOpen = document.querySelector('.stack-btn[data-panel="help"]').classList.contains('active');
  out.helpAltTip = [...document.querySelectorAll('.help-desc')].some((d) => /Free look/i.test(d.textContent));

  // Tab cycles: help (last) -> closed -> camera
  window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Tab', bubbles: true }));
  const closedAfterHelp = document.querySelector('.stack-panel').style.display === 'none';
  window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Tab', bubbles: true }));
  out.tabCycles = closedAfterHelp
    && document.querySelector('.stack-btn[data-panel="camera"]').classList.contains('active');
  // Escape closes
  window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Escape', bubbles: true }));
  out.escCloses = document.querySelector('.stack-panel').style.display === 'none';
  return out;
});

check('6 stack buttons', r.sixButtons === 6, r.sixButtons);
check('old Mission Control gone', r.oldPanelGone);
check('camera panel opens + 7 modes', r.cameraOpen && r.modeRows === 7);
check('mode row switches + highlights', r.modeSwitch && r.activeRow);
check('ghost clock dims when panel open', r.ghostDimmed);
check('one panel at a time', r.onlyTime);
check('time panel has 6 speed buttons', r.timeButtons === 6);
check('bodies: 10 planets + HERE badge', r.bodyRows === 10 && r.hereBadge, r.bodyRows);
check('bodies: 8 real moons clickable', r.moonRows === 8, r.moonRows);
check('Saturn shows Coming Soon toast', r.comingSoon);
check('moon click navigates (Europa orbit)', r.moonNav);
check('5 curated presets', r.curatedRows >= 5, r.curatedRows);
check('save preset -> localStorage', r.saved);
check('preset date is ISO 8601 string', r.isoDate);
check('preset captured camera state', r.savedCam);
check('preset restore round-trip', r.restored);
check('share encode round-trip', r.shareRoundTrip);
check('display panel toggles', r.displayToggles >= 6, r.displayToggles);
check('altitude preset buttons restored', r.altPresetBtns === 4, r.altPresetBtns);
check('? opens help panel with Alt tip', r.helpOpen && r.helpAltTip);
check('Tab cycles panels', r.tabCycles);
check('Escape closes panel', r.escCloses);

// ?view= URL restore in a fresh page
const page2 = await browser.newPage();
await page2.goto(r.shareUrl, { waitUntil: 'domcontentloaded' });
await page2.waitForFunction('window.__sse', { timeout: 60000 });
await page2.waitForFunction(
  'document.getElementById("loading-screen").classList.contains("done")', { timeout: 60000 });
const shared = await page2.evaluate(() => {
  const { cameraCtl } = window.__sse;
  return { mode: cameraCtl.mode, body: cameraCtl.ins.body, alt: cameraCtl.ins.altitudeKm };
});
check('?view= URL restores exact view',
  shared.mode === 'insertion' && shared.body === 'Io' && Math.abs(shared.alt - 4321) < 1,
  JSON.stringify(shared));
await page2.close();

await page.screenshot({ path: `${OUT}stack.png` });
console.log(`\n${pass} passed, ${fail} failed; errors: ${errors.length}`);
if (errors.length) console.log(errors.slice(0, 5).join('\n'));
await browser.close();
process.exit(fail || errors.length ? 1 : 0);
