// V4 headless smoke test â€” run against `npm run dev` (http://localhost:5173).
// Headless Chrome renders this scene at ~4 fps: every assertion is made
// against physics.simSeconds / direct cameraCtl.update() calls, never wall clock.
import puppeteer from 'puppeteer-core';
import { readFileSync } from 'fs';

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const URL = process.env.SMOKE_URL || 'http://localhost:5175';
const VERSION = JSON.parse(readFileSync('package.json', 'utf8')).version;

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

await page.goto(URL, { waitUntil: 'domcontentloaded' });
await page.waitForFunction('window.__sse && window.__sse.physics', { timeout: 60000 });
await page.waitForFunction(
  'document.getElementById("loading-screen").classList.contains("done")',
  { timeout: 60000 }
);

// -- Group 1: version display ------------------------------------------------
const ver = await page.$eval('#loading-version', (e) => e.textContent);
check(`loading screen shows v${VERSION}`, ver.includes(`v${VERSION}`), ver);

// -- Group 2a/2b: plume + label parenting -------------------------------------
const parenting = await page.evaluate(() => {
  const { renderer } = window.__sse;
  const io = renderer.bodyMeshes.get('Io');
  const plumesOnMesh = io.plumes.length > 0 && io.plumes.every(
    (p) => p.points.parent === io.mesh && p.hotspot.parent === io.mesh);
  const europa = renderer.bodyMeshes.get('Europa');
  const labelsOnMesh = europa.featureSprites?.length > 0 &&
    europa.featureSprites.every((s) => s.parent === europa.mesh);
  return { plumesOnMesh, labelsOnMesh, plumeCount: io.plumes.length };
});
check('Io plumes + hotspots parented to mesh', parenting.plumesOnMesh, JSON.stringify(parenting));
check('Europa feature labels parented to mesh', parenting.labelsOnMesh);

// Functional: hotspot world bearing must track mesh rotation (sim-time based).
const plumeTrack = await page.evaluate(() => {
  const { renderer, physics, THREE } = window.__sse;
  const io = renderer.bodyMeshes.get('Io');
  const hs = io.plumes[0].hotspot;
  const rel = () => {
    const w = hs.getWorldPosition(new THREE.Vector3())
      .sub(io.group.getWorldPosition(new THREE.Vector3()));
    return Math.atan2(-w.z, w.x);
  };
  const before = { rot: io.mesh.rotation.y, ang: rel() };
  physics.setTimeIndex(4); // 500x top step (v10.0.10) — 800 iters keeps the
  for (let i = 0; i < 800; i++) physics.update(0.05); // old 20,000 sim-s window
  renderer.update(physics, 0.05, 1);
  physics.setTimeIndex(1);
  const after = { rot: io.mesh.rotation.y, ang: rel() };
  const norm = (a) => Math.atan2(Math.sin(a), Math.cos(a));
  const dRot = norm(after.rot - before.rot);
  const dAng = norm(after.ang - before.ang);
  return { dRot, dAng, err: Math.abs(norm(dAng - dRot)) };
});
check('hotspot bearing tracks Io rotation at 10,000x',
  Math.abs(plumeTrack.dRot) > 0.05 && plumeTrack.err < 0.02, JSON.stringify(plumeTrack));

// -- Group 2c: shapes + aspect guard -------------------------------------------
const shapes = await page.evaluate(() => {
  const { renderer } = window.__sse;
  const am = renderer.bodyMeshes.get('Amalthea').mesh.scale;
  const io = renderer.bodyMeshes.get('Io').mesh.scale;
  const jup = renderer.primaryMesh.scale;
  return {
    amalthea: [am.x, +am.y.toFixed(3), +am.z.toFixed(3)],
    ioUnit: io.x === 1 && io.y === 1 && io.z === 1,
    jupOblate: +(jup.y / jup.x).toFixed(4),
  };
});
check('Amalthea ellipsoid 1 : 0.584 : 0.512',
  shapes.amalthea[0] === 1 && Math.abs(shapes.amalthea[1] - 0.584) < 0.001 &&
  Math.abs(shapes.amalthea[2] - 0.512) < 0.001, JSON.stringify(shapes));
