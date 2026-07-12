// Saturn band-contrast probe: sample lit-side luminance at zone/belt
// latitudes on the sub-solar meridian + save a Hubble-angle screenshot.
//   SMOKE_URL=http://localhost:5173 node tests/saturnbandprobe.mjs [label]
import puppeteer from 'puppeteer-core';
import { mkdirSync } from 'fs';

const CHROME = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const BASE = process.env.SMOKE_URL || 'http://localhost:5173';
const LABEL = process.argv[2] || 'current';
mkdirSync('tests/shots', { recursive: true });

const browser = await puppeteer.launch({
  executablePath: CHROME, headless: 'new',
  args: ['--use-gl=angle', '--enable-unsafe-swiftshader', '--window-size=1280,800'],
});
const page = await browser.newPage();
await page.setViewport({ width: 1280, height: 800 });
await page.goto(`${BASE}/?system=saturn`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction('window.__sse && window.__sse.physics', { timeout: 60000 });
await page.waitForFunction(
  'document.getElementById("loading-screen").classList.contains("done")', { timeout: 60000 });
await new Promise((r) => setTimeout(r, 2500));

const res = await page.evaluate(() => {
  const { renderer, physics, ui, cameraCtl, THREE } = window.__sse;
  ui.setPresentation(true);
  physics.setTimeIndex(0);
  // Enter free mode NOW: the 0.8 s mode transition finishes during the
  // probe, so the later framing evaluate isn't fought by the blend
  // (cinematic was still active — it flew the camera away between
  // evaluates and the screenshot framed empty sky twice).
  cameraCtl.setMode('free');
  for (let i = 0; i < 40; i++) cameraCtl.update(0.05);
  physics.jumpToSimSeconds(4718 * 86400); // 2017 northern summer — lit north
  renderer.update(physics, 0.016, 1);
  // Camera at the subsolar point, ~50,000 km altitude equivalent framing.
  const sunW = renderer.sunDir.clone().applyQuaternion(renderer.root.quaternion).normalize();
  renderer.camera.position.copy(sunW).multiplyScalar(170);
  renderer.camera.lookAt(0, 0, 0);
  renderer.camera.fov = 48; renderer.camera.updateProjectionMatrix();
  renderer.update(physics, 0.016, 1);
  renderer.renderer.render(renderer.scene, renderer.camera);
  const gl = renderer.renderer.getContext();
  const w = gl.drawingBufferWidth, h = gl.drawingBufferHeight;
  const px = new Uint8Array(w * h * 4);
  gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, px);
  const axis = new THREE.Vector3(0, 1, 0).applyQuaternion(renderer.root.quaternion);
  const sample = (latDeg) => {
    const lat = latDeg * Math.PI / 180;
    const east = new THREE.Vector3().crossVectors(axis, sunW).normalize();
    const merid = new THREE.Vector3().crossVectors(east, axis).normalize();
    const dir = merid.multiplyScalar(Math.cos(lat)).addScaledVector(axis, Math.sin(lat));
    const p = dir.multiplyScalar(60.268).project(renderer.camera);
    const sx = Math.round((p.x * 0.5 + 0.5) * w), sy = Math.round((p.y * 0.5 + 0.5) * h);
    let r = 0, g = 0, b = 0, n = 0;
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
      const i = ((sy + dy) * w + (sx + dx)) * 4;
      r += px[i]; g += px[i + 1]; b += px[i + 2]; n++;
    }
    return { lum: +((r + g + b) / 3 / n).toFixed(1),
      rgb: [Math.round(r / n), Math.round(g / n), Math.round(b / n)] };
  };
  // Latitudes aligned to the fract(lat*3.5) band formula: belts land at
  // ~6-15°, 22-32°, 38-48°; zones between them.
  return {
    zoneEq: sample(3), belt1: sample(10), zone2: sample(18),
    belt2: sample(27), zone3: sample(35), polar: sample(64), hexRegion: sample(74),
  };
});
console.log(`[${LABEL}]`, JSON.stringify(res, null, 1));

// Hubble-reference angle: lit face, rings tilted, north pole in view.
// Physics stays PAUSED from the probe evaluate; pin free-mode yaw/pitch
// from the lookAt quaternion (saturnshots.mjs pattern).
await page.evaluate(() => {
  const { renderer, physics, cameraCtl, THREE } = window.__sse;
  const sunW = renderer.sunDir.clone().applyQuaternion(renderer.root.quaternion).normalize();
  const axis = new THREE.Vector3(0, 1, 0).applyQuaternion(renderer.root.quaternion);
  renderer.camera.position.copy(sunW).multiplyScalar(240).addScaledVector(axis, 110);
  renderer.camera.lookAt(0, 0, 0);
  const e = new THREE.Euler().setFromQuaternion(renderer.camera.quaternion, 'YXZ');
  cameraCtl.yaw = e.y; cameraCtl.pitch = e.x;
  renderer.update(physics, 0.016, 1);
});
await new Promise((r) => setTimeout(r, 1200));
await page.screenshot({ path: `tests/shots/saturn-bands-${LABEL}.png` });
console.log(`saved tests/shots/saturn-bands-${LABEL}.png`);
await browser.close();
