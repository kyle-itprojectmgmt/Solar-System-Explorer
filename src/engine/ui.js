// ---------------------------------------------------------------------------
// UI layer — HUD, collapsible side panel, body info panel, labels,
// notifications, audio controls, embed drawers, screenshot.
// Pure DOM (no framework); styled by /src/style.css with the ITprojectMGMT
// brand system (Montserrat / Lato, #0077CC / #66B2FF).
// ---------------------------------------------------------------------------

import { AUDIO_MODES } from './audio.js';
import { TIME_STEPS, dateToSimSeconds, simSecondsToDate } from './physics.js';
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
    this._buildBottomTray();
    this._buildAudioFlyout();
    this._buildViewButtons();
    this._buildNotifications();
    this._buildLabels();
    this._bindKeys();
    this._attachTooltips();

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

    // Zone 1 (V4c): pure ghost text — no panel, no box. The date is
    // clickable (opens the date picker); 🔴 toggles LIVE real-time mode.
    const tl = el('div', 'hud-ghost', this.hud);
    this.hudGhost = tl;
    const dateRow = el('div', 'ghost-daterow', tl);
    this.dateEl = el('button', 'ghost-date', dateRow);
    this.dateEl.onclick = () => this.toggleDatePicker();
    this.liveBtn = el('button', 'ghost-live', dateRow);
    this.liveBtn.onclick = () => this.setLive(!this.liveMode);
    const line2 = el('div', 'ghost-line2', tl);
    this.multEl = el('span', 'ghost-mult', line2);
    el('span', 'ghost-sep', line2).textContent = ' · ';
    this.delayEl = el('span', 'ghost-delay', line2);

    this._buildDatePicker();
    this.setLive(localStorage.getItem('sse-live-mode') === '1', true);

    const tr = el('div', 'hud-topright panel', this.hud);
    this.modeEl = el('div', 'hud-mode', tr);
    this.targetEl = el('div', 'hud-target', tr);
    this.hintEl = el('div', 'hud-hint', tr);

    // Free look indicator (2b) — visible while Alt / two-finger look is held.
    this.freeLookEl = el('div', 'freelook-indicator', this.hud);
    this.freeLookEl.textContent = '🔓 Free Look';
    this.cam.onFreeLookChange = (on) => this.freeLookEl.classList.toggle('show', on);

    // Altitude readout — top center, shown within 50,000 km of any body.
    this.altEl = el('div', 'hud-altitude', this.hud);
    this.altEl.style.display = 'none';

    // Detail-floor feedback (4a): one-time message below the ALT readout.
    this.floorMsg = el('div', 'detail-floor-msg', this.hud);
    this.floorMsg.textContent = 'Maximum surface detail reached';

    // 1:2:4 resonance alignment readout — visible while resonance lines are on.
    this.resEl = el('div', 'resonance-hud', this.hud);
    this.resEl.style.display = 'none';
  }

  // -- Date picker + LIVE mode (V4c Group 5) -------------------------------------

  _buildDatePicker() {
    const p = el('div', 'date-picker panel', this.rootEl);
    this.datePicker = p;
    p.style.display = 'none';

    const head = el('div', 'dp-head', p);
    const btn = (label, cls, fn) => {
      const b = el('button', `dp-nav ${cls || ''}`, head);
      b.textContent = label;
      b.onclick = fn;
      return b;
    };
    btn('◀◀', '', () => this._dpShift(-120)); // jump 10 years
    btn('◀', '', () => this._dpShift(-1));
    this.dpTitle = el('span', 'dp-title', head);
    btn('▶', '', () => this._dpShift(1));
    btn('▶▶', '', () => this._dpShift(120));

    const yearRow = el('div', 'dp-yearrow', p);
    el('span', 'af-label', yearRow).textContent = 'Year';
    this.dpYear = el('input', 'dp-year embed-input', yearRow);
    Object.assign(this.dpYear, { type: 'number', min: 1950, max: 2050 });
    this.dpYear.onchange = () => {
      const y = Math.max(1950, Math.min(2050, +this.dpYear.value || 1979));
      this._dpY = y;
      this._dpRender();
    };

    this.dpGrid = el('div', 'dp-grid', p);

    // Close on click-away / Escape (Escape handled in _bindKeys).
    document.addEventListener('pointerdown', (e) => {
      if (this.datePicker.style.display !== 'none'
        && !this.datePicker.contains(e.target) && e.target !== this.dateEl) {
        this.toggleDatePicker(false);
      }
    });
  }

  toggleDatePicker(force) {
    const show = force !== undefined ? force : this.datePicker.style.display === 'none';
    if (show) {
      const d = this.physics.simDate;
      this._dpY = Math.max(1950, Math.min(2050, d.getUTCFullYear()));
      this._dpM = d.getUTCMonth();
      this._dpRender();
    }
    this.datePicker.style.display = show ? '' : 'none';
  }

  _dpShift(months) {
    const total = this._dpY * 12 + this._dpM + months;
    this._dpY = Math.max(1950, Math.min(2050, Math.floor(total / 12)));
    this._dpM = ((total % 12) + 12) % 12;
    this._dpRender();
  }

  _dpRender() {
    const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June',
      'July', 'August', 'September', 'October', 'November', 'December'];
    this.dpTitle.textContent = `${MONTHS[this._dpM]} ${this._dpY}`;
    this.dpYear.value = this._dpY;
    this.dpGrid.innerHTML = '';
    for (const wd of ['S', 'M', 'T', 'W', 'T', 'F', 'S']) {
      el('span', 'dp-wd', this.dpGrid).textContent = wd;
    }
    const first = new Date(Date.UTC(this._dpY, this._dpM, 1));
    const days = new Date(Date.UTC(this._dpY, this._dpM + 1, 0)).getUTCDate();
    for (let i = 0; i < first.getUTCDay(); i++) el('span', '', this.dpGrid);
    const sim = this.physics.simDate;
    const isSimMonth = sim.getUTCFullYear() === this._dpY && sim.getUTCMonth() === this._dpM;
    for (let d = 1; d <= days; d++) {
      const b = el('button', 'dp-day', this.dpGrid);
      b.textContent = d;
      if (isSimMonth && sim.getUTCDate() === d) b.classList.add('today');
      b.onclick = () => this._dpPick(d);
    }
  }

  /** Jump the simulation to the picked date (time-of-day preserved). */
  _dpPick(day) {
    const sim = this.physics.simDate;
    const pad = (n) => String(n).padStart(2, '0');
    const iso = `${this._dpY}-${pad(this._dpM + 1)}-${pad(day)}`
      + `T${pad(sim.getUTCHours())}:${pad(sim.getUTCMinutes())}:${pad(sim.getUTCSeconds())}Z`;
    this.setLive(false);
    this.physics.jumpToSimSeconds(dateToSimSeconds(iso, this.physics.epochMs));
    this.notify(`Jumped to ${iso.slice(0, 10)}`);
    this.toggleDatePicker(false);
  }

  /** 🔴 LIVE: track the real-world UTC clock at 1x. */
  setLive(v, silent = false) {
    this.liveMode = v;
    localStorage.setItem('sse-live-mode', v ? '1' : '0');
    this.liveBtn.textContent = v ? '🔴 LIVE' : '🔴';
    this.liveBtn.classList.toggle('on', v);
    if (v) {
      this.physics.jumpToSimSeconds(
        dateToSimSeconds(new Date().toISOString(), this.physics.epochMs));
      this.physics.setTimeIndex(1);
      this._liveSync = 0;
      if (!silent) this.notify('LIVE — tracking real-world time');
    }
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
    this.mcIncSlider.oninput = () => {
      // Read first: entering insertion mode syncs this slider from the old
      // ins state, which would clobber the value being dragged.
      const incDeg = +this.mcIncSlider.value;
      // Dragging inclination outside Orbit Insertion used to silently do
      // nothing (bug #23) — the intent is clearly "orbit at this angle".
      if (this.cam.mode !== 'insertion') {
        const target = this.cam.target || this.cam.lastTarget || this.system.primary.name;
        this.cam.setMode('insertion', target);
        this.notify('Switched to Orbit Insertion for inclination');
      }
      this.cam.setInsertion({ incDeg });
    };
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

  // -- Bottom center tray (V4c Group 3) ---------------------------------------------
  // The one persistent control surface: music, volume, screenshot,
  // presentation mode, Ko-fi. Fixed bottom-center, never moves.

  _buildBottomTray() {
    const tray = el('div', 'bottom-tray', this.rootEl);
    this.tray = tray;

    this.musicBtn = el('button', 'tray-btn tray-music', tray);
    this.musicBtn.textContent = '🎵';
    this.musicBtn.onclick = () => this.toggleAudioFlyout();

    this.trayVol = el('input', 'slider tray-vol', tray);
    Object.assign(this.trayVol, { type: 'range', min: 0, max: 1, step: 0.01, value: this.audio.volume });
    this.trayVol.oninput = () => {
      this.audio.setVolume(+this.trayVol.value);
      if (+this.trayVol.value > 0) this._muted = false;
      this._syncAudioUI();
    };

    const shot = el('button', 'tray-btn', tray);
    shot.textContent = '📷';
    shot.dataset.tray = 'screenshot';
    shot.onclick = () => this.onScreenshot?.();

    this.presBtn = el('button', 'tray-btn', tray);
    this.presBtn.textContent = '👁';
    this.presBtn.dataset.tray = 'presentation';
    this.presBtn.onclick = () => this.setPresentation(!this.presentationMode);

    const kofi = el('a', 'tray-btn kofi-btn', tray);
    kofi.href = KOFI_URL;
    kofi.target = '_blank';
    kofi.rel = 'noopener';
    kofi.textContent = '☕';
  }

  // -- Audio flyout (V4c Group 4) -----------------------------------------------------
  // Expands upward from the tray's music icon. Replaces the old Player
  // panel and the 7-button audio mode row.

  _buildAudioFlyout() {
    const p = el('div', 'audio-flyout panel', this.rootEl);
    this.audioFlyout = p;
    p.style.display = 'none';

    // Row 1 — mute toggle.
    const muteRow = el('div', 'af-row', p);
    this.muteBtn = el('button', 'tray-btn', muteRow);
    this.muteBtn.onclick = () => {
      this._muted = !this._muted;
      if (this._muted) {
        this._preMuteVol = this.audio.volume || 0.6;
        this.audio.setVolume(0);
      } else {
        this.audio.setVolume(this._preMuteVol ?? 0.6);
      }
      this._syncAudioUI();
    };
    el('span', 'af-label', muteRow).textContent = 'Mute';

    // Row 2 — generative sounds dropdown.
    this.genRow = el('div', 'af-row', p);
    el('span', 'af-label', this.genRow).textContent = 'Space Sounds';
    this.genSelect = el('select', 'af-select', this.genRow);
    const GEN = [
      ['silent', '— None —'],
      ['voyager', 'Voyager Radio'],
      ['ambient', 'Deep Space Ambient'],
      ['psychedelic', 'Psychedelic Journey'],
      ['electronic', 'Cosmic Electronic'],
    ];
    for (const [id, label] of GEN) {
      const o = el('option', '', this.genSelect);
      o.value = id; o.textContent = label;
    }
    this.genSelect.onchange = () => {
      this.audio.setMode(this.genSelect.value);
      this._syncAudioUI();
    };

    // Rows 3/4 — streaming services with expandable URL inputs.
    this.streamRows = {};
    for (const [mode, svg, label] of [
      ['spotify', SPOTIFY_SVG, 'Spotify Playlist'],
      ['youtube', YOUTUBE_SVG, 'YouTube Playlist'],
    ]) {
      const row = el('div', 'af-row af-stream', p);
      const head = el('button', `af-stream-head brand-${mode}`, row);
      head.innerHTML = `${svg}<span class="af-label">${label}</span><span class="af-chev">▾</span>`;
      const body = el('div', 'af-stream-body', row);
      body.style.display = 'none';
      const input = el('input', 'embed-input', body);
      input.type = 'text';
      input.placeholder = mode === 'spotify'
        ? 'Paste a Spotify playlist URL…'
        : 'Paste a YouTube playlist or video URL…';
      input.value = localStorage.getItem(`sse-${mode}-url`) || '';
      const load = el('button', 'btn btn-primary btn-small', body);
      load.textContent = 'Load';
      const frameWrap = el('div', 'embed-frame', body);
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
        localStorage.setItem(`sse-${mode}-url`, input.value);
        this.audio.setMode(mode);
        render(input.value);
        this._syncAudioUI();
      };
      head.onclick = () => {
        const open = body.style.display === 'none';
        body.style.display = open ? '' : 'none';
        head.querySelector('.af-chev').textContent = open ? '▴' : '▾';
        if (open && input.value && !frameWrap.firstChild) render(input.value);
      };
      this.streamRows[mode] = { row, head, body };
    }

    // Engine asks for the embed UI when a streaming mode is restored.
    this.audio.onEmbedRequest = (mode) => {
      this.toggleAudioFlyout(true);
      const r = this.streamRows[mode];
      if (r && r.body.style.display === 'none') r.head.click();
    };

    // Click-away / Escape close.
    document.addEventListener('pointerdown', (e) => {
      if (this.audioFlyout.style.display !== 'none'
        && !this.audioFlyout.contains(e.target) && e.target !== this.musicBtn) {
        this.toggleAudioFlyout(false);
      }
    });
    this._syncAudioUI();
  }

  toggleAudioFlyout(force) {
    const show = force !== undefined ? force : this.audioFlyout.style.display === 'none';
    this.audioFlyout.style.display = show ? '' : 'none';
  }

  /** Keep tray glow, mute icon, dropdown and active-row highlights in sync. */
  _syncAudioUI() {
    const mode = this.audio.mode;
    this.musicBtn.classList.toggle('audio-active', mode !== 'silent');
    this.muteBtn.textContent = this._muted || this.audio.volume === 0 ? '🔇' : '🔊';
    this.trayVol.value = this.audio.volume;
    const generative = ['silent', 'voyager', 'ambient', 'psychedelic', 'electronic'];
    if (generative.includes(mode)) this.genSelect.value = mode;
    this.genRow.classList.toggle('af-active', generative.includes(mode) && mode !== 'silent');
    for (const [m, r] of Object.entries(this.streamRows || {})) {
      r.row.classList.toggle('af-active', mode === m);
    }
  }

  // -- Fullscreen + presentation mode ---------------------------------------------------------

  _buildViewButtons() {
    // Fullscreen — always visible in the top-right, outside the panels.
    this.fsBtn = el('button', 'btn btn-icon fs-btn', this.rootEl);
    this.fsBtn.textContent = '⛶';
    this.fsBtn.title = 'Fullscreen (F11)';
    this.fsBtn.onclick = () => this.toggleFullscreen();
  }

  toggleFullscreen() {
    if (document.fullscreenElement) document.exitFullscreen?.();
    else document.documentElement.requestFullscreen?.();
  }

  /** Pure 3D scene: one class on <body> hides all UI except the tray's eye. */
  setPresentation(v) {
    this.presentationMode = v;
    document.body.classList.toggle('presentation-mode', v);
    this.presBtn.textContent = v ? '🚫' : '👁'; // eye-slash while active
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
        case 'Escape':
          this.hideInfo(); this.toggleHelp(false);
          this.toggleAudioFlyout(false); this.toggleDatePicker(false);
          break;
        case 'KeyS':
          // S is both surface-mode select and free-fly backward; only treat
          // as surface select when not flying.
          if (this.cam.mode !== 'free') this._activateMode(CAMERA_MODES[3]);
          break;
        default: break;
      }
    });
  }

  // -- Tooltips (Group 4) -----------------------------------------------------------------------------

  _attachTooltips() {
    const t = this.tooltip = new Tooltip();
    const q = (sel) => this.rootEl.querySelector(sel);
    const find = (root, re) => root
      ? [...root.querySelectorAll('button')].find((b) => re.test(b.textContent))
      : null;

    // Sound modes
    t.attach(this.musicBtn, 'Music and soundscapes — generative modes, Spotify, YouTube');
    t.attach(this.trayVol, 'Volume');
    t.attach(this.muteBtn, 'Mute / unmute all audio');
    t.attach(this.genSelect, 'Generative space soundscapes — evolve continuously, never repeat');
    t.attach(this.streamRows.spotify.head, 'Connect your Spotify playlist — paste URL and click Load');
    t.attach(this.streamRows.youtube.head, 'Connect your YouTube playlist — paste URL and click Load');

    // Camera modes
    const camTips = {
      cinematic: 'Auto-scripted cinematic pans — press any key to take control',
      free: 'Full 6DOF flight — WASD to move, mouse to look, Shift for boost',
      orbit: 'Orbit around a body — click any body to target it',
      surface: 'Land on a moon surface — watch Jupiter rise and set',
      chase: 'Follow a moon from behind — see its surface and Jupiter ahead',
      system: 'Pull back to see the full Jupiter system with orbital paths',
      insertion: 'Insert into a physically accurate orbit — set altitude, inclination, and geosync',
    };
    this.rootEl.querySelectorAll('[data-cam-mode]').forEach((b) => t.attach(b, camTips[b.dataset.camMode]));

    // Time controls
    const timeTips = [
      'Pause simulation — freeze all orbital motion',
      'Real time — 1 second of simulation per second',
      '10× faster — see moons drift visibly',
      '100× faster — moon orbits become apparent',
      '1,000× faster — watch eclipses and resonances',
      '10,000× faster — full orbital cycles in minutes',
    ];
    this.rootEl.querySelectorAll('[data-time-index]').forEach((b) => t.attach(b, timeTips[+b.dataset.timeIndex]));
    t.attach(this.timeSlider, 'Controls simulation speed — how fast moons orbit and Jupiter rotates');

    // Display checkboxes
    t.attach(this.orbitToggle.parentElement, 'Show orbital path lines for all moons');
    t.attach(this.labelToggle.parentElement, 'Show name labels on Jupiter and all moons');
    t.attach(this.ringToggle.parentElement, "Show Jupiter's four-component ring system");
    t.attach(this.resonanceToggle.parentElement,
      'Shows the gravitational resonance between Io, Europa, and Ganymede. '
      + 'They orbit Jupiter in a precise 1:2:4 ratio — for every orbit Ganymede '
      + 'completes, Europa completes 2 and Io completes 4. Lines pulse when moons align.');

    // Mission Control sliders
    t.attach(this.mcAltSlider, 'Camera altitude above the surface — drag to fly closer or further');
    t.attach(this.mcIncSlider, 'Orbital tilt — 0° equatorial, 90° polar, negative values = retrograde orbit');
    t.attach(this.orbSec.querySelector('input.slider'), 'How fast the camera orbits the target — independent of simulation time');
    t.attach(this.chaseSec.querySelector('input.slider'), 'Camera height above the chased moon — from surface-skim to wide overview');

    // Orbit Insertion panel
    const lockRow = [...this.insPanel.querySelectorAll('.toggle-row')]
      .find((r) => /geosync/i.test(r.textContent));
    t.attach(lockRow, 'Lock camera to body rotation — clouds appear stationary below');
    t.attach(find(this.insPanel, /GeoSync/), "Jump to geosynchronous orbit — 160,000 km above Jupiter's clouds");
    for (const b of this.insNavBtns) t.attach(b, "Navigate to the Great Red Spot — Jupiter's ancient storm");

    // Bottom tray buttons
    t.attach(q('[data-tray="screenshot"]'), 'Capture screenshot — hides UI for clean image');
    t.attach(this.presBtn, 'Presentation mode — hides all UI. Press P or click again to restore.');
    t.attach(this.fsBtn, 'Enter fullscreen — press F11 or Escape to exit');
    t.attach(q('.kofi-btn'), 'Enjoyed exploring? Support this project');
    t.attach(q('.help-btn'), 'Show keyboard shortcuts and control reference');

    // Presets
    t.attach(find(this.side, /Voyager/), 'Recreate the Voyager 1 flyby of Jupiter — March 5, 1979');

    // Mode indicator: free look hint (2b).
    t.attach(this.modeEl, 'Hold Alt to look around freely while maintaining orbital position');

    // Ghost time display (G5).
    t.attach(this.dateEl, 'Click to pick any date 1950–2050 — moons jump to their real positions');
    t.attach(this.liveBtn, 'LIVE — track the real-world clock at 1×');
  }

  // -- Per-frame update ------------------------------------------------------------------------------

  update(dt) {
    // LIVE mode: multiplier locked to 1x, gentle re-sync to the wall clock
    // once a minute (frame-time drift correction).
    if (this.liveMode) {
      if (this.physics.timeIndex !== 1) this.physics.setTimeIndex(1);
      this._liveSync = (this._liveSync ?? 0) + dt;
      if (this._liveSync > 60) {
        this._liveSync = 0;
        this.physics.jumpToSimSeconds(
          dateToSimSeconds(new Date().toISOString(), this.physics.epochMs));
      }
    }

    // Clock + multiplier (all date formatting goes through the utility).
    const iso = simSecondsToDate(this.physics.simSeconds, this.physics.epochMs);
    this.dateEl.textContent = `${iso.slice(0, 10)}  ${iso.slice(11, 19)} UTC`;
    this.multEl.textContent = this.physics.paused ? 'PAUSED' : `${this.physics.timeMultiplier.toLocaleString()}×`;
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

    // Resonance alignment readout.
    if (this.r.resonance?.visible && this.r.resonanceInfo) {
      this.resEl.style.display = '';
      this.resEl.textContent = `Resonance: ${this.r.resonanceInfo.pct}% aligned`;
      this.resEl.classList.toggle('aligned', this.r.resonanceInfo.aligned);
    } else {
      this.resEl.style.display = 'none';
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

// -- Tooltip system (Group 4) -----------------------------------------------------
// One shared floating element; hover 500 ms on desktop, long-press on touch.
// Appended to <body> (outside #ui-root) and styled by .sse-tooltip.

class Tooltip {
  constructor() {
    this.el = document.createElement('div');
    this.el.className = 'sse-tooltip';
    document.body.appendChild(this.el);
  }

  attach(element, text) {
    if (!element || !text) return;
    element.removeAttribute?.('title'); // no double tooltip from native title
    let timer;
    element.addEventListener('mouseenter', (e) => {
      timer = setTimeout(() => {
        this.el.textContent = text;
        this.el.style.display = 'block';
        this._pos(e.clientX, e.clientY);
      }, 500);
    });
    element.addEventListener('mousemove', (e) => this._pos(e.clientX, e.clientY));
    element.addEventListener('mouseleave', () => {
      clearTimeout(timer);
      this.el.style.display = 'none';
    });
    // Mobile long-press: anchored to the element (no cursor to follow).
    let touchTimer;
    element.addEventListener('touchstart', () => {
      touchTimer = setTimeout(() => {
        this.el.textContent = text;
        this.el.style.display = 'block';
        const r = element.getBoundingClientRect();
        this._pos(r.left, r.top - 8);
      }, 600);
    }, { passive: true });
    element.addEventListener('touchend', () => {
      clearTimeout(touchTimer);
      setTimeout(() => { this.el.style.display = 'none'; }, 1500);
    });
  }

  _pos(cx, cy) {
    const x = Math.min(cx + 12, window.innerWidth - 240);
    const y = Math.max(cy - 36, 8);
    this.el.style.left = `${x}px`;
    this.el.style.top = `${y}px`;
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
