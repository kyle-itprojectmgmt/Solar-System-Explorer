// Physics update cost baseline — times physics.update(1/60) per system,
// at 1x and 10,000x, plus body counts. Pure CPU timing (render-independent).
import puppeteer from 'puppeteer-core';

const CHROME = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const BASE = process.env.SMOKE_URL || 'http://localhost:5175';
const SYSTEMS = ['sun', 'jupiter', 'earth', 'mars', 'saturn',
  'mercury', 'venus', 'uranus', 'neptune', 'pluto'];

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: 'new',
  args: ['--use-gl=angle', '--enable-unsafe-swiftshader', '--window-size=1280,800'],
});

console.log('system    bodies nbody  1x µs/call  10000x µs/call');
for (const slug of SYSTEMS) {
  const page = await browser.newPage();
  await page.goto(`${BASE}/?system=${slug}`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction('window.__sse && window.__sse.physics', { timeout: 60000 });
  const r = await page.evaluate(() => {
    const { physics } = window.__sse;
    const N = 5000;
    const run = (idx) => {
      physics.setTimeIndex(idx);
      for (let i = 0; i < 200; i++) physics.update(1 / 60); // warm-up
      const t0 = performance.now();
      for (let i = 0; i < N; i++) physics.update(1 / 60);
      return (performance.now() - t0) / N * 1000; // µs per call
    };
    const us1x = run(1);
    const us10k = run(5);
    physics.setTimeIndex(1);
    return {
      bodies: physics.bodies.length,
      nbody: physics.bodies.filter((b) => b.nbody).length,
      us1x, us10k,
    };
  });
  console.log(`${slug.padEnd(9)} ${String(r.bodies).padEnd(6)} ${String(r.nbody).padEnd(6)} ${r.us1x.toFixed(1).padStart(9)}  ${r.us10k.toFixed(1).padStart(12)}`);
  await page.close();
}
await browser.close();
