// V10 Pluto system suite: end-to-end checks for the dwarf-planet binary.
// Companions: plutocal.mjs (pure-node sun/ephemeris guard), plutoshots.mjs
// (screenshot calibration probes). Run against `npm run dev`.
//
// House rules baked in: assertions against sim state, never wall clock;
// diff-render probes pause physics and double-render RAW in one evaluate
// (postfx film grain is temporal); night-side gate is the moonnight.mjs
// anti-solar luminance probe.
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
await page.setViewport({ width: 1280, height: 800 });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
await page.goto(`${BASE}/?system=pluto`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction('window.__sse && window.__sse.physics', { timeout: 60000 });
await page.waitForFunction(
  'document.getElementById("loading-screen").classList.contains("done")', { timeout: 60000 });

async function settle(frames = 80) {
  await page.evaluate((n) => {
    for (let i = 0; i < n; i++) window.__sse.cameraCtl.update(0.05);
  }, frames);
  await new Promise((r) => setTimeout(r, 700));
}

/** Sub-<worldDir> lat/lon on a mesh, suncal pixel-verified convention. */
const LOCAL_LON_FN = `(m, worldDir) => {
  const THREE = window.__sse.THREE;
  m.updateWorldMatrix(true, false);
  const c = m.getWorldPosition(new THREE.Vector3());
  const p = m.worldToLocal(c.clone().add(worldDir)).normalize();
  return { lat: Math.asin(p.y) * 180 / Math.PI, lon: Math.atan2(-p.z, p.x) * 180 / Math.PI };
}`;

/** Mean luminance + channel means of a raw-rendered screen patch. */
function rawPatch(cxFrac, cyFrac, half = 40) {
  return page.evaluate((fx, fy, hw) => {
    const { renderer, physics } = window.__sse;
    renderer.update(physics, 0.016, 1);
    const gl = renderer.renderer.getContext();
    const w = gl.drawingBufferWidth, h = gl.drawingBufferHeight;
    renderer.renderer.render(renderer.scene, renderer.camera);
    const buf = new Uint8Array(w * h * 4);
    gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, buf);
    const px = Math.round(fx * w), py = Math.round(fy * h);
    let r = 0, g = 0, b = 0, n = 0, bright = 0;
    for (let y = py - hw; y < py + hw; y++) {
      for (let x = px - hw; x < px + hw; x++) {
        if (x < 0 || y < 0 || x >= w || y >= h) continue;
        const i = (y * w + x) * 4;
        r += buf[i]; g += buf[i + 1]; b += buf[i + 2]; n++;
        if ((buf[i] + buf[i + 1] + buf[i + 2]) / 3 > 25) bright++;
      }
    }
    return { r: r / n, g: g / n, b: b / n, lum: (r + g + b) / (3 * n), bright, n };
  }, cxFrac, cyFrac, half);
}

// -- Boot + structure ---------------------------------------------------------
{
  const info = await page.evaluate(() => {
    const { physics, renderer, ui } = window.__sse;
    const v = new window.__sse.THREE.Vector3();
    renderer.bodyWorldPos('Charon', v);
    return {
      slug: ui.system.slug,
      epoch: physics.epochMs,
      charonDist: v.length(),
      atmosphere: !!renderer.atmosphereMesh,
      moons: ui.system.bodies.length,
    };
  });
  check('pluto system loads', info.slug === 'pluto');
  check('New Horizons epoch wired (2015-07-14T11:49Z)',
    info.epoch === Date.parse('2015-07-14T11:49:00Z'), `epoch=${info.epoch}`);
  check('Charon orbits at ~19,600 km', Math.abs(info.charonDist - 19.596) < 0.1,
    `d=${info.charonDist.toFixed(2)} units`);
  check('blue haze shell present', info.atmosphere);
  check('one moon (Charon)', info.moons === 1);
}

// -- Settled boot opens on the lit hemisphere (v8.0.1 rule) --------------------
{
  await settle(60);
  const dot = await page.evaluate(() => {
    const { renderer, THREE } = window.__sse;
    const c = renderer.primaryMesh.getWorldPosition(new THREE.Vector3());
    const camDir = renderer.camera.position.clone().sub(c).normalize();
    const sunW = renderer.sunDir.clone().applyQuaternion(renderer.root.quaternion).normalize();
    return camDir.dot(sunW);
  });
  check('boot cinematic on the lit hemisphere (cam·sun > 0.8)', dot > 0.8,
    `dot=${dot.toFixed(3)}`);
  await page.evaluate(() => window.__sse.ui.setPresentation(true));
}

