// ---------------------------------------------------------------------------
// UI layer — HUD, collapsible side panel, body info panel, labels,
// notifications, audio controls, embed drawers, screenshot.
// Pure DOM (no framework); styled by /src/style.css with the ITprojectMGMT
// brand system (Montserrat / Lato, #0077CC / #66B2FF).
// ---------------------------------------------------------------------------

import { AUDIO_MODES } from './audio.js';
import { TIME_STEPS } from './physics.js';
import { KOFI_URL, KM_PER_UNIT } from '../config.js';

const CAMERA_MODES = [
  { id: 'cinematic', label: 'Cinematic', key: 'C', targeted: false },
  { id: 'free', label: 'Free Fly', key: 'F', targeted: false },
  { id: 'orbit', label: 'Orbit', key: 'O', targeted: true },
  { id: 'surface', label: 'Surface', key: 'S', targeted: true },
  { id: 'chase', label: 'Chase', key: 'H', targeted: true },
  { id: 'insertion', label: 'Orbit Insertion', key: 'I', targeted: false },
  { id: 'system', label: 'System View', key: 'G', targeted: false },
];

export class UI {
  constructor({ system, physics, sceneRenderer, cameraCtl, audio, onScreenshot, onVoyagerPreset }) {
    this.system = system;
    this.physics = physics;
    this.r = sceneRenderer;
    this.cam = cameraCtl;
    this.audio = audio;
    this.onScreenshot = onScreenshot;
    this.onVoyagerPreset = onVoyagerPreset;

    this.labelsVisible = false;
    this.presentationMode = false;
    this.labelEls = new Map();
    this.eclipseStates = new Map();
    this._eventTickTimer = 0;

    this.rootEl = document.createElement('div');
    this.rootEl.id = 'ui-root';
    document.body.appendChild(this.rootEl);

    this._buildHUD();
    this._buildSidePanel();
    this._buildInsertionPanel();
    this._buildInfoPanel();
    this._buildHelpOverlay();
    this._buildAudioControls();
    this._buildCornerButtons();
    this._buildViewButtons();
    this._buildNotifications();
    this._buildEmbedDrawer();
    this._buildLabels();
    this._bindKeys();

    this.cam.onModeChange = (mode, target, hint) => {
      this._updateModeHUD(mode, target, hint);
      this._syncSystemViewExtras(mode);
    };
    this.cam.onBodyPicked = (name) => this.showInfo(name);
    this._updateModeHUD(this.cam.mode, this.cam.target);
  }

  // -- HUD ------------------------------------------------------------------

  _buildHUD() {
    this.hud = el('div', 'hud', this.rootEl);

    const tl = el('div', 'hud-topleft panel', this.hud);
    this.dateEl = el('div', 'hud-date', tl);
    this.multEl = el('div', 'hud-mult', tl);
    this.delayEl = el('div', 'hud-delay', tl);

    const tr = el('div', 'hud-topright panel', this.hud);
    this.modeEl = el('div', 'hud-mode', tr);
    this.targetEl = el('div', 'hud-target', tr);
    this.hintEl = el('div', 'hud-hint', tr);

    // Altitude readout — top center, shown within 50,000 km of any body.
    this.altEl = el('div', 'hud-altitude', this.hud);
    this.altEl.style.display = 'none';

    // Detail-floor feedback (4a): one-time message below the ALT readout.
    this.floorMsg = el('div', 'detail-floor-msg', this.hud);
    this.floorMsg.textContent = 'Maximum surface detail reached';
  }

  _bodyCfg(name) {
    return name === this.system.primary.name
      ? this.system.primary
      : this.system.bodies.find((b) => b.name === name);
  }

  _updateModeHUD(mode, target, hint = '') {
    const m = CAMERA_MODES.find((x) => x.id === mode);
    this.modeEl.textContent = m ? m.label.toUpperCase() : mode;
    this.targetEl.textContent = target || '';
    this.hintEl.textContent = hint;
    this.rootEl.querySelectorAll('[data-cam-mode]').forEach((b) => {
      b.classList.toggle('active', b.dataset.camMode === mode);
    });
    if (this.insPanel) this.insPanel.style.display = mode === 'insertion' ? '' : 'none';
    if (this.orbSec) this.orbSec.style.display = mode === 'orbit' ? '' : 'none';
    if (this.chaseSec) this.chaseSec.style.display = mode === 'chase' ? '' : 'none';
  }

  _syncSystemViewExtras(mode) {
    if (mode === 'system') {
      this.r.setOrbitLinesVisible(true);
      this.setLabelsVisible(true);
      if (this.resonanceToggle.checked) this.r.setResonanceVisible(true);
      this.orbitToggle.checked = true;
      this.labelToggle.checked = true;
    } else {
      this.r.setResonanceVisible(false);
    }
  }

  // -- Side panel --------------------------------------------------------------

