// Titan haze probe: is the shell compositing over the disc?
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

const info = await page.evaluate(() => {
  const { renderer, physics, THREE } = window.__sse;
  const entry = renderer.bodyMeshes.get('Titan');
  const shell = entry.group.children.find((c) => c.material?.userData?.altitudeBody === 'Titan');
  const u = shell.material.uniforms;
  const t = renderer.bodyWorldPos('Titan', new THREE.Vector3());
  const sunW = renderer.sunDir.clone().applyQuaternion(renderer.root.quaternion);
  renderer.camera.position.copy(t).addScaledVector(sunW, 9);
  renderer.camera.lookAt(t);
  renderer.update(physics, 0.016, 1);
  renderer.renderer.render(renderer.scene, renderer.camera);
  const gl = renderer.renderer.getContext();
  const w = gl.drawingBufferWidth, h = gl.drawingBufferHeight;
  const px = new Uint8Array(4);
  gl.readPixels(Math.round(w / 2), Math.round(h / 2), 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
  return {
    side: shell.material.side,
    frontSideConst: THREE.FrontSide,
    blending: shell.material.blending,
    normalConst: THREE.NormalBlending,
    visible: shell.visible,
    renderOrder: shell.renderOrder,
    shellRadius: shell.geometry.parameters.radius,
    moonRadius: entry.radiusUnits,
    uAltitude: u.uAltitude.value,
    uIntensity: u.uIntensity.value,
    uSunW: [...'xyz'].map((k) => +u.uSunW.value[k].toFixed(3)),
    camDist: renderer.camera.position.distanceTo(t),
    centerPixel: [...px],
    transparent: shell.material.transparent,
    depthTest: shell.material.depthTest,
    depthWrite: shell.material.depthWrite,
  };
});
console.log(JSON.stringify(info, null, 1));

// Differential experiments: which knob makes the disc center change?
// The RAF loop runs cinematic camera pans between evaluate calls — the
// camera MUST be re-pinned inside every grab.
const exp = await page.evaluate(() => {
  const { renderer, physics, THREE } = window.__sse;
  const entry = renderer.bodyMeshes.get('Titan');
  const shell = entry.group.children.find((c) => c.material?.userData?.altitudeBody === 'Titan');
  const grab = () => {
    const t = renderer.bodyWorldPos('Titan', new THREE.Vector3());
    const sunW = renderer.sunDir.clone().applyQuaternion(renderer.root.quaternion);
    renderer.camera.position.copy(t).addScaledVector(sunW, 9);
    renderer.camera.lookAt(t);
    renderer.update(physics, 0.016, 1);
    renderer.renderer.render(renderer.scene, renderer.camera);
    const gl = renderer.renderer.getContext();
    const px = new Uint8Array(4);
    gl.readPixels(Math.round(gl.drawingBufferWidth / 2), Math.round(gl.drawingBufferHeight / 2),
      1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
    return [...px];
  };
  const out = { base: grab() };
  shell.material.uniforms.uIntensity.value = 5;
  out.intensity5 = grab();
  shell.material.uniforms.uIntensity.value = 1;
  shell.material.depthTest = false;
  out.noDepthTest = grab();
  shell.material.depthTest = true;
  entry.mesh.visible = false;
  out.moonHidden = grab();
  entry.mesh.visible = true;
  return out;
});
console.log(JSON.stringify(exp, null, 1));
await browser.close();
