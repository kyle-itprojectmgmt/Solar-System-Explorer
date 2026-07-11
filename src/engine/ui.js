// ---------------------------------------------------------------------------
// UI layer — HUD, collapsible side panel, body info panel, labels,
// notifications, audio controls, embed drawers, screenshot.
// Pure DOM (no framework); styled by /src/style.css with the ITprojectMGMT
// brand system (Montserrat / Lato, #0077CC / #66B2FF).
// ---------------------------------------------------------------------------

import { AUDIO_MODES } from './audio.js';
import { TIME_STEPS } from './physics.js';
import { KOFI_URL } from '../config.js';

const CAMERA_MODES = [
  { id: 'cinematic', label: 'Cinematic', key: 'C', targeted: false },
  { id: 'free', label: 'Free Fly', key: 'F', targeted: false },
  { id: 'orbit', label: 'Orbit', key: 'O', targeted: true },
  { id: 'surface', label: 'Surface', key: 'S', targeted: true },
  { id: 'chase', label: 'Chase', key: 'H', targeted: true },
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
    this.labelEls = new Map();
    this.eclipseStates = new Map();
    this._eventTickTimer = 0;

    this.rootEl = document.createElement('div');
    this.rootEl.id = 'ui-root';
    document.body.appendChild(this.rootEl);

    this._buildHUD();
    this._buildSidePanel();
    this._buildInfoPanel();
    this._buildAudioControls();
    this._buildCornerButtons();
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
  }

  _updateModeHUD(mode, target, hint = '') {
    const m = CAMERA_MODES.find((x) => x.id === mode);
    this.modeEl.textContent = m ? m.label.toUpperCase() : mode;
    this.targetEl.textContent = target || '';
    this.hintEl.textContent = hint;
    this.rootEl.querySelectorAll('[data-cam-mode]').forEach((b) => {
      b.classList.toggle('active', b.dataset.camMode === mode);
    });
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

    el('h2', 'side-title', this.side).textContent = 'MISSION CONTROL';

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

    // Altitude presets — shown once a body is targeted.
    this.altSec = section(this.side, 'Altitude');
    const altGrid = el('div', 'btn-grid', this.altSec);
    for (const [label, km] of [['Distant', 100000], ['Near', 10000], ['Low Orbit', 500], ['Skim', 50]]) {
      const b = el('button', 'btn btn-small', altGrid);
      b.textContent = `${label} · ${km.toLocaleString()} km`;
      b.onclick = () => this.cam.flyToAltitude(km);
    }
    this.altSec.style.display = 'none';

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
    el('h2', 'info-title', this.info).textContent = cfg.name;
    const stats = el('dl', 'info-stats', this.info);
    for (const [k, v] of Object.entries(cfg.stats || {})) {
      el('dt', '', stats).textContent = k;
      el('dd', '', stats).textContent = v;
    }
    for (const f of cfg.facts || []) {
      el('p', 'info-fact', this.info).textContent = f;
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

  // -- Audio controls ----------------------------------------------------------------

  _buildAudioControls() {
    const wrap = el('div', 'audio-panel panel', this.rootEl);
    const row = el('div', 'audio-row', wrap);
    for (const m of AUDIO_MODES) {
      const b = el('button', 'btn btn-icon', row);
      b.textContent = m.icon;
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
    head.textContent = '🎵 Player';
    head.onclick = () => this.drawer.classList.toggle('collapsed');
    this.embedBody = el('div', 'embed-body', this.drawer);
    this.drawer.style.display = 'none';

    this.audio.onEmbedRequest = (mode) => this._showEmbed(mode);
  }

  _showEmbed(mode) {
    this.drawer.style.display = '';
    this.drawer.classList.remove('collapsed');
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
      switch (e.code) {
        case 'KeyC': this.cam.setMode('cinematic'); break;
        case 'KeyF': this.cam.setMode('free'); break;
        case 'KeyO': this._activateMode(CAMERA_MODES[2]); break;
        case 'KeyH': this._activateMode(CAMERA_MODES[4]); break;
        case 'KeyG': this.cam.setMode('system'); break;
        case 'Space': e.preventDefault(); this.physics.togglePause(); break;
        case 'Comma': this.physics.slower(); break;
        case 'Period': this.physics.faster(); break;
        case 'Tab': e.preventDefault(); this.toggleSidePanel(); break;
        case 'Escape': this.hideInfo(); break;
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

    // Altitude presets appear once any body has been targeted.
    this.altSec.style.display = (this.cam.target || this.cam.lastTarget) ? '' : 'none';

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

  /** Hide/show all UI for clean screenshots. */
  setVisible(v) {
    this.rootEl.style.transition = 'opacity 0.3s';
    this.rootEl.style.opacity = v ? '1' : '0';
    this.rootEl.style.pointerEvents = v ? '' : 'none';
  }
}

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