check('Galilean moons perfect spheres', shapes.ioUnit);
check('Jupiter oblate Y = 0.9351', Math.abs(shapes.jupOblate - 0.9351) < 0.0005, String(shapes.jupOblate));

const aspectGuard = await page.evaluate(() => {
  const { renderer, physics } = window.__sse;
  renderer.camera.aspect = 3.7;
  renderer.update(physics, 0.016, 2);
  return renderer.camera.aspect;
});
check('render loop self-heals stale aspect',
  Math.abs(aspectGuard - 1280 / 800) < 0.01, String(aspectGuard));

// -- Group 3a: retrograde inclination -------------------------------------------
const inc = await page.evaluate(() => {
  const { cameraCtl, physics } = window.__sse;
  const run = (deg) => {
    cameraCtl.setMode('insertion', 'Jupiter');
    cameraCtl.setInsertion({ incDeg: deg, locked: false, altitudeKm: 20000 });
    const p0 = cameraCtl.ins.phase;
    for (let i = 0; i < 20; i++) { physics.update(0.1); cameraCtl.update(0.1); }
    return cameraCtl.ins.phase - p0;
  };
  const fwd = run(45);
  const back = run(-45);
  return { fwd, back };
});
check('inclination +45 advances phase', inc.fwd > 1e-4, JSON.stringify(inc));
check('inclination -45 is retrograde (phase reverses)', inc.back < -1e-4, JSON.stringify(inc));

// -- Group 3b: altitude slider -----------------------------------------------------
const alt = await page.evaluate(() => {
  const readout = document.querySelector('.alt-readout');
  const slider = readout?.parentElement.querySelector('input.slider');
  if (!slider) return { present: false };
  const { cameraCtl } = window.__sse;
  cameraCtl.setMode('orbit', 'Jupiter');
  slider.value = 0.5; // log midpoint of 50..500,000 = ~5,000 km
  slider.dispatchEvent(new Event('input'));
  const tween = cameraCtl.distTween;
  for (let i = 0; i < 80; i++) cameraCtl.update(0.05); // settle 4 s of updates
  const entry = window.__sse.renderer.bodyMeshes.get('Jupiter');
  const altKm = (cameraCtl.orbDist - entry.radiusUnits) * 1000;
  return { present: true, tweenTo: tween?.to, altKm, readout: readout.textContent };
});
check('altitude slider present + readout', alt.present && /ALT:/.test(alt.readout), JSON.stringify(alt));
check('slider drag flies camera to ~5,000 km', Math.abs(alt.altKm - 5000) < 100, String(alt.altKm));

// -- Group 3c: presentation mode -----------------------------------------------------
const pres = await page.evaluate(() => {
  const fs = !!document.querySelector('.fs-btn');
  const eye = document.querySelector('[data-tray="presentation"]');
  window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyP', bubbles: true }));
  const on = document.body.classList.contains('presentation-mode');
  const hudHidden = !document.querySelector('.hud-ghost').checkVisibility();
  const panelHidden = !document.querySelector('.icon-stack').checkVisibility();
  const eyeVisible = eye.checkVisibility();
  window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyP', bubbles: true }));
  const off = !document.body.classList.contains('presentation-mode');
  const hudBack = document.querySelector('.hud-ghost').checkVisibility();
  return { fs, on, hudHidden, panelHidden, eyeVisible, off, hudBack };
});
check('fullscreen button present', pres.fs);
check('P hides all UI except exit eye',
  pres.on && pres.hudHidden && pres.panelHidden && pres.eyeVisible, JSON.stringify(pres));
check('P restores UI', pres.off && pres.hudBack);

