// V7 Saturn system suite — run against `npm run dev`:
//   SMOKE_URL=http://localhost:5173 node tests/saturntest.mjs
// House rules: assert against physics.simSeconds / direct state, never wall
// clock; settle cameras via cameraCtl.update() loops.
import puppeteer from 'puppeteer-core';

const CHROME = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const BASE = process.env.SMOKE_URL || 'http://localhost:5173';

let pass = 0, fail = 0;
const failures = [];
function check(name, ok, detail = '') {
  if (ok) { pass++; console.log(`  ok  ${name}`); }
  else { fail++; failures.push(name); console.log(`FAIL  ${name} ${detail}`); }
}

const browser = await puppeteer.launch({
  executablePath: CHROME, headless: 'new',
  args: ['--use-gl=angle', '--enable-unsafe-swiftshader', '--window-size=1280,800'],
});
const page = await browser.newPage();
await page.setViewport({ width: 1280, height: 800 });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });

await page.goto(`${BASE}/?system=saturn`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction('window.__sse && window.__sse.physics', { timeout: 60000 });
await page.waitForFunction(
  'document.getElementById("loading-screen").classList.contains("done")', { timeout: 60000 });
await new Promise((r) => setTimeout(r, 2500));

// -- Group 1: system composition ----------------------------------------------
const comp = await page.evaluate(() => {
  const { physics, renderer } = window.__sse;
  return {
    moons: physics.bodies.map((b) => b.name),
    ringMeshes: renderer.ringMeshes.length,
    hasTex: renderer.ringMeshes[0]?.material.uniforms?.uHasTex?.value ?? -1,
    styles: Object.fromEntries(renderer.detailEntries.map((e) => [e.name, e.detail.style])),
    navRows: [...document.querySelectorAll('.nav-travel, .body-row, .preset-row')].length > 0,
  };
});
check('all 9 moons present', comp.moons.length === 9, comp.moons.join(','));
check('textured ring disc built + Cassini strip loaded',
  comp.ringMeshes === 1 && comp.hasTex === 1, JSON.stringify(comp));
check('detail styles: kronos + enceladus + iapetus + 6 cratered',
  comp.styles.Saturn === 'kronos' && comp.styles.Enceladus === 'enceladus'
  && comp.styles.Iapetus === 'iapetus' && comp.styles.Mimas === 'cratered'
  && comp.styles.Phoebe === 'cratered', JSON.stringify(comp.styles));

// -- Group 2: orbits — inclination + retrograde (sim-time based) ---------------
const orbits = await page.evaluate(() => {
  const { physics } = window.__sse;
  physics.setTimeIndex(0);
  const ang = (b) => Math.atan2(-b.pos.z, b.pos.x);
  const before = {};
  for (const b of physics.bodies) before[b.name] = { ang: ang(b), y: b.pos.y };
  physics.setTimeIndex(5); // 10,000x
  for (let i = 0; i < 40; i++) physics.update(0.05);
  physics.setTimeIndex(0);
  const out = {};
  for (const b of physics.bodies) {
    const d = ang(b) - before[b.name].ang;
    out[b.name] = {
      dAng: Math.atan2(Math.sin(d), Math.cos(d)),
      y: b.pos.y,
      r: Math.hypot(b.pos.x, b.pos.y, b.pos.z) / b.a,
    };
  }
  return out;
});
check('Titan orbits prograde', orbits.Titan.dAng > 0.001, `dAng ${orbits.Titan.dAng.toFixed(4)}`);
check('Phoebe orbits RETROGRADE (opposite to all others)',
  orbits.Phoebe.dAng < -0.00001 && orbits.Titan.dAng > 0,
  `Phoebe ${orbits.Phoebe.dAng.toFixed(5)} vs Titan ${orbits.Titan.dAng.toFixed(4)}`);
check('Iapetus orbit inclined (out of ring plane)', Math.abs(orbits.Iapetus.y) > 1e5,
  `y ${orbits.Iapetus.y.toFixed(0)} km`);
check('all orbit radii stay on their circles', Object.values(orbits).every((o) => Math.abs(o.r - 1) < 0.01));

// -- Group 3: Hyperion tumbles, Titan shell, geysers ---------------------------
const bodiesInfo = await page.evaluate(() => {
  const { physics, renderer } = window.__sse;
  const hyp = renderer.bodyMeshes.get('Hyperion');
  const r0 = { x: hyp.mesh.rotation.x, y: hyp.mesh.rotation.y, z: hyp.mesh.rotation.z };
  physics.setTimeIndex(5);
  for (let i = 0; i < 30; i++) physics.update(0.05);
  renderer.update(physics, 0.016, 1);
  physics.setTimeIndex(0);
  const r1 = { x: hyp.mesh.rotation.x, y: hyp.mesh.rotation.y, z: hyp.mesh.rotation.z };
  const titan = renderer.bodyMeshes.get('Titan');
  const shell = titan.group.children.find((c) => c.material?.userData?.altitudeBody === 'Titan');
  const enc = renderer.bodyMeshes.get('Enceladus');
  return {
    tumble: { dx: Math.abs(r1.x - r0.x), dy: Math.abs(r1.y - r0.y), dz: Math.abs(r1.z - r0.z) },
    titanShell: !!shell,
    titanNormalBlend: shell ? shell.material.blending === window.__sse.THREE.NormalBlending : false,
    geysers: enc.plumes.length,
    geysersOnMesh: enc.plumes.every((p) => p.points.parent === enc.mesh),
  };
});
check('Hyperion tumbles on all three axes',
  bodiesInfo.tumble.dx > 1e-4 && bodiesInfo.tumble.dy > 1e-4 && bodiesInfo.tumble.dz > 1e-4,
  JSON.stringify(bodiesInfo.tumble));
check('Titan opaque haze shell (normal blending)', bodiesInfo.titanShell && bodiesInfo.titanNormalBlend);
check('Enceladus: 4 geyser plumes parented to the mesh',
  bodiesInfo.geysers === 4 && bodiesInfo.geysersOnMesh);

// -- Group 4: Cassini Division reads in pixels (top-down render) ---------------
const division = await page.evaluate(() => {
  const { renderer, physics, cameraCtl, THREE } = window.__sse;
  cameraCtl.setMode('free');
  renderer.camera.position.set(0, 320, 0.001);
  renderer.camera.lookAt(0, 0, 0);
  renderer.camera.fov = 48; renderer.camera.updateProjectionMatrix();
  renderer.update(physics, 0.016, 1);
  renderer.renderer.render(renderer.scene, renderer.camera);
  const gl = renderer.renderer.getContext();
  const w = gl.drawingBufferWidth, h = gl.drawingBufferHeight;
  const px = new Uint8Array(w * h * 4);
  gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, px);
  // Project three radii to screen: B ring (105k km), Cassini center
  // (119.9k km), A ring (130k km) along +x from Saturn at origin.
  const sample = (rUnits) => {
    const p = new THREE.Vector3(rUnits, 0, 0).applyQuaternion(renderer.root.quaternion)
      .project(renderer.camera);
    const sx = Math.round((p.x * 0.5 + 0.5) * w), sy = Math.round((p.y * 0.5 + 0.5) * h);
    let lum = 0, n = 0;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const i = ((sy + dy) * w + (sx + dx)) * 4;
      lum += (px[i] + px[i + 1] + px[i + 2]) / 3; n++;
    }
    return lum / n;
  };
  return { b: sample(105), division: sample(119.9), a: sample(130) };
});
check('Cassini Division darker than B and A rings (pixel probe)',
  division.b > division.division * 1.8 && division.a > division.division * 1.2,
  JSON.stringify(division));

