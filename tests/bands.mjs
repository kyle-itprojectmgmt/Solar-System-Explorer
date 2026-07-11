// "Bands vertical on fresh entry" — measurement per the bug report, plus
// the roll hypothesis: is the problem the entry PHASE (which face) or the
// view's screen-up (roll)? Measures Kyle's four values and the on-screen
// angle of Jupiter's spin axis before/after the fix.
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
await page.goto(URL, { waitUntil: 'domcontentloaded' });
await page.waitForFunction('window.__sse', { timeout: 60000 });
await page.waitForFunction(
  'document.getElementById("loading-screen").classList.contains("done")', { timeout: 60000 });

const r = await page.evaluate(() => {
  const { cameraCtl, physics, renderer, THREE } = window.__sse;
  const out = {};
  const center = renderer.bodyWorldPos('Jupiter', new THREE.Vector3());

  // (1)-(2): fresh-load camera relative to Jupiter, camLocal, atan2 value.
  const camRel = cameraCtl.camera.position.clone().sub(center);
  const camLocal = camRel.clone().applyQuaternion(renderer.root.quaternion.clone().invert());
  out.q1_camRel = camRel.toArray().map((v) => +v.toFixed(1));
  out.q2_atan2 = +Math.atan2(-camLocal.z, camLocal.x).toFixed(3);

  // Press I.
  window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyI', bubbles: true }));
  out.q3_insPhase = +cameraCtl.ins.phase.toFixed(3);
  for (let i = 0; i < 40; i++) cameraCtl.update(0.05);
  const posRel = cameraCtl.camera.position.clone().sub(center);
  out.q4_posePos = posRel.toArray().map((v) => +v.toFixed(1));
  out.q4_bearing = +Math.atan2(-posRel.z, posRel.x).toFixed(3); // matches q2 => position preserved

  // The actual symptom metric: the on-screen angle of Jupiter's spin axis.
  // 0° = axis vertical on screen = bands horizontal (correct).
  const cam = cameraCtl.camera;
  cam.updateMatrixWorld(true);
  cam.matrixWorldInverse.copy(cam.matrixWorld).invert();
  const axisWorld = new THREE.Vector3(0, 1, 0).applyQuaternion(renderer.root.quaternion);
  const pTop = center.clone().addScaledVector(axisWorld, renderer.bodyRadius('Jupiter')).project(cam);
  const pC = center.clone().project(cam);
  const sx = (pTop.x - pC.x), sy = (pTop.y - pC.y);
  out.axisScreenAngleDeg = +THREE.MathUtils.radToDeg(Math.atan2(Math.abs(sx), sy)).toFixed(1);
  return out;
});
console.log(JSON.stringify(r, null, 1));
await page.screenshot({ path: `${OUT}bands-entry.png` });
console.log(`errors: ${errors.length}`);
if (errors.length) console.log(errors.slice(0, 4).join('\n'));
await browser.close();
