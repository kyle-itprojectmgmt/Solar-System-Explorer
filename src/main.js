// ---------------------------------------------------------------------------
// Solar System Explorer — entry point.
// Loads the active system config (see SYSTEM_CONFIG in config.js), detects a
// quality tier, and wires renderer + physics + camera + audio + UI together.
// ---------------------------------------------------------------------------

import { SYSTEM_CONFIG } from './config.js';
import { PhysicsEngine } from './engine/physics.js';
import { SceneRenderer } from './engine/renderer.js';
import { CameraController } from './engine/camera.js';
import { createPostFX } from './engine/postfx.js';
import { AudioEngine } from './engine/audio.js';
import { UI } from './engine/ui.js';

// -- Quality tier detection ----------------------------------------------------

function detectQuality() {
  // Coarse primary pointer = touch-first device. Raw maxTouchPoints would
  // wrongly demote touchscreen laptops (and headless Chrome) to tablet tier.
  const coarse = window.matchMedia?.('(pointer: coarse)').matches ?? false;
  const mem = navigator.deviceMemory || 8;
  const cores = navigator.hardwareConcurrency || 8;
  let tier = 'desktop';
  if (coarse && (mem <= 4 || cores <= 4)) tier = 'mobile';
  else if (coarse) tier = 'tablet';

  const saved = localStorage.getItem('sse-quality-tier');
  if (saved && ['desktop', 'tablet', 'mobile'].includes(saved)) tier = saved;

  return {
    tier,
    pixelRatio: Math.min(window.devicePixelRatio || 1, 2),
    postfx: tier !== 'mobile',
    highResPrimary: tier === 'desktop',
  };
}

// -- Loading screen ---------------------------------------------------------------

function loadingScreen(facts) {
  const bar = document.getElementById('loading-bar');
  const factEl = document.getElementById('loading-fact');
  const screen = document.getElementById('loading-screen');
  let i = Math.floor(Math.random() * facts.length);
  factEl.textContent = facts[i] || '';
  const timer = setInterval(() => {
    i = (i + 1) % facts.length;
    factEl.textContent = facts[i] || '';
  }, 3200);
  return {
    progress(p) { bar.style.width = `${Math.round(p * 100)}%`; },
    done() {
      bar.style.width = '100%';
      clearInterval(timer);
      setTimeout(() => screen.classList.add('done'), 350);
    },
  };
}

// -- Boot ---------------------------------------------------------------------------

async function boot() {
  const { default: system } = await import(`./data/systems/${SYSTEM_CONFIG}.js`);
  const quality = detectQuality();
  const loader = loadingScreen(system.loadingFacts || []);

  const physics = new PhysicsEngine(system);
  const renderer = new SceneRenderer(system, quality, (p) => loader.progress(p));
  document.getElementById('app').appendChild(renderer.renderer.domElement);

  const cameraCtl = new CameraController(renderer, renderer.renderer.domElement, physics);
  const postfx = createPostFX(renderer.renderer, renderer.scene, renderer.camera, quality);
  const audio = new AudioEngine();

  // Screenshot: hide UI, render one clean frame, save, restore.
  let ui;
  function screenshot() {
    ui.setVisible(false);
    setTimeout(() => {
      renderFrame(0.016, performance.now() / 1000);
      renderer.renderer.domElement.toBlob((blob) => {
        if (blob) {
          const a = document.createElement('a');
          const ts = new Date().toISOString().slice(0, 19).replace('T', '-').replaceAll(':', '-');
          a.href = URL.createObjectURL(blob);
          a.download = `solar-system-explorer-${ts}.png`;
          a.click();
          URL.revokeObjectURL(a.href);
        }
        ui.setVisible(true);
      });
    }, 350);
  }

  // Voyager 1 flyby preset: reset the clock to the epoch, radio audio,
  // scripted approach sequence.
  function voyagerPreset() {
    physics.simSeconds = 0;
    physics.setTimeIndex(1);
    audio.setMode('voyager');
    ui.notify('Voyager 1 flyby — March 5, 1979');
    const primary = system.primary.name;
    const io = system.bodies[0]?.name || primary;
    cameraCtl.playSequence([
      { target: primary, dist: 30, height: 8, orbitRate: 0.012, duration: 12, startTheta: 2.6 },
      { target: primary, dist: 9, height: 2.2, orbitRate: 0.03, duration: 14, startTheta: 3.4 },
      { target: io, dist: 8, height: 1.8, orbitRate: 0.06, duration: 12, startTheta: 1.2, lookAt: primary },
      { target: primary, dist: 5, height: 1.2, orbitRate: 0.04, duration: 14, startTheta: 4.6 },
    ]);
  }

  ui = new UI({
    system, physics, sceneRenderer: renderer, cameraCtl, audio,
    onScreenshot: screenshot,
    onVoyagerPreset: voyagerPreset,
  });

  // Occasional volcanic notifications when the camera is near a plume body.
  const volcanoBodies = system.bodies.filter((b) => b.features?.volcanicPlumes);
  setInterval(() => {
    for (const b of volcanoBodies) {
      const d = renderer.bodyWorldPos(b.name).distanceTo(renderer.camera.position);
      if (d < (b.radiusKm / 1000) * 30 && Math.random() < 0.4) {
        const v = b.features.volcanoes[Math.floor(Math.random() * b.features.volcanoes.length)];
        ui.notify(`Volcanic eruption detected at ${v.name} region`);
      }
    }
  }, 45000);

  if (postfx) renderer.resizeHooks.push((w, h) => postfx.setSize(w, h));

  // Dev-only handle for automated smoke tests.
  if (import.meta.env.DEV) {
    const THREE = await import('three');
    window.__sse = { physics, renderer, cameraCtl, THREE };
  }

  // -- Render loop ----------------------------------------------------------------

  const clock = { last: performance.now() };

  function renderFrame(dt, t) {
    physics.update(dt);
    renderer.update(physics, dt, t);
    cameraCtl.update(dt);
    ui.update(dt);

    if (postfx) {
      // Keep DoF focused on the current target's near surface, not its center
      // — at low altitude the surface is the subject.
      const focusName = cameraCtl.target || system.primary.name;
      const centerDist = renderer.bodyWorldPos(focusName).distanceTo(renderer.camera.position);
      postfx.setFocusDistanceWorld(Math.max(centerDist - renderer.bodyRadius(focusName), 0.05));
      postfx.render(dt);
    } else {
      renderer.renderer.render(renderer.scene, renderer.camera);
    }
  }

  function loop(now) {
    const dt = Math.min((now - clock.last) / 1000, 0.1);
    clock.last = now;
    renderFrame(dt, now / 1000);
    requestAnimationFrame(loop);
  }

  // Wait for the texture manager to finish (or 12 s max) before revealing.
  await new Promise((resolve) => {
    let settled = false;
    const finish = () => { if (!settled) { settled = true; resolve(); } };
    renderer.loadingManager.onLoad = finish;
    setTimeout(finish, 12000);
  });

  loader.done();
  requestAnimationFrame((now) => { clock.last = now; loop(now); });

  // Restore saved audio mode on first user interaction (browsers require a
  // gesture before AudioContext can start).
  const resumeAudio = () => {
    if (audio.mode !== 'silent') audio.setMode(audio.mode);
    window.removeEventListener('pointerdown', resumeAudio);
    window.removeEventListener('keydown', resumeAudio);
  };
  window.addEventListener('pointerdown', resumeAudio);
  window.addEventListener('keydown', resumeAudio);
}

boot();
