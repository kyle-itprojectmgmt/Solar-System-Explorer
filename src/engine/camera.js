// ---------------------------------------------------------------------------
// Camera controller — six modes, smooth 0.8 s eased transitions, unified
// mouse / keyboard / touch input. System-agnostic: targets are body names
// resolved through the renderer.
//
// Modes: cinematic | free | orbit | surface | chase | system
// ---------------------------------------------------------------------------

import * as THREE from 'three';
import { G, KM_PER_UNIT } from '../config.js';

const TRANSITION_S = 0.8;
const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

export class CameraController {
  constructor(sceneRenderer, dom, physics) {
    this.r = sceneRenderer;
    this.camera = sceneRenderer.camera;
    this.dom = dom;
    this.physics = physics;

    this.mode = 'cinematic';
    this.target = null;          // body name for orbit/surface/chase
    this.lastTarget = null;      // remembered across mode switches
    this.pendingMode = null;     // waiting for a click to choose target
    this.onModeChange = null;    // (mode, target) => void
    this.onBodyPicked = null;    // (name) => void — for info panel

    // Transition state
    this.blend = 1;
    this.fromPos = new THREE.Vector3();
    this.fromQuat = new THREE.Quaternion();

    // Free-fly state
    this.yaw = 0; this.pitch = 0;
    this.keys = new Set();

    // Orbit state
    this.orbTheta = 0.6; this.orbPhi = 1.2; this.orbDist = 300;
    this.distTween = null;      // altitude preset animation
    this.orbSpeedMult = 1;      // "Orbital Speed" slider, orbit mode
    this.chaseDistMult = 1;
    this.chaseHeightMult = 1.5; // "Chase Height" slider, chase mode

    // Surface state
    this.surfLat = 0; this.surfLon = 0; this.surfYaw = 0; this.surfPitch = 0.1;

    // Chase spring (smoothed position and look-at point)
    this.chasePos = new THREE.Vector3();
    this.chaseLook = new THREE.Vector3();

    // Free look (2b): orientation offset on top of the orbital pose.
    // Position never changes — only where the camera is pointing.
    this.freeLook = { active: false, yaw: 0, pitch: 0 };
    this.onFreeLookChange = null; // (active) => void — UI indicator

    // Orbit insertion state (mode 7)
    this.ins = {
      body: null, altitudeKm: 10000, incDeg: 0, locked: false,
      phase: 0, yaw: 0, pitch: -1.31, // default view: nadir + 15° forward tilt
      nodePhase: 0,                   // line of nodes longitude — set ONLY on mode entry
      lockOffset: 0,                  // geosync: phase − body rotation angle
      velKmS: 0, periodS: 0, surfaceKmS: 0, // computed each frame for the HUD
    };
    this.onInsertionChange = null; // UI sync hook

    // Cinematic
    this.cineIndex = 0;
    this.cineTime = 0;
    this.cineSeq = this._defaultCinematicSequence();

    // Scratch
    this._v = new THREE.Vector3();
    this._q = new THREE.Quaternion();

    this._bindInput();
    this._startTransition();
  }

  // -- Public API --------------------------------------------------------------

