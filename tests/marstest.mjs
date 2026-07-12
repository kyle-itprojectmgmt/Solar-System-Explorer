// V6 Mars system guard — earthtest.mjs's sibling. Verifies the system
// loads, the ares detail style + dust atmosphere compile clean at close
// range, both moons orbit at the right radii with Phobos outrunning the
// planet's spin (prograde), labels register, and the dust-storm uniform
// responds. Zero console errors required.
import puppeteer from 'puppeteer-core';

const CHROME = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const BASE = process.env.SMOKE_URL || 'http://localhost:5173';

let pass = 0, fail = 0;
const check = (name, ok, detail = '') => {
  console.log(`${ok ? ' ok ' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
  ok ? pass++ : fail++;
};

const browser = await puppeteer.launch({
  executablePath: CHROME, headless: 'new',
  args: ['--use-gl=angle', '--enable-unsafe-swiftshader', '--window-size=1280,800'],
});
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
await page.setViewport({ width: 1280, height: 800 });
await page.goto(`${BASE}/?system=mars`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction('window.__sse && window.__sse.physics', { timeout: 60000 });
await page.waitForFunction(
  'document.getElementById("loading-screen").classList.contains("done")', { timeout: 60000 });
await new Promise((r) => setTimeout(r, 2500));

const state = await page.evaluate(() => {
  const { physics, renderer, cameraCtl, ui, THREE } = window.__sse;
  const out = {};
  out.primary = renderer.system.primary.name;
  out.bodyNames = renderer.system.bodies.map((b) => b.name);

  // Moon orbit radii (units of 1,000 km) at epoch.
  physics.setTimeIndex(0);
  physics.jumpToSimSeconds(0);
  renderer.update(physics, 0.016, 1);
  const center = renderer.primaryMesh.getWorldPosition(new THREE.Vector3());
  const posOf = (n) => renderer.bodyWorldPos(n, new THREE.Vector3()).clone();
  out.phobosR = posOf('Phobos').sub(center).length() * 1000;
  out.deimosR = posOf('Deimos').sub(center).length() * 1000;

  // Phobos direction + speed: angular rate vs the planet's spin rate.
  // Prograde ground-truth (orbitdir.mjs convention): the moon's world
  // angle must advance in the SAME sense as the planet's rotation, faster.
  const ang = (n) => {
    const p = posOf(n).sub(center);
    return Math.atan2(p.z, p.x);
  };
  const meshRotY = () => renderer.bodyMeshes.get('Mars').mesh.rotation.y;
  const a0 = ang('Phobos'), r0 = meshRotY();
  physics.jumpToSimSeconds(600); // +10 sim-minutes
  renderer.update(physics, 0.016, 1);
  const wrapPi = (x) => ((x + Math.PI) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI) - Math.PI;
  out.phobosStep = wrapPi(ang('Phobos') - a0);
  out.marsSpinStep = wrapPi(meshRotY() - r0);

  // ares detail entry + dust uniform + dust shell material.
  const entry = renderer.detailEntries.find((e) => e.name === 'Mars');
  out.hasAres = !!entry;
  out.hasDustUniform = !!entry?.uniforms?.uDustStorm;
  out.dustValue = entry?.uniforms?.uDustStorm?.value;
  out.atmoIsShader = !!renderer.atmosphereMesh?.material?.uniforms?.uSunW;

  // Drop to 1,500 km — ares must blend in and COMPILE (errors surface on
  // the first frame it renders).
  cameraCtl.setMode('orbit', 'Mars');
  cameraCtl.orbSpeedMult = 0;
  cameraCtl.setAltitudeDirect(1500);
  for (let i = 0; i < 60; i++) cameraCtl.update(0.05);
  renderer.update(physics, 0.016, 1);
  renderer.renderer.render(renderer.scene, renderer.camera);
  out.blend = renderer.getDetailBlend('Mars');

  // Storm uniform responds (simulates the VIEW slider write).
  if (entry?.uniforms?.uDustStorm) {
    entry.uniforms.uDustStorm.value = 1.0;
    renderer.renderer.render(renderer.scene, renderer.camera);
    entry.uniforms.uDustStorm.value = out.dustValue;
  }

  // Surface feature labels registered for Mars.
  out.featureCount = renderer.system.primary.surfaceFeatures?.length ?? 0;

  // Moons render as ellipsoids (radii config -> non-uniform mesh scale).
  const ph = renderer.bodyMeshes.get('Phobos');
  out.phobosScale = ph ? [ph.mesh.scale.x, ph.mesh.scale.y, ph.mesh.scale.z]
    .map((v) => +v.toFixed(3)) : null;

  // Dust slider present in the VIEW panel.
  out.hasDustSlider = !!ui.dustSlider;
  return out;
});

check('Mars is primary', state.primary === 'Mars');
check('Phobos + Deimos present', state.bodyNames.join(',') === 'Phobos,Deimos', state.bodyNames.join(','));
check('Phobos orbit ~9,376 km', Math.abs(state.phobosR - 9376) < 200, `${state.phobosR.toFixed(0)} km`);
check('Deimos orbit ~23,463 km', Math.abs(state.deimosR - 23463) < 300, `${state.deimosR.toFixed(0)} km`);
// Sign convention: rotation about +Y maps (1,0,0) -> (cosθ, 0, -sinθ), so a
// prograde-spinning surface has DECREASING atan2(z,x). Prograde moon =
// same sense as the surface = opposite sign to mesh.rotation.y's step.
check('Phobos and Mars spin the same sense (prograde)',
  Math.sign(state.phobosStep) === -Math.sign(state.marsSpinStep) && state.marsSpinStep !== 0,
  `phobos ${state.phobosStep.toFixed(5)} rad vs surface ${(-state.marsSpinStep).toFixed(5)} rad / 10 min`);
check('Phobos outruns the planet\'s rotation',
  Math.abs(state.phobosStep) > Math.abs(state.marsSpinStep),
  `${(state.phobosStep / state.marsSpinStep).toFixed(2)}x`);
check('ares detail registered with uDustStorm', state.hasAres && state.hasDustUniform,
  `initial ${state.dustValue}`);
check('dust atmosphere is the shader shell', state.atmoIsShader);
check('ares blending at 1,500 km', state.blend > 0.9, `blend ${state.blend?.toFixed(2)}`);
check('10 surface features configured', state.featureCount === 10, `${state.featureCount}`);
check('Phobos ellipsoid scale (y,z < x)', state.phobosScale
  && state.phobosScale[1] < 1 && state.phobosScale[2] < 1,
  JSON.stringify(state.phobosScale));
check('dust slider in VIEW panel', state.hasDustSlider);

await new Promise((r) => setTimeout(r, 1200));
await page.screenshot({ path: 'tests/shots/v6-mars-1500km.png' });
check('zero console errors', errors.length === 0, errors.slice(0, 3).join(' | '));

console.log(`\n${pass} passed, ${fail} failed`);
await browser.close();
process.exit(fail === 0 ? 0 : 1);
