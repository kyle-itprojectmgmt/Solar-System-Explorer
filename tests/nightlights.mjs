// V5a night-light placement probe v2: search sim hours until Paris is in
// night, aim the camera straight at it, then sample known points' pixels.
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

const pts = await page.evaluate(() => {
  const { cameraCtl, physics, renderer, THREE } = window.__sse;
  const toLocal = (lat, lon) => {
    const la = lat * Math.PI / 180, lo = lon * Math.PI / 180;
    return new THREE.Vector3(
      Math.cos(la) * Math.cos(lo), Math.sin(la), -Math.cos(la) * Math.sin(lo));
  };
  const mesh = renderer.primaryMesh;
  const r = mesh.geometry.boundingSphere?.radius ?? 1;
  const center = () => mesh.getWorldPosition(new THREE.Vector3());
  const worldNormal = (lat, lon) =>
    mesh.localToWorld(toLocal(lat, lon).multiplyScalar(r)).sub(center()).normalize();
  const sunW = renderer.sunDir.clone().applyQuaternion(renderer.root.quaternion).normalize();

  // Find a sim hour where Paris sits well inside the night hemisphere.
  physics.setTimeIndex(0);
  let chosen = -1;
  for (let h = 0; h < 24; h += 1) {
    physics.jumpToSimSeconds(h * 3600);
    renderer.update(physics, 0.016, 1);
    mesh.updateWorldMatrix(true, false);
    if (worldNormal(48.9, 2.3).dot(sunW) < -0.55) { chosen = h; break; }
  }

  // Aim the orbit camera down Paris's normal.
  const N = worldNormal(48.9, 2.3);
  cameraCtl.setMode('orbit', 'Earth');
  cameraCtl.orbSpeedMult = 0;
  cameraCtl.orbTheta = Math.atan2(N.z, N.x);
  cameraCtl.orbPhi = Math.acos(Math.max(-1, Math.min(1, N.y)));
  cameraCtl.setAltitudeDirect(22000);
  for (let i = 0; i < 40; i++) cameraCtl.update(0.05);
  renderer.update(physics, 0.016, 1);
  renderer.renderer.render(renderer.scene, renderer.camera);

  const cam = renderer.camera;
  cam.updateMatrixWorld(true);
  cam.matrixWorldInverse.copy(cam.matrixWorld).invert();
  const targets = {
    London: [51.5, -0.1], Paris: [48.9, 2.3], Milan: [45.5, 9.2],
    Cairo: [30.1, 31.3], Sahara: [23.0, 10.0], Atlantic: [45.0, -28.0],
    Kalahari: [-24.0, 21.0], Moscow: [55.8, 37.6],
  };
  const out = { __hour: chosen };
  const camDir = cam.position.clone().sub(center()).normalize();
  for (const [name, [lat, lon]] of Object.entries(targets)) {
    const n = worldNormal(lat, lon);
    const world = center().add(n.clone().multiplyScalar(r * mesh.getWorldScale(new THREE.Vector3()).x));
    const facing = n.dot(camDir) > 0.35;
    const night = n.dot(sunW) < -0.05;
    const ndc = world.project(cam);
    out[name] = {
      facing, night,
      x: Math.round((ndc.x * 0.5 + 0.5) * innerWidth),
      y: Math.round((-ndc.y * 0.5 + 0.5) * innerHeight),
    };
  }
  return out;
});

console.log('night hour found:', pts.__hour);
await new Promise((r) => setTimeout(r, 1500));
await page.screenshot({ path: `${OUT}v5a-night-europe.png` });

const b64 = readFileSync(`${OUT}v5a-night-europe.png`).toString('base64');
const samples = await page.evaluate(async (b64, pts) => {
  const img = new Image();
  img.src = 'data:image/png;base64,' + b64;
  await img.decode();
  const cv = document.createElement('canvas');
  cv.width = img.width; cv.height = img.height;
  const cx = cv.getContext('2d');
  cx.drawImage(img, 0, 0);
  const out = {};
  for (const [name, p] of Object.entries(pts)) {
    if (name === '__hour') continue;
    if (!p.facing || !p.night) { out[name] = `skip (facing=${p.facing} night=${p.night})`; continue; }
    const d = cx.getImageData(p.x - 2, p.y - 2, 5, 5).data;
    let r = 0, g = 0, b = 0;
    for (let i = 0; i < d.length; i += 4) { r += d[i]; g += d[i + 1]; b += d[i + 2]; }
    const n = d.length / 4;
    out[name] = { r: Math.round(r / n), g: Math.round(g / n), b: Math.round(b / n) };
  }
  return out;
}, b64, pts);

console.log(JSON.stringify(samples, null, 1));
const lum = (s) => (typeof s === 'string' ? -1 : 0.299 * s.r + 0.587 * s.g + 0.114 * s.b);
const cities = ['London', 'Paris', 'Milan', 'Cairo', 'Moscow'].map((c) => lum(samples[c]));
const darks = ['Sahara', 'Atlantic', 'Kalahari'].map((c) => lum(samples[c])).filter((v) => v >= 0);
const city = Math.max(...cities);
const dark = Math.max(...darks, 0);
// V5b: the night side is deliberately no longer pure black (nightAmbient
// keeps terrain at ~10%), so the dark references sit near 25-30 luminance.
// Cities must clearly outshine that floor, not a black screen.
console.log(`brightest city ${city.toFixed(0)}  vs  brightest dark ref ${dark.toFixed(0)}  (want city > 1.8x dark, city > 45)`);
await browser.close();
process.exit(city > dark * 1.8 && city > 45 ? 0 : 1);