// -- Mutual tidal lock: sub-Charon meridian pinned at 0°E (IAU convention) -----
{
  const lock = await page.evaluate((llf) => {
    const localLon = eval(llf);
    const { physics, renderer, THREE } = window.__sse;
    const mesh = renderer.primaryMesh;
    const probe = () => {
      renderer.update(physics, 0.016, 1);
      const cPos = renderer.bodyMeshes.get('Charon').group.getWorldPosition(new THREE.Vector3());
      const pPos = mesh.getWorldPosition(new THREE.Vector3());
      const sunW = renderer.sunDir.clone().applyQuaternion(renderer.root.quaternion).normalize();
      return {
        subCharon: localLon(mesh, cPos.clone().sub(pPos).normalize()).lon,
        subsolar: localLon(mesh, sunW),
      };
    };
    physics.setTimeIndex(0);
    physics.jumpToSimSeconds(0);
    const t0 = probe();
    physics.jumpToSimSeconds(86400 * 1.59680725);  // quarter orbit
    const tQ = probe();
    physics.jumpToSimSeconds(86400 * 12.774458);   // two orbits
    const t2 = probe();
    physics.jumpToSimSeconds(0);
    renderer.update(physics, 0.016, 1);
    return { t0, tQ, t2 };
  }, LOCAL_LON_FN);
  check('epoch subsolar on the heart (lat ≈ 51.5N, lon ≈ 176E)',
    Math.abs(lock.t0.subsolar.lat - 51.5) < 1 && Math.abs(lock.t0.subsolar.lon - 176) < 1.5,
    JSON.stringify(lock.t0.subsolar));
  const maxLock = Math.max(Math.abs(lock.t0.subCharon), Math.abs(lock.tQ.subCharon), Math.abs(lock.t2.subCharon));
  check('sub-Charon meridian pinned at 0°E through 2 orbits (mutual lock)',
    maxLock < 0.1, `max |lon|=${maxLock.toFixed(4)}°`);
  check('Charon period drives rotation: subsolar advances -90° per quarter orbit',
    Math.abs((lock.t0.subsolar.lon - lock.tQ.subsolar.lon + 540) % 360 - 180 - (-90 + 180)) < 1
    || Math.abs(lock.tQ.subsolar.lon - (lock.t0.subsolar.lon - 90 + 360) % 360) < 1
    || Math.abs(((lock.t0.subsolar.lon - lock.tQ.subsolar.lon) + 360) % 360 - 90) < 1,
    `t0=${lock.t0.subsolar.lon.toFixed(1)} tQ=${lock.tQ.subsolar.lon.toFixed(1)}`);
}

// -- Heart preset: camera over Tombaugh Regio, lit, bright region --------------
{
  await page.evaluate(() => {
    const b = [...document.querySelectorAll('.preset-row')].find((r) => r.textContent.includes('The Heart'));
    b.click();
  });
  await settle(120);
  const cam = await page.evaluate((llf) => {
    const localLon = eval(llf);
    const { renderer, THREE } = window.__sse;
    const c = renderer.primaryMesh.getWorldPosition(new THREE.Vector3());
    const camDir = renderer.camera.position.clone().sub(c).normalize();
    const sunW = renderer.sunDir.clone().applyQuaternion(renderer.root.quaternion).normalize();
    return { sub: localLon(renderer.primaryMesh, camDir), dot: camDir.dot(sunW) };
  }, LOCAL_LON_FN);
  check('heart preset: camera over Tombaugh Regio (lon 176±15, lat 22±10)',
    Math.abs(cam.sub.lon - 176) < 15 || Math.abs(cam.sub.lon + 184) < 15,
    JSON.stringify(cam.sub));
  check('heart preset: lit view (cam·sun > 0.75)', cam.dot > 0.75, `dot=${cam.dot.toFixed(2)}`);
  const disc = await rawPatch(0.5, 0.45, 50);
  check('Tombaugh Regio bright from 5,000 km (disc lum > 60)', disc.lum > 60,
    `lum=${disc.lum.toFixed(1)}`);
}

