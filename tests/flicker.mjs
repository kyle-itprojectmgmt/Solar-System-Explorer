// Temporal shimmer probe: mean absolute pixel diff between two frames whose
// camera differs by a tiny rotation. Sub-pixel noise decorrelates under such
// motion (flicker); properly faded noise changes only marginally.
import puppeteer from 'puppeteer-core';

const CHROME = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const URL = process.env.SMOKE_URL || 'http://localhost:5175';

const browser = await puppeteer.launch({
  executablePath: CHROME, headless: 'new',
  args: ['--use-gl=angle', '--enable-unsafe-swiftshader', '--window-size=800,600'],
});
const page = await browser.newPage();
await page.setViewport({ width: 800, height: 600 });
await page.goto(URL, { waitUntil: 'domcontentloaded' });
await page.waitForFunction('window.__sse && window.__sse.physics', { timeout: 60000 });
await page.waitForFunction(
  'document.getElementById("loading-screen").classList.contains("done")', { timeout: 60000 });
await new Promise((r) => setTimeout(r, 3000));

async function grab(body, altKm, dTheta) {
  return page.evaluate(({ body, altKm, dTheta }) => {
    const { cameraCtl, renderer, physics } = window.__sse;
    physics.setTimeIndex(0); // pause: only camera motion differs
    cameraCtl.setMode('orbit', body);
    cameraCtl.orbSpeedMult = 0;
    const entry = renderer.bodyMeshes.get(body);
    cameraCtl.orbDist = entry.radiusUnits + altKm / 1000;
    cameraCtl.distTween = null;
    const d = renderer.sunDir;
    cameraCtl.orbTheta = Math.atan2(d.z, d.x) + dTheta;
    cameraCtl.orbPhi = Math.PI / 2 - 0.15;
    for (let i = 0; i < 60; i++) cameraCtl.update(0.05);
    renderer.update(physics, 0.016, 1);
    const gl = renderer.renderer;
    gl.render(renderer.scene, renderer.camera); // postfx bypassed: raw scene
    const c = gl.domElement;
    const w = 256, h = 256;
    const off = document.createElement('canvas');
    off.width = w; off.height = h;
    const ctx = off.getContext('2d');
    ctx.drawImage(c, c.width / 2 - 128, c.height / 2 - 128, 256, 256, 0, 0, w, h);
    return Array.from(ctx.getImageData(0, 0, w, h).data);
  }, { body, altKm, dTheta });
}

for (const [body, altKm] of [['Io', 500], ['Europa', 500], ['Jupiter', 3000]]) {
  const a = await grab(body, altKm, 0);
  const b = await grab(body, altKm, 0.00025); // ~sub-pixel camera rotation
  let sum = 0, n = 0;
  for (let i = 0; i < a.length; i += 4) {
    sum += Math.abs(a[i] - b[i]) + Math.abs(a[i + 1] - b[i + 1]) + Math.abs(a[i + 2] - b[i + 2]);
    n += 3;
  }
  console.log(`${body}@${altKm}km  mean|diff| = ${(sum / n).toFixed(3)}`);
}
await browser.close();
