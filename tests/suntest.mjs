// V9 Sun system suite (3g): end-to-end checks for the first star system.
// Diff-render probes for the corona/chromosphere shells (house rule from
// haloshots.mjs: a starfield defeats raw luminance thresholds). Run against
// `npm run dev`.
import puppeteer from 'puppeteer-core';

const CHROME = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const BASE = process.env.SMOKE_URL || 'http://localhost:5173';

let pass = 0, fail = 0;
function check(name, ok, detail = '') {
  if (ok) { pass++; console.log(`  ok  ${name}`); }
  else { fail++; console.log(`FAIL  ${name} ${detail}`); }
}

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: 'new',
  args: ['--use-gl=angle', '--enable-unsafe-swiftshader', '--window-size=1280,800'],
});

const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
await page.goto(`${BASE}/?system=sun`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction('window.__sse && window.__sse.physics', { timeout: 60000 });
await page.waitForFunction(
  'document.getElementById("loading-screen").classList.contains("done")', { timeout: 60000 });
await page.evaluate(() => window.__sse.ui.setPresentation(true));

async function settle(frames = 40) {
  await page.evaluate((n) => {
    for (let i = 0; i < n; i++) window.__sse.cameraCtl.update(0.05);
  }, frames);
  await new Promise((r) => setTimeout(r, 600));
}

/** Mean luminance of a screenshot region. */
async function regionLum(x, y, w, h) {
  const shot = await page.screenshot({ type: 'png' });
  return page.evaluate(async (b64, rx, ry, rw, rh) => {
    const img = new Image();
    img.src = 'data:image/png;base64,' + b64;
    await img.decode();
    const c = document.createElement('canvas');
    c.width = img.width; c.height = img.height;
    const ctx = c.getContext('2d');
    ctx.drawImage(img, 0, 0);
    const d = ctx.getImageData(rx, ry, rw, rh).data;
    let sum = 0;
    for (let i = 0; i < d.length; i += 4) sum += (d[i] + d[i + 1] + d[i + 2]) / 3;
    return sum / (d.length / 4);
  }, shot.toString('base64'), x, y, w, h);
}

/** Diff-render (haloshots.mjs technique): pause physics, render the raw
 *  scene twice back-to-back with a mesh toggled, readPixels both — the
 *  postfx film grain, bloom, and any sim-time animation cancel exactly. */
function diffRender(meshKey) {
  return page.evaluate((k) => {
    const { renderer, physics } = window.__sse;
    const wasIdx = physics.timeIndex;
    physics.setTimeIndex(0);
    renderer.update(physics, 0.016, 1);
    const gl = renderer.renderer.getContext();
    const w = gl.drawingBufferWidth, h = gl.drawingBufferHeight;
    const grab = () => {
      renderer.renderer.render(renderer.scene, renderer.camera);
      const buf = new Uint8Array(w * h * 4);
      gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, buf);
      return buf;
    };
    const a = grab();
    renderer.sunMeshes[k].visible = false;
    const b = grab();
    renderer.sunMeshes[k].visible = true;
    physics.setTimeIndex(wasIdx);
    let sum = 0, changed = 0;
    for (let i = 0; i < a.length; i += 4) {
      const d = Math.abs(a[i] - b[i]) + Math.abs(a[i + 1] - b[i + 1]) + Math.abs(a[i + 2] - b[i + 2]);
      sum += d;
      if (d > 12) changed++;
    }
    return { mean: sum / (a.length / 4), changed };
  }, meshKey);
}

// -- Boot + structure ---------------------------------------------------------
{
  const info = await page.evaluate(() => {
    const r = window.__sse.renderer;
    return {
      isStar: r.system.isStar === true,
      prominences: r.prominences?.length ?? 0,
      photo: !!r.sunMeshes?.photo, chromo: !!r.sunMeshes?.chromo, corona: !!r.sunMeshes?.corona,
    };
  });
  check('sun system loads (isStar path)', info.isStar);
  check('photosphere/chromosphere/corona meshes present', info.photo && info.chromo && info.corona);
  check('prominences built (4 loops)', info.prominences === 4, `n=${info.prominences}`);
}

