// V5c bug #41 probe: the NW-Pacific hurricane must read as an organic
// vortex, not a machined sin(ang*3.5) spiral rose. Mirrors ec_hurricane's
// anchor math (lon drifts westward with ec_t = uTime * 3e-5) to find the
// storm, aims the orbit camera down its normal at two sun angles
// (terminator relief view + full day side), screenshots both, and measures
// the 3.5-cycle spiral harmonic on object-space rings around the eye.
// Gate: absolute 3.5-cycle amplitude on the mid/outer day-side rings
// (d >= 0.55) — the machined shader measured 13.1/8.7/7.7 there, the
// organic one 4.1/3.8/0.9; the innermost ring is the eyewall and is
// legitimately coherent in both. The terminator view is too dim to gate
// on (residual rms ~ signal) — its screenshot is the visual reference.
import puppeteer from 'puppeteer-core';
import { mkdirSync, readFileSync } from 'fs';
import { fileURLToPath } from 'url';

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const BASE = process.env.SMOKE_URL || 'http://localhost:5175';
const OUT = fileURLToPath(new globalThis.URL('./shots/', import.meta.url));
mkdirSync(OUT, { recursive: true });

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
await new Promise((r) => setTimeout(r, 2500));

// Aim at the storm with its local sunDot nearest the target; return
// object-space rings (constant angular distance from the eye) projected to
// screen — a screen-space circle would mix shader radii on oblique views.
async function aimAndSample(targetSunDot) {
  return page.evaluate((targetSunDot) => {
    const { cameraCtl, physics, renderer, THREE } = window.__sse;
    const mesh = renderer.primaryMesh;
    const r = mesh.geometry.boundingSphere?.radius ?? 1;
    const center = () => mesh.getWorldPosition(new THREE.Vector3());
    const sunW = () => renderer.sunDir.clone().applyQuaternion(renderer.root.quaternion).normalize();
    // ec_hurricane NW-Pacific anchor at simSeconds s:
    // la = 16°, lo = 138° - ec_t * 0.15 rad, ec_t = (s % 1e6) * 3e-5.
    const anchorLocal = (s) => {
      const t = (s % 1e6) * 0.00003;
      const la = 16.0 * Math.PI / 180;
      const lo = 138.0 * Math.PI / 180 - t * 0.15;
      return new THREE.Vector3(
        Math.cos(la) * Math.cos(lo), Math.sin(la), -Math.cos(la) * Math.sin(lo));
    };
    const worldNormalAt = (s) => {
      mesh.updateWorldMatrix(true, false);
      return mesh.localToWorld(anchorLocal(s).clone().multiplyScalar(r))
        .sub(center()).normalize();
    };
    physics.setTimeIndex(0);
    let chosen = 0, best = 1e9;
    for (let h = 0; h < 24; h += 0.25) {
      const s = h * 3600;
      physics.jumpToSimSeconds(s);
      renderer.update(physics, 0.016, 1);
      const score = Math.abs(worldNormalAt(s).dot(sunW()) - targetSunDot);
      if (score < best) { best = score; chosen = s; }
    }
    physics.jumpToSimSeconds(chosen);
    renderer.update(physics, 0.016, 1);
    const q = mesh.getWorldQuaternion(new THREE.Quaternion()).invert();
    const sunObj = sunW().applyQuaternion(q);

    const N = worldNormalAt(chosen);
    cameraCtl.setMode('orbit', 'Earth');
    cameraCtl.orbSpeedMult = 0;
    cameraCtl.orbTheta = Math.atan2(N.z, N.x);
    cameraCtl.orbPhi = Math.acos(Math.max(-1, Math.min(1, N.y)));
    cameraCtl.setAltitudeDirect(4500);
    for (let i = 0; i < 60; i++) cameraCtl.update(0.05);
    renderer.update(physics, 0.016, 1);
    renderer.renderer.render(renderer.scene, renderer.camera);

    const cam = renderer.camera;
    cam.updateMatrixWorld(true);
    cam.matrixWorldInverse.copy(cam.matrixWorld).invert();
    const toScreen = (local) => {
      mesh.updateWorldMatrix(true, false);
      const ndc = mesh.localToWorld(local.clone().multiplyScalar(r)).project(cam);
      return { x: (ndc.x * 0.5 + 0.5) * innerWidth, y: (-ndc.y * 0.5 + 0.5) * innerHeight };
    };
    const hc = anchorLocal(chosen);
    const e1 = new THREE.Vector3(0, 1, 0).cross(hc).normalize();
    const e2 = hc.clone().cross(e1);
    const NA = 96;
    const rings = [0.35, 0.55, 0.8, 1.05].map((dnorm) => {
      const dd = dnorm * 0.055;
      const pts = [];
      for (let i = 0; i < NA; i++) {
        const b = (i / NA) * Math.PI * 2;
        const p = hc.clone().multiplyScalar(Math.cos(dd))
          .add(e1.clone().multiplyScalar(Math.sin(dd) * Math.cos(b)))
          .add(e2.clone().multiplyScalar(Math.sin(dd) * Math.sin(b)))
          .normalize();
        const s = toScreen(p);
        s.b = b;
        s.sunDot = p.dot(sunObj); // dark-side samples carry no band signal
        pts.push(s);
      }
      return { dnorm, pts };
    });
    return { simSeconds: chosen, sunDot: +N.dot(sunW()).toFixed(3), rings };
  }, targetSunDot);
}

