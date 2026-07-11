// Systematic Orbit Insertion measurement (per V4d follow-up session spec).
// Part 1: pure geometry table — pose evaluated directly at fixed phases
//         (nodePhase=0 so latitude should equal sin(phase)·sin(inc)).
// Part 2: interactive drag probe — from a real entry, drag INC right
//         (0→+45) and left (0→-45) in 1° steps; record radius envelope
//         ("oval" metric), planet NDC, latitude — quantify any asymmetry.
// Part 3: ring geometry — reachable altitudes vs ring span.
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
  const { cameraCtl, physics, renderer, THREE } = window.__sse;
  physics.setTimeIndex(0);
  const center = () => renderer.bodyWorldPos('Jupiter', new THREE.Vector3());

  // ---- Part 1: geometry table --------------------------------------------
  cameraCtl.setMode('insertion', 'Jupiter');
  cameraCtl.setInsertion({ body: 'Jupiter', altitudeKm: 214274, locked: false });
  cameraCtl.blend = 1;
  const table = [];
  for (const inc of [-90, -60, -45, -30, -15, 0, 15, 30, 45, 60, 90]) {
    for (const ph of [0, Math.PI / 2, Math.PI, 3 * Math.PI / 2]) {
      cameraCtl.ins.incDeg = inc;
      cameraCtl.ins.nodePhase = 0;   // pure math: node on +X
      cameraCtl.ins.phase = ph;
      cameraCtl.ins.yaw = 0; cameraCtl.ins.pitch = -1.45;
      cameraCtl.blend = 1;
      cameraCtl.update(0.016);
      const cam = cameraCtl.camera;
      const c = center();
      const rel = cam.position.clone().sub(c);
      // De-tilt into Jupiter's equatorial frame for a clean latitude.
      const relEq = rel.clone().applyQuaternion(renderer.root.quaternion.clone().invert());
      const lat = THREE.MathUtils.radToDeg(Math.asin(relEq.clone().normalize().y));
      const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(cam.quaternion);
      const toC = c.clone().sub(cam.position).normalize();
      const fwdAngle = THREE.MathUtils.radToDeg(Math.acos(THREE.MathUtils.clamp(fwd.dot(toC), -1, 1)));
      const up = new THREE.Vector3(0, 1, 0).applyQuaternion(cam.quaternion);
      const upAngle = THREE.MathUtils.radToDeg(Math.acos(THREE.MathUtils.clamp(up.y, -1, 1)));
      table.push({
        inc, phaseDeg: Math.round(THREE.MathUtils.radToDeg(ph)),
        lat: +lat.toFixed(1),
        expectedLat: +(THREE.MathUtils.radToDeg(Math.asin(
          Math.sin(ph) * Math.sin(THREE.MathUtils.degToRad(Math.abs(inc)))))).toFixed(1),
        radiusU: +rel.length().toFixed(1),
        fwdToCenterDeg: +fwdAngle.toFixed(1),
        upVsWorldYDeg: +upAngle.toFixed(1),
      });
    }
  }

  // ---- Part 2: drag probe, right vs left ----------------------------------
  const dragProbe = (target) => {
    // Fresh, realistic entry each time.
    cameraCtl.setMode('orbit', 'Jupiter');
    cameraCtl.orbSpeedMult = 0;
    cameraCtl.orbDist = renderer.bodyRadius('Jupiter') * 4;
    for (let i = 0; i < 30; i++) cameraCtl.update(0.05);
    cameraCtl.ins.incDeg = 0;
    cameraCtl.setMode('insertion', 'Jupiter');
    for (let i = 0; i < 30; i++) cameraCtl.update(0.05);
    const c = center();
    let rMin = 1e9, rMax = 0, offMax = 0, latEnd = 0;
    const step = target > 0 ? 1 : -1;
    for (let d = step; Math.abs(d) <= Math.abs(target); d += step) {
      cameraCtl.setInsertion({ incDeg: d });
      for (let i = 0; i < 6; i++) cameraCtl.update(0.016); // ~100ms between ticks (drag speed)
      const rel = cameraCtl.camera.position.clone().sub(c);
      rMin = Math.min(rMin, rel.length()); rMax = Math.max(rMax, rel.length());
      const cam = cameraCtl.camera;
      cam.updateMatrixWorld(true);
      cam.matrixWorldInverse.copy(cam.matrixWorld).invert();
      const p = c.clone().project(cam);
      offMax = Math.max(offMax, Math.hypot(p.x, p.y));
      const relEq = rel.clone().applyQuaternion(renderer.root.quaternion.clone().invert());
      latEnd = THREE.MathUtils.radToDeg(Math.asin(relEq.clone().normalize().y));
    }
    for (let i = 0; i < 40; i++) cameraCtl.update(0.05); // settle
    const relF = cameraCtl.camera.position.clone().sub(c);
    const relFEq = relF.clone().applyQuaternion(renderer.root.quaternion.clone().invert());
    return {
      target,
      radiusMinU: +rMin.toFixed(1), radiusMaxU: +rMax.toFixed(1),
      ovality: +((rMax - rMin) / rMax).toFixed(3),
      maxCenterOff: +offMax.toFixed(2),
      midDragLat: +latEnd.toFixed(1),
      settledLat: +THREE.MathUtils.radToDeg(
        Math.asin(relFEq.clone().normalize().y)).toFixed(1),
      settledRadiusU: +relF.length().toFixed(1),
    };
  };
  const dragRight = dragProbe(45);
  const dragLeft = dragProbe(-45);

  // ---- Part 3: rings -------------------------------------------------------
  const rings = {
    ringSpanKmFromCenter: [129000, 226000],
    jupiterRadiusKm: 71492,
    altSliderRangeKm: [50, 500000],
    insideRingAltRangeKm: [129000 - 71492, 226000 - 71492],
    entryFramingAltKm: Math.round(renderer.bodyRadius('Jupiter') * 1000 * 3.7),
    geosyncAltKm: 160000 - 71492,
  };
  return { table, dragRight, dragLeft, rings };
});