  _buildSidePanel() {
    this.side = el('div', 'side-panel panel', this.rootEl);
    this.sideTab = el('button', 'side-tab', this.rootEl);
    this.sideTab.innerHTML = '◂';
    this.sideTab.title = 'Toggle panel (Tab)';
    this.sideTab.onclick = () => this.toggleSidePanel();

    const head = el('div', 'side-head', this.side);
    el('h2', 'side-title', head).textContent = 'MISSION CONTROL';
    const helpBtn = el('button', 'btn btn-icon help-btn', head);
    helpBtn.textContent = '?';
    helpBtn.title = 'Controls (?)';
    helpBtn.onclick = () => this.toggleHelp();

    // Camera modes
    const camSec = section(this.side, 'Camera');
    const camGrid = el('div', 'btn-grid', camSec);
    for (const m of CAMERA_MODES) {
      const b = el('button', 'btn', camGrid);
      b.dataset.camMode = m.id;
      b.innerHTML = `${m.label}<span class="key">${m.key}</span>`;
      b.onclick = () => this._activateMode(m);
    }

    // Time controls
    const timeSec = section(this.side, 'Time');
    const timeRow = el('div', 'time-row', timeSec);
    for (let i = 0; i < TIME_STEPS.length; i++) {
      const b = el('button', 'btn btn-small', timeRow);
      b.textContent = TIME_STEPS[i] === 0 ? '⏸' : `${TIME_STEPS[i].toLocaleString()}x`;
      b.dataset.timeIndex = i;
      b.onclick = () => this.physics.setTimeIndex(i);
    }
    this.timeSlider = el('input', 'slider', timeSec);
    Object.assign(this.timeSlider, { type: 'range', min: 0, max: TIME_STEPS.length - 1, step: 1, value: this.physics.timeIndex });
    this.timeSlider.oninput = () => this.physics.setTimeIndex(+this.timeSlider.value);

    // Body selector
    const bodySec = section(this.side, 'Bodies');
    const bodyGrid = el('div', 'btn-grid', bodySec);
    const names = [this.system.primary.name, ...this.system.bodies.map((b) => b.name)];
    for (const n of names) {
      const b = el('button', 'btn btn-small', bodyGrid);
      b.textContent = n;
      b.onclick = () => { this.cam.focusBody(n); this.showInfo(n); };
    }

    // Altitude — continuous logarithmic slider (replaces the old presets).
    // Equal slider travel = equal zoom factor; readout tracks the camera live.
    const ALT_MIN = 50, ALT_MAX = 500000;
    this._altT = (km) => Math.log10(km / ALT_MIN) / Math.log10(ALT_MAX / ALT_MIN);
    this._altKm = (t) => ALT_MIN * Math.pow(ALT_MAX / ALT_MIN, t);
    this.altSec = section(this.side, 'Altitude');
    this.mcAltReadout = el('div', 'alt-readout', this.altSec);
    this.mcAltSlider = el('input', 'slider', this.altSec);
    Object.assign(this.mcAltSlider, { type: 'range', min: 0, max: 1, step: 0.001, value: 0.5 });
    const altScale = el('div', 'ins-scale', this.altSec);
    altScale.innerHTML = '<span>50 km</span><span>500,000 km</span>';
    // While dragging, the slider drives the camera; otherwise the camera
    // drives the slider (see update()).
    this.mcAltSlider.addEventListener('pointerdown', () => { this._altDragging = true; });
    window.addEventListener('pointerup', () => { this._altDragging = false; });
    this.mcAltSlider.oninput = () => {
      const km = this._altKm(+this.mcAltSlider.value);
      this.mcAltReadout.textContent = `ALT: ${Math.round(km).toLocaleString()} km`;
      // Direct set, not flyToAltitude: restarting its 1.5 s tween on every
      // input event stalls the camera until release ("catches up" bug #11).
      if (this.cam.mode === 'insertion') this.cam.setInsertion({ altitudeKm: km });
      else this.cam.setAltitudeDirect(km);
    };
    this.altSec.style.display = 'none';

    // Quick-access inclination — mirrors the Orbit Insertion panel control.
    this.incSecMC = section(this.side, 'Inclination');
    this.mcIncLabel = el('div', 'ins-label', this.incSecMC);
    this.mcIncSlider = el('input', 'slider', this.incSecMC);
    Object.assign(this.mcIncSlider, { type: 'range', min: -90, max: 90, step: 1, value: this.cam.ins.incDeg });
    this.mcIncSlider.oninput = () => this.cam.setInsertion({ incDeg: +this.mcIncSlider.value });
    const mcIncScale = el('div', 'ins-scale', this.incSecMC);
    mcIncScale.innerHTML = '<span>-90° retro</span><span>0° equatorial</span><span>90° polar</span>';
    this.mcIncLabel.textContent = incText(this.cam.ins.incDeg);
    this.incSecMC.style.display = 'none';

    // Orbit mode tuning — how fast the camera sweeps along its orbital path,
    // independent of the time multiplier.
    this.orbSec = section(this.side, 'Orbit Camera');
    const orbLabel = el('div', 'ins-label', this.orbSec);
    const orbSlider = el('input', 'slider', this.orbSec);
    Object.assign(orbSlider, { type: 'range', min: 0, max: 4, step: 0.05, value: this.cam.orbSpeedMult });
    const syncOrb = () => { orbLabel.textContent = `Camera Speed: ${this.cam.orbSpeedMult.toFixed(2)}×`; };
    orbSlider.oninput = () => { this.cam.orbSpeedMult = +orbSlider.value; syncOrb(); };
    syncOrb();
    this.orbSec.style.display = 'none';

    // Chase mode tuning — camera height above the chased moon.
    this.chaseSec = section(this.side, 'Chase Camera');
    const chaseLabel = el('div', 'ins-label', this.chaseSec);
    const chaseSlider = el('input', 'slider', this.chaseSec);
    Object.assign(chaseSlider, { type: 'range', min: 0.2, max: 4, step: 0.05, value: this.cam.chaseHeightMult });
    const chaseDesc = (v) => (v <= 0.5 ? 'Low — surface skim' : v < 2.5 ? 'Medium' : 'High — wide view');
    const syncChase = () => {
      chaseLabel.textContent = `Chase Height: ${this.cam.chaseHeightMult.toFixed(2)}× radius (${chaseDesc(this.cam.chaseHeightMult)})`;
    };
    chaseSlider.oninput = () => { this.cam.chaseHeightMult = +chaseSlider.value; syncChase(); };
    syncChase();
    this.chaseSec.style.display = 'none';

    // Toggles
    const togSec = section(this.side, 'Display');
    this.orbitToggle = toggle(togSec, 'Orbital paths', false, (v) => this.r.setOrbitLinesVisible(v));
    this.labelToggle = toggle(togSec, 'Body labels', false, (v) => this.setLabelsVisible(v));
    this.ringToggle = toggle(togSec, 'Rings', true, (v) => this.r.setRingsVisible(v));
    this.resonanceToggle = toggle(togSec, 'Resonance lines', false, (v) => this.r.setResonanceVisible(v && this.cam.mode === 'system'));

    // Voyager preset
    const presetSec = section(this.side, 'Presets');
    const voyBtn = el('button', 'btn btn-primary', presetSec);
    voyBtn.textContent = '🛰 Voyager 1 Flyby — Mar 5, 1979';
    voyBtn.onclick = () => this.onVoyagerPreset?.();

    // Event ticker
    const tickSec = section(this.side, 'Upcoming Events');
    this.tickerEl = el('div', 'ticker', tickSec);
  }

