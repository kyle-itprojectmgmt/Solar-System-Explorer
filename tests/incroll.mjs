// Inclination scene-rotation fix verification:
// - dragging the slider must not roll the view (scene appearing to rotate)
// - bodies must never move or rotate
// - sweeps/centering/retrograde must still hold
// - both inclination sliders stay in sync
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

let pass = 0, fail = 0;
const check = (n, ok, d = '') => {
  if (ok) { pass++; console.log(`  ok  ${n}`); } else { fail++; console.log(`FAIL  ${n} ${d}`); }
};

const r = await page.evaluate(() => {
  const { cameraCtl, physics, renderer, THREE } = window.__sse;
  const out = {};
  physics.setTimeIndex(0); // freeze sim: any apparent motion is camera-only

  cameraCtl.setMode('insertion', 'Io');
  cameraCtl.setInsertion({ body: 'Io', altitudeKm: 2000, incDeg: 0, locked: false });
  cameraCtl.blend = 1;
  cameraCtl.update(0.016);

  // project() reads camera matrices that normally refresh on render — the
  // test loop never renders, so refresh them manually before projecting.
  const freshProject = (v) => {
    cameraCtl.camera.updateMatrixWorld(true);
    cameraCtl.camera.matrixWorldInverse.copy(cameraCtl.camera.matrixWorld).invert();
    return v.project(cameraCtl.camera);
  };
  const rootQ0 = renderer.root.quaternion.clone();
  const ioPos0 = renderer.bodyWorldPos('Io', new THREE.Vector3()).clone();
  const ioRot0 = renderer.bodyMeshes.get('Io').mesh.rotation.y;
  const center = () => renderer.bodyWorldPos('Io', new THREE.Vector3());

  // Drag 0 -> 90 in 1-degree steps, settling the transition each step.
  // Track the worst per-step view roll (rotation about the view axis) and
  // the target body's projected offset from view center.
  let maxRollDeg = 0, maxOffset = 0;
  let prevUp = new THREE.Vector3(0, 1, 0).applyQuaternion(cameraCtl.camera.quaternion);
  let prevFwd = new THREE.Vector3(0, 0, -1).applyQuaternion(cameraCtl.camera.quaternion);
  for (let d = 1; d <= 90; d++) {
    cameraCtl.setInsertion({ incDeg: d });
    for (let i = 0; i < 20; i++) cameraCtl.update(0.05); // settle 1 s blend
    const up = new THREE.Vector3(0, 1, 0).applyQuaternion(cameraCtl.camera.quaternion);
    const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(cameraCtl.camera.quaternion);
    // Roll = rotation of "up" around the (shared) view axis between steps.
    const upPerpPrev = prevUp.clone().addScaledVector(prevFwd, -prevUp.dot(prevFwd)).normalize();
    const upPerp = up.clone().addScaledVector(fwd, -up.dot(fwd)).normalize();
    const roll = THREE.MathUtils.radToDeg(Math.acos(THREE.MathUtils.clamp(upPerpPrev.dot(upPerp), -1, 1)));
    maxRollDeg = Math.max(maxRollDeg, roll);
    const p = freshProject(center());
    maxOffset = Math.max(maxOffset, Math.hypot(p.x, p.y));
    prevUp = up; prevFwd = fwd;
  }
  out.maxRollPerStepDeg = +maxRollDeg.toFixed(2);
  out.maxCenterOffset = +maxOffset.toFixed(3);
  out.bodiesStill = renderer.root.quaternion.angleTo(rootQ0) < 1e-9
    && center().distanceTo(ioPos0) < 1e-9
    && renderer.bodyMeshes.get('Io').mesh.rotation.y === ioRot0;

  // Polar sweep at 90 (drive phase via sim time).
  physics.setTimeIndex(1);
  let minLat = 90, maxLat = -90;
  const c0 = center();
  for (let i = 0; i < 450; i++) {
    physics.simSeconds += 60; // full ~19,200 s orbit at 2,000 km over Io
    cameraCtl._lastSimSec = physics.simSeconds - 60;
    cameraCtl.update(0.016);
    const rel = cameraCtl.camera.position.clone().sub(c0).normalize();
    const lat = THREE.MathUtils.radToDeg(Math.asin(rel.y));
    minLat = Math.min(minLat, lat); maxLat = Math.max(maxLat, lat);
  }
  out.polarSweep = [+minLat.toFixed(1), +maxLat.toFixed(1)];

  // Retrograde still reverses phase.
  cameraCtl.setInsertion({ incDeg: -45 });
  const p0 = cameraCtl.ins.phase;
  for (let i = 0; i < 20; i++) {
    physics.simSeconds += 30;
    cameraCtl._lastSimSec = physics.simSeconds - 30;
    cameraCtl.update(0.016);
  }
  out.retrograde = cameraCtl.ins.phase < p0;

  // Dual slider sync: insertion-panel slider drives, INC-panel slider follows.
  const sliders = [...document.querySelectorAll('input.slider')].filter((s) => s.min === '-90');
  out.twoSliders = sliders.length;
  const [a, b] = sliders;
  a.value = 33; a.dispatchEvent(new Event('input'));
  const bFollows = +b.value === 33;
  b.value = -60; b.dispatchEvent(new Event('input'));
  const aFollows = +a.value === -60;
  out.slidersSync = bFollows && aFollows && cameraCtl.ins.incDeg === -60;
  return out;
});

check('drag 0→90: no view roll (max per-step < 2°)', r.maxRollPerStepDeg < 2, `${r.maxRollPerStepDeg}°`);
check('body stays centered while dragging (< 0.6 NDC)', r.maxCenterOffset < 0.6, r.maxCenterOffset);
check('bodies never move/rotate during drag', r.bodiesStill);
check('90° sweeps over both poles', r.polarSweep[0] < -85 && r.polarSweep[1] > 85, JSON.stringify(r.polarSweep));
check('retrograde traversal preserved', r.retrograde);
check('both inclination sliders stay in sync', r.twoSliders === 2 && r.slidersSync, `${r.twoSliders} sliders`);
console.log(`\n${pass} passed, ${fail} failed; errors: ${errors.length}`);
if (errors.length) console.log(errors.slice(0, 4).join('\n'));
await browser.close();
process.exit(fail || errors.length ? 1 : 0);