console.log('inc | phase | lat (expected) | radius | fwd->center | up-vs-Y');
for (const t of res.table) {
  console.log(
    `${String(t.inc).padStart(4)} | ${String(t.phaseDeg).padStart(4)} | `
    + `${String(t.lat).padStart(6)} (${String(t.expectedLat).padStart(6)}) | `
    + `${t.radiusU} | ${t.fwdToCenterDeg} | ${t.upVsWorldYDeg}`);
}
console.log('\ndrag right +45:', JSON.stringify(res.dragRight));
console.log('drag left  -45:', JSON.stringify(res.dragLeft));
console.log('\nrings:', JSON.stringify(res.rings, null, 1));

// Assertions.
let pass = 0, fail = 0;
const check = (n, ok, d = '') => {
  if (ok) { pass++; console.log(`  ok  ${n}`); } else { fail++; console.log(`FAIL  ${n} ${d}`); }
};
check('latitude == sin(phase)·sin(inc) for ALL inc/phase (±0.5°)',
  res.table.every((t) => Math.abs(t.lat - t.expectedLat) <= 0.5));
check('radius constant — circular at every inc/phase',
  res.table.every((t) => Math.abs(t.radiusU - res.table[0].radiusU) < 0.5));
check('drag right: settles at ~45° latitude',
  Math.abs(res.dragRight.settledLat - 45) < 4, res.dragRight.settledLat);
check('drag left: settles at ~45° latitude (|inc| plane, retrograde)',
  Math.abs(res.dragLeft.settledLat - 45) < 4, res.dragLeft.settledLat);
check('drag ovality tiny + symmetric',
  res.dragRight.ovality < 0.03 && res.dragLeft.ovality < 0.03
  && Math.abs(res.dragRight.ovality - res.dragLeft.ovality) < 0.01);
check('planet stays framed during both drags',
  res.dragRight.maxCenterOff <= 0.45 && res.dragLeft.maxCenterOff <= 0.45);
console.log(`\n${pass} passed, ${fail} failed; errors: ${errors.length}`);
await browser.close();
process.exit(fail || errors.length ? 1 : 0);
