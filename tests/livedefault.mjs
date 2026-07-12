// LIVE-by-default guard (V5.1.2): fresh REAL-USER load (webdriver spoofed
// off) opens every system at the current UTC instant with the HUD 🔴 LIVE
// active; the SAVE-panel epoch presets (Voyager / Apollo 11) are the way
// back to the historical moments and must exit LIVE. Plus HYG star checks:
// visible in the sky at high altitude, never on the planet disc.
import puppeteer from 'puppeteer-core';

const CHROME = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const BASE = process.env.SMOKE_URL || 'http://localhost:5173';

const browser = await puppeteer.launch({
  executablePath: CHROME, headless: 'new',
  args: ['--use-gl=angle', '--enable-unsafe-swiftshader', '--window-size=1280,800'],
});

const checks = [];
const check = (name, ok, extra = '') => {
  checks.push(ok);
  console.log(`${ok ? ' ok ' : 'FAIL'} ${name}${extra ? `  (${extra})` : ''}`);
};

async function freshPage(url) {
  // Isolated context per system: a preset click legitimately persists
  // sse-live-mode='0', which must not leak into the next fresh-load check.
  const ctx = await browser.createBrowserContext();
  const page = await ctx.newPage();
  await page.setViewport({ width: 1280, height: 800 });
  // Look like a real user: the LIVE default keys off navigator.webdriver.
  await page.evaluateOnNewDocument(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => false });
  });
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction('window.__sse && window.__sse.physics', { timeout: 60000 });
  await page.waitForFunction(
    'document.getElementById("loading-screen").classList.contains("done")', { timeout: 60000 });
  await new Promise((r) => setTimeout(r, 1500));
  return page;
}

// ---- Jupiter: fresh load = LIVE at current UTC; Voyager preset = 1979 ----
{
  const page = await freshPage(`${BASE}/`);
  const r = await page.evaluate(() => {
    const { physics, ui } = window.__sse;
    const out = {};
    out.liveOn = ui.liveMode === true;
    out.btnOn = document.querySelector('.ghost-live').classList.contains('on');
    out.driftS = Math.abs(physics.epochMs + physics.simSeconds * 1000 - Date.now()) / 1000;
    out.hudUtc = document.querySelector('.ghost-date').textContent;
    // Voyager preset lives in the SAVE panel.
    const btn = [...document.querySelectorAll('.preset-row')]
      .find((b) => b.textContent.includes('Voyager'));
    out.voyagerBtn = !!btn;
    btn?.click();
    out.voyagerSimS = physics.simSeconds;
    out.liveOffAfter = ui.liveMode === false;
    return out;
  });
  check('Jupiter fresh load: LIVE on + HUD 🔴 active', r.liveOn && r.btnOn);
  check('Jupiter opens at current UTC (not 1979)', r.driftS < 60, `drift ${r.driftS.toFixed(1)}s, HUD ${r.hudUtc}`);
  // Give the LIVE drift-snap a chance to (wrongly) revert the preset.
  await new Promise((res) => setTimeout(res, 700));
  const r2 = await page.evaluate(() => window.__sse.physics.simSeconds);
  check('Voyager preset -> 1979 epoch + LIVE off', r.voyagerBtn && Math.abs(r.voyagerSimS) < 60 && r.liveOffAfter);
  check('Voyager jump survives LIVE drift-snap', Math.abs(r2) < 120, `simS ${r2.toFixed(0)}`);
  await page.close();
}

// ---- Earth: fresh load = LIVE now; Apollo preset = 1969; stars ----------
{
  const page = await freshPage(`${BASE}/?system=earth`);
  const r = await page.evaluate(() => {
    const { physics, ui } = window.__sse;
    const out = {};
    out.liveOn = ui.liveMode === true;
    out.driftS = Math.abs(physics.epochMs + physics.simSeconds * 1000 - Date.now()) / 1000;
    const btn = [...document.querySelectorAll('.preset-row')]
      .find((b) => b.textContent.includes('Apollo'));
    out.apolloBtn = !!btn;
    btn?.click();
    out.apolloSimS = physics.simSeconds;
    out.liveOffAfter = ui.liveMode === false;
    return out;
  });
  check('Earth fresh load: LIVE on at current UTC (not 1969)', r.liveOn && r.driftS < 60, `drift ${r.driftS.toFixed(1)}s`);
  check('Apollo 11 preset -> 1969 epoch + LIVE off', r.apolloBtn && Math.abs(r.apolloSimS) < 60 && r.liveOffAfter);

  // Stars: bright sky dots at 50,000 km must come from the HYG points
  // (count drops when hidden); on-disc dot count must NOT change (the
  // "stars on the surface" report was the city-light speckle).
  const stars = await page.evaluate(async () => {
    const { cameraCtl, physics, renderer } = window.__sse;
    window.__sse.ui.setLive(false);
    physics.setTimeIndex(0);
    cameraCtl.setMode('orbit', 'Earth');
    cameraCtl.orbSpeedMult = 0;
    cameraCtl.setAltitudeDirect(50000);
    for (let i = 0; i < 50; i++) cameraCtl.update(0.05);
    renderer.update(physics, 0.016, 1);
    const starObjs = renderer.scene.children.filter((o) => o.isPoints && o.renderOrder === -1);
    const grab = () => {
      renderer.renderer.render(renderer.scene, renderer.camera);
      const gl = renderer.renderer.getContext();
      const w = gl.drawingBufferWidth, h = gl.drawingBufferHeight;
      const px = new Uint8Array(w * h * 4);
      gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, px);
      return { px, w, h };
    };
    // Changed-pixel diff isolates the HYG layer from the Milky Way panorama.
    const a = grab();
    starObjs.forEach((s) => { s.visible = false; });
    const b = grab();
    starObjs.forEach((s) => { s.visible = true; });
    const region = (x0, x1, y0, y1) => {
      let n = 0;
      for (let y = Math.floor(b.h * y0); y < b.h * y1; y++) {
        for (let x = Math.floor(b.w * x0); x < b.w * x1; x++) {
          const i = (y * b.w + x) * 4;
          if (Math.abs(a.px[i] - b.px[i]) + Math.abs(a.px[i + 1] - b.px[i + 1])
            + Math.abs(a.px[i + 2] - b.px[i + 2]) > 12) n++;
        }
      }
      return n;
    };
    return {
      skyDiff: region(0.0, 0.15, 0.1, 0.9),   // left sky strip
      discDiff: region(0.46, 0.54, 0.44, 0.56), // safely inside the disc
      starObjs: starObjs.length,
    };
  });
  check('HYG stars render in the sky at 50,000 km', stars.starObjs === 1 && stars.skyDiff > 15,
    `sky pixels from HYG layer: ${stars.skyDiff}`);
  check('no star dots on the planet disc (toggle changes nothing)', stars.discDiff === 0,
    `disc diff ${stars.discDiff}`);
  await page.close();
}

await browser.close();
const failed = checks.filter((c) => !c).length;
console.log(failed ? `FAIL (${failed})` : 'PASS');
process.exit(failed ? 1 : 0);
