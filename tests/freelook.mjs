// 2b/2c verification: Alt free look + inclination auto-switch.
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

const res = await page.evaluate(() => {
  const { cameraCtl, THREE } = window.__sse;
  const out = {};
  cameraCtl.setMode('orbit', 'Jupiter');
  for (let i = 0; i < 40; i++) cameraCtl.update(0.05);
  const q0 = cameraCtl.camera.quaternion.clone();
  const p0 = cameraCtl.camera.position.clone();

  // Alt down → free look active + indicator shows
  window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Alt', bubbles: true }));
  out.activeOnAlt = cameraCtl.freeLook.active;
  out.indicator = document.querySelector('.freelook-indicator').classList.contains('show');

  // Drag → orientation changes, position does not
  cameraCtl._drag(200, 80);
  cameraCtl.update(0.05);
  const q1 = cameraCtl.camera.quaternion.clone();
  const p1 = cameraCtl.camera.position.clone();
  out.rotated = q0.angleTo(q1) > 0.2;
  out.positionFixed = p0.distanceTo(p1) < 1e-6;

  // Alt up → eases back to nadir
  window.dispatchEvent(new KeyboardEvent('keyup', { key: 'Alt', bubbles: true }));
  out.inactiveOnRelease = !cameraCtl.freeLook.active;
  for (let i = 0; i < 40; i++) cameraCtl.update(0.05); // ~2 s of settle
  out.restored = cameraCtl.camera.quaternion.angleTo(q0) < 0.02;
  out.indicatorOff = !document.querySelector('.freelook-indicator').classList.contains('show');

  // 2c: inclination slider in orbit mode auto-switches to insertion
  cameraCtl.setMode('orbit', 'Io');
  const slider = [...document.querySelectorAll('input.slider')]
    .find((s) => s.min === '-90' && s.max === '90');
  slider.value = 30;
  slider.dispatchEvent(new Event('input'));
  out.autoSwitched = cameraCtl.mode === 'insertion' && cameraCtl.ins.body === 'Io';
  out.incApplied = cameraCtl.ins.incDeg === 30;
  return out;
});
console.log(JSON.stringify(res, null, 1));
console.log(`errors: ${errors.length}`);
if (errors.length) console.log(errors.slice(0, 4).join('\n'));
await browser.close();
const ok = Object.values(res).every((v) => v === true);
process.exit(ok && !errors.length ? 0 : 1);
