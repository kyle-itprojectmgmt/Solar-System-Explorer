// V8 four-system guard — Mercury / Venus / Uranus / Neptune. Verifies each
// system loads, the six new detail styles (hermes / aphrodite / ouranos /
// miranda / poseidon / triton) blend in and COMPILE at close range (three.js
// surfaces GLSL errors as console errors on first render), Uranus's polar-sun
// + over-the-poles moon geometry, Triton's retrograde orbit vs Proteus, and
// Triton's dark geyser plumes. Zero console errors required per system.
// Run against `npm run dev` (SMOKE_URL, default :5175).
import puppeteer from 'puppeteer-core';

const CHROME = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const BASE = process.env.SMOKE_URL || 'http://localhost:5175';

let pass = 0, fail = 0;
const check = (name, ok, detail = '') => {
  console.log(`${ok ? ' ok ' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
  ok ? pass++ : fail++;
};

const browser = await puppeteer.launch({
  executablePath: CHROME, headless: 'new',
  args: ['--use-gl=angle', '--enable-unsafe-swiftshader', '--window-size=1280,800'],
});

async function boot(system) {
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.setViewport({ width: 1280, height: 800 });
  await page.goto(`${BASE}/?system=${system}`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction('window.__sse && window.__sse.physics', { timeout: 60000 });
  await page.waitForFunction(
    'document.getElementById("loading-screen").classList.contains("done")', { timeout: 60000 });
  await new Promise((r) => setTimeout(r, 2000));
  return { page, errors };
}

// Drive the camera to a low altitude over a body and render, so the detail
// style must blend in and compile. Returns the resulting blend.
const DIVE = (body, altKm) => `(() => {
  const { physics, renderer, cameraCtl } = window.__sse;
  cameraCtl.setMode('orbit', ${JSON.stringify(body)});
  cameraCtl.orbSpeedMult = 0;
  cameraCtl.setAltitudeDirect(${altKm});
  for (let i = 0; i < 60; i++) cameraCtl.update(0.05);
  renderer.update(physics, 0.016, 1);
  renderer.renderer.render(renderer.scene, renderer.camera);
  return renderer.getDetailBlend(${JSON.stringify(body)});
})()`;

// -- Mercury ------------------------------------------------------------------
{
  const { page, errors } = await boot('mercury');
  const s = await page.evaluate(() => ({
    primary: window.__sse.renderer.system.primary.name,
    style: window.__sse.renderer.system.primary.detail?.style,
    bodies: window.__sse.renderer.system.bodies.length,
    hasAtmo: !!window.__sse.renderer.atmosphereMesh,
  }));
  check('mercury: system loads', s.primary === 'Mercury');
  check('mercury: hermes style configured, no moons, NO atmosphere shell',
    s.style === 'hermes' && s.bodies === 0 && !s.hasAtmo);
  const blend = await page.evaluate(DIVE('Mercury', 1500));
  await new Promise((r) => setTimeout(r, 1200));
  check('mercury: hermes blends in at 1,500 km', blend > 0.5, `blend=${blend?.toFixed(2)}`);
  check('mercury: zero console errors (hermes compiled)', errors.length === 0,
    errors.slice(0, 2).join(' | '));
  await page.close();
}

// -- Venus --------------------------------------------------------------------
{
  const { page, errors } = await boot('venus');
  const s = await page.evaluate(() => ({
    primary: window.__sse.renderer.system.primary.name,
    style: window.__sse.renderer.system.primary.detail?.style,
    hasAtmo: !!window.__sse.renderer.atmosphereMesh,
    // Super-rotation is alive from NAV distance (kronos-style activation).
    farBlend: window.__sse.renderer.getDetailBlend('Venus'),
  }));
  check('venus: system loads with limb atmosphere', s.primary === 'Venus' && s.hasAtmo);
  check('venus: aphrodite active from NAV-entry distance', s.style === 'aphrodite' && s.farBlend > 0,
    `farBlend=${s.farBlend?.toFixed(2)}`);
  const blend = await page.evaluate(DIVE('Venus', 3000));
  await new Promise((r) => setTimeout(r, 1200));
  check('venus: full cloud detail at 3,000 km', blend > 0.9, `blend=${blend?.toFixed(2)}`);
  check('venus: zero console errors (aphrodite compiled)', errors.length === 0,
    errors.slice(0, 2).join(' | '));
  await page.close();
}

// -- Uranus -------------------------------------------------------------------
{
  const { page, errors } = await boot('uranus');
  const s = await page.evaluate(() => {
    const { physics, renderer, THREE } = window.__sse;
    const out = {};
    out.primary = renderer.system.primary.name;
    out.rings = (renderer.ringMeshes || []).length;
    out.moons = renderer.system.bodies.map((b) => b.name);
    out.sunY = physics.sunDir.y; // LIVE: near-polar sun is the signature
    // Over-the-poles geometry: in WORLD space (root carries the 97.77 deg
    // tilt) a moon's orbit sweeps almost vertically. Sample Miranda's
    // world-Y amplitude across half an orbit.
    physics.setTimeIndex(0);
    const posY = [];
    for (let i = 0; i <= 8; i++) {
      physics.jumpToSimSeconds(i * (1.4135 * 86400) / 8);
      renderer.update(physics, 0.016, 1);
      posY.push(renderer.bodyWorldPos('Miranda', new THREE.Vector3()).y);
    }
    out.mirandaYAmp = (Math.max(...posY) - Math.min(...posY)) / 2 / 129.39; // vs orbit radius (units)
    return out;
  });
  check('uranus: system loads with ring disc', s.primary === 'Uranus' && s.rings === 1,
    `rings=${s.rings}`);
  check('uranus: five moons configured',
    JSON.stringify(s.moons) === JSON.stringify(['Miranda', 'Ariel', 'Umbriel', 'Titania', 'Oberon']),
    s.moons.join(','));
  check('uranus: LIVE sun is near-polar (|y| > 0.9)', Math.abs(s.sunY) > 0.9,
    `sunY=${s.sunY?.toFixed(3)}`);
  check('uranus: Miranda orbits OVER THE POLES in world space (Y amplitude > 0.9 R)',
    s.mirandaYAmp > 0.9, `amp=${s.mirandaYAmp?.toFixed(2)}`);
  const blend = await page.evaluate(DIVE('Uranus', 8000));
  await new Promise((r) => setTimeout(r, 1200));
  check('uranus: ouranos blends in at 8,000 km', blend > 0.5, `blend=${blend?.toFixed(2)}`);
  const mblend = await page.evaluate(DIVE('Miranda', 300));
  await new Promise((r) => setTimeout(r, 1200));
  check('uranus: miranda style blends in at 300 km', mblend > 0.5, `blend=${mblend?.toFixed(2)}`);
  check('uranus: zero console errors (ouranos + miranda compiled)', errors.length === 0,
    errors.slice(0, 2).join(' | '));
  await page.close();
}

// -- Neptune ------------------------------------------------------------------
{
  const { page, errors } = await boot('neptune');
  const s = await page.evaluate(() => {
    const { physics, renderer, THREE } = window.__sse;
    const out = {};
    out.primary = renderer.system.primary.name;
    out.moons = renderer.system.bodies.map((b) => b.name);

    // Retrograde probe: Triton's world angle must step OPPOSITE to
    // prograde Proteus over the same interval.
    physics.setTimeIndex(0);
    physics.jumpToSimSeconds(0);
    renderer.update(physics, 0.016, 1);
    const ang = (n) => {
      const p = renderer.bodyWorldPos(n, new THREE.Vector3());
      const c = renderer.primaryMesh.getWorldPosition(new THREE.Vector3());
      const q = renderer.root.quaternion.clone().invert();
      const v = p.sub(c).applyQuaternion(q); // equatorial frame
      return Math.atan2(-v.z, v.x);
    };
    const t0 = ang('Triton'), p0 = ang('Proteus');
    physics.jumpToSimSeconds(3600 * 4); // +4 sim-hours
    renderer.update(physics, 0.016, 1);
    const wrapPi = (x) => ((x + Math.PI) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI) - Math.PI;
    out.tritonStep = wrapPi(ang('Triton') - t0);
    out.proteusStep = wrapPi(ang('Proteus') - p0);

    // Triton's geysers: 4 dark plumes parented to the mesh.
    const entry = renderer.bodyMeshes.get('Triton');
    out.plumes = entry?.plumes?.length ?? 0;
    out.plumeParentedToMesh = !!entry && entry.plumes.every(
      (pl) => pl.points.parent === entry.mesh);
    return out;
  });
  check('neptune: system loads with Triton + Proteus',
    s.primary === 'Neptune' && JSON.stringify(s.moons) === JSON.stringify(['Triton', 'Proteus']),
    s.moons.join(','));
  check('neptune: Triton orbits RETROGRADE (opposite Proteus)',
    s.tritonStep * s.proteusStep < 0 && Math.abs(s.tritonStep) > 1e-4,
    `triton=${s.tritonStep?.toFixed(4)} proteus=${s.proteusStep?.toFixed(4)}`);
  check('neptune: 4 Triton geyser plumes parented to the rotating mesh',
    s.plumes === 4 && s.plumeParentedToMesh, `plumes=${s.plumes}`);
  const blend = await page.evaluate(DIVE('Neptune', 8000));
  await new Promise((r) => setTimeout(r, 1200));
  check('neptune: poseidon blends in at 8,000 km', blend > 0.5, `blend=${blend?.toFixed(2)}`);
  const tblend = await page.evaluate(DIVE('Triton', 400));
  await new Promise((r) => setTimeout(r, 1200));
  check('neptune: triton style blends in at 400 km', tblend > 0.5, `blend=${tblend?.toFixed(2)}`);
  check('neptune: zero console errors (poseidon + triton compiled)', errors.length === 0,
    errors.slice(0, 2).join(' | '));
  await page.close();
}

await browser.close();
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