// -- LIVE default (real-user context is covered by livedefault.mjs; under
//    automation LIVE defaults off — assert the Sun config epoch instead) ------
{
  const epoch = await page.evaluate(() => window.__sse.physics.epochMs);
  check('J2000 epoch wired', epoch === Date.parse('2000-01-01T12:00:00Z'), `epoch=${epoch}`);
}

// -- Photosphere: granulated, limb-darkened -----------------------------------
{
  await page.evaluate(() => {
    const { cameraCtl } = window.__sse;
    cameraCtl.setMode('insertion', 'Sun');
    cameraCtl.setInsertion({ body: 'Sun', altitudeKm: 900000, incDeg: 0, locked: false });
  });
  await settle();
  // Limb darkening — raw-render probe: project the disc center and its
  // pixel radius analytically (the insertion forward tilt offsets the disc,
  // so screen-center guesses sample the wrong pixels), then compare the
  // disc center against a patch at 90% radius. Granulation is averaged out
  // by 40x40 patches; the Eddington term is a 0.6 swing center-to-limb.
  const ld = await page.evaluate(() => {
    const { renderer, physics, THREE } = window.__sse;
    renderer.update(physics, 0.016, 1);
    const gl = renderer.renderer.getContext();
    const w = gl.drawingBufferWidth, h = gl.drawingBufferHeight;
    renderer.renderer.render(renderer.scene, renderer.camera);
    const buf = new Uint8Array(w * h * 4);
    gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, buf);
    const ndc = new THREE.Vector3(0, 0, 0).project(renderer.camera);
    const cx = Math.round((ndc.x * 0.5 + 0.5) * w);
    const cy = Math.round((ndc.y * 0.5 + 0.5) * h); // GL coords, same space as readPixels
    const dist = renderer.camera.position.length();
    const R = renderer.bodyRadius('Sun');
    const theta = Math.asin(Math.min(1, R / dist));
    const fovY = (renderer.camera.fov * Math.PI) / 180;
    const rpx = (Math.tan(theta) / Math.tan(fovY / 2)) * (h / 2);
    const patch = (px, py) => {
      let sum = 0, n = 0;
      for (let y = py - 20; y < py + 20; y++) {
        for (let x = px - 20; x < px + 20; x++) {
          if (x < 0 || y < 0 || x >= w || y >= h) continue;
          const i = (y * w + x) * 4;
          sum += (buf[i] + buf[i + 1] + buf[i + 2]) / 3;
          n++;
        }
      }
      return sum / Math.max(1, n);
    };
    // Sample toward whichever horizontal side stays in-frame.
    const ex = cx + (cx > w / 2 ? -1 : 1) * Math.round(rpx * 0.9);
    return { center: patch(cx, cy), edge: patch(ex, cy), cx, cy, rpx: Math.round(rpx) };
  });
  check('photosphere renders (center luminance 40..255)', ld.center > 40,
    `lum=${ld.center.toFixed(1)}`);
  check('limb darkening: 90%-radius patch dimmer than center', ld.edge < ld.center * 0.93,
    `center=${ld.center.toFixed(1)} edge=${ld.edge.toFixed(1)} rpx=${ld.rpx}`);
}

// -- Granulation: structure has spatial variance beyond film grain ------------
{
  await page.evaluate(() => {
    window.__sse.cameraCtl.setInsertion({ altitudeKm: 150000 });
  });
  await settle();
  // Compare mean luminance of several disjoint patches — granulation cells
  // (bright centers vs orange lanes) give patch-to-patch spread; film grain
  // alone would average out per patch.
  const patches = [];
  for (const [x, y] of [[200, 150], [600, 150], [1000, 150], [200, 600], [600, 600], [1000, 600]]) {
    patches.push(await regionLum(x, y, 60, 60));
  }
  const spread = Math.max(...patches) - Math.min(...patches);
  check('granulation structure present (patch spread > 6)', spread > 6,
    `spread=${spread.toFixed(1)} patches=${patches.map((p) => p.toFixed(0)).join(',')}`);
  check('not blown white (min patch < 250)', Math.min(...patches) < 250);
}