  setMode(mode, target = null) {
    if (mode === this.mode && target === this.target) return;
    this.setFreeLook(false);
    this.mode = mode;
    this.target = target;
    if (target) this.lastTarget = target;
    this.pendingMode = null;

    if (mode === 'orbit' || mode === 'system') {
      const name = mode === 'system' ? this.r.system.primary.name : target;
      const bodyR = this.r.bodyRadius(name);
      this.orbDist = mode === 'system'
        ? this._systemViewDistance()
        : Math.max(bodyR * 4, 3);
      this.orbTheta = 0.5; this.orbPhi = 1.25;
    }
    if (mode === 'surface' && target) {
      // Stand ~80° of longitude from the sub-primary point: the primary
      // hangs huge and low on the horizon.
      this.surfLat = 0.15; this.surfLon = Math.PI * 0.55;
      this.surfYaw = Math.PI; this.surfPitch = 0.12;
    }
    if (mode === 'chase' && target) {
      this.chasePos.copy(this.camera.position);
      this.chaseLook.copy(this.r.bodyWorldPos(target, new THREE.Vector3()));
    }
    if (mode === 'cinematic') {
      this.cineIndex = 0; this.cineTime = 0;
    }
    if (mode === 'insertion') {
      this.ins.body = target || this.ins.body || this.lastTarget || this.r.system.primary.name;
      this.target = this.ins.body;
      this.lastTarget = this.ins.body;
      // Start the orbit AT the camera (no pole snap, no jump): orient the
      // orbit plane — i.e. choose the line of nodes — so the inclined
      // circle passes through the camera's current bearing. The node is
      // set ONLY here, never during INC drags (re-anchoring it while
      // dragging is what made the view roll — "the scene rotates").
      const entry = this.r.bodyMeshes.get(this.ins.body);
      if (entry) {
        const center = entry.group.getWorldPosition(new THREE.Vector3());
        const local = this.camera.position.clone().sub(center)
          .applyQuaternion(this.r.root.quaternion.clone().invert());
        if (local.lengthSq() > 1e-6) {
          const u = local.clone().normalize();
          const lon = Math.atan2(-u.z, u.x);
          const lat = Math.asin(THREE.MathUtils.clamp(u.y, -1, 1));
          const inc = THREE.MathUtils.degToRad(Math.abs(this.ins.incDeg));
          if (inc < 1e-4) {
            // Equatorial: camera longitude is the phase. Park the node 90°
            // behind so a future inclination drag arcs the camera up its
            // own meridian — no jump, no roll (tangent ∥ node axis there).
            this.ins.phase = lon;
            this.ins.nodePhase = lon - Math.PI / 2;
          } else {
            // sin(lat) = sin(phase − node)·sin(inc) on the inclined circle;
            // clamp handles |lat| > inc (plane can't reach the camera —
            // enter at the max-latitude point on the camera's longitude).
            const rel = Math.asin(THREE.MathUtils.clamp(Math.sin(lat) / Math.sin(inc), -1, 1));
            // Longitude offset of that point from the node.
            const dLon = Math.atan2(Math.sin(rel) * Math.cos(inc), Math.cos(rel));
            this.ins.nodePhase = lon - dLon;
            this.ins.phase = this.ins.nodePhase + rel;
          }
          // Preserve the camera's altitude within the working range; when
          // arriving from very far (e.g. System View), enter at a distance
          // where the planet fills about half the view instead of the old
          // 500,000 km ceiling — otherwise the planet sat small and low
          // with the rings arcing across the whole frame.
          const derivedKm = (local.length() - entry.radiusUnits) * KM_PER_UNIT;
          const frameKm = entry.radiusUnits * KM_PER_UNIT * 3.7;
          this.ins.altitudeKm = Math.max(
            this._minInsertionAltKm(this.ins.body),
            derivedKm > 500000 ? frameKm : derivedKm
          );
        }
      }
      // Default view: nadir plus a forward tilt that adapts to how large
      // the body appears — 15° when skimming the surface (horizon ahead),
      // shrinking with distance so the planet stays centered in view
      // instead of dropping toward the frame edge.
      {
        const e2 = this.r.bodyMeshes.get(this.ins.body);
        const distU = (e2?.radiusUnits ?? 1) + this.ins.altitudeKm / KM_PER_UNIT;
        const angRad = Math.asin(Math.min(1, (e2?.radiusUnits ?? 1) / distU));
        const tilt = Math.min(THREE.MathUtils.degToRad(15), angRad * 0.5);
        this.ins.yaw = 0;
        this.ins.pitch = -(Math.PI / 2 - tilt);
      }
      if (this.ins.locked) {
        this.ins.lockOffset = this.ins.phase - this._bodyRotationAngle(this.ins.body);
      }
      this.onInsertionChange?.(this.ins);
    }
    if (mode === 'free') {
      // Adopt current orientation so there's no snap.
      const e = new THREE.Euler().setFromQuaternion(this.camera.quaternion, 'YXZ');
      this.yaw = e.y; this.pitch = e.x;
    }
    this._startTransition();
    this.onModeChange?.(mode, target);
  }

  /** Hold-to-look: only meaningful in the nadir-locked orbital modes. */
  setFreeLook(on) {
    const usable = ['orbit', 'chase', 'insertion'].includes(this.mode);
    const next = !!(on && usable);
    if (next === this.freeLook.active) return;
    this.freeLook.active = next;
    this.onFreeLookChange?.(next);
  }

  requestTargetedMode(mode) {
    this.pendingMode = mode;
    this.onModeChange?.(this.mode, this.target, `Click a body for ${mode} mode…`);
  }

  focusBody(name) {
    this.setMode('orbit', name);
  }

  _systemViewDistance() {
    const far = Math.max(...this.r.system.bodies.map((b) => b.semiMajorAxisKm)) / 1000;
    return far * 2.6;
  }

  _startTransition() {
    this.blend = 0;
    this.fromPos.copy(this.camera.position);
    this.fromQuat.copy(this.camera.quaternion);
  }

  // -- Input --------------------------------------------------------------------