// -- Group 5: ring plane fly-in — disc only, no particle overlay ----------------
// (Particle system removed post-v7 — white blob snowflakes on hardware.)
const ringPlane = await page.evaluate(() => {
  const { renderer, physics, THREE } = window.__sse;
  // Inside the ring plane at low altitude (root frame carries the tilt).
  renderer.camera.position.copy(
    renderer.root.localToWorld(new THREE.Vector3(110, 1.0, 0)));
  renderer.camera.lookAt(renderer.root.localToWorld(new THREE.Vector3(130, 0, 0)));
  renderer.update(physics, 0.016, 1);
  return {
    noParticles: !renderer.ringParticles,
    noPointsInRoot: !renderer.root.children.some(
      (c) => c.isPoints && c.geometry?.attributes?.aSeed),
    discVisible: renderer.ringMeshes[0]?.visible === true,
  };
});
check('ring particle system fully removed', ringPlane.noParticles && ringPlane.noPointsInRoot);
check('ring disc still renders in the ring plane', ringPlane.discVisible);

// -- Group 6: FOV / telephoto ---------------------------------------------------
const fov = await page.evaluate(() => {
  const { renderer, ui } = window.__sse;
  const out = { start: renderer.camera.fov };
  ui.setFov(25, true);
  out.after25 = renderer.camera.fov;
  document.querySelector('[data-tray="telephoto"]').click();
  out.afterTele = renderer.camera.fov; // 25 < threshold 30 -> back to normal 48
  document.querySelector('[data-tray="telephoto"]').click();
  out.afterTele2 = renderer.camera.fov; // 48 -> telephoto 10
  const slider = ui.fovSlider;
  slider.value = 1.0; slider.dispatchEvent(new Event('input'));
  out.afterSlider = renderer.camera.fov;
  ui.setFov(48, true);
  return out;
});
check('FOV slider + setFov change the camera live', fov.after25 === 25 && fov.afterSlider === 90,
  JSON.stringify(fov));