// -- Sunspot count follows activity -------------------------------------------
{
  const countAt = async (v) => {
    await page.evaluate((val) => {
      window.__sse.ui.activitySlider.value = String(val);
      window.__sse.ui.activitySlider.oninput();
    }, v);
    await new Promise((r) => setTimeout(r, 2600)); // wall-clock spawn/retire blends
    return page.evaluate(() =>
      window.__sse.renderer.sunMats.photoMat.uniforms.uSpotCount.value);
  };
  const c100 = await countAt(1);
  check('sunspot count > 6 at 100% activity', c100 > 6, `n=${c100}`);
  const c75 = await countAt(0.75);
  check('sunspot count ≈ 9 at 75% activity', c75 >= 7 && c75 <= 12, `n=${c75}`);
  const c0 = await countAt(0);
  const live0 = await page.evaluate(() =>
    window.__sse.renderer.sunspots.filter((s) => !s.dying).length);
  check('zero live spots at 0% activity', live0 === 0, `live=${live0} uniform=${c0}`);
  await countAt(0.75);
}

// -- Corona: diff-render at 500,000 km, occluded at 50,000 km ------------------
{
  await page.evaluate(() => {
    window.__sse.cameraCtl.setInsertion({ altitudeKm: 500000, incDeg: 20 });
  });
  await settle();
  const far = await diffRender('corona');
  check('corona visible at 500,000 km (diff-render)', far.changed > 2000,
    `changed=${far.changed} mean=${far.mean.toFixed(2)}`);

  await page.evaluate(() => {
    window.__sse.cameraCtl.setInsertion({ altitudeKm: 50000, incDeg: 20 });
  });
  await settle();
  const near = await diffRender('corona');
  check('corona occluded by the disc at 50,000 km', near.changed < far.changed / 10,
    `near=${near.changed} far=${far.changed}`);
}

// -- Chromosphere: red rim at the limb (diff-render) ---------------------------
{
  await page.evaluate(() => {
    window.__sse.cameraCtl.setInsertion({ altitudeKm: 1200000, incDeg: 0 });
  });
  await settle();
  const d = await diffRender('chromo');
  check('chromosphere rim visible on the limb (diff-render)', d.changed > 200,
    `changed=${d.changed}`);
}

// -- Differential rotation: uniform plumbing ------------------------------------
{
  const t = await page.evaluate(() => {
    const u = window.__sse.renderer.sunShared;
    const before = { time: u.uTime.value, days: u.uDays.value };
    window.__sse.physics.update(2);           // 2 s at current multiplier
    window.__sse.renderer.update(window.__sse.physics, 0.016, 1);
    return { before, after: { time: u.uTime.value, days: u.uDays.value } };
  });
  check('uTime/uDays advance with sim time',
    t.after.time > t.before.time && t.after.days > t.before.days,
    JSON.stringify(t));
  const src = await page.evaluate(() =>
    window.__sse.renderer.sunMats.photoMat.fragmentShader.includes('2.396')
    && window.__sse.renderer.sunMats.photoMat.fragmentShader.includes('uDays'));
  check('Snodgrass residual differential rotation in photosphere shader', src);
}