  _activateMode(m) {
    if (m.targeted) {
      // Reuse the current or last-used target so a bare keypress works;
      // only ask for a click when there has never been a target.
      const target = this.cam.target || this.cam.lastTarget;
      if (target) this.cam.setMode(m.id, target);
      else this.cam.requestTargetedMode(m.id);
    } else {
      this.cam.setMode(m.id);
    }
  }

  toggleSidePanel() {
    const open = this.side.classList.toggle('open');
    this.sideTab.innerHTML = open ? '▸' : '◂';
  }

  // -- Orbit insertion panel --------------------------------------------------------

  _buildInsertionPanel() {
    const ALT_MIN = 10, ALT_MAX = 500000;
    const altToT = (km) => Math.log10(km / ALT_MIN) / Math.log10(ALT_MAX / ALT_MIN);
    const tToAlt = (t) => ALT_MIN * Math.pow(ALT_MAX / ALT_MIN, t);

    const p = el('div', 'insertion-panel panel', this.rootEl);
    this.insPanel = p;
    p.style.display = 'none';
    el('h2', 'side-title', p).textContent = 'ORBITAL INSERTION';

    // Parent body selector: primary + major moons.
    const bodyRow = el('div', 'btn-grid', p);
    const bodies = [this.system.primary.name,
      ...this.system.bodies.filter((b) => b.physics === 'nbody').map((b) => b.name)];
    this.insBodyBtns = bodies.map((n) => {
      const b = el('button', 'btn btn-small', bodyRow);
      b.textContent = n;
      b.onclick = () => this.cam.setInsertion({ body: n });
      return b;
    });

    const altLabel = el('div', 'ins-label', p);
    const altSlider = el('input', 'slider', p);
    Object.assign(altSlider, { type: 'range', min: 0, max: 1, step: 0.001 });
    altSlider.oninput = () => this.cam.setInsertion({ altitudeKm: tToAlt(+altSlider.value) });

    const incLabel = el('div', 'ins-label', p);
    const incSlider = el('input', 'slider', p);
    Object.assign(incSlider, { type: 'range', min: -90, max: 90, step: 1, value: 0 });
    incSlider.oninput = () => this.cam.setInsertion({ incDeg: +incSlider.value });
    const incHints = el('div', 'ins-scale', p);
    incHints.innerHTML = '<span>-90° retrograde</span><span>0° equatorial</span><span>90° polar</span>';

    const lockToggle = toggle(p, 'Lock to body rotation (geosync)', false,
      (v) => this.cam.setInsertion({ locked: v }));

    const geoBtn = el('button', 'btn btn-primary', p);
    geoBtn.style.width = '100%';
    geoBtn.style.marginTop = '8px';
    geoBtn.textContent = `🛰 ${this.system.primary.name} GeoSync`;
    geoBtn.onclick = () => this.cam.presetGeoSync();

    // Feature navigation presets (config-driven) — shown when the primary
    // is the insertion body.
    this.insNavBtns = (this.system.primary.navPresets || []).map((preset) => {
      const b = el('button', 'btn btn-primary', p);
      b.style.width = '100%';
      b.textContent = preset.label;
      b.onclick = () => {
        this.cam.flyToFeature(this.system.primary.name, preset);
        if (preset.message) this.notify(preset.message);
      };
      return b;
    });

    this.insInfo = el('div', 'ins-info', p);

    // Keep controls in sync when scroll-zoom or presets change parameters.
    this.cam.onInsertionChange = (ins) => {
      altSlider.value = altToT(ins.altitudeKm);
      altLabel.textContent = `Altitude: ${Math.round(ins.altitudeKm).toLocaleString()} km`;
      incSlider.value = ins.incDeg;
      incLabel.textContent = incText(ins.incDeg);
      if (this.mcIncSlider) {
        this.mcIncSlider.value = ins.incDeg;
        this.mcIncLabel.textContent = incText(ins.incDeg);
      }
      lockToggle.checked = ins.locked;
      this.insBodyBtns.forEach((b) => b.classList.toggle('active', b.textContent === ins.body));
      this.insNavBtns.forEach((b) => {
        b.style.display = ins.body === this.system.primary.name ? '' : 'none';
      });
    };
  }