  _bindInput() {
    const dom = this.dom;
    this.pointer = { down: false, x: 0, y: 0, id: null };
    this.touches = new Map();
    this.pinchDist = 0;

    dom.addEventListener('pointerdown', (e) => {
      if (e.target !== dom) return;
      this._interruptCinematic();
      this.pointer.down = true;
      this.pointer.x = e.clientX; this.pointer.y = e.clientY;
      this.pointer.moved = 0;
      this.touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
      dom.setPointerCapture(e.pointerId);
    });
    dom.addEventListener('pointermove', (e) => {
      if (!this.pointer.down) return;
      const t = this.touches.get(e.pointerId);
      if (t) { t.x = e.clientX; t.y = e.clientY; }

      if (this.touches.size === 2) {
        const [a, b] = [...this.touches.values()];
        const d = Math.hypot(a.x - b.x, a.y - b.y);
        if (this.pinchDist > 0) this._pinch(d - this.pinchDist);
        this.pinchDist = d;
        // Two-finger drag = free look in orbital modes (2b); pinch still zooms.
        const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
        if (this._twoMid) {
          this.setFreeLook(true);
          if (this.freeLook.active) {
            const s = 0.0032;
            this.freeLook.yaw -= (mx - this._twoMid.x) * s;
            this.freeLook.pitch = THREE.MathUtils.clamp(
              this.freeLook.pitch - (my - this._twoMid.y) * s, -1.5, 1.5);
          }
        }
        this._twoMid = { x: mx, y: my };
        return;
      }
      const dx = e.clientX - this.pointer.x;
      const dy = e.clientY - this.pointer.y;
      this.pointer.x = e.clientX; this.pointer.y = e.clientY;
      this.pointer.moved += Math.abs(dx) + Math.abs(dy);
      this._drag(dx, dy);
    });
    const up = (e) => {
      this.touches.delete(e.pointerId);
      this.pinchDist = 0;
      if (this.touches.size < 2) {
        this._twoMid = null;
        if (!this._altHeld) this.setFreeLook(false);
      }
      if (this.touches.size === 0) this.pointer.down = false;
      if (this.pointer.moved < 6) this._click(e);
    };
    dom.addEventListener('pointerup', up);
    dom.addEventListener('pointercancel', up);

    dom.addEventListener('wheel', (e) => {
      e.preventDefault();
      this._interruptCinematic();
      this._pinch(-e.deltaY * 0.5);
    }, { passive: false });

    dom.addEventListener('dblclick', (e) => {
      const name = this._pick(e);
      if (name) this.setMode('orbit', name);
    });

    window.addEventListener('keydown', (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
      if (e.key === 'Alt') {
        e.preventDefault(); // keep the browser from focusing its menu bar
        this._altHeld = true;
        this.setFreeLook(true);
        return;
      }
      this.keys.add(e.code);
      if (['KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyQ', 'KeyE'].includes(e.code)) {
        if (this.mode === 'cinematic') this.setMode('free');
      }
    });
    window.addEventListener('keyup', (e) => {
      if (e.key === 'Alt') {
        this._altHeld = false;
        if (!this._twoMid) this.setFreeLook(false);
      }
      this.keys.delete(e.code);
    });
    // Alt+Tab away must not leave free look stuck on.
    window.addEventListener('blur', () => {
      this._altHeld = false;
      this._twoMid = null;
      this.setFreeLook(false);
    });
  }

  _interruptCinematic() {
    if (this.mode === 'cinematic') this.setMode('free');
  }

  _pick(e) {
    const x = (e.clientX / window.innerWidth) * 2 - 1;
    const y = -(e.clientY / window.innerHeight) * 2 + 1;
    return this.r.raycastBody(x, y);
  }

  _click(e) {
    const name = this._pick(e);
    if (this.pendingMode && name) {
      this.setMode(this.pendingMode, name);
      return;
    }
    if (name) this.onBodyPicked?.(name);
  }

  _drag(dx, dy) {
    const s = 0.0032;
    // Free look consumes the drag: orientation only, position untouched.
    if (this.freeLook.active) {
      this.freeLook.yaw -= dx * s;
      this.freeLook.pitch = THREE.MathUtils.clamp(this.freeLook.pitch - dy * s, -1.5, 1.5);
      return;
    }
    switch (this.mode) {
      case 'free':
        this.yaw -= dx * s; this.pitch -= dy * s;
        this.pitch = THREE.MathUtils.clamp(this.pitch, -1.55, 1.55);
        break;
      case 'orbit':
      case 'system':
        this.orbTheta -= dx * s * 1.6;
        this.orbPhi = THREE.MathUtils.clamp(this.orbPhi - dy * s * 1.6, 0.05, Math.PI - 0.05);
        break;
      case 'surface':
        this.surfYaw -= dx * s;
        this.surfPitch = THREE.MathUtils.clamp(this.surfPitch + dy * s, -1.4, 1.5);
        break;
      case 'insertion':
        this.ins.yaw -= dx * s;
        this.ins.pitch = THREE.MathUtils.clamp(this.ins.pitch - dy * s, -1.55, 0.6);
        break;
      case 'chase':
        break;
      default:
        break;
    }
  }

  // -- Altitude helpers ----------------------------------------------------------

  /** Minimum permitted camera distance from a body's center (scene units).
   *  The hard floor comes from the body config's detailFloor (data-driven)
   *  — the altitude where procedural detail + texture resolution run out. */
  _floorDist(name) {
    const entry = this.r.bodyMeshes.get(name);
    if (!entry) return 0;
    const minAltKm = entry.cfg?.detailFloor?.hardKm
      ?? (entry.isPrimary ? 500 : entry.cfg.radiusKm >= 500 ? 10 : 5);
    return entry.radiusUnits + minAltKm / 1000;
  }

  /**
   * Zoom resistance approaching a body's detail floor: 1 above the soft
   * floor, quadratic taper between soft and hard, 0 (hard stop) at hardKm.
   */
  _zoomResistance(name, altKm) {
    const df = this.r.bodyMeshes.get(name)?.cfg?.detailFloor;
    if (!df) return 1;
    if (altKm > df.softKm) return 1;
    if (altKm <= df.hardKm) return 0;
    const t = (altKm - df.hardKm) / (df.softKm - df.hardKm);
    return t * t;
  }

  _nearestBodyName() {
    return this.r.nearestAltitudeKm(this.camera.position)?.name ?? null;
  }