// -- Group 3d: GRS preset ---------------------------------------------------------------
const grs = await page.evaluate(() => {
  const { cameraCtl, renderer, THREE } = window.__sse;
  const preset = renderer.system.primary.navPresets[0];
  cameraCtl.flyToFeature('Jupiter', preset);
  for (let i = 0; i < 120; i++) cameraCtl.update(0.05); // settle 6 s of updates
  const entry = renderer.bodyMeshes.get('Jupiter');
  const altKm = (cameraCtl.orbDist - entry.radiusUnits) * 1000;
  // Recompute the GRS bearing and compare with the camera bearing.
  const de = renderer.detailEntries.find((e) => e.name === 'Jupiter');
  const u = de.uniforms[preset.uniformUV].value;
  const az = u.x * Math.PI * 2, pol = (1 - u.y) * Math.PI;
  const local = new THREE.Vector3(
    -Math.cos(az) * Math.sin(pol), Math.cos(pol), Math.sin(az) * Math.sin(pol));
  const dir = local.applyQuaternion(entry.mesh.getWorldQuaternion(new THREE.Quaternion())).normalize();
  const camDir = renderer.camera.position.clone()
    .sub(entry.group.getWorldPosition(new THREE.Vector3())).normalize();
  const sepDeg = THREE.MathUtils.radToDeg(Math.acos(Math.min(1, dir.dot(camDir))));
  return { mode: cameraCtl.mode, target: cameraCtl.target, altKm, sepDeg, uv: [u.x, u.y] };
});
check('GRS preset enters orbit mode on Jupiter', grs.mode === 'orbit' && grs.target === 'Jupiter');
check('GRS preset reaches ~20,000 km', Math.abs(grs.altKm - 20000) < 400, String(grs.altKm));
check('camera parked over GRS (< 10 deg separation)', grs.sepDeg < 10, `${grs.sepDeg.toFixed(1)} deg`);

// -- Group 4a: detail-aware zoom floor ---------------------------------------------------
const floor = await page.evaluate(() => {
  const { cameraCtl, renderer } = window.__sse;
  const altOf = (body) =>
    (cameraCtl.orbDist - renderer.bodyMeshes.get(body).radiusUnits) * 1000;
  const run = (body) => {
    cameraCtl.setMode('orbit', body);
    cameraCtl.distTween = null;
    // Zoom in hard: 400 aggressive pinches.
    const speeds = [];
    let prev = altOf(body);
    for (let i = 0; i < 400; i++) {
      cameraCtl._pinch(400);
      if (i % 40 === 0) { speeds.push(prev - altOf(body)); prev = altOf(body); }
    }
    return { finalAlt: altOf(body), speeds };
  };
  const jup = run('Jupiter');
  const io = run('Io');
  // Resistance check: zoom out to 2,900 km (below soft floor 3,000) on
  // Jupiter and compare one pinch there vs one pinch at 10,000 km.
  cameraCtl.setMode('orbit', 'Jupiter');
  const entry = window.__sse.renderer.bodyMeshes.get('Jupiter');
  cameraCtl.orbDist = entry.radiusUnits + 10;
  const a0 = altOf('Jupiter'); cameraCtl._pinch(200);
  const dFar = a0 - altOf('Jupiter');
  cameraCtl.orbDist = entry.radiusUnits + 2.9;
  const a1 = altOf('Jupiter'); cameraCtl._pinch(200);
  const dSoft = a1 - altOf('Jupiter');
  return { jupFinal: jup.finalAlt, ioFinal: io.finalAlt, dFar, dSoft };
});
check('Jupiter zoom converges on 1,500 km floor (never below)',
  floor.jupFinal >= 1499 && floor.jupFinal < 1700, String(floor.jupFinal));
check('Io zoom converges on 150 km floor (never below)',
  floor.ioFinal >= 149.9 && floor.ioFinal < 170, String(floor.ioFinal));
check('quadratic resistance below soft floor',
  floor.dSoft < floor.dFar * 0.6 && floor.dSoft >= 0, JSON.stringify(floor));

// -- Console errors ---------------------------------------------------------------------
const realErrors = consoleErrors.filter((e) => !/favicon|404/i.test(e));
check('zero console errors', realErrors.length === 0, realErrors.slice(0, 3).join(' | '));

await browser.close();
console.log(`\n${pass} passed, ${fail} failed${fail ? ' â€” ' + failures.join(', ') : ''}`);
process.exit(fail ? 1 : 0);