  _updateInsertionInfo() {
    const ins = this.cam.ins;
    const h = Math.floor(ins.periodS / 3600);
    const m = Math.floor((ins.periodS % 3600) / 60);
    const s = Math.floor(ins.periodS % 60);
    const isPrimary = ins.body === this.system.primary.name;
    this.insInfo.innerHTML = `
      <div class="ins-row"><span>Altitude</span><span>${Math.round(ins.altitudeKm).toLocaleString()} km above ${isPrimary ? 'clouds' : 'surface'}</span></div>
      <div class="ins-row"><span>Velocity</span><span>${ins.velKmS.toFixed(1)} km/s</span></div>
      <div class="ins-row"><span>Period</span><span>${h}h ${m}m ${s}s</span></div>
      <div class="ins-row"><span>Inc</span><span>${ins.incDeg}°</span></div>
      <div class="ins-row"><span>Surface speed</span><span>${
        ins.locked ? '0.0 km/s (Geosynchronous)' : `${ins.surfaceKmS.toFixed(1)} km/s`
      }</span></div>
      ${isPrimary ? '<div class="ins-warn">⚠️ Extreme radiation environment</div>' : ''}`;
  }

  // -- Info panel -----------------------------------------------------------------

  _buildInfoPanel() {
    this.info = el('div', 'info-panel panel hidden', this.rootEl);
    document.addEventListener('pointerdown', (e) => {
      if (!this.info.classList.contains('hidden') && !this.info.contains(e.target)) {
        this.hideInfo();
      }
    });
  }

  showInfo(name) {
    const cfg = name === this.system.primary.name
      ? this.system.primary
      : this.system.bodies.find((b) => b.name === name);
    if (!cfg) return;
    this.info.innerHTML = '';
    this.infoBody = name;

    // Header: name + type badge. All card data comes from the system
    // config — nothing body-specific lives here.
    const head = el('div', 'info-head', this.info);
    el('h2', 'info-title', head).textContent = cfg.name;
    if (cfg.type) el('span', 'info-badge', head).textContent = cfg.type;
    this.detailDot = el('div', 'detail-indicator', this.info);
    this.detailDot.textContent = '● Surface Detail Active';
    this.detailDot.style.display = 'none';

    // Key stats grid. Diameter/periods derive from the same fields that
    // drive the simulation (radiusKm, periodDays) — single source of truth.
    const stats = el('dl', 'info-stats', this.info);
    const add = (k, v, html = false) => {
      if (v == null) return;
      el('dt', '', stats).textContent = k;
      const dd = el('dd', '', stats);
      if (html) dd.innerHTML = v; else dd.textContent = v;
    };
    if (cfg.radii) add('Dimensions', `${cfg.radii.x * 2} × ${cfg.radii.y * 2} × ${cfg.radii.z * 2} km`);
    else add('Diameter', `${(cfg.radiusKm * 2).toLocaleString()} km`);
    if (cfg.massKg) add('Mass', fmtMass(cfg.massKg), true);
    if (cfg.surfaceGravity) add('Gravity', `${cfg.surfaceGravity} m/s²`);
    if (cfg.surfaceTempRange) add('Temp', fmtTempRange(cfg.surfaceTempRange));
    if (cfg.orbitalDistanceKm) {
      add('Orbit distance', `${cfg.orbitalDistanceKm.min.toLocaleString()} – ${cfg.orbitalDistanceKm.max.toLocaleString()} km`);
    } else if (cfg.semiMajorAxisKm) {
      add('Orbit distance', `${cfg.semiMajorAxisKm.toLocaleString()} km`);
    }
    const period = cfg.periodDays ?? cfg.orbitalPeriodDays;
    if (period) add('Orbital period', period < 1 ? `${(period * 24).toFixed(1)} hours` : `${period.toLocaleString()} days`);
    if (cfg.tidallyLocked) add('Rotation', `${(cfg.periodDays * 24).toFixed(1)} hours (tidally locked)`);
    else if (cfg.rotationPeriodHours) add('Rotation', `${cfg.rotationPeriodHours} hours`);
    if (cfg.discoveredYear) add('Discovered', `${cfg.discoveredYear} — ${cfg.discoveredBy || ''}`);

    // Notable features (fall back to legacy facts for bodies without them).
    const feats = cfg.notableFeatures || cfg.facts || [];
    if (feats.length) {
      el('h3', 'info-subhead', this.info).textContent = 'NOTABLE FEATURES';
      const ul = el('ul', 'info-features', this.info);
      for (const f of feats) el('li', '', ul).textContent = f;
    }

    // Expandable "More Info" section.
    if (cfg.moreInfo) {
      const more = el('button', 'info-more-btn', this.info);
      more.textContent = 'More Info ▾';
      const box = el('dl', 'info-stats info-more', this.info);
      box.style.display = 'none';
      for (const [k, v] of Object.entries(cfg.moreInfo)) {
        el('dt', '', box).textContent = humanizeKey(k);
        el('dd', '', box).textContent = v;
      }
      more.onclick = () => {
        const open = box.style.display === 'none';
        box.style.display = open ? '' : 'none';
        more.textContent = open ? 'More Info ▴' : 'More Info ▾';
      };
    }

    const row = el('div', 'info-actions', this.info);
    const btn = el('button', 'btn btn-primary', row);
    btn.textContent = 'Set as target';
    btn.onclick = () => { this.cam.focusBody(name); this.hideInfo(); };
    const close = el('button', 'btn', row);
    close.textContent = 'Close';
    close.onclick = () => this.hideInfo();
    this.info.classList.remove('hidden');
  }