  /**
   * Zoom toward/away from the current focus body in any mode.
   * delta > 0 zooms in. Altitude above the floor scales multiplicatively,
   * i.e. logarithmically: fast when far, fine-grained when close, and the
   * floor (min safe altitude) can never be crossed.
   */
  _pinch(delta) {
    if (this.mode === 'surface') return; // standing on the ground
    // Zooming in (delta > 0) meets quadratic resistance below the target
    // body's soft detail floor and a hard stop at its hard floor (4a).
    const resist = (name, altKm) =>
      delta > 0 ? this._zoomResistance(name, altKm) : 1;

    if (this.mode === 'orbit' || this.mode === 'system') {
      const name = this.mode === 'system' ? this.r.system.primary.name : this.target;
      const floor = this._floorDist(name);
      const entry = this.r.bodyMeshes.get(name);
      const altKm = entry ? (this.orbDist - entry.radiusUnits) * KM_PER_UNIT : 1e9;
      const f = Math.exp(-delta * 0.0016 * resist(name, altKm));
      this.distTween = null;
      // Seed a small epsilon so zooming out from exactly the floor works.
      const above = Math.max(this.orbDist - floor, floor * 0.002);
      this.orbDist = Math.min(floor + above * f, 3e5);
    } else if (this.mode === 'chase') {
      const f = Math.exp(-delta * 0.0016);
      this.chaseDistMult = THREE.MathUtils.clamp(this.chaseDistMult * f, 1, 60);
    } else if (this.mode === 'insertion') {
      const min = this._minInsertionAltKm(this.ins.body);
      const f = Math.exp(-delta * 0.0016 * resist(this.ins.body, this.ins.altitudeKm));
      this.ins.altitudeKm = THREE.MathUtils.clamp(
        Math.max(this.ins.altitudeKm, min * 1.001) * f, min, 500000);
      this.onInsertionChange?.(this.ins);
    } else {
      // Free fly / cinematic (which hands off to free on input anyway):
      // dolly along the line to the nearest or targeted body.
      const name = this.target || this._nearestBodyName();
      if (!name) return;
      const center = this.r.bodyWorldPos(name, new THREE.Vector3());
      const cur = this.camera.position.distanceTo(center);
      const floor = this._floorDist(name);
      const entry = this.r.bodyMeshes.get(name);
      const altKm = entry ? (cur - entry.radiusUnits) * KM_PER_UNIT : 1e9;
      const f = Math.exp(-delta * 0.0016 * resist(name, altKm));
      const next = Math.min(floor + Math.max(cur - floor, floor * 0.002) * f, 3e5);
      const dir = center.clone().sub(this.camera.position).normalize();
      this.camera.position.addScaledVector(dir, cur - next);
      // Keep the transition origin in step so an in-flight blend doesn't
      // drag the camera back and swallow the zoom.
      this.fromPos.addScaledVector(dir, cur - next);
    }
  }

  /** Set orbit-camera altitude immediately — for live slider drags, where
   *  restarting a tween on every input event would stall until release. */
  setAltitudeDirect(km) {
    const target = this.target || this.lastTarget || this.r.system.primary.name;
    if (this.mode !== 'orbit' || this.target !== target) this.setMode('orbit', target);
    const entry = this.r.bodyMeshes.get(target);
    if (!entry) return;
    this.distTween = null;
    this.orbDist = Math.max(this._floorDist(target), entry.radiusUnits + km / 1000);
  }

  /** Animate orbit distance to a preset altitude (km) over 1.5 s. */
  flyToAltitude(km) {
    const target = this.target || this.lastTarget || this.r.system.primary.name;
    if (this.mode !== 'orbit' || this.target !== target) this.setMode('orbit', target);
    const entry = this.r.bodyMeshes.get(target);
    const to = Math.max(this._floorDist(target), entry.radiusUnits + km / 1000);
    this.distTween = { from: this.orbDist, to, t: 0, dur: 1.5 };
  }

  /**
   * Fly the camera over a texture-anchored surface feature. Data-driven:
   * presets live in the system config (cfg.navPresets), the engine only
   * resolves a UV to the feature's current world bearing — which accounts
   * for the body's rotation this frame and the primary's axial tilt.
   */
  flyToFeature(name, preset) {
    const entry = this.r.bodyMeshes.get(name);
    if (!entry) return;
    // Resolve the anchor UV: a live shader uniform when named (it retargets
    // when the hi-res texture swaps in), else a literal preset.uv pair.
    let uv = preset.uv;
    if (preset.uniformUV) {
      const de = this.r.detailEntries.find((e) => e.name === name);
      const u = de?.uniforms?.[preset.uniformUV]?.value;
      if (u) uv = [u.x, u.y];
    }
    if (!uv) return;
    // Three.js SphereGeometry UV mapping -> unit direction in mesh space.
    const az = uv[0] * Math.PI * 2;
    const pol = (1 - uv[1]) * Math.PI;
    const local = new THREE.Vector3(
      -Math.cos(az) * Math.sin(pol),
      Math.cos(pol),
      Math.sin(az) * Math.sin(pol)
    );
    const dir = local.applyQuaternion(entry.mesh.getWorldQuaternion(this._q)).normalize();

    if (this.mode === 'insertion' && this.ins.body === name) {
      // Already orbiting this body in insertion mode: park the orbital phase
      // over the feature's longitude at the preset altitude.
      const rl = dir.clone().applyQuaternion(this.r.root.quaternion.clone().invert());
      this.ins.phase = Math.atan2(-rl.z, rl.x);
      if (this.ins.locked) this.ins.lockOffset = this.ins.phase - this._bodyRotationAngle(name);
      this.setInsertion({ altitudeKm: preset.altitudeKm });
      this._startTransition();
      return;
    }
    if (this.mode !== 'orbit' || this.target !== name) this.setMode('orbit', name);
    this.orbTheta = Math.atan2(dir.z, dir.x);
    this.orbPhi = Math.acos(THREE.MathUtils.clamp(dir.y, -1, 1));
    this.distTween = { from: this.orbDist, to: entry.radiusUnits + preset.altitudeKm / 1000, t: 0, dur: 2 };
    this._startTransition();
  }