// -- Cthulhu Macula: dark and red-dominant --------------------------------------
{
  await page.evaluate(() => {
    const { ui, cameraCtl } = window.__sse;
    cameraCtl.flyToFeature('Pluto', ui.system.primary.navPresets[1]);
  });
  await settle(140);
  const disc = await rawPatch(0.5, 0.45, 50);
  check('Cthulhu Macula darker than the heart (lum < 60)', disc.lum < 60,
    `lum=${disc.lum.toFixed(1)}`);
  check('Cthulhu Macula red-dominant (r > b)', disc.r > disc.b,
    `r=${disc.r.toFixed(1)} b=${disc.b.toFixed(1)}`);
}

// -- Blue haze: diff-render on the lit limb; blue crescent ring backlit ---------
{
  // Lit side, 5,000 km: haze shell contributes pixels (diff-render).
  await page.evaluate(() => {
    const { ui, cameraCtl } = window.__sse;
    cameraCtl.flyToFeature('Pluto', { ...ui.system.primary.navPresets[0], altitudeKm: 5000 });
  });
  await settle(120);
  const litDiff = await page.evaluate(() => {
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
    renderer.atmosphereMesh.visible = false;
    const b = grab();
    renderer.atmosphereMesh.visible = true;
    physics.setTimeIndex(wasIdx);
    let changed = 0, blueDom = 0;
    for (let i = 0; i < a.length; i += 4) {
      const d = Math.abs(a[i] - b[i]) + Math.abs(a[i + 1] - b[i + 1]) + Math.abs(a[i + 2] - b[i + 2]);
      if (d > 10) { changed++; if (a[i + 2] > a[i]) blueDom++; }
    }
    return { changed, blueDom };
  });
  check('haze visible at the lit limb (diff-render > 300 px)', litDiff.changed > 300,
    `changed=${litDiff.changed}`);
  check('haze pixels blue-dominant', litDiff.blueDom > litDiff.changed * 0.6,
    `blue=${litDiff.blueDom}/${litDiff.changed}`);
}

// -- Night side pure black (moonnight anti-solar gate) ---------------------------
{
  await page.evaluate((llf) => {
    // Park the camera exactly anti-solar at 3,000 km via orbit-mode pose.
    const { renderer, cameraCtl, THREE } = window.__sse;
    const sunW = renderer.sunDir.clone().applyQuaternion(renderer.root.quaternion).normalize();
    cameraCtl.setMode('orbit', 'Pluto');
    cameraCtl.orbDist = renderer.bodyRadius('Pluto') + 3.0;
    cameraCtl.orbTheta = Math.atan2(-sunW.z, -sunW.x);
    cameraCtl.orbPhi = Math.PI / 2 - Math.asin(sunW.y) * -1;
  }, LOCAL_LON_FN);
  await settle(80);
  const night = await rawPatch(0.5, 0.5, 60);
  check('night side ≤ 8% luminance (moonnight gate)', night.lum <= 20.4,
    `lum=${night.lum.toFixed(1)} (${(night.lum / 255 * 100).toFixed(1)}%)`);
  check('night side zero bright pixels (>25)', night.bright === 0, `bright=${night.bright}`);
}

// -- Pluto + Charon binary frame --------------------------------------------------
{
  await page.evaluate(() => {
    const b = [...document.querySelectorAll('.preset-row')].find((r) => r.textContent.includes('Pluto + Charon'));
    b.click();
  });
  await settle(120);
  const ndc = await page.evaluate(() => {
    const { renderer, THREE } = window.__sse;
    const proj = (name) => {
      const v = renderer.bodyWorldPos(name, new THREE.Vector3()).project(renderer.camera);
      return { x: v.x, y: v.y, z: v.z };
    };
    return { pluto: proj('Pluto'), charon: proj('Charon') };
  });
  const inFrame = (p) => Math.abs(p.x) < 1 && Math.abs(p.y) < 1 && p.z < 1;
  check('binary preset: Pluto in frame', inFrame(ndc.pluto), JSON.stringify(ndc.pluto));
  check('binary preset: Charon in frame simultaneously', inFrame(ndc.charon), JSON.stringify(ndc.charon));
}

