// Scratch: measure subsolar lon + Charon geometry at the NH epoch.
import puppeteer from 'puppeteer-core';
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const browser = await puppeteer.launch({
  executablePath: CHROME, headless: 'new',
  args: ['--use-gl=angle', '--enable-unsafe-swiftshader', '--window-size=1280,800'],
});
const page = await browser.newPage();
await page.goto('http://localhost:5173/?system=pluto', { waitUntil: 'domcontentloaded' });
await page.waitForFunction('window.__sse && window.__sse.physics', { timeout: 60000 });
await page.waitForFunction(
  'document.getElementById("loading-screen").classList.contains("done")', { timeout: 60000 });
await new Promise((r) => setTimeout(r, 1500));

const out = await page.evaluate(() => {
  const { physics, renderer, THREE } = window.__sse;
  const mesh = renderer.primaryMesh;
  const localLon = (m, worldDir) => {
    m.updateWorldMatrix(true, false);
    const c = m.getWorldPosition(new THREE.Vector3());
    const p = m.worldToLocal(c.clone().add(worldDir)).normalize();
    return {
      lat: Math.asin(p.y) * 180 / Math.PI,
      lon: Math.atan2(-p.z, p.x) * 180 / Math.PI,
    };
  };
  const measure = () => {
    renderer.update(physics, 0.016, 1);
    const sunW = renderer.sunDir.clone().applyQuaternion(renderer.root.quaternion).normalize();
    const subsolar = localLon(mesh, sunW);
    // Charon's position in Pluto's body frame.
    const charonEntry = renderer.bodyMeshes.get('Charon');
    const cPos = charonEntry.group.getWorldPosition(new THREE.Vector3());
    const pPos = mesh.getWorldPosition(new THREE.Vector3());
    const toCharonW = cPos.clone().sub(pPos).normalize();
    const subCharon = localLon(mesh, toCharonW);
    // Which Charon-local direction faces Pluto (for plutoshine)?
    const charonMesh = charonEntry.mesh;
    const toPlutoW = pPos.clone().sub(cPos).normalize();
    const charonFacing = localLon(charonMesh, toPlutoW);
    return { subsolar, subCharon, charonFacing };
  };
  physics.setTimeIndex(0);
  physics.jumpToSimSeconds(0);
  const t0 = measure();
  // Advance 2 Charon orbits + a bit to test the mutual lock and direction.
  physics.jumpToSimSeconds(86400 * 1.59680725); // exactly 1/4 orbit
  const tQ = measure();
  physics.jumpToSimSeconds(86400 * 12.774458); // exactly 2 orbits
  const t2 = measure();
  return { t0, tQ, t2, cfgPhase: renderer.system.primary.rotationPhaseAtEpochDeg };
});
console.log(JSON.stringify(out, null, 2));
await browser.close();