check('🔭 toggles telephoto ↔ normal', fov.afterTele === 48 && fov.afterTele2 === 10,
  JSON.stringify(fov));

// -- Group 7: curated presets + no dust slider ----------------------------------
const presets = await page.evaluate(() => {
  const labels = [...document.querySelectorAll('.preset-row')].map((b) => b.textContent);
  const run = (label) => {
    const btn = [...document.querySelectorAll('.preset-row')].find((b) => b.textContent.includes(label));
    if (!btn) return null;
    btn.click();
    const { cameraCtl } = window.__sse;
    for (let i = 0; i < 60; i++) cameraCtl.update(0.05);
    return { mode: cameraCtl.mode, target: cameraCtl.target,
      insAlt: cameraCtl.ins?.altitudeKm, fov: window.__sse.renderer.camera.fov };
  };
  return {
    labels,
    ringPlane: run('Ring Plane View'),
    through: run('Through the Rings'),
    titan: run('Titan Close Pass'),
    mimas: run('Death Star View'),
    dustSlider: !!document.querySelector('.stack-panel input.slider') // any slider exists
      && [...document.querySelectorAll('.alt-readout')].some((e) => e.textContent.includes('DUST')),
  };
});
const wantPresets = ['Ring Plane View', 'Ring Edge-On', 'Through the Rings',
  'Titan Close Pass', 'Enceladus Geysers', 'Iapetus Boundary', 'Death Star View'];
check('all 7 Saturn presets listed',
  wantPresets.every((wp) => presets.labels.some((l) => l.includes(wp))), presets.labels.join(','));
check('Ring Plane View: insertion at 150,000 km',
  presets.ringPlane?.mode === 'insertion' && presets.ringPlane?.insAlt === 150000,
  JSON.stringify(presets.ringPlane));
check('Through the Rings: orbit mode + 25° FOV',
  presets.through?.mode === 'orbit' && presets.through?.fov === 25, JSON.stringify(presets.through));
check('Titan Close Pass: insertion on Titan at 500 km',
  presets.titan?.mode === 'insertion' && presets.titan?.target === 'Titan'
  && presets.titan?.insAlt === 500, JSON.stringify(presets.titan));
check('Death Star View: orbit mode on Mimas',
  presets.mimas?.mode === 'orbit' && presets.mimas?.target === 'Mimas', JSON.stringify(presets.mimas));
check('dust storm slider NOT shown for Saturn (Mars only)', presets.dustSlider === false);

check('zero console errors', errors.length === 0, errors.slice(0, 4).join(' | '));

await browser.close();
console.log(`\n${pass} passed, ${fail} failed${fail ? ' — ' + failures.join(', ') : ''}`);
process.exit(fail ? 1 : 0);
