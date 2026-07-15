// v10.0.12 guards:
// #89 — entering Orbit mode derives theta/phi from the camera's current
//       bearing (the old fixed 0.5/1.25 reset made the transition sweep
//       sideways — read as "reverse orbit after insertion→orbit").
// #90 — earth-clouds ec_zonal differential rotation is BOUNDED (the old
//       t*speed sheared clouds into thin zonal streaks by late uTime wrap;
//       filament detector on a dayside render at uTime 999,900).
// SPD — slider drives cam.orbSpeedMult and the orbit advance rate scales
//       with it (measured working in v10.0.12 — this pins it).
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

// ---- SPD slider drives the orbit advance rate --------------------------------
const spd = await page.evaluate(async () => {
  const S = window.__sse;
  S.ui.setLive(false);
  S.ui.userSetTimeIndex(1);
  S.cameraCtl.setMode('orbit', 'Earth');
  const sl = S.ui.spdSlider;
  sl.value = '4'; sl.dispatchEvent(new Event('input'));
  const mult4 = S.cameraCtl.orbSpeedMult;
  const a0 = S.cameraCtl.orbTheta;
  await new Promise((r) => setTimeout(r, 3000));
  const a1 = S.cameraCtl.orbTheta;
  sl.value = '1'; sl.dispatchEvent(new Event('input'));
  const b0 = S.cameraCtl.orbTheta;
  await new Promise((r) => setTimeout(r, 3000));
  const b1 = S.cameraCtl.orbTheta;
  return { mult4, rate4: (a0 - a1) / 3, rate1: (b0 - b1) / 3 };
});
const ratio = spd.rate4 / spd.rate1;
check('SPD slider input reaches cam.orbSpeedMult', spd.mult4 === 4, `${spd.mult4}`);
check('orbit advance rate scales 4x with the slider',
  ratio > 3.5 && ratio < 4.5 && Math.abs(spd.rate1 - Math.PI * 2 / 60) < Math.PI * 2 / 60 * 0.1,
  `ratio ${ratio.toFixed(2)}, 1x rate ${spd.rate1.toFixed(4)} (want ~${(Math.PI * 2 / 60).toFixed(4)})`);

// ---- SPD hint when dragged in insertion mode ---------------------------------
const hint = await page.evaluate(() => {
  const S = window.__sse;
  S.cameraCtl.setMode('insertion', 'Earth');
  const sl = S.ui.spdSlider;
  sl.value = '2'; sl.dispatchEvent(new Event('input'));
  const notes = [...document.querySelectorAll('.notification')].map((n) => n.textContent);
  return notes.some((t) => /Orbit Speed applies to Orbit mode/.test(t));
});
check('dragging SPD in insertion mode explains itself (one-shot notify)', hint);

// ---- #89: insertion -> orbit keeps bearing, no retrograde sweep --------------
const dir = await page.evaluate(async () => {
  const S = window.__sse; const { cameraCtl } = S;
  const subLon = () => {
    const local = S.renderer.primaryMesh.worldToLocal(S.renderer.camera.position.clone()).normalize();
    return Math.atan2(-local.z, local.x) * 180 / Math.PI;
  };
  const unwrap = (d) => (d > 180 ? d - 360 : d < -180 ? d + 360 : d);
  S.ui.userSetTimeIndex(1);
  cameraCtl.setMode('insertion', 'Earth');
  cameraCtl.setInsertion({ altitudeKm: 400, incDeg: 0 });
  await new Promise((r) => setTimeout(r, 2500));
  const center = S.renderer.bodyWorldPos('Earth').clone();
  const d0 = S.renderer.camera.position.clone().sub(center).normalize();
  const expTheta = Math.atan2(d0.z, d0.x);
  cameraCtl.setMode('orbit', 'Earth');
  const gotTheta = cameraCtl.orbTheta;
  const lon0 = subLon();
  await new Promise((r) => setTimeout(r, 900)); // inside the transition blend
  const lonMid = subLon();
  await new Promise((r) => setTimeout(r, 3500)); // settled
  const lonEnd = subLon();
  return {
    thetaErr: Math.abs(Math.atan2(Math.sin(gotTheta - expTheta), Math.cos(gotTheta - expTheta))),
    duringDeg: +unwrap(lonMid - lon0).toFixed(2),
    afterDeg: +unwrap(lonEnd - lonMid).toFixed(2),
  };
});
check('orbit entry theta = camera bearing (no 0.5 hard reset)',
  dir.thetaErr < 0.15, `theta error ${dir.thetaErr.toFixed(3)} rad`);
check('no westward sweep during the insertion→orbit transition',
  dir.duringDeg > -5, `${dir.duringDeg}° during blend (pre-fix: -104.9°)`);
check('post-transition drift stays prograde (east)',
  dir.afterDeg > 0, `${dir.afterDeg}°`);

// ---- #90: no cloud streak filaments at late uTime wrap ------------------------
const filaments = await page.evaluate(async () => {
  const S = window.__sse;
  S.ui.setLive(false); S.ui.userSetTimeIndex(0);
  const base = Math.floor(S.physics.simSeconds / 1e6) * 1e6;
  S.physics.jumpToSimSeconds(base + 999900); // worst case of the old shear
  S.cameraCtl.setMode('orbit', 'Earth');
  const sun = S.renderer.sunDir.clone().applyQuaternion(S.renderer.root.quaternion);
  S.cameraCtl.orbTheta = Math.atan2(sun.z, sun.x) + 0.5; // dayside, off the glint
  S.cameraCtl.orbPhi = Math.acos(Math.max(-1, Math.min(1, sun.y)));
  S.cameraCtl.orbDist = S.renderer.bodyRadius('Earth') + 8.0;
  for (let i = 0; i < 80; i++) S.cameraCtl.update(0.05);
  // house rule: sync + double RAW render + read in one evaluate
  S.renderer.update(S.physics, 0.016, base + 999900);
  S.cameraCtl.update(0.016);
  S.renderer.renderer.render(S.renderer.scene, S.renderer.camera);
  S.renderer.renderer.render(S.renderer.scene, S.renderer.camera);
  const c = document.querySelector('canvas');
  const g = document.createElement('canvas'); g.width = c.width; g.height = c.height;
  const cx = g.getContext('2d'); cx.drawImage(c, 0, 0);
  const d = cx.getImageData(0, 0, g.width, g.height).data;
  const W = g.width, H = g.height;
  const lum = (x, y) => { const i = (y * W + x) * 4; return 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]; };
  // thin horizontal filament: bright px, bright 6px left+right, dark 3px above+below
  let fil = 0;
  for (let y = 104; y < H - 104; y++) for (let x = 206; x < W - 206; x++) {
    const l = lum(x, y);
    if (l < 110) continue;
    if (lum(x - 6, y) > 100 && lum(x + 6, y) > 100
      && lum(x, y - 3) < l - 60 && lum(x, y + 3) < l - 60) fil++;
  }
  return fil;
});
check('no zonal streak filaments at uTime 999,900 (bounded ec_zonal shear)',
  filaments < 500, `${filaments} filaments (pre-fix measured 983, post-fix 215)`);

await browser.close();
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
