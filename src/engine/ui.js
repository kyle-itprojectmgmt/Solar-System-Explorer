// ---------------------------------------------------------------------------
// UI layer — HUD, collapsible side panel, body info panel, labels,
// notifications, audio controls, embed drawers, screenshot.
// Pure DOM (no framework); styled by /src/style.css with the ITprojectMGMT
// brand system (Montserrat / Lato, #0077CC / #66B2FF).
// ---------------------------------------------------------------------------

import { AUDIO_MODES } from './audio.js';
import { TIME_STEPS, dateToSimSeconds, simSecondsToDate } from './physics.js';
import { KOFI_URL, KM_PER_UNIT, SOLAR_SYSTEM } from '../config.js';

const CAMERA_MODES = [
  { id: 'cinematic', label: 'Cinematic', key: 'C', targeted: false },
  { id: 'free', label: 'Free Fly', key: 'F', targeted: false },
  { id: 'orbit', label: 'Orbit', key: 'O', targeted: true },
  // Surface hidden until V5 (needs realistic starfield + ground rendering);
  // the camera.js implementation stays intact.
  { id: 'surface', label: 'Surface', key: 'S', targeted: true, hidden: true },
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
    this._buildIconStack();
    this._buildInsertionPanel();
    this._buildInfoPanel();
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
    this._checkSharedView();
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

  // -- Right-edge icon stack (V4c Group 6) — replaces Mission Control ---------------

  _buildIconStack() {
    this.stack = el('div', 'icon-stack', this.rootEl);
    this.stackPanel = el('div', 'stack-panel panel', this.rootEl);
    this.stackPanel.style.display = 'none';
    this.stackContents = {};
    this.stackButtons = {};
    this.openPanelId = null;
    this._panelOrder = ['camera', 'time', 'bodies', 'presets', 'display', 'help', 'alt', 'inc', 'spd'];

    // Text labels, not emoji (V4d item 2) — mission-control style.
    const defs = [
      ['camera', 'CAM', 'Camera'], ['time', 'TIME', 'Time'], ['bodies', 'NAV', 'Bodies'],
      ['presets', 'SAVE', 'Presets'], ['display', 'VIEW', 'Display'], ['help', 'HELP', 'Help'],
    ];
    for (const [id, label, title] of defs) {
      const b = el('button', 'stack-btn', this.stack);
      b.textContent = label;
      b.dataset.panel = id;
      b.onclick = () => this.togglePanel(id);
      this.stackButtons[id] = b;
      const c = el('div', 'stack-content', this.stackPanel);
      c.style.display = 'none';
      el('h2', 'side-title', c).textContent = title.toUpperCase();
      this.stackContents[id] = c;
    }

    // Parameter controls (V4d item 3): divider, then ALT / INC / SPD as
    // peer buttons opening focused single-control panels.
    el('div', 'stack-divider', this.stack);
    const paramDefs = [
      ['alt', 'ALT', 'Altitude'], ['inc', 'INC', 'Inclination'], ['spd', 'SPD', 'Orbit Speed'],
    ];
    for (const [id, label, title] of paramDefs) {
      const b = el('button', 'stack-btn', this.stack);
      b.textContent = label;
      b.dataset.panel = id;
      b.onclick = () => this.togglePanel(id);
      this.stackButtons[id] = b;
      const c = el('div', 'stack-content', this.stackPanel);
      c.style.display = 'none';
      el('h2', 'side-title', c).textContent = title.toUpperCase();
      this.stackContents[id] = c;
    }

    this._buildCameraPanel(this.stackContents.camera);
    this._buildTimePanel(this.stackContents.time);
    this._buildBodiesPanel(this.stackContents.bodies);
    this._buildPresetsPanel(this.stackContents.presets);
    this._buildDisplayPanel(this.stackContents.display);
    this._buildHelpPanel(this.stackContents.help);
    this._buildAltPanel(this.stackContents.alt);
    this._buildIncPanel(this.stackContents.inc);
    this._buildSpdPanel(this.stackContents.spd);
  }

  /** One panel open at a time; the ghost clock dims while any is open. */
  togglePanel(id, force) {
    const open = force !== undefined ? force : this.openPanelId !== id;
    for (const [pid, c] of Object.entries(this.stackContents)) {
      c.style.display = open && pid === id ? '' : 'none';
      this.stackButtons[pid].classList.toggle('active', open && pid === id);
    }
    this.stackPanel.style.display = open ? '' : 'none';
    this.openPanelId = open ? id : null;
    this.hudGhost.classList.toggle('dimmed', open);
  }

  _cyclePanel() {
    const i = this.openPanelId ? this._panelOrder.indexOf(this.openPanelId) : -1;
    if (i === this._panelOrder.length - 1) this.togglePanel(this.openPanelId, false);
    else this.togglePanel(this._panelOrder[i + 1], true);
  }

  // -- 6a Camera panel ---------------------------------------------------------------

  _buildCameraPanel(c) {
    const icons = {
      cinematic: '🎬', free: '✈️', orbit: '🔄', surface: '🌍',
      chase: '🏃', system: '🌌', insertion: '🛸',
    };
    const list = el('div', 'mode-list', c);
    for (const m of CAMERA_MODES) {
      if (m.hidden) continue;
      const row = el('button', 'mode-row', list);
      row.dataset.camMode = m.id;
      row.innerHTML = `<span class="mode-ico">${icons[m.id]}</span>`
        + `<span class="mode-label">${m.label}</span><span class="key">${m.key}</span>`;
      row.onclick = () => this._activateMode(m);
    }
    // Chase Height stays contextual here (appears only in Chase mode) —
    // the V4d spec moved ALT/INC/SPD to their own panels but left this
    // slider's home unspecified.
    this._buildChaseSlider(c);
  }

  // -- ALT / INC / SPD focused panels (V4d item 3) --------------------------------

  _buildAltPanel(c) {
    // Continuous logarithmic altitude slider — equal travel = equal zoom
    // factor; readout tracks the camera live (see update()).
    const ALT_MIN = 50, ALT_MAX = 500000;
    this._altT = (km) => Math.log10(km / ALT_MIN) / Math.log10(ALT_MAX / ALT_MIN);
    this._altKm = (t) => ALT_MIN * Math.pow(ALT_MAX / ALT_MIN, t);
    this.altSec = el('div', 'side-section', c);
    this.mcAltReadout = el('div', 'alt-readout', this.altSec);
    this.mcAltSlider = el('input', 'slider', this.altSec);
    Object.assign(this.mcAltSlider, { type: 'range', min: 0, max: 1, step: 0.001, value: 0.5 });
    const altScale = el('div', 'ins-scale', this.altSec);
    altScale.innerHTML = '<span>50 km</span><span>500,000 km</span>';
    el('p', 'panel-desc', this.altSec).textContent = 'Camera altitude above surface';
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
  }

  _buildIncPanel(c) {
    this.incSecMC = el('div', 'side-section', c);
    this.mcIncLabel = el('div', 'alt-readout', this.incSecMC);
    this.mcIncSlider = el('input', 'slider', this.incSecMC);
    Object.assign(this.mcIncSlider, { type: 'range', min: -90, max: 90, step: 1, value: this.cam.ins.incDeg });
    this.mcIncSlider.oninput = () => {
      // Read first: entering insertion mode syncs this slider from the old
      // ins state, which would clobber the value being dragged.
      const incDeg = +this.mcIncSlider.value;
      // Dragging inclination outside Orbit Insertion auto-switches (bug #23)
      // — the intent is clearly "orbit at this angle". The new inclination
      // is applied BEFORE setMode so the entry phase derives in the target
      // plane (otherwise a stale stored inclination could snap the camera
      // toward the pole on entry).
      if (this.cam.mode !== 'insertion') {
        const target = this.cam.target || this.cam.lastTarget || this.system.primary.name;
        this.cam.ins.incDeg = incDeg;
        this.cam.setMode('insertion', target);
        this.notify('Switched to Orbit Insertion for inclination');
      }
      this.cam.setInsertion({ incDeg });
      this.mcIncLabel.textContent = incShort(incDeg);
    };
    const mcIncScale = el('div', 'ins-scale', this.incSecMC);
    mcIncScale.innerHTML = '<span>-90° retro</span><span>0° equatorial</span><span>90° polar</span>';
    this.mcIncLabel.textContent = incShort(this.cam.ins.incDeg);
    this.incNote = el('p', 'panel-desc', this.incSecMC);
    this.incNote.textContent = 'Orbital plane tilt — dragging switches to Orbit Insertion';
  }

  _buildSpdPanel(c) {
    // How fast the camera sweeps along its orbital path — independent of
    // the simulation time multiplier.
    this.orbSec = el('div', 'side-section', c);
    const orbLabel = el('div', 'alt-readout', this.orbSec);
    const orbSlider = el('input', 'slider', this.orbSec);
    Object.assign(orbSlider, { type: 'range', min: 0, max: 4, step: 0.05, value: this.cam.orbSpeedMult });
    const syncOrb = () => { orbLabel.textContent = `${this.cam.orbSpeedMult.toFixed(2)}×`; };
    orbSlider.oninput = () => { this.cam.orbSpeedMult = +orbSlider.value; syncOrb(); };
    syncOrb();
    el('p', 'panel-desc', this.orbSec).textContent =
      'Camera orbit speed — independent of simulation time';
    this.spdSlider = orbSlider;
  }

  _buildChaseSlider(parent) {
    // Chase mode tuning — camera height above the chased moon.
    this.chaseSec = section(parent, 'Chase Camera');
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

  }

  // -- 6b Time panel ------------------------------------------------------------------

  _buildTimePanel(c) {
    const timeRow = el('div', 'time-row', c);
    for (let i = 0; i < TIME_STEPS.length; i++) {
      const b = el('button', 'btn btn-small', timeRow);
      b.textContent = TIME_STEPS[i] === 0 ? '⏸' : `${TIME_STEPS[i].toLocaleString()}×`;
      b.dataset.timeIndex = i;
      b.onclick = () => this.physics.setTimeIndex(i);
    }
    this.timeSlider = el('input', 'slider', c);
    Object.assign(this.timeSlider, { type: 'range', min: 0, max: TIME_STEPS.length - 1, step: 1, value: this.physics.timeIndex });
    this.timeSlider.oninput = () => this.physics.setTimeIndex(+this.timeSlider.value);

    // Date row — same picker and LIVE toggle as the HUD (synchronized:
    // both routes read/write the one physics clock through the utility).
    const dateRow = el('div', 'tp-daterow', c);
    this.tpDate = el('button', 'btn btn-small', dateRow);
    this.tpDate.onclick = () => this.toggleDatePicker();
    const live = el('button', 'btn btn-small tp-live', dateRow);
    live.textContent = '🔴';
    live.onclick = () => this.setLive(!this.liveMode);
  }

  // -- 6c Bodies panel — solar system hierarchy ----------------------------------------

  _buildBodiesPanel(c) {
    const list = el('div', 'bodies-list', c);
    for (const p of SOLAR_SYSTEM) {
      const isCurrent = p.name === this.system.primary.name;
      const row = el('button', 'body-row', list);
      if (p.star) {
        row.innerHTML = '<span>☀️ Sun</span>';
        row.onclick = () => this.notify('Solar Observatory — coming in a future update');
        this._sunRow = row;
      } else if (isCurrent) {
        row.classList.add('current');
        row.innerHTML = `<span>★ ${p.name}</span><span class="here-badge">HERE</span>`;
        row.onclick = () => { this.cam.focusBody(p.name); this.showInfo(p.name); };
        // The active system's real moons — clickable navigation.
        for (const b of this.system.bodies) {
          const m = el('button', 'moon-row', list);
          m.textContent = `↳ ${b.name}`;
          m.onclick = () => this.cam.focusBody(b.name);
        }
      } else {
        row.innerHTML = `<span>● ${p.name}</span>${p.moons?.length ? '<span class="body-chev">›</span>' : ''}`;
        row.onclick = () => this.notify(`Coming Soon — ${p.name} system launching soon`);
        if (p.moons?.length) {
          const sub = el('div', 'moon-sub', list);
          sub.style.display = 'none';
          for (const mn of p.moons) el('div', 'moon-row ghost-moon', sub).textContent = `↳ ${mn} — Coming Soon`;
          row.addEventListener('mouseenter', () => { sub.style.display = ''; });
          row.addEventListener('mouseleave', (e) => {
            if (!sub.contains(e.relatedTarget)) sub.style.display = 'none';
          });
          sub.addEventListener('mouseleave', () => { sub.style.display = 'none'; });
        }
      }
    }
  }

  // -- 6d Presets panel — curated + saved views ------------------------------------------

  _buildPresetsPanel(c) {
    el('h3', 'side-heading', c).textContent = 'CURATED';
    const curated = [
      ['🌋 Io Volcano Flyby', () => {
        this.cam.playSequence([
          { target: 'Io', dist: 4, height: 1.0, orbitRate: 0.07, duration: 10, startTheta: 1.0 },
          { target: 'Io', dist: 1.6, height: 0.35, orbitRate: 0.1, duration: 12, startTheta: 2.6 },
          { target: 'Io', dist: 6, height: 1.4, orbitRate: 0.05, duration: 10, startTheta: 4.2, lookAt: this.system.primary.name },
        ]);
        this.notify('Io volcano flyby — watch for plumes on the limb');
      }],
      ['🌑 Triple Moon Shadow', () => {
        this.cam.setMode('orbit', this.system.primary.name);
        this.cam.setAltitudeDirect(80000);
        this.physics.setTimeIndex(4);
        this.notify('1,000× — watch for moon shadows crossing Jupiter');
      }],
      ['🔴 GRS Close Pass', () => {
        const preset = this.system.primary.navPresets?.[0];
        if (preset) {
          this.cam.flyToFeature(this.system.primary.name, preset);
          this.notify(preset.message || 'Navigating to the Great Red Spot…');
        }
      }],
      ['🛸 Voyager 1979', () => this.onVoyagerPreset?.()],
      ['💫 Moon Alignment', () => {
        this.cam.setMode('system');
        if (!this.resonanceToggle.checked) {
          this.resonanceToggle.checked = true;
          this.resonanceToggle.onchange();
        }
        this.physics.setTimeIndex(5);
        this.notify('10,000× — resonance lines pulse when moons align');
      }],
    ];
    this.voyagerBtn = null;
    for (const [label, fn] of curated) {
      const b = el('button', 'preset-row', c);
      b.textContent = label;
      b.onclick = fn;
      if (label.includes('Voyager')) this.voyagerBtn = b;
    }

    el('h3', 'side-heading', c).textContent = 'MY PRESETS';
    const saveBtn = el('button', 'btn btn-primary preset-save', c);
    saveBtn.textContent = '+ Save Current View';
    const nameRow = el('div', 'preset-namerow', c);
    nameRow.style.display = 'none';
    const nameInput = el('input', 'embed-input', nameRow);
    nameInput.placeholder = 'Preset name…';
    const okBtn = el('button', 'btn btn-small btn-primary', nameRow);
    okBtn.textContent = '✓';
    this.presetList = el('div', 'preset-list', c);

    const MAX_PRESETS = 20;
    saveBtn.onclick = () => {
      if (this._loadPresets().length >= MAX_PRESETS) {
        this.notify('Delete a preset to save more.');
        return;
      }
      nameRow.style.display = '';
      nameInput.value = '';
      nameInput.focus();
    };
    const commit = () => {
      const name = nameInput.value.trim();
      if (!name) return;
      const arr = this._loadPresets();
      arr.push(this.capturePreset(name));
      this._savePresets(arr);
      nameRow.style.display = 'none';
      this._renderPresetList();
      this.notify(`Saved "${name}"`);
    };
    okBtn.onclick = commit;
    nameInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') commit();
      if (e.key === 'Escape') nameRow.style.display = 'none';
      e.stopPropagation();
    });
    this._renderPresetList();
  }

  _loadPresets() {
    try { return JSON.parse(localStorage.getItem('sse-presets') || '[]'); }
    catch { return []; }
  }

  _savePresets(arr) { localStorage.setItem('sse-presets', JSON.stringify(arr)); }

  _renderPresetList() {
    this.presetList.innerHTML = '';
    this._loadPresets().forEach((p, i) => {
      const row = el('div', 'preset-item', this.presetList);
      const go = el('button', 'preset-row', row);
      go.textContent = `📍 ${p.name}`;
      go.onclick = () => { this.applyPreset(p); this.notify(`Restored "${p.name}"`); };
      const share = el('button', 'btn btn-small', row);
      share.textContent = '🔗';
      share.onclick = () => this._sharePreset(p);
      const del = el('button', 'btn btn-small', row);
      del.textContent = '🗑';
      del.onclick = () => {
        const arr = this._loadPresets();
        arr.splice(i, 1);
        this._savePresets(arr);
        this._renderPresetList();
      };
    });
  }

  /** Full state snapshot. sim.date is an ISO 8601 UTC string (never raw
   *  simSeconds) via the physics date utility — the long-term contract. */
  capturePreset(name) {
    return {
      name,
      sim: {
        date: simSecondsToDate(this.physics.simSeconds, this.physics.epochMs),
        timeMultiplier: this.physics.timeMultiplier,
      },
      camera: this._captureCamera(),
      display: {
        rings: this.ringToggle.checked,
        orbitalPaths: this.orbitToggle.checked,
        localLabels: this.labelToggle.checked,
        systemLabels: this.sysLabelToggle?.checked ?? false,
        resonance: this.resonanceToggle.checked,
      },
    };
  }

  _captureCamera() {
    const cam = this.cam;
    const base = { mode: cam.mode, target: cam.target || cam.lastTarget };
    if (cam.mode === 'insertion') {
      Object.assign(base, {
        altitudeKm: cam.ins.altitudeKm, incDeg: cam.ins.incDeg,
        phase: cam.ins.phase, nodePhase: cam.ins.nodePhase,
        yaw: cam.ins.yaw, pitch: cam.ins.pitch,
        locked: cam.ins.locked,
      });
    } else if (cam.mode === 'free') {
      Object.assign(base, { pos: cam.camera.position.toArray(), yaw: cam.yaw, pitch: cam.pitch });
    } else {
      Object.assign(base, { orbTheta: cam.orbTheta, orbPhi: cam.orbPhi, orbDist: cam.orbDist });
    }
    return base;
  }

  applyPreset(p) {
    if (p.sim?.date) {
      this.setLive(false);
      this.physics.jumpToSimSeconds(dateToSimSeconds(p.sim.date, this.physics.epochMs));
    }
    const ti = TIME_STEPS.indexOf(p.sim?.timeMultiplier);
    if (ti >= 0) this.physics.setTimeIndex(ti);
    const cam = p.camera || {};
    if (cam.mode === 'insertion') {
      this.cam.setMode('insertion', cam.target);
      this.cam.setInsertion({
        body: cam.target, altitudeKm: cam.altitudeKm ?? 10000,
        incDeg: cam.incDeg ?? 0, locked: !!cam.locked,
      });
      if (cam.phase != null) this.cam.ins.phase = cam.phase;
      if (cam.nodePhase != null) this.cam.ins.nodePhase = cam.nodePhase;
      if (cam.yaw != null) this.cam.ins.yaw = cam.yaw;
      if (cam.pitch != null) this.cam.ins.pitch = cam.pitch;
    } else if (cam.mode === 'free') {
      this.cam.setMode('free');
      if (cam.pos) this.cam.camera.position.fromArray(cam.pos);
      if (cam.yaw != null) this.cam.yaw = cam.yaw;
      if (cam.pitch != null) this.cam.pitch = cam.pitch;
    } else if (cam.mode) {
      this.cam.setMode(cam.mode, cam.target || null);
      if (cam.orbTheta != null) {
        this.cam.orbTheta = cam.orbTheta;
        this.cam.orbPhi = cam.orbPhi;
        this.cam.orbDist = cam.orbDist;
        this.cam.distTween = null;
      }
    }
    const d = p.display || {};
    const set = (t, v) => { if (t && v != null && t.checked !== v) { t.checked = v; t.onchange(); } };
    set(this.ringToggle, d.rings);
    set(this.orbitToggle, d.orbitalPaths);
    set(this.labelToggle, d.localLabels);
    set(this.sysLabelToggle, d.systemLabels);
    set(this.resonanceToggle, d.resonance);
  }

  _sharePreset(p) {
    const encoded = btoa(encodeURIComponent(JSON.stringify(p)));
    const url = `${location.origin}${location.pathname}?view=${encoded}`;
    navigator.clipboard?.writeText(url).then(
      () => this.notify('Link copied! Share this view with anyone.'),
      () => this.notify('Could not copy — check clipboard permissions'),
    );
  }

  /** ?view= in the URL restores a shared preset on load. */
  _checkSharedView() {
    const v = new URLSearchParams(location.search).get('view');
    if (!v) return;
    try {
      const p = JSON.parse(decodeURIComponent(atob(v)));
      this.applyPreset(p);
      this.notify(p.name ? `Shared view: "${p.name}"` : 'Shared view restored');
    } catch {
      this.notify('Could not read the shared view link');
    }
  }

  // -- 6e Display panel -----------------------------------------------------------------

  _buildDisplayPanel(c) {
    const labels = section(c, 'Labels');
    this.labelToggle = toggle(labels, 'Local labels (current system)', false, (v) => this.setLabelsVisible(v));
    this.sysLabelToggle = toggle(labels, 'System-wide labels (all planets)', false, () => {
      if (!this._sysLabelNoted) {
        this._sysLabelNoted = true;
        this.notify('System-wide labels arrive with the Solar System view');
      }
    });

    const vis = section(c, 'Visual');
    this.ringToggle = toggle(vis, 'Rings', true, (v) => this.r.setRingsVisible(v));
    this.orbitToggle = toggle(vis, 'Orbital paths', false, (v) => this.r.setOrbitLinesVisible(v));
    this.resonanceToggle = toggle(vis, 'Resonance lines', false, (v) => this.r.setResonanceVisible(v && this.cam.mode === 'system'));
    this.velToggle = toggle(vis, 'Velocity vectors', false, () => {
      if (!this._velNoted) {
        this._velNoted = true;
        this.notify('Velocity vectors — coming soon');
      }
    });

    // Quick-jump altitude presets (restored from the pre-v4 Mission Control,
    // now compact buttons alongside the continuous slider).
    const alt = section(c, 'Altitude Presets');
    const grid = el('div', 'btn-grid', alt);
    for (const [label, km] of [['Distant', 100000], ['Near', 10000], ['Low Orbit', 500], ['Skim', 50]]) {
      const b = el('button', 'btn btn-small', grid);
      b.textContent = `${label} · ${km.toLocaleString()} km`;
      b.onclick = () => this.cam.flyToAltitude(km);
    }
  }

  // -- 6f Help panel ----------------------------------------------------------------------

  _buildHelpPanel(c) {
    const sec = (title, rows) => {
      el('h3', 'side-heading', c).textContent = title;
      const list = el('div', 'help-list', c);
      for (const [key, desc] of rows) {
        const row = el('div', 'help-row', list);
        el('span', 'help-key', row).textContent = key;
        el('span', 'help-desc', row).textContent = desc;
      }
    };
    sec('KEYBOARD SHORTCUTS', [
      ['C', 'Cinematic (auto)'], ['F', 'Free Fly'], ['O', 'Orbit'],
      ['H', 'Chase'], ['G', 'System View'], ['I', 'Orbit Insertion'],
      ['W A S D', 'Move (Free Fly)'], ['Shift', 'Speed boost 5×'],
      ['Alt (hold)', 'Free look while orbiting'],
      [',  .', 'Time slower / faster'], ['Space', 'Pause / Resume'],
      ['Tab', 'Cycle panels'], ['?', 'This help panel'],
      ['P', 'Presentation mode'], ['F11', 'Fullscreen'], ['Escape', 'Close panels'],
    ]);
    sec('MOUSE + TOUCH', [
      ['Drag', 'Look / rotate'], ['Scroll wheel', 'Zoom / altitude'],
      ['Click body', 'Focus / info card'], ['Double tap', 'Focus body'],
      ['1 finger drag', 'Look / rotate'], ['2 finger pinch', 'Zoom'],
      ['2 finger drag', 'Free look (orbit modes)'],
    ]);
    sec('TIPS', [
      ['🔓', 'Hold Alt to free-look while orbiting'],
      ['📅', 'Click the date to pick any year 1950–2050'],
      ['🔗', 'Share any saved view with a link'],
    ]);
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
        this.mcIncLabel.textContent = incShort(ins.incDeg);
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
    // Event toasts (G7) — bottom center, above the tray.
    this.toastWrap = el('div', 'event-toasts', this.rootEl);
    this._toastSeen = new Map();  // occurrence key -> expiry (sim s)
    this._toastQueue = [];
    this._toastTimer = 0;
  }

  // -- Upcoming-event toasts (V4c Group 7) ------------------------------------------------

  /** Once a second: surface eclipse/transit events that are imminent in
   *  WALL-clock terms at the current multiplier (timely, not spammy). */
  _updateEventToasts(dt) {
    this._toastTimer -= dt;
    if (this._toastTimer > 0) return;
    this._toastTimer = 1;
    const mult = this.physics.timeMultiplier;
    if (mult <= 0) return;
    for (const evt of this.physics.predictEvents(5)) {
      const wallLead = evt.inSeconds / mult;
      if (wallLead > 30 || evt.inSeconds < 1) continue; // > ~30 wall-s away
      const key = `${evt.body}:${evt.type}:${Math.round((this.physics.simSeconds + evt.inSeconds) / 120)}`;
      if (this._toastSeen.has(key)) continue;
      this._toastSeen.set(key, this.physics.simSeconds + evt.inSeconds + 600);
      this._spawnToast(evt);
    }
    // Expire dedupe keys once their events have long passed.
    for (const [k, exp] of this._toastSeen) {
      if (this.physics.simSeconds > exp) this._toastSeen.delete(k);
    }
    // Promote queued toasts when a slot frees up (max 2 visible).
    while (this._toastQueue.length && this.toastWrap.children.length < 2) {
      this.toastWrap.appendChild(this._toastQueue.shift());
    }
  }

  _spawnToast(evt) {
    const t = el('div', 'event-toast', null);
    const verb = evt.type === 'eclipse' ? 'eclipse begins' : 'transit begins';
    el('span', 'toast-text', t).textContent = `🔔 ${evt.body} ${verb} in ${fmtDur(evt.inSeconds)}`;
    const watch = el('button', 'btn btn-small btn-primary', t);
    watch.textContent = 'Watch →';
    watch.onclick = () => { this._watchEvent(evt); t.remove(); };
    const x = el('button', 'toast-x', t);
    x.textContent = '✕';
    x.onclick = () => t.remove();
    setTimeout(() => t.remove(), 30000); // auto-dismiss
    if (this.toastWrap.children.length < 2) this.toastWrap.appendChild(t);
    else this._toastQueue.push(t);
  }

  /** Fly to the optimal viewpoint for the event type. */
  _watchEvent(evt) {
    const primary = this.system.primary.name;
    if (evt.type === 'eclipse') {
      // Pull back past the moon, looking inward: moon in the foreground,
      // Jupiter behind it — the shadow crossing reads clearly.
      const moonPos = this.r.bodyWorldPos(evt.body);
      const jupPos = this.r.bodyWorldPos(primary);
      const dir = moonPos.clone().sub(jupPos).normalize();
      this.cam.setMode('orbit', evt.body);
      this.cam.orbSpeedMult = Math.min(this.cam.orbSpeedMult, 0.2);
      this.cam.orbTheta = Math.atan2(dir.z, dir.x);
      this.cam.orbPhi = Math.PI / 2 - 0.12;
      this.cam.orbDist = this.r.bodyRadius(evt.body) * 14;
      this.cam.distTween = null;
      this.notify(`Watching ${evt.body} — eclipse ahead`);
    } else {
      // Transit: sun-side view of Jupiter's face for the shadow silhouette.
      const d = this.r.sunDir;
      this.cam.setMode('orbit', primary);
      this.cam.orbSpeedMult = Math.min(this.cam.orbSpeedMult, 0.2);
      this.cam.orbTheta = Math.atan2(d.z, d.x);
      this.cam.orbPhi = Math.PI / 2 - 0.1;
      this.cam.orbDist = this.r.bodyRadius(primary) * 3.5;
      this.cam.distTween = null;
      this.notify(`Watching ${primary} — ${evt.body} transit ahead`);
    }
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
      if (e.key === '?') { this.togglePanel('help'); return; }
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
        case 'Tab': e.preventDefault(); this._cyclePanel(); break;
        case 'KeyP': this.setPresentation(!this.presentationMode); break;
        case 'F11': e.preventDefault(); this.toggleFullscreen(); break;
        case 'Escape':
          this.hideInfo();
          if (this.openPanelId) this.togglePanel(this.openPanelId, false);
          this.toggleAudioFlyout(false); this.toggleDatePicker(false);
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
    t.attach(this.spdSlider, 'Orbit Speed — how fast the camera orbits the target, independent of simulation time');
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

    // Presets + icon stack
    t.attach(this.voyagerBtn, 'Recreate the Voyager 1 flyby of Jupiter — March 5, 1979');
    const stackTips = {
      camera: 'CAM — Camera modes and controls',
      time: 'TIME — Simulation speed and date',
      bodies: 'NAV — Navigate to any body',
      presets: 'SAVE — Curated and saved views',
      display: 'VIEW — Display options',
      help: 'HELP — Shortcuts and controls (?)',
      alt: 'ALT — Camera altitude',
      inc: 'INC — Orbital inclination',
      spd: 'SPD — Orbit speed',
    };
    for (const [id, b] of Object.entries(this.stackButtons)) t.attach(b, stackTips[id]);
    t.attach(this._sunRow, 'Solar Observatory — coming in a future update');

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

    // Upcoming-event toasts.
    this._updateEventToasts(dt);

    // INC panel note: only shown while outside Orbit Insertion.
    if (this.openPanelId === 'inc') {
      this.incNote.style.display = this.cam.mode === 'insertion' ? 'none' : '';
    }

    // Time panel date button mirrors the HUD clock.
    if (this.openPanelId === 'time') {
      this.tpDate.textContent = `📅 ${simSecondsToDate(this.physics.simSeconds, this.physics.epochMs).slice(0, 10)}`;
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

function incShort(v) {
  if (v <= -80) return `${v}° retrograde polar`;
  if (v < 0) return `${v}° retrograde`;
  if (v >= 80) return `${v}° polar`;
  if (v < 10) return `${v}° equatorial`;
  return `${v}°`;
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