// -- Solar flares: spawn, animate, clean up -------------------------------------
{
  const flare = await page.evaluate(async () => {
    const r = window.__sse.renderer;
    const spot = { lat: 0.2, lon: 1.0, radius: 0.04 };
    r._spawnFlare(spot);
    const spawned = r.solarFlares.length;
    // Drive the flare through its lifetime.
    for (let i = 0; i < 60; i++) r._updateSolarFlares(0.25);
    return { spawned, after: r.solarFlares.length };
  });
  check('flare spawns as particle arc', flare.spawned === 1, JSON.stringify(flare));
  check('flare expires and cleans up', flare.after === 0, JSON.stringify(flare));
}

// -- Curated presets: all 4 execute without error --------------------------------
{
  const result = await page.evaluate(() => {
    const rows = [...document.querySelectorAll('.preset-row')].map((b) => b.textContent);
    const sunRows = rows.filter((t) =>
      ['Corona View', 'Photosphere Close-Up', 'Polar Plumes', 'Solar Limb'].some((n) => t.includes(n)));
    return { total: rows.length, sun: sunRows.length };
  });
  check('4 sun curated presets in SAVE panel', result.sun === 4, JSON.stringify(result));
  const execOk = await page.evaluate(() => {
    const names = ['Corona View', 'Photosphere Close-Up', 'Polar Plumes', 'Solar Limb'];
    const rows = [...document.querySelectorAll('.preset-row')];
    let ok = 0;
    for (const n of names) {
      const b = rows.find((r) => r.textContent.includes(n));
      try { b.click(); ok++; } catch { /* counted by ok */ }
    }
    return ok;
  });
  await settle();
  check('all 4 presets execute', execOk === 4, `ok=${execOk}`);
  const alt = await page.evaluate(() => window.__sse.cameraCtl.ins.altitudeKm);
  check('Solar Limb preset altitude survives entry (1.2M km, not clamped to 500k)',
    Math.abs(alt - 1200000) < 1000, `alt=${alt}`);
}

// -- Activity slider sweep renders without crash ---------------------------------
{
  await page.evaluate(() => {
    const s = window.__sse.ui.activitySlider;
    for (const v of ['0', '0.25', '0.5', '0.75', '1', '0.75']) { s.value = v; s.oninput(); }
  });
  await new Promise((r) => setTimeout(r, 800));
  const lum = await regionLum(560, 340, 160, 120);
  check('activity sweep renders (disc still lit)', lum > 30, `lum=${lum.toFixed(1)}`);
}

check('sun suite zero console errors', errors.length === 0, errors.slice(0, 4).join(' | '));
await page.close();

// -- Cross-system regression: Sun → Earth → Jupiter -------------------------------
for (const [sys, checkFn] of [
  ['earth', async (p) => {
    const info = await p.evaluate(() => {
      let dir = false;
      window.__sse.renderer.scene.traverse((o) => { if (o.type === 'DirectionalLight') dir = true; });
      const s = window.__sse.physics.sunDir;
      return { dir, len: Math.hypot(s.x, s.y, s.z) };
    });
    check('earth after sun: directional light restored', info.dir);
    check('earth after sun: ephemeris sun direction unit-length', Math.abs(info.len - 1) < 1e-6);
  }],
  ['jupiter', async (p) => {
    const info = await p.evaluate(() => ({
      moons: window.__sse.physics.bodies.length,
      rings: window.__sse.renderer.ringMeshes.length,
    }));
    check('jupiter after sun: 8 moons + 4 rings', info.moons === 8 && info.rings === 4,
      JSON.stringify(info));
  }],
]) {
  const p2 = await browser.newPage();
  const errs2 = [];
  p2.on('pageerror', (e) => errs2.push(String(e)));
  p2.on('console', (m) => { if (m.type() === 'error') errs2.push(m.text()); });
  await p2.goto(`${BASE}/?system=${sys}`, { waitUntil: 'domcontentloaded' });
  await p2.waitForFunction('window.__sse && window.__sse.physics', { timeout: 60000 });
  await checkFn(p2);
  check(`${sys} zero console errors`, errs2.length === 0, errs2.slice(0, 3).join(' | '));
  await p2.close();
}

await browser.close();
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