  hideInfo() { this.info.classList.add('hidden'); }

  // -- Help overlay -------------------------------------------------------------------

  _buildHelpOverlay() {
    this.help = el('div', 'help-overlay hidden', this.rootEl);
    const card = el('div', 'help-card panel', this.help);
    el('h2', 'help-title', card).textContent = 'CONTROLS';

    const cols = el('div', 'help-cols', card);
    const left = el('div', 'help-col', cols);
    const right = el('div', 'help-col', cols);

    const sec = (parent, title, rows) => {
      el('h3', 'help-heading', parent).textContent = title;
      const list = el('div', 'help-list', parent);
      for (const [key, desc] of rows) {
        const row = el('div', 'help-row', list);
        el('span', 'help-key', row).textContent = key;
        el('span', 'help-desc', row).textContent = desc;
      }
    };

    sec(left, 'CAMERA MODES', [
      ['C', 'Cinematic (auto)'], ['F', 'Free Fly'], ['O', 'Orbit (click body)'],
      ['S', 'Surface (click body)'], ['H', 'Chase (click body)'],
      ['G', 'System View'], ['I', 'Orbit Insertion'],
    ]);
    sec(left, 'NAVIGATION', [
      ['W A S D', 'Move (Free Fly)'], ['Shift', 'Speed boost 5×'],
      [',  .', 'Time slower / faster'], ['Space', 'Pause / Resume'],
    ]);
    sec(left, 'INTERFACE', [
      ['Tab', 'Mission Control panel'], ['?', 'This help screen'], ['Escape', 'Close panels'],
      ['F11', 'Fullscreen'], ['P', 'Presentation mode (hide UI)'],
    ]);

    sec(right, 'MOUSE', [
      ['Drag', 'Look / rotate'], ['Scroll wheel', 'Zoom / altitude'],
      ['Click body', 'Focus / info panel'],
    ]);
    sec(right, 'TOUCH', [
      ['1 finger drag', 'Look / rotate'], ['2 finger pinch', 'Zoom'],
      ['2 finger drag', 'Pan'], ['Double tap', 'Focus body'],
      ['Long press', 'Body info panel'], ['Swipe up', 'Mission Control'],
    ]);
    sec(right, 'ALTITUDE', [
      ['Slider', 'Mission Control — log scale'],
      ['Range', '50 km – 500,000 km'],
    ]);

    el('p', 'help-tip', card).textContent =
      'Pro tip: Press Space to pause, then drag to explore any moment in time.';

    // Click outside the card closes.
    this.help.addEventListener('pointerdown', (e) => {
      if (e.target === this.help) this.toggleHelp(false);
    });
  }

  toggleHelp(force) {
    const show = force !== undefined ? force : this.help.classList.contains('hidden');
    this.help.classList.toggle('hidden', !show);
  }

  // -- Audio controls ----------------------------------------------------------------

