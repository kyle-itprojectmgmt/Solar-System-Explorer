// V4d verification: text labels, ALT/INC/SPD panels, Surface hidden.
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
  const { cameraCtl } = window.__sse;
  const out = {};
  const labels = [...document.querySelectorAll('.stack-btn')].map((b) => b.textContent);
  out.labels = labels.join(' ');
  out.noEmoji = labels.every((l) => /^[A-Z]+$/.test(l));
  out.divider = !!document.querySelector('.stack-divider');
  const open = (id) => document.querySelector(`.stack-btn[data-panel="${id}"]`).click();

  // CAM panel: 6 modes, no Surface, no sliders (except contextual chase, hidden now)
  open('camera');
  out.modeCount = document.querySelectorAll('.mode-row').length;
  out.noSurface = ![...document.querySelectorAll('.mode-row')].some((m) => /Surface/.test(m.textContent));
  out.noAltInCam = !document.querySelector('.stack-content:not([style*="none"]) .alt-readout');

  // ALT panel
  open('alt');
  cameraCtl.setMode('orbit', 'Jupiter');
  const altSlider = document.querySelector('.stack-content:not([style*="display: none"]) input.slider');
  altSlider.value = 0.5;
  altSlider.dispatchEvent(new Event('input'));
  out.altReadout = document.querySelector('.alt-readout').textContent;
  out.altDesc = [...document.querySelectorAll('.panel-desc')].some((p) => /altitude above surface/i.test(p.textContent));

  // INC panel: readout + auto-switch note behavior
  open('inc');
  const incSlider = [...document.querySelectorAll('input.slider')].find((s) => s.min === '-90');
  incSlider.value = 90;
  incSlider.dispatchEvent(new Event('input'));
  out.incReadout = [...document.querySelectorAll('.alt-readout')].map((e) => e.textContent).find((t) => /polar|°/.test(t));
  // v8.0.1: INC from ORBIT mode adjusts the current orbit — no mode switch.
  out.incSwitched = cameraCtl.mode === 'orbit' && cameraCtl.ins.incDeg === 90;

  // SPD panel
  open('spd');
  const spdSlider = [...document.querySelectorAll('.stack-content')].find((c) => c.style.display !== 'none')
    .querySelector('input.slider');
  spdSlider.value = 2.5;
  spdSlider.dispatchEvent(new Event('input'));
  out.spdApplied = Math.abs(cameraCtl.orbSpeedMult - 2.5) < 0.01;
  out.spdDesc = [...document.querySelectorAll('.panel-desc')].some((p) => /orbit speed/i.test(p.textContent));

  // S key must do nothing
  cameraCtl.setMode('orbit', 'Io');
  window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyS', bubbles: true }));
  out.sInert = cameraCtl.mode === 'orbit';

  // Tab cycles through 9 panels + closed
  document.querySelector('.stack-btn[data-panel="spd"]').click(); // close
  let seen = 0;
  for (let i = 0; i < 10; i++) {
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Tab', bubbles: true }));
    if (document.querySelector('.stack-panel').style.display !== 'none') seen++;
  }
  out.tabSeen = seen; // 9 panels + 1 closed step
  return out;
});

check('labels CAM TIME NAV SAVE VIEW HELP ALT INC SPD', r.labels === 'CAM TIME NAV SAVE VIEW HELP ALT INC SPD', r.labels);
check('no emoji on stack buttons', r.noEmoji);
check('divider present', r.divider);
check('CAM shows 6 modes, Surface hidden', r.modeCount === 6 && r.noSurface, r.modeCount);
check('no sliders inside CAM panel', r.noAltInCam);
check('ALT panel slider + readout', /ALT: 5,0\d\d km/.test(r.altReadout), r.altReadout);
check('ALT description present', r.altDesc);
check('INC readout short form (90° polar)', /90° polar/.test(r.incReadout), r.incReadout);
check('INC drag adjusts current orbit @90 (no switch, v8.0.1)', r.incSwitched);
check('SPD slider applies 2.50x', r.spdApplied);
check('SPD description present', r.spdDesc);
check('S key inert', r.sInert);
check('Tab cycles all 9 panels', r.tabSeen === 9, r.tabSeen);

await page.screenshot({ path: `${OUT}v4d-stack.png` });
console.log(`\n${pass} passed, ${fail} failed; errors: ${errors.length}`);
if (errors.length) console.log(errors.slice(0, 5).join('\n'));
await browser.close();
process.exit(fail || errors.length ? 1 : 0);