// Least-squares fit {1, cos b, sin b, cos 2b, sin 2b, cos 3.5b, sin 3.5b}
// on lit samples; report the 3.5-cycle spiral amplitude vs residual rms.
async function ringMetric(shotPath, info) {
  const b64 = readFileSync(shotPath).toString('base64');
  return page.evaluate(async (b64, info) => {
    const img = new Image();
    img.src = 'data:image/png;base64,' + b64;
    await img.decode();
    const cv = document.createElement('canvas');
    cv.width = img.width; cv.height = img.height;
    const cx = cv.getContext('2d');
    cx.drawImage(img, 0, 0);
    const lum = (x, y) => {
      const d = cx.getImageData(Math.round(x), Math.round(y), 1, 1).data;
      return 0.299 * d[0] + 0.587 * d[1] + 0.114 * d[2];
    };
    const solve = (A, y) => {
      const n = A[0].length, m = A.length;
      const M = Array.from({ length: n }, () => new Array(n + 1).fill(0));
      for (let i = 0; i < m; i++)
        for (let j = 0; j < n; j++) {
          for (let k = 0; k < n; k++) M[j][k] += A[i][j] * A[i][k];
          M[j][n] += A[i][j] * y[i];
        }
      for (let c = 0; c < n; c++) {
        let piv = c;
        for (let rw = c + 1; rw < n; rw++) if (Math.abs(M[rw][c]) > Math.abs(M[piv][c])) piv = rw;
        [M[c], M[piv]] = [M[piv], M[c]];
        for (let rw = 0; rw < n; rw++) {
          if (rw === c || Math.abs(M[c][c]) < 1e-12) continue;
          const f = M[rw][c] / M[c][c];
          for (let k = c; k <= n; k++) M[rw][k] -= f * M[c][k];
        }
      }
      return M.map((row, i) => (Math.abs(row[i]) < 1e-12 ? 0 : row[n] / row[i]));
    };
    const out = [];
    for (const ring of info.rings) {
      const lit = ring.pts.filter((p) => p.sunDot > 0.03);
      if (lit.length < 24) { out.push({ r: ring.dnorm, skip: `only ${lit.length} lit samples` }); continue; }
      const y = lit.map((p) => lum(p.x, p.y));
      const A = lit.map((p) => [1, Math.cos(p.b), Math.sin(p.b), Math.cos(2 * p.b), Math.sin(2 * p.b), Math.cos(3.5 * p.b), Math.sin(3.5 * p.b)]);
      const c = solve(A, y);
      let resSq = 0;
      for (let i = 0; i < y.length; i++) {
        let fit = 0;
        for (let j = 0; j < 7; j++) fit += A[i][j] * c[j];
        resSq += (y[i] - fit) ** 2;
      }
      const harm = Math.hypot(c[5], c[6]);
      const res = Math.sqrt(resSq / y.length);
      out.push({ r: ring.dnorm, n: y.length, mean: +c[0].toFixed(1), harm: +harm.toFixed(1), res: +res.toFixed(1), ratio: +(harm / Math.max(res, 1)).toFixed(2) });
    }
    return out;
  }, b64, info);
}

const report = (label, info, metric) => {
  console.log(`\n${label} — simSeconds ${info.simSeconds}, storm sunDot ${info.sunDot}`);
  console.log('ring d | lit n | mean | 3.5-cycle amp | residual rms | ratio');
  for (const m of metric) console.log(` ${m.r}   | ${m.skip ?? `${m.n} | ${m.mean} | ${m.harm} | ${m.res} | ${m.ratio}`}`);
};

// 1. Terminator relief view (the bug's reporting condition) — visual reference.
const infoTerm = await aimAndSample(0.08);
await new Promise((r) => setTimeout(r, 1500));
const shotTerm = `${OUT}v5c-hurricane-terminator.png`;
await page.screenshot({ path: shotTerm });
report('TERMINATOR', infoTerm, await ringMetric(shotTerm, infoTerm));

// 2. Day side — the measurement gate (strong signal, low noise floor).
const infoDay = await aimAndSample(0.85);
await new Promise((r) => setTimeout(r, 1500));
const shotDay = `${OUT}v5c-hurricane-day.png`;
await page.screenshot({ path: shotDay });
const dayMetric = await ringMetric(shotDay, infoDay);
report('DAY SIDE', infoDay, dayMetric);

const worst = Math.max(...dayMetric.filter((m) => !m.skip && m.r >= 0.55).map((m) => m.harm));
console.log(`\nday-side max 3.5-cycle amplitude outside the eyewall: ${worst} (machined shader ≥ ~8, organic target < 6)`);
await browser.close();
process.exit(worst < 6 ? 0 : 1);