  _buildAudioControls() {
    const wrap = el('div', 'audio-panel panel', this.rootEl);
    const row = el('div', 'audio-row', wrap);
    for (const m of AUDIO_MODES) {
      const b = el('button', 'btn btn-icon', row);
      // Brand-accurate inline SVG for the streaming services (3d).
      if (m.id === 'spotify') { b.classList.add('brand-spotify'); b.innerHTML = SPOTIFY_SVG; }
      else if (m.id === 'youtube') { b.classList.add('brand-youtube'); b.innerHTML = YOUTUBE_SVG; }
      else b.textContent = m.icon;
      b.title = m.label;
      b.dataset.audioMode = m.id;
      b.onclick = () => {
        this.audio.setMode(m.id);
        row.querySelectorAll('button').forEach((x) => x.classList.toggle('active', x === b));
      };
      if (m.id === this.audio.mode) b.classList.add('active');
    }
    const vol = el('input', 'slider vol-slider', wrap);
    Object.assign(vol, { type: 'range', min: 0, max: 1, step: 0.01, value: this.audio.volume });
    vol.oninput = () => this.audio.setVolume(+vol.value);
  }

  // -- Corner buttons (Ko-fi + screenshot) -----------------------------------------------

  _buildCornerButtons() {
    const wrap = el('div', 'corner-buttons', this.rootEl);
    const kofi = el('a', 'btn kofi-btn', wrap);
    kofi.href = KOFI_URL;
    kofi.target = '_blank';
    kofi.rel = 'noopener';
    kofi.textContent = '☕ Support this project';
    const shot = el('button', 'btn btn-icon', wrap);
    shot.textContent = '📷';
    shot.title = 'Screenshot';
    shot.onclick = () => this.onScreenshot?.();
  }

  // -- Fullscreen + presentation mode ---------------------------------------------------------

  _buildViewButtons() {
    // Fullscreen — always visible in the top-right, outside Mission Control.
    this.fsBtn = el('button', 'btn btn-icon fs-btn', this.rootEl);
    this.fsBtn.textContent = '⛶';
    this.fsBtn.title = 'Fullscreen (F11)';
    this.fsBtn.onclick = () => this.toggleFullscreen();

    // Presentation mode — hides every UI element except this eye icon.
    this.presBtn = el('button', 'btn btn-icon presentation-btn', this.rootEl);
    this.presBtn.textContent = '👁';
    this.presBtn.title = 'Presentation mode (P)';
    this.presBtn.onclick = () => this.setPresentation(!this.presentationMode);
  }

  toggleFullscreen() {
    if (document.fullscreenElement) document.exitFullscreen?.();
    else document.documentElement.requestFullscreen?.();
  }

  /** Pure 3D scene: one class on <body> hides all UI except the exit eye. */
  setPresentation(v) {
    this.presentationMode = v;
    document.body.classList.toggle('presentation-mode', v);
    this.presBtn.title = v ? 'Exit presentation mode (P)' : 'Presentation mode (P)';
  }

  // -- Notifications ------------------------------------------------------------------------

  _buildNotifications() {
    this.noteWrap = el('div', 'notifications', this.rootEl);
  }

  notify(text) {
    const n = el('div', 'notification panel', this.noteWrap);
    n.textContent = text;
    requestAnimationFrame(() => n.classList.add('show'));
    setTimeout(() => {
      n.classList.remove('show');
      setTimeout(() => n.remove(), 600);
    }, 5000);
  }

  // -- Spotify / YouTube drawer ---------------------------------------------------------------

  _buildEmbedDrawer() {
    this.drawer = el('div', 'embed-drawer panel', this.rootEl);
    this.drawer.classList.add('collapsed');
    const head = el('button', 'embed-head', this.drawer);
    el('span', '', head).textContent = '🎵 Player';
    this.embedChevron = el('span', 'embed-chevron', head);
    this._syncChevron = () => {
      this.embedChevron.textContent = this.drawer.classList.contains('collapsed') ? '▴' : '▾';
    };
    // Collapse state persists (independent of presentation mode, which
    // hides the whole drawer along with everything else).
    head.onclick = () => {
      const collapsed = this.drawer.classList.toggle('collapsed');
      localStorage.setItem('sse-music-collapsed', collapsed ? '1' : '0');
      this._syncChevron();
    };
    this._syncChevron();
    this.embedBody = el('div', 'embed-body', this.drawer);
    this.drawer.style.display = 'none';

    this.audio.onEmbedRequest = (mode) => this._showEmbed(mode);
  }

  _showEmbed(mode) {
    this.drawer.style.display = '';
    this.drawer.classList.toggle('collapsed',
      localStorage.getItem('sse-music-collapsed') === '1');
    this._syncChevron();
    this.embedBody.innerHTML = '';
    const storageKey = `sse-${mode}-url`;
    const saved = localStorage.getItem(storageKey) || '';

    const input = el('input', 'embed-input', this.embedBody);
    input.type = 'text';
    input.placeholder = mode === 'spotify'
      ? 'Paste a Spotify playlist URL…'
      : 'Paste a YouTube playlist or video URL…';
    input.value = saved;
    const load = el('button', 'btn btn-primary btn-small', this.embedBody);
    load.textContent = 'Load';
    const frameWrap = el('div', 'embed-frame', this.embedBody);

    const render = (url) => {
      frameWrap.innerHTML = '';
      const src = mode === 'spotify' ? spotifyEmbedUrl(url) : youtubeEmbedUrl(url);
      if (!src) return;
      const f = document.createElement('iframe');
      f.src = src;
      f.allow = 'autoplay; encrypted-media';
      f.width = '100%';
      f.height = mode === 'spotify' ? '152' : '180';
      f.style.border = '0';
      f.style.borderRadius = '8px';
      frameWrap.appendChild(f);
    };
    load.onclick = () => {
      localStorage.setItem(storageKey, input.value);
      render(input.value);
    };
    if (saved) render(saved);
  }

