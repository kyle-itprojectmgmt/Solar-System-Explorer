// Bug 2 haze isolation probe: screenshot Earth day side at several altitudes
// with individual layers toggled, then sample surface patches from the PNGs.
// Toggles are persistent (survive the RAF loop's renderer.update each frame):
//   noatmo  — atmosphereMesh.visible = false
//   nodetail— detailEntries[Earth].detail.activationKm -> ~0 (blend 0)
//   nospec  — primary material specular -> black
import puppeteer from 'puppeteer-core';
import { mkdirSync, readFileSync } from 'fs';
import { fileURLToPath } from 'url';

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const BASE = process.env.SMOKE_URL || 'http://localhost:5175';
const OUT = fileURLToPath(new globalThis.URL('./shots/haze/', import.meta.url));
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

// Freeze time, aim at the subsolar point (full day side fills the view).
await page.evaluate(() => {
  const { cameraCtl, physics, renderer } = window.__sse;
  physics.setTimeIndex(0);
  cameraCtl.setMode('orbit', 'Earth');
  cameraCtl.orbSpeedMult = 0;
  const d = renderer.sunDir;
  cameraCtl.orbTheta = Math.atan2(d.z, d.x);
  cameraCtl.orbPhi = Math.PI / 2 - 0.2;
});

const ALTS = [500, 5000, 40000, 100000];
const CONFIGS = ['full', 'noatmo', 'nodetail', 'nospec'];
const meta = {};

for (const alt of ALTS) {
  for (const cfg of CONFIGS) {
    const m = await page.evaluate(async (alt, cfg) => {
      const { cameraCtl, renderer, physics, THREE } = window.__sse;
      // reset all toggles
      if (renderer.atmosphereMesh) renderer.atmosphereMesh.visible = true;
      const earthEntry = renderer.detailEntries.find((e) => e.name === 'Earth');
      if (earthEntry.__origDetail) earthEntry.detail = earthEntry.__origDetail;
      const mat = renderer.primaryMesh.material;
      if (!mat.__origSpec) mat.__origSpec = mat.specular.clone();
      mat.specular.copy(mat.__origSpec);
      // apply this config's toggle
      if (cfg === 'noatmo' && renderer.atmosphereMesh) renderer.atmosphereMesh.visible = false;
      if (cfg === 'nodetail') {
        earthEntry.__origDetail = earthEntry.detail;
        earthEntry.detail = { activationKm: 0.002, fullKm: 0.001 };
      }
      if (cfg === 'nospec') mat.specular.setRGB(0, 0, 0);

      cameraCtl.setAltitudeDirect(alt);
      for (let i = 0; i < 40; i++) cameraCtl.update(0.05);
      renderer.update(physics, 0.016, 1);
      renderer.renderer.render(renderer.scene, renderer.camera);

      // silhouette radius in px for sampling geometry
      const cam = renderer.camera;
      cam.updateMatrixWorld(true);
      const center = renderer.primaryMesh.getWorldPosition(new THREE.Vector3());
      const R = renderer.bodyMeshes.get('Earth').radiusUnits *
        renderer.primaryMesh.getWorldScale(new THREE.Vector3()).x;
      const d = cam.position.distanceTo(center);
      const camDir = center.clone().sub(cam.position).normalize();
      const perp = new THREE.Vector3().crossVectors(camDir, cam.up).normalize();
      const sil = Math.sqrt(Math.max(0, 1 - (R / d) * (R / d)));
      const edge = center.clone().add(perp.multiplyScalar(R * sil))
        .add(camDir.clone().multiplyScalar(-R * R / d));
      const ndcC = center.clone().project(cam);
      const ndcE = edge.project(cam);
      const px = (n) => [(n.x * 0.5 + 0.5) * innerWidth, (-n.y * 0.5 + 0.5) * innerHeight];
      const [cx, cy] = px(ndcC); const [ex, ey] = px(ndcE);
      return { cx, cy, discR: Math.hypot(ex - cx, ey - cy), blend: renderer.getDetailBlend('Earth') };
    }, alt, cfg);
    meta[`${alt}-${cfg}`] = m;
    await new Promise((r) => setTimeout(r, 700));
    await page.screenshot({ path: `${OUT}${alt}-${cfg}.png` });
  }
}

// restore toggles
await page.evaluate(() => {
  const { renderer } = window.__sse;
  if (renderer.atmosphereMesh) renderer.atmosphereMesh.visible = true;
  const e = renderer.detailEntries.find((x) => x.name === 'Earth');
  if (e.__origDetail) e.detail = e.__origDetail;
  const mat = renderer.primaryMesh.material;
  if (mat.__origSpec) mat.specular.copy(mat.__origSpec);
});

// Sample each PNG: 9x9 mean RGB at fractions of disc radius from center,
// sampled in 4 directions (up/down/left/right), reported per fraction.
for (const alt of ALTS) {
  console.log(`\n=== ${alt} km  (discR ${Math.round(meta[`${alt}-full`].discR)}px, blend ${meta[`${alt}-full`].blend.toFixed(2)}) ===`);
  for (const cfg of CONFIGS) {
    const b64 = readFileSync(`${OUT}${alt}-${cfg}.png`).toString('base64');
    const m = meta[`${alt}-${cfg}`];
    const rows = await page.evaluate(async (b64, m) => {
      const img = new Image();
      img.src = 'data:image/png;base64,' + b64;
      await img.decode();
      const cv = document.createElement('canvas');
      cv.width = img.width; cv.height = img.height;
      const cx2 = cv.getContext('2d');
      cx2.drawImage(img, 0, 0);
      const patch = (x, y) => {
        const d = cx2.getImageData(Math.round(x) - 4, Math.round(y) - 4, 9, 9).data;
        let r = 0, g = 0, b = 0;
        for (let i = 0; i < d.length; i += 4) { r += d[i]; g += d[i + 1]; b += d[i + 2]; }
        const n = d.length / 4;
        return [r / n, g / n, b / n];
      };
      const out = {};
      for (const f of [0, 0.35, 0.65, 0.85, 0.95]) {
        const pts = [[0, -1], [0, 1], [-1, 0], [1, 0]].map(([dx, dy]) =>
          patch(m.cx + dx * f * m.discR, m.cy + dy * f * m.discR));
        const avg = [0, 1, 2].map((i) => pts.reduce((s, p) => s + p[i], 0) / 4);
        out[f] = avg.map((v) => Math.round(v));
      }
      return out;
    }, b64, m);
    const fmt = Object.entries(rows).map(([f, v]) => `r${f}:[${v.join(',')}]`).join('  ');
    console.log(`${cfg.padEnd(9)} ${fmt}`);
  }
}
await browser.close();