  // -- Per-frame update ------------------------------------------------------------

  update(dt) {
    // Simulated seconds elapsed this frame — the same accumulator physics and
    // the renderer advanced earlier in the frame, so every orbital phase
    // derived from it stays in step with body rotation and moon motion.
    const sim = this.physics.simSeconds;
    this._simDelta = sim - (this._lastSimSec ?? sim);
    this._lastSimSec = sim;

    const pose = this._computePose(dt);
    if (this.blend < 1) {
      this.blend = Math.min(1, this.blend + dt / TRANSITION_S);
      const k = easeInOut(this.blend);
      this.camera.position.lerpVectors(this.fromPos, pose.pos, k);
      this.camera.quaternion.slerpQuaternions(this.fromQuat, pose.quat, k);
    } else {
      this.camera.position.copy(pose.pos);
      this.camera.quaternion.copy(pose.quat);
    }

    // Free look (2b): yaw/pitch offset on top of the mode pose. On release
    // the offset eases back to nadir over ~0.5 s.
    const fl = this.freeLook;
    if (!fl.active && (Math.abs(fl.yaw) > 1e-4 || Math.abs(fl.pitch) > 1e-4)) {
      const k = 1 - Math.exp(-dt * 8);
      fl.yaw -= fl.yaw * k;
      fl.pitch -= fl.pitch * k;
      if (Math.abs(fl.yaw) < 1e-4 && Math.abs(fl.pitch) < 1e-4) { fl.yaw = 0; fl.pitch = 0; }
    }
    if (fl.yaw !== 0 || fl.pitch !== 0) {
      this.camera.quaternion.multiply(
        this._q.setFromEuler(new THREE.Euler(fl.pitch, fl.yaw, 0, 'YXZ')));
    }

    this._enforceFloors();
  }

  /** Never let the camera clip inside a body's minimum safe altitude. */
  _enforceFloors() {
    if (this.mode === 'surface') return; // surface mode stands on the ground
    const c = new THREE.Vector3();
    for (const [name, entry] of this.r.bodyMeshes) {
      const floor = this._floorDist(name);
      entry.group.getWorldPosition(c);
      const d = this.camera.position.distanceTo(c);
      if (d < floor && d > 1e-9) {
        this.camera.position.sub(c).setLength(floor).add(c);
      }
    }
  }

  _computePose(dt) {
    switch (this.mode) {
      case 'free': return this._poseFree(dt);
      case 'orbit': return this._poseOrbit(this.target, dt);
      case 'system': return this._poseOrbit(this.r.system.primary.name, dt);
      case 'surface': return this._poseSurface();
      case 'chase': return this._poseChase(dt);
      case 'insertion': return this._poseInsertion(dt);
      case 'cinematic': return this._poseCinematic(dt);
      default: return { pos: this.camera.position.clone(), quat: this.camera.quaternion.clone() };
    }
  }

  _poseFree(dt) {
    const quat = new THREE.Quaternion().setFromEuler(new THREE.Euler(this.pitch, this.yaw, 0, 'YXZ'));
    const pos = this.camera.position.clone();
    const boost = this.keys.has('ShiftLeft') || this.keys.has('ShiftRight') ? 5 : 1;
    // Speed auto-scales with proximity: metres per second near a surface,
    // system-crossing speed out in space.
    const near = Math.max(this.r.nearestAltitudeKm(pos)?.altKm ?? 5e4, 2) / 1000; // units
    const v = THREE.MathUtils.clamp(near * 0.9, 0.002, 4000) * boost * dt;
    const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(quat);
    const right = new THREE.Vector3(1, 0, 0).applyQuaternion(quat);
    const upv = new THREE.Vector3(0, 1, 0).applyQuaternion(quat);
    if (this.keys.has('KeyW')) pos.addScaledVector(fwd, v);
    if (this.keys.has('KeyS')) pos.addScaledVector(fwd, -v);
    if (this.keys.has('KeyA')) pos.addScaledVector(right, -v);
    if (this.keys.has('KeyD')) pos.addScaledVector(right, v);
    if (this.keys.has('KeyQ')) pos.addScaledVector(upv, -v);
    if (this.keys.has('KeyE')) pos.addScaledVector(upv, v);
    return { pos, quat };
  }