  // -- Labels ------------------------------------------------------------------------------------

  _buildLabels() {
    this.labelLayer = el('div', 'label-layer', this.rootEl);
    const names = [this.system.primary.name, ...this.system.bodies.map((b) => b.name)];
    for (const n of names) {
      const l = el('div', 'body-label', this.labelLayer);
      l.textContent = n;
      l.style.display = 'none';
      l.onclick = () => this.showInfo(n);
      this.labelEls.set(n, l);
    }
  }

  setLabelsVisible(v) {
    this.labelsVisible = v;
    if (!v) this.labelEls.forEach((l) => (l.style.display = 'none'));
  }

  // -- Keyboard shortcuts --------------------------------------------------------------------------

  _bindKeys() {
    window.addEventListener('keydown', (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
      if (e.key === '?') { this.toggleHelp(); return; }
      switch (e.code) {
        case 'KeyC': this.cam.setMode('cinematic'); break;
        case 'KeyF': this.cam.setMode('free'); break;
        case 'KeyO': this._activateMode(CAMERA_MODES[2]); break;
        case 'KeyH': this._activateMode(CAMERA_MODES[4]); break;
        case 'KeyI': this.cam.setMode('insertion'); break;
        case 'KeyG': this.cam.setMode('system'); break;
        case 'Space': e.preventDefault(); this.physics.togglePause(); break;
        case 'Comma': this.physics.slower(); break;
        case 'Period': this.physics.faster(); break;
        case 'Tab': e.preventDefault(); this.toggleSidePanel(); break;
        case 'KeyP': this.setPresentation(!this.presentationMode); break;
        case 'F11': e.preventDefault(); this.toggleFullscreen(); break;
        case 'Escape': this.hideInfo(); this.toggleHelp(false); break;
        case 'KeyS':
          // S is both surface-mode select and free-fly backward; only treat
          // as surface select when not flying.
          if (this.cam.mode !== 'free') this._activateMode(CAMERA_MODES[3]);
          break;
        default: break;
      }
    });
  }

  // -- Per-frame update ------------------------------------------------------------------------------

  update(dt) {
    // Clock + multiplier.
    const d = this.physics.simDate;
    this.dateEl.textContent = d.toISOString().slice(0, 19).replace('T', '  ') + ' UTC';
    this.multEl.textContent = this.physics.paused ? 'PAUSED' : `${this.physics.timeMultiplier.toLocaleString()}x`;
    this.timeSlider.value = this.physics.timeIndex;
    this.rootEl.querySelectorAll('[data-time-index]').forEach((b) => {
      b.classList.toggle('active', +b.dataset.timeIndex === this.physics.timeIndex);
    });

    // Signal delay bonus readout.
    const mins = this.physics.lightDelayToEarthSeconds() / 60;
    this.delayEl.textContent = `Signal delay to Earth: ${mins.toFixed(0)} min`;

    // Altitude readout.
    const near = this.r.nearestAltitudeKm(this.r.camera.position);
    if (near && near.altKm <= 50000) {
      this.altEl.style.display = '';
      this.altEl.textContent = `ALT: ${Math.max(0, Math.round(near.altKm)).toLocaleString()} km`;
    } else {
      this.altEl.style.display = 'none';
    }

    // Detail-floor feedback: message fades in once when crossing the soft
    // floor; the ALT readout pulses once when the hard floor is reached.
    const df = near && this._bodyCfg(near.name)?.detailFloor;
    if (df) {
      if (near.altKm <= df.softKm && !this._softShown) {
        this._softShown = true;
        this.floorMsg.classList.add('show');
        clearTimeout(this._floorMsgT);
        this._floorMsgT = setTimeout(() => this.floorMsg.classList.remove('show'), 3000);
      } else if (near.altKm > df.softKm * 1.15) {
        this._softShown = false;
      }
      // Resistance is asymptotic: the camera converges on (not exactly to)
      // the hard floor, so the pulse fires within 10% of it.
      if (near.altKm <= df.hardKm * 1.1 && !this._hardPulsed) {
        this._hardPulsed = true;
        this.altEl.classList.remove('pulse');
        void this.altEl.offsetWidth; // restart the animation
        this.altEl.classList.add('pulse');
      } else if (near.altKm > df.softKm) {
        this._hardPulsed = false;
      }
    }

    // Altitude + inclination sliders appear once any body has been targeted.
    // Outside a drag, the slider follows the camera's actual altitude.
    const tgt = this.cam.target || this.cam.lastTarget;
    this.altSec.style.display = tgt ? '' : 'none';
    this.incSecMC.style.display = tgt ? '' : 'none';
    if (tgt && !this._altDragging) {
      const entry = this.r.bodyMeshes.get(tgt);
      if (entry) {
        const altKm = Math.max(0,
          (this.r.bodyWorldPos(tgt).distanceTo(this.r.camera.position) - entry.radiusUnits) * KM_PER_UNIT);
        this.mcAltSlider.value = Math.min(1, Math.max(0, this._altT(Math.max(altKm, 50))));
        this.mcAltReadout.textContent = `ALT: ${Math.round(altKm).toLocaleString()} km`;
      }
    }

    // Orbit insertion live readout.
    if (this.cam.mode === 'insertion') this._updateInsertionInfo();

    // Procedural detail indicator on the open info panel.
    if (this.detailDot && !this.info.classList.contains('hidden')) {
      this.detailDot.style.display =
        this.r.getDetailBlend(this.infoBody) > 0.05 ? '' : 'none';
    }

    // Eclipse notifications.
    for (const b of this.physics.bodies) {
      if (b.cfg.radiusKm < 500) continue;
      const prev = this.eclipseStates.get(b.name) || { ecl: false, tra: false };
      const ecl = b.eclipseFactor > 0.5;
      if (ecl && !prev.ecl) this.notify(`${b.name} entering eclipse…`);
      if (!ecl && prev.ecl) this.notify(`${b.name} leaving eclipse`);
      if (b.inTransit && !prev.tra) this.notify(`${b.name} transiting ${this.system.primary.name}`);
      this.eclipseStates.set(b.name, { ecl, tra: b.inTransit });
    }

    // Event ticker (refresh once a second).
    this._eventTickTimer -= dt;
    if (this._eventTickTimer <= 0) {
      this._eventTickTimer = 1;
      const evts = this.physics.predictEvents(5);
      this.tickerEl.innerHTML = evts
        .map((e) => `<div class="tick-row"><span>${e.body} ${e.type}</span><span class="tick-time">${fmtDur(e.inSeconds)}</span></div>`)
        .join('');
    }

    // Labels.
    if (this.labelsVisible) {
      const cam = this.r.camera;
      for (const [name, elm] of this.labelEls) {
        const p = this.r.bodyWorldPos(name);
        const sp = p.clone().project(cam);
        if (sp.z > 1 || sp.z < -1) { elm.style.display = 'none'; continue; }
        elm.style.display = '';
        elm.style.left = `${(sp.x * 0.5 + 0.5) * window.innerWidth}px`;
        elm.style.top = `${(-sp.y * 0.5 + 0.5) * window.innerHeight - 14}px`;
      }
    }
  }

}

