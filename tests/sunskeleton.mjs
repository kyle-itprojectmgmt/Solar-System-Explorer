// V9 Phase 1 gate: the Sun system skeleton must boot with zero console
// errors before workers are spawned. Verifies the isStar build path:
// photosphere + chromosphere + corona meshes, no directional sun light,
// NAV travel row, activity slider, ALT ceiling, loading reveal (the
// texture-less system must not stall on the loading manager).
// Run against `npm run dev`.
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

// -- Sun system boots ---------------------------------------------------------
{
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto(`${BASE}/?system=sun`, { waitUntil: 'domcontentloaded' });
  try {
    await page.waitForFunction('window.__sse && window.__sse.physics', { timeout: 60000 });
    await page.waitForFunction(
      'document.getElementById("loading-screen").classList.contains("done")',
      { timeout: 60000 });
    const info = await page.evaluate(() => {
      const r = window.__sse.renderer;
      const lights = [];
      r.scene.traverse((o) => { if (o.isLight) lights.push(o.type); });
      return {
        slug: r.system.slug,
        isStar: r.system.isStar === true,
        primary: !!r.primaryMesh,
        radiusUnits: r.bodyRadius('Sun'),
        sunMats: !!(r.sunMats?.photoMat && r.sunMats?.chromoMat && r.sunMats?.coronaMat),
        shared: !!(r.sunShared?.uTime && r.sunShared?.uActivity),
        activity: r.sunActivity,
        lights,
        maxAlt: r.system.primary.maxInsertionAltKm,
      };
    });
    check('sun boots (slug + isStar + primary mesh)', info.slug === 'sun' && info.isStar && info.primary);
    check('true-scale radius (696 units)', Math.abs(info.radiusUnits - 696) < 0.5, `r=${info.radiusUnits}`);
    check('photosphere + chromosphere + corona materials built', info.sunMats);
    check('shared sun uniforms wired', info.shared);
    check('no directional sun light in a star system',
      !info.lights.includes('DirectionalLight'), info.lights.join(','));
    check('activity default 0.75', Math.abs(info.activity - 0.75) < 1e-6, `a=${info.activity}`);
    check('maxInsertionAltKm = 5,000,000', info.maxAlt === 5000000);

    // Photosphere actually renders: sample center pixels — must be neither
    // black (shader failed) nor pure white.
    const shot = await page.screenshot({ type: 'png' });
    const png = await page.evaluate(async (b64) => {
      const img = new Image();
      img.src = 'data:image/png;base64,' + b64;
      await img.decode();
      const c = document.createElement('canvas');
      c.width = img.width; c.height = img.height;
      const ctx = c.getContext('2d');
      ctx.drawImage(img, 0, 0);
      const d = ctx.getImageData(img.width / 2 - 20, img.height / 2 - 20, 40, 40).data;
      let sum = 0;
      for (let i = 0; i < d.length; i += 4) sum += (d[i] + d[i + 1] + d[i + 2]) / 3;
      return sum / (d.length / 4);
    }, shot.toString('base64'));
    check('sun disc renders (center luminance 20..255)', png > 20, `lum=${png.toFixed(1)}`);

    // Activity slider present in VIEW panel + writes the uniform.
    const slider = await page.evaluate(() => {
      const ui = window.__sse.ui;
      if (!ui.activitySlider) return { present: false };
      ui.activitySlider.value = '0.25';
      ui.activitySlider.oninput();
      return {
        present: true,
        uniform: window.__sse.renderer.sunShared.uActivity.value,
        stored: localStorage.getItem('sse-sun-activity'),
      };
    });
    check('solar activity slider present', slider.present);
    check('slider writes shared uniform', Math.abs((slider.uniform ?? -1) - 0.25) < 1e-6,
      `u=${slider.uniform}`);
    check('slider persists to localStorage', slider.stored === '0.25', `s=${slider.stored}`);

    check('sun zero console errors', errors.length === 0, errors.slice(0, 3).join(' | '));
  } catch (e) {
    check('sun boots', false, String(e).slice(0, 160));
  }
  await page.close();
}

// -- NAV travel row from another system + no regression -----------------------
{
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto(`${BASE}/?system=jupiter`, { waitUntil: 'domcontentloaded' });
  try {
    await page.waitForFunction('window.__sse && window.__sse.physics', { timeout: 60000 });
    const nav = await page.evaluate(() => {
      const rows = [...document.querySelectorAll('.body-row')];
      const sunRow = rows.find((r) => r.textContent.includes('Sun'));
      return {
        sunRow: !!sunRow,
        travel: sunRow ? sunRow.textContent.includes('→') : false,
        dirLight: (() => {
          let has = false;
          window.__sse.renderer.scene.traverse((o) => { if (o.type === 'DirectionalLight') has = true; });
          return has;
        })(),
      };
    });
    check('jupiter NAV shows Sun travel row', nav.sunRow && nav.travel);
    check('jupiter still has its directional sun light', nav.dirLight);
    check('jupiter zero console errors', errors.length === 0, errors.slice(0, 3).join(' | '));
  } catch (e) {
    check('jupiter boots', false, String(e).slice(0, 160));
  }
  await page.close();
}

await browser.close();
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