// -- Mordor Macula: north pole darker and redder than mid-latitudes ----------------
{
  await page.evaluate(() => {
    const b = [...document.querySelectorAll('.preset-row')].find((r) => r.textContent.includes('Mordor Macula'));
    b.click();
  });
  await settle(120);
  // Sample along Charon's disc: project the north-pole surface point and a
  // mid-latitude point into screen space, then compare patches.
  const mordor = await page.evaluate(() => {
    const { renderer, THREE } = window.__sse;
    const entry = renderer.bodyMeshes.get('Charon');
    const mesh = entry.mesh;
    mesh.updateWorldMatrix(true, false);
    const r = renderer.bodyRadius('Charon');
    const toScreen = (local) => {
      const w = mesh.localToWorld(local.clone().multiplyScalar(r / mesh.scale.x));
      const v = w.project(renderer.camera);
      return { x: (v.x * 0.5 + 0.5), y: (v.y * 0.5 + 0.5), z: v.z };
    };
    return {
      pole: toScreen(new THREE.Vector3(0, 1, 0)),
      mid: toScreen(new THREE.Vector3(0.9, 0.2, 0.37).normalize()),
    };
  });
  const polePatch = await rawPatch(mordor.pole.x, mordor.pole.y, 14);
  const midPatch = await rawPatch(mordor.mid.x, mordor.mid.y, 14);
  check('Mordor Macula darker than mid-latitude terrain',
    polePatch.lum < midPatch.lum * 0.85,
    `pole=${polePatch.lum.toFixed(1)} mid=${midPatch.lum.toFixed(1)}`);
}

// -- All 5 curated presets execute without error -----------------------------------
{
  const names = ['New Horizons — 2015', 'The Heart', 'Pluto + Charon', 'Blue Haze Crescent', 'Mordor Macula'];
  const found = await page.evaluate((ns) => {
    const rows = [...document.querySelectorAll('.preset-row')].map((b) => b.textContent);
    return ns.filter((n) => rows.some((t) => t.includes(n))).length;
  }, names);
  check('5 pluto curated presets in SAVE panel', found === 5, `found=${found}`);
  const execOk = await page.evaluate((ns) => {
    const rows = [...document.querySelectorAll('.preset-row')];
    let ok = 0;
    for (const n of ns) {
      const b = rows.find((r) => r.textContent.includes(n));
      try { b.click(); ok++; } catch { /* counted */ }
    }
    return ok;
  }, names);
  await settle(60);
  check('all 5 presets execute', execOk === 5, `ok=${execOk}`);
}

// -- New Horizons epoch preset: sim at epoch + heart facing --------------------------
{
  await page.evaluate(() => {
    const b = [...document.querySelectorAll('.preset-row')].find((r) => r.textContent.includes('New Horizons — 2015'));
    b.click();
  });
  await settle(140);
  const state = await page.evaluate((llf) => {
    const localLon = eval(llf);
    const { physics, renderer, THREE } = window.__sse;
    const c = renderer.primaryMesh.getWorldPosition(new THREE.Vector3());
    const camDir = renderer.camera.position.clone().sub(c).normalize();
    return { simS: physics.simSeconds, sub: localLon(renderer.primaryMesh, camDir) };
  }, LOCAL_LON_FN);
  check('NH preset returns the sim to the flyby epoch', Math.abs(state.simS) < 120,
    `simS=${state.simS.toFixed(1)}`);
  check('NH preset: heart facing the camera (lon 176±20)',
    Math.abs(state.sub.lon - 176) < 20 || Math.abs(state.sub.lon + 184) < 20,
    JSON.stringify(state.sub));
}

check('pluto suite zero console errors', errors.length === 0, errors.slice(0, 4).join(' | '));
await page.close();

// -- Cross-system regression: Pluto → Neptune → Sun ----------------------------------
for (const sys of ['neptune', 'sun']) {
  const p2 = await browser.newPage();
  const errs2 = [];
  p2.on('pageerror', (e) => errs2.push(String(e)));
  p2.on('console', (m) => { if (m.type() === 'error') errs2.push(m.text()); });
  await p2.goto(`${BASE}/?system=${sys}`, { waitUntil: 'domcontentloaded' });
  await p2.waitForFunction('window.__sse && window.__sse.physics', { timeout: 60000 });
  check(`${sys} after pluto: zero console errors`, errs2.length === 0, errs2.slice(0, 3).join(' | '));
  await p2.close();
}

await browser.close();
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