// -- Brand icons (inline SVG — no external image loads, works offline) -----------

const SPOTIFY_SVG = `<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z"/></svg>`;

const YOUTUBE_SVG = `<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/></svg>`;

// -- tiny DOM helpers -----------------------------------------------------------

function el(tag, cls, parent) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  parent?.appendChild(e);
  return e;
}

function section(parent, title) {
  const s = el('div', 'side-section', parent);
  el('h3', 'side-heading', s).textContent = title.toUpperCase();
  return s;
}

function toggle(parent, label, initial, onChange) {
  const row = el('label', 'toggle-row', parent);
  const input = el('input', '', row);
  input.type = 'checkbox';
  input.checked = initial;
  input.onchange = () => onChange(input.checked);
  el('span', '', row).textContent = label;
  return input;
}

function fmtMass(kg) {
  const [mant, exp] = kg.toExponential(3).split('e+');
  return `${mant} × 10<sup>${exp}</sup> kg`;
}

function fmtTempRange([a, b]) {
  const f = (t) => `${t.toLocaleString()} °C`;
  return a === b ? f(a) : `${f(Math.min(a, b))} to ${f(Math.max(a, b))}`;
}

function humanizeKey(k) {
  return k.replace(/([A-Z])/g, ' $1').replace(/^./, (c) => c.toUpperCase());
}

function incText(v) {
  let tag = '';
  if (v <= -80) tag = ' (retrograde polar)';
  else if (v < 0) tag = ' (retrograde)';
  else if (v >= 80) tag = ' (polar)';
  else if (v < 10) tag = ' (equatorial)';
  return `Inclination: ${v}°${tag}`;
}

function fmtDur(s) {
  if (s < 90) return `${Math.round(s)}s`;
  if (s < 5400) return `${Math.floor(s / 60)}m ${Math.round(s % 60)}s`;
  if (s < 172800) return `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m`;
  return `${(s / 86400).toFixed(1)}d`;
}

function spotifyEmbedUrl(url) {
  const m = url.match(/open\.spotify\.com\/(playlist|album|track)\/([A-Za-z0-9]+)/);
  return m ? `https://open.spotify.com/embed/${m[1]}/${m[2]}?theme=0` : null;
}

function youtubeEmbedUrl(url) {
  const list = url.match(/[?&]list=([\w-]+)/);
  if (list) return `https://www.youtube.com/embed/videoseries?list=${list[1]}`;
  const vid = url.match(/(?:v=|youtu\.be\/)([\w-]{6,})/);
  return vid ? `https://www.youtube.com/embed/${vid[1]}` : null;
}
