// Ring-shadow numeric probe: at northern summer (2017), the B ring's
// shadow lands near −20° latitude on the sub-solar meridian. Compare
// rendered luminance there vs +15° (unshadowed) at equal sun incidence
// asymmetry — the shadowed band must be markedly darker.
import puppeteer from 'puppeteer-core';
const CHROME = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const BASE = process.env.SMOKE_URL || 'http://localhost:5173';
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
  const { renderer, physics, THREE } = window.__sse;
  physics.setTimeIndex(0);
  physics.jumpToSimSeconds(4718 * 86400); // ≈ 2017-06-01, δ ≈ +26°
  renderer.update(physics, 0.016, 1);
  // Camera on the subsolar point, straight in.
  const sunW = renderer.sunDir.clone().applyQuaternion(renderer.root.quaternion).normalize();
  renderer.camera.position.copy(sunW).multiplyScalar(180);
  renderer.camera.lookAt(0, 0, 0);
  renderer.camera.fov = 48; renderer.camera.updateProjectionMatrix();
  renderer.update(physics, 0.016, 1);
  renderer.renderer.render(renderer.scene, renderer.camera);
  const gl = renderer.renderer.getContext();
  const w = gl.drawingBufferWidth, h = gl.drawingBufferHeight;
  const px = new Uint8Array(w * h * 4);
  gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, px);

  // Sample the surface point at a given latitude on the sub-solar meridian:
  // world dir = rotate sunW toward the pole axis (root Y in world).
  const axis = new THREE.Vector3(0, 1, 0).applyQuaternion(renderer.root.quaternion);
  const sample = (latDeg) => {
    const lat = latDeg * Math.PI / 180;
    // Build surface direction: combination of sunW (equatorial component)
    // and axis, at the requested latitude, then scale by Saturn radius.
    const east = new THREE.Vector3().crossVectors(axis, sunW).normalize();
    const merid = new THREE.Vector3().crossVectors(east, axis).normalize(); // sunward, in equator
    const dir = merid.multiplyScalar(Math.cos(lat)).addScaledVector(axis, Math.sin(lat));
    const world = dir.multiplyScalar(60.268); // surface, scene units
    const p = world.project(renderer.camera);
    const sx = Math.round((p.x * 0.5 + 0.5) * w), sy = Math.round((p.y * 0.5 + 0.5) * h);
    let lum = 0, n = 0;
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
      const i = ((sy + dy) * w + (sx + dx)) * 4;
      lum += (px[i] + px[i + 1] + px[i + 2]) / 3; n++;
    }
    return +(lum / n).toFixed(1);
  };
  return {
    shadowLat20S: sample(-20),  // B-ring shadow zone
    clearLat15N: sample(15),    // unshadowed mirror-ish latitude
    clearLat40N: sample(40),
    equator: sample(0),
  };
});
console.log(JSON.stringify(res, null, 1));
const ok = res.clearLat15N > res.shadowLat20S * 1.4;
console.log(ok ? 'PASS — shadow band present' : 'FAIL — no shadow contrast');
await browser.close();
process.exit(ok ? 0 : 1);
