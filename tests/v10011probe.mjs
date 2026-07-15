// v10.0.11 guard (bug #86): the Orbit Insertion panel's pre-insertion
// camera restore (preModeOI) fires ONLY on an explicit ✕ click. Every
// other way the panel closes — Enter Orbit commit, another panel taking
// the slot (TIME/NAV), overlay dismiss — leaves the camera in insertion.
// Also: re-selecting the insertion mode button reopens the panel (setMode
// short-circuits on same mode+target, so the UI handles the reopen).
import puppeteer from 'puppeteer-core';

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const BASE = process.env.SMOKE_URL || 'http://localhost:5175';

let pass = 0, fail = 0;
const check = (name, ok, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}: ${name}${detail ? ` — ${detail}` : ''}`);
  ok ? pass++ : fail++;
};

const browser = await puppeteer.launch({
  executablePath: CHROME, headless: 'new',
  args: ['--use-gl=angle', '--enable-unsafe-swiftshader', '--window-size=1280,800'],
});
const page = await browser.newPage();
await page.setViewport({ width: 1280, height: 800 });
await page.goto(`${BASE}/?system=earth`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction('window.__sse && window.__sse.physics', { timeout: 60000 });
await page.waitForFunction(
  'document.getElementById("loading-screen").classList.contains("done")', { timeout: 60000 });
await new Promise((r) => setTimeout(r, 2000));

const r = await page.evaluate(() => {
  const { ui, cameraCtl } = window.__sse;
  const out = {};
  const panelOpen = () => ui.insPanel.style.display !== 'none';

  // 1) ✕ click reverts to the pre-insertion mode and closes the panel.
  cameraCtl.setMode('orbit', 'Earth');           // known pre-mode
  cameraCtl.setMode('insertion', 'Earth');
  cameraCtl.setInsertion({ altitudeKm: 400, incDeg: 51.6 });
  out.xPanelBefore = panelOpen();
  document.getElementById('oi-close').click();
  out.xModeAfter = cameraCtl.mode;               // want 'orbit' (reverted)
  out.xPanelAfter = panelOpen();                 // want false

  // 2) Enter Orbit commits: panel closes, camera STAYS in insertion.
  cameraCtl.setMode('insertion', 'Earth');
  out.eoPanelBefore = panelOpen();
  document.querySelector('.ins-enter-btn').click();
  out.eoModeAfter = cameraCtl.mode;              // want 'insertion'
  out.eoPanelAfter = panelOpen();                // want false

  // 3) Reopen via the insertion mode button: panel back, still insertion,
  //    sliders reflect live state (onInsertionChange keeps them synced).
  document.querySelector('[data-cam-mode="insertion"]').click();
  out.reopenPanel = panelOpen();                 // want true
  out.reopenMode = cameraCtl.mode;               // want 'insertion'

  // 4) Opening TIME while the OI panel is open: OI closes, camera stays.
  cameraCtl.setInsertion({ altitudeKm: 1234 });
  const altBefore = cameraCtl.ins.altitudeKm;
  ui.openPanel('time');
  out.timeModeAfter = cameraCtl.mode;            // want 'insertion'
  out.timeAltAfter = cameraCtl.ins.altitudeKm;   // want unchanged 1234
  out.timeAltBefore = altBefore;
  out.timeOiPanel = panelOpen();                 // want false

  // 5) Overlay dismiss (click-away class of close): camera stays too.
  document.querySelector('[data-cam-mode="insertion"]').click();
  ui.closeAllPanels();                           // what overlay/Escape call
  out.dismissModeAfter = cameraCtl.mode;         // want 'insertion'

  return out;
});

check('✕ closes panel and reverts to pre-insertion mode',
  r.xPanelBefore && !r.xPanelAfter && r.xModeAfter === 'orbit',
  JSON.stringify({ mode: r.xModeAfter, panel: r.xPanelAfter }));
check('Enter Orbit closes panel, camera stays in insertion',
  r.eoPanelBefore && !r.eoPanelAfter && r.eoModeAfter === 'insertion',
  JSON.stringify({ mode: r.eoModeAfter, panel: r.eoPanelAfter }));
check('insertion mode button reopens the panel in-place',
  r.reopenPanel && r.reopenMode === 'insertion',
  JSON.stringify({ mode: r.reopenMode, panel: r.reopenPanel }));
check('opening TIME keeps camera in insertion at same altitude',
  r.timeModeAfter === 'insertion' && !r.timeOiPanel
    && Math.abs(r.timeAltAfter - r.timeAltBefore) < 1,
  JSON.stringify({ mode: r.timeModeAfter, alt: r.timeAltAfter }));
check('overlay/Escape dismiss keeps camera in insertion',
  r.dismissModeAfter === 'insertion', r.dismissModeAfter);

await browser.close();
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