  _poseOrbit(name, dt = 0) {
    // Altitude preset tween (1.5 s ease-in-out).
    if (this.distTween) {
      const tw = this.distTween;
      tw.t = Math.min(1, tw.t + dt / tw.dur);
      this.orbDist = tw.from + (tw.to - tw.from) * easeInOut(tw.t);
      if (tw.t >= 1) this.distTween = null;
    }
    // Advance along the orbital path so the surface sweeps beneath the
    // camera. Visual period: 60 s of simulated time per revolution (so it
    // scales with the time multiplier and freezes on pause), adjusted by the
    // Orbital Speed slider, and capped at one revolution per 5 wall-clock
    // seconds so high multipliers sweep dramatically instead of strobing.
    if (this.mode === 'orbit') {
      const adv = (Math.PI * 2 / 60) * this.orbSpeedMult * this._simDelta;
      this.orbTheta += Math.min(adv, (Math.PI * 2 / 5) * dt);
    }

    const center = this.r.bodyWorldPos(name, this._v);
    const pos = new THREE.Vector3(
      center.x + this.orbDist * Math.sin(this.orbPhi) * Math.cos(this.orbTheta),
      center.y + this.orbDist * Math.cos(this.orbPhi),
      center.z + this.orbDist * Math.sin(this.orbPhi) * Math.sin(this.orbTheta)
    );
    const quat = lookQuat(pos, center);

    // Below 500 km, ease in a 15° tilt from pure nadir toward the direction
    // of orbital travel — horizon ahead, surface sweeping beneath and behind.
    const entry = this.r.bodyMeshes.get(name);
    if (entry) {
      const altKm = (this.orbDist - entry.radiusUnits) * 1000;
      if (altKm < 500) {
        const t = 1 - Math.max(0, altKm) / 500;
        const nadir = center.clone().sub(pos).normalize();
        const travel = new THREE.Vector3(-Math.sin(this.orbTheta), 0, Math.cos(this.orbTheta));
        const axis = nadir.cross(travel); // rotating about n×t tips the view from nadir toward travel
        if (axis.lengthSq() > 1e-9) {
          quat.premultiply(new THREE.Quaternion().setFromAxisAngle(
            axis.normalize(), THREE.MathUtils.degToRad(15 * t)));
        }
      }
    }
    return { pos, quat };
  }

