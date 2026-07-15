// #78 definitive: camera OUTSIDE the moon orbit; build a test ring segment
// containing ONLY the far arc (points on the far side of the planet plane).
// With working depth, ZERO of its pixels may appear inside the true disc.
// Disc radius via boundingSphere × worldScale (radiusUnits is already
// world-units — multiplying by scale again was the earlier probes' bug).
import puppeteer from 'puppeteer-core';
import { mkdirSync } from 'fs';
import { fileURLToPath } from 'url';

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const BASE = process.env.SMOKE_URL || 'http://localhost:5175';
const OUT = fileURLToPath(new globalThis.URL('./shots/bug7879/', import.meta.url));
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
await new Promise((r) => setTimeout(r, 2000));

const res = await page.evaluate(() => {
  const { cameraCtl, physics, renderer, THREE } = window.__sse;
  physics.setTimeIndex(0);
  cameraCtl.setMode('orbit', 'Earth');
  cameraCtl.orbSpeedMult = 0;
  cameraCtl.orbPhi = Math.PI / 2;  // EXACTLY the equatorial orbit plane —
  cameraCtl.orbTheta = 0.4;        // the far arc must cross behind the disc
  cameraCtl.setAltitudeDirect(60000); // inside the orbit: disc ~85px, sensitive
  for (let i = 0; i < 200; i++) cameraCtl.update(0.05);
  renderer.update(physics, 0.016, 1);

  const cam = renderer.camera;
  cam.updateMatrixWorld(true);
  const mesh = renderer.primaryMesh;
  mesh.updateWorldMatrix(true, false);
  const center = mesh.getWorldPosition(new THREE.Vector3());
  const R = mesh.geometry.boundingSphere.radius * mesh.getWorldScale(new THREE.Vector3()).x;
  const d = cam.position.distanceTo(center);
  const ndc = center.clone().project(cam);
  const cx = (ndc.x * 0.5 + 0.5) * innerWidth;
  const cy = (-ndc.y * 0.5 + 0.5) * innerHeight;
  // px per world unit at planet distance, from a projected offset point
  const camDir = center.clone().sub(cam.position).normalize();
  const perp = new THREE.Vector3().crossVectors(camDir, cam.up).normalize();
  const off = center.clone().addScaledVector(perp, R).project(cam);
  const rPx = Math.hypot((off.x * 0.5 + 0.5) * innerWidth - cx,
    (-off.y * 0.5 + 0.5) * innerHeight - cy);

  // Far-arc-only ring: moon orbit radius, equatorial plane (same frame as
  // _buildOrbitLines), keep only points on the far side of the plane
  // through the planet center perpendicular to camDir.
  const line0 = renderer.orbitLines.children[0];
  const pos = line0.geometry.attributes.position;
  const a = Math.hypot(pos.getX(0), pos.getY(0), pos.getZ(0)); // orbit radius, units
  const pts = [];
  for (let i = 0; i <= 720; i++) {
    const t = (i / 720) * Math.PI * 2;
    const p = new THREE.Vector3(a * Math.cos(t), 0, -a * Math.sin(t));
    const world = p.clone().applyMatrix4(renderer.root.matrixWorld);
    if (world.clone().sub(center).dot(camDir) > R) pts.push(p); // strictly behind
  }
  const farLine = new THREE.Line(
    new THREE.BufferGeometry().setFromPoints(pts),
    new THREE.LineBasicMaterial({ color: 0x66b2ff, transparent: true, opacity: 0.9 }));
  renderer.root.add(farLine);

  const snap = () => {
    renderer.renderer.render(renderer.scene, renderer.camera);
    const gl = renderer.renderer.getContext();
    const w = gl.drawingBufferWidth, h = gl.drawingBufferHeight;
    const buf = new Uint8Array(w * h * 4);
    gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, buf);
    return { buf, w, h };
  };
  farLine.visible = true;
  const A = snap();
  farLine.visible = false;
  const B = snap();
  renderer.root.remove(farLine);
  const scale = A.w / innerWidth;
  let insideDisc = 0, total = 0;
  for (let y = 0; y < A.h; y++) {
    for (let x = 0; x < A.w; x++) {
      const i = (y * A.w + x) * 4;
      const dl = Math.abs(A.buf[i] - B.buf[i]) + Math.abs(A.buf[i + 1] - B.buf[i + 1]) + Math.abs(A.buf[i + 2] - B.buf[i + 2]);
      if (dl > 20) {
        total++;
        const sx = x / scale, sy = innerHeight - y / scale;
        if (Math.hypot(sx - cx, sy - cy) < rPx * 0.95) insideDisc++;
      }
    }
  }
  const camRel = cam.position.clone().sub(center);
  return { discPx: Math.round(rPx), cx: Math.round(cx), cy: Math.round(cy),
    farArcPixelsTotal: total, farArcPixelsInsideDisc: insideDisc,
    farPts: pts.length, camYFrac: +(camRel.y / camRel.length()).toFixed(4) };
});
console.log(JSON.stringify(res, null, 1));
const bleed = res.farArcPixelsInsideDisc > 5;
const rendered = res.farArcPixelsTotal > 500; // arc must actually draw
console.log(bleed
  ? 'FAIL: far arc renders through the disc'
  : rendered
    ? 'PASS: far arc correctly occluded (and visible outside the disc)'
    : 'FAIL: far arc did not render at all — test is blind');
await browser.close();
process.exit(!bleed && rendered ? 0 : 1);