  _poseSurface() {
    const entry = this.r.bodyMeshes.get(this.target);
    if (!entry) return this._poseFree(0);
    const rUnits = entry.radiusUnits;
    // Surface point in the moon mesh's local (rotating) frame.
    const local = new THREE.Vector3(
      Math.cos(this.surfLat) * Math.cos(this.surfLon),
      Math.sin(this.surfLat),
      Math.sin(this.surfLon) * Math.cos(this.surfLat)
    ).multiplyScalar(rUnits * 1.002);
    const pos = entry.mesh.localToWorld(local.clone());
    const up = pos.clone().sub(entry.group.getWorldPosition(new THREE.Vector3())).normalize();

    // Build horizon-relative look direction from yaw/pitch.
    const north = Math.abs(up.y) < 0.98 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0);
    const east = north.clone().cross(up).normalize();
    const forward0 = up.clone().cross(east).normalize();
    const lookDir = forward0.clone()
      .applyAxisAngle(up, this.surfYaw)
      .applyAxisAngle(east.clone().applyAxisAngle(up, this.surfYaw), this.surfPitch);
    const m = new THREE.Matrix4().lookAt(pos, pos.clone().add(lookDir), up);
    return { pos, quat: new THREE.Quaternion().setFromRotationMatrix(m) };
  }

  /** Body's velocity direction in world space (from physics, not geometry). */
  _bodyVelocityWorld(name, out = new THREE.Vector3()) {
    const b = this.physics?.getBody(name);
    if (!b) return out.set(0, 0, 0); // primary or unknown
    if (b.nbody) {
      out.set(b.vel.x, b.vel.y, b.vel.z);
    } else {
      // Kepler bodies: analytic tangent of the circular orbit.
      const ang = b.phase + (Math.PI * 2) * (this.physics.simSeconds / b.period);
      out.set(-Math.sin(ang), 0, -Math.cos(ang));
    }
    return out.applyQuaternion(this.r.root.quaternion); // equatorial -> world
  }

  _poseChase(dt) {
    const entry = this.r.bodyMeshes.get(this.target);
    if (!entry) return this._poseFree(0);
    const center = entry.group.getWorldPosition(new THREE.Vector3());
    const R = entry.radiusUnits;
    // Fighter-jet chase cam: 3R behind and (Chase Height slider) above the
    // moon, both scaled by scroll zoom so the framing holds while zooming.
    const behind = R * 3 * this.chaseDistMult;
    const above = R * this.chaseHeightMult * this.chaseDistMult;

    // Trail BEHIND the direction of travel (velocity-derived, so the offset
    // is correct at every point of the orbit). "Above" is the orbital plane's
    // north — the root frame's Y axis, which carries the axial tilt.
    const vel = this._bodyVelocityWorld(this.target);
    const up = new THREE.Vector3(0, 1, 0).applyQuaternion(this.r.root.quaternion);
    let desired, lookTarget;
    if (vel.lengthSq() > 1e-12) {
      vel.normalize();
      desired = center.clone()
        .addScaledVector(vel, -behind)
        .addScaledVector(up, above);
      // Aim ahead of the moon along its travel: its surface fills the lower
      // half of the view and the sky ahead (Jupiter, for inner moons) the rest.
      lookTarget = center.clone().addScaledVector(vel, R * 2);
    } else {
      // Static target (the primary): hold the current bearing, station-keeping.
      const dir = this.chasePos.clone().sub(center);
      if (dir.lengthSq() < 1e-9) dir.set(0.3, 0.25, 1);
      desired = center.clone().addScaledVector(dir.normalize(), R * 3.5 * this.chaseDistMult);
      lookTarget = center;
    }

    if (this.blend >= 1) {
      // Frame-rate-independent exponential spring on both position and look.
      this.chasePos.lerp(desired, 1 - Math.exp(-dt * 3.0));
      this.chaseLook.lerp(lookTarget, 1 - Math.exp(-dt * 5.0));
    } else {
      this.chasePos.copy(desired);
      this.chaseLook.copy(lookTarget);
    }
    return { pos: this.chasePos.clone(), quat: lookQuat(this.chasePos, this.chaseLook) };
  }

  // -- Orbit insertion (mode 7) ----------------------------------------------------

  _minInsertionAltKm(name) {
    const entry = this.r.bodyMeshes.get(name);
    if (!entry) return 10;
    return entry.cfg?.detailFloor?.hardKm
      ?? (entry.isPrimary ? 500 : entry.cfg.radiusKm >= 500 ? 10 : 5);
  }

  _bodyRotationRateRadS(name) {
    const entry = this.r.bodyMeshes.get(name);
    if (!entry) return 0;
    if (entry.isPrimary) return this.physics.rotationRate;
    // Tidally locked moons rotate once per orbit.
    return (Math.PI * 2) / (entry.cfg.periodDays * 86400);
  }

  /**
   * The body's current rotation angle — the exact value the renderer applied
   * to the mesh this frame. GeoSync pins the camera phase to this, so camera
   * and texture share one time accumulator and cannot drift apart.
   */
  _bodyRotationAngle(name) {
    const entry = this.r.bodyMeshes.get(name);
    if (!entry) return 0;
    return entry.isPrimary ? this.physics.primaryRotation : entry.mesh.rotation.y;
  }

  /** Update insertion parameters from the UI (body/altitude/inclination/lock). */
  setInsertion(params) {
    const wasLocked = this.ins.locked;
    // Plane change: blend the camera smoothly onto the newly tilted path.
    // (The node is FIXED — anchoring it at the camera's position made the
    // tangent, and with it the whole nadir view, roll about the view axis
    // while dragging: the scene appeared to rotate. Bodies never move;
    // only the camera glides to its new orbital plane.)
    if (params.incDeg !== undefined && params.incDeg !== this.ins.incDeg) {
      this._startTransition();
    }
    Object.assign(this.ins, params);
    if (params.body) { this.target = params.body; this.lastTarget = params.body; }
    const min = this._minInsertionAltKm(this.ins.body);
    this.ins.altitudeKm = THREE.MathUtils.clamp(this.ins.altitudeKm, min, 500000);
    // (Re)anchor the geosync lock at the camera's current longitude when the
    // lock engages or the locked body changes — no jump, just hold station.
    if (this.ins.locked && (!wasLocked || params.body)) {
      this.ins.lockOffset = this.ins.phase - this._bodyRotationAngle(this.ins.body);
    }
    this.onInsertionChange?.(this.ins);
  }

  /** One-click stationary orbit: camera hangs over a fixed longitude. */
  presetGeoSync() {
    const primary = this.r.system.primary;
    // Enter the mode first — setMode auto-derives phase/altitude from the
    // camera, so the preset values must be applied after.
    if (this.mode !== 'insertion') this.setMode('insertion', primary.name);
    // Geosynchronous radius 160,000 km from the center => altitude above
    // the cloud tops is radius-dependent, not hardcoded.
    this.setInsertion({
      body: primary.name,
      altitudeKm: 160000 - primary.radiusKm,
      incDeg: 0,
      locked: true,
    });
    // Park over the subsolar longitude (daylit clouds below), looking down.
    this.ins.phase = Math.atan2(-this.r.sunDir.z, this.r.sunDir.x);
    this.ins.lockOffset = this.ins.phase - this._bodyRotationAngle(this.ins.body);
    this.ins.pitch = -0.8;
    this._startTransition();
  }

  _poseInsertion(dt) {
    const ins = this.ins;
    const entry = this.r.bodyMeshes.get(ins.body);
    if (!entry) return this._poseFree(0);

    const rUnits = entry.radiusUnits + ins.altitudeKm / 1000;
    const rKm = rUnits * KM_PER_UNIT;
    const mass = entry.isPrimary ? this.r.system.primary.massKg : entry.cfg.massKg;

    // Negative inclination = retrograde: the plane tilts by the magnitude
    // and the orbit is traversed in the opposite direction. (A negative
    // axis-angle tilt alone only mirrors the plane — it does not reverse
    // the direction of travel, so the sign drives the phase advance.)
    const retro = ins.incDeg < 0 && !ins.locked;
    const orbitSign = retro ? -1 : 1;

    // Circular orbital mechanics: v = sqrt(GM/r). Locked mode pins the
    // angular rate to the body's rotation instead (geosynchronous).
    let omega;
    if (ins.locked) {
      omega = this._bodyRotationRateRadS(ins.body);
      ins.velKmS = omega * rKm;
      // Exact lock: same accumulator as the mesh rotation, so the surface
      // below cannot drift no matter the multiplier or frame timing.
      ins.phase = ins.lockOffset + this._bodyRotationAngle(ins.body);
    } else {
      ins.velKmS = Math.sqrt((G * mass) / rKm);
      omega = ins.velKmS / rKm;
      ins.phase += orbitSign * omega * this._simDelta; // advance along the orbital path
    }
    ins.periodS = omega > 0 ? (Math.PI * 2) / omega : 0;
    // Ground-track sweep rate: relative angular velocity × surface radius.
    ins.surfaceKmS = ins.locked
      ? 0
      : Math.abs(orbitSign * omega - this._bodyRotationRateRadS(ins.body)) * entry.radiusUnits * KM_PER_UNIT;

    // Orbit plane: a great circle inclined by |incDeg| from the equator,
    // tilted about the line of nodes fixed at entry (radial direction at
    // ins.nodePhase). Camera position only — nothing in the scene is ever
    // rotated. At 90° the path passes over both poles; the body stays at
    // the circle's center (and centered in view) at every inclination.
    const inc = THREE.MathUtils.degToRad(Math.abs(ins.incDeg));
    const nodeAxis = new THREE.Vector3(
      Math.cos(ins.nodePhase || 0), 0, -Math.sin(ins.nodePhase || 0));
    const local = new THREE.Vector3(Math.cos(ins.phase), 0, -Math.sin(ins.phase))
      .multiplyScalar(rUnits).applyAxisAngle(nodeAxis, inc);
    // Travel direction = d(position)/dφ, reversed for retrograde traversal.
    const tangent = new THREE.Vector3(-Math.sin(ins.phase), 0, -Math.cos(ins.phase))
      .multiplyScalar(orbitSign)
      .applyAxisAngle(nodeAxis, inc);
    local.applyQuaternion(this.r.root.quaternion);
    tangent.applyQuaternion(this.r.root.quaternion).normalize();

    const center = entry.group.getWorldPosition(new THREE.Vector3());
    const pos = center.clone().add(local);

    // Nadir-referenced orientation: look-around yaw spins about the radial,
    // pitch about the local right axis (default pitch looks down at the
    // surface ahead). Screen-up is the ORBIT-PLANE NORMAL, not the radial:
    // with the radial as the lookAt up, a near-nadir view's screen-up
    // collapses onto the travel direction (which lies in the orbit plane),
    // rolling the planet sideways — cloud bands rendered vertically at
    // every entry phase (measured: spin axis at 90° on screen). The orbit
    // normal is constant along the orbit, so the view is also roll-free
    // around a full revolution.
    const up = local.clone().normalize();
    const north = new THREE.Vector3(0, 1, 0).applyAxisAngle(nodeAxis, inc)
      .applyQuaternion(this.r.root.quaternion);
    const fwd = tangent.clone().applyAxisAngle(up, ins.yaw);
    const right = fwd.clone().cross(up).normalize();
    fwd.applyAxisAngle(right, ins.pitch);
    const m = new THREE.Matrix4().lookAt(pos, pos.clone().add(fwd), north);
    return { pos, quat: new THREE.Quaternion().setFromRotationMatrix(m) };
  }

  // -- Cinematic auto mode -------------------------------------------------------

  _defaultCinematicSequence() {
    const primary = () => this.r.system.primary.name;
    const moons = this.r.system.bodies.filter((b) => b.physics === 'nbody').map((b) => b.name);
    return [
      { target: primary(), dist: 14, height: 3.5, orbitRate: 0.02, duration: 12, startTheta: 0.3 },   // reveal
      { target: primary(), dist: 4.2, height: 1.1, orbitRate: 0.05, duration: 14, startTheta: 2.1 },  // slow orbit
      { target: moons[0] || primary(), dist: 6, height: 1.6, orbitRate: 0.09, duration: 11, startTheta: 4.0 }, // dive to Io
      { target: primary(), dist: 22, height: 6, orbitRate: 0.015, duration: 12, startTheta: 5.2 },    // pull back
      { target: moons[1] || primary(), dist: 7, height: 2, orbitRate: 0.07, duration: 12, startTheta: 1.0 },   // drift near Europa
    ];
  }

  _poseCinematic(dt) {
    const seq = this.activeSeq || this.cineSeq;
    const shot = seq[this.cineIndex % seq.length];
    this.cineTime += dt;
    if (this.cineTime > shot.duration) {
      this.cineTime = 0;
      this.cineIndex = (this.cineIndex + 1) % seq.length;
      this._startTransition();
      if (this.activeSeq && this.cineIndex === 0) this.activeSeq = null; // one-shot sequences end
      return this._poseCinematic(0);
    }
    const cur = seq[this.cineIndex % seq.length];
    const center = this.r.bodyWorldPos(cur.target, this._v).clone();
    const bodyR = this.r.bodyRadius(cur.target);
    const theta = (cur.startTheta || 0) + this.cineTime * (cur.orbitRate || 0.03);
    const dist = bodyR * cur.dist;
    const pos = new THREE.Vector3(
      center.x + dist * Math.cos(theta),
      center.y + bodyR * (cur.height || 1.5),
      center.z + dist * Math.sin(theta)
    );
    const lookTarget = cur.lookAt ? this.r.bodyWorldPos(cur.lookAt, new THREE.Vector3()) : center;
    return { pos, quat: lookQuat(pos, lookTarget) };
  }

  /** Play a one-shot scripted sequence (e.g. the Voyager flyby preset). */
  playSequence(seq) {
    this.activeSeq = seq;
    this.mode = 'cinematic';
    this.cineIndex = 0; this.cineTime = 0;
    this._startTransition();
    this.onModeChange?.('cinematic', null);
  }
}

function lookQuat(from, to) {
  const m = new THREE.Matrix4().lookAt(from, to, new THREE.Vector3(0, 1, 0));
  return new THREE.Quaternion().setFromRotationMatrix(m);
}
