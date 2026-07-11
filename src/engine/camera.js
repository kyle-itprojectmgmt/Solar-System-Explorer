// ---------------------------------------------------------------------------
// Camera controller — six modes, smooth 0.8 s eased transitions, unified
// mouse / keyboard / touch input. System-agnostic: targets are body names
// resolved through the renderer.
//
// Modes: cinematic | free | orbit | surface | chase | system
// ---------------------------------------------------------------------------

import * as THREE from 'three';

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
    this.speed = 40; // units/s
    this.keys = new Set();

    // Orbit state
    this.orbTheta = 0.6; this.orbPhi = 1.2; this.orbDist = 300;

    // Surface state
    this.surfLat = 0; this.surfLon = 0; this.surfYaw = 0; this.surfPitch = 0.1;

    // Chase spring (smoothed position and look-at point)
    this.chasePos = new THREE.Vector3();
    this.chaseLook = new THREE.Vector3();

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
    if (mode === 'free') {
      // Adopt current orientation so there's no snap.
      const e = new THREE.Euler().setFromQuaternion(this.camera.quaternion, 'YXZ');
      this.yaw = e.y; this.pitch = e.x;
    }
    this._startTransition();
    this.onModeChange?.(mode, target);
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
      this.keys.add(e.code);
      if (['KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyQ', 'KeyE'].includes(e.code)) {
        if (this.mode === 'cinematic') this.setMode('free');
      }
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
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
      case 'chase':
        break;
      default:
        break;
    }
  }

  _pinch(delta) {
    if (this.mode === 'orbit' || this.mode === 'system') {
      const name = this.mode === 'system' ? this.r.system.primary.name : this.target;
      const minD = this.r.bodyRadius(name) * 1.6;
      this.orbDist = THREE.MathUtils.clamp(this.orbDist * (1 - delta * 0.002), minD, 3e5);
    } else if (this.mode === 'free') {
      this.speed = THREE.MathUtils.clamp(this.speed * (1 + delta * 0.002), 0.5, 5000);
    }
  }

  // -- Per-frame update ------------------------------------------------------------

  update(dt) {
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
  }

  _computePose(dt) {
    switch (this.mode) {
      case 'free': return this._poseFree(dt);
      case 'orbit': return this._poseOrbit(this.target);
      case 'system': return this._poseOrbit(this.r.system.primary.name);
      case 'surface': return this._poseSurface();
      case 'chase': return this._poseChase(dt);
      case 'cinematic': return this._poseCinematic(dt);
      default: return { pos: this.camera.position.clone(), quat: this.camera.quaternion.clone() };
    }
  }

  _poseFree(dt) {
    const quat = new THREE.Quaternion().setFromEuler(new THREE.Euler(this.pitch, this.yaw, 0, 'YXZ'));
    const pos = this.camera.position.clone();
    const boost = this.keys.has('ShiftLeft') || this.keys.has('ShiftRight') ? 5 : 1;
    const v = this.speed * boost * dt;
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

  _poseOrbit(name) {
    const center = this.r.bodyWorldPos(name, this._v);
    const pos = new THREE.Vector3(
      center.x + this.orbDist * Math.sin(this.orbPhi) * Math.cos(this.orbTheta),
      center.y + this.orbDist * Math.cos(this.orbPhi),
      center.z + this.orbDist * Math.sin(this.orbPhi) * Math.sin(this.orbTheta)
    );
    const quat = lookQuat(pos, center);
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
    const dist = entry.radiusUnits * 7;

    // Trail BEHIND the direction of travel (velocity-derived, so the offset
    // is correct at every point of the orbit).
    const vel = this._bodyVelocityWorld(this.target);
    let desired;
    if (vel.lengthSq() > 1e-12) {
      vel.normalize();
      desired = center.clone()
        .addScaledVector(vel, -dist)
        .add(new THREE.Vector3(0, entry.radiusUnits * 2.2, 0));
    } else {
      // Static target (the primary): hold the current bearing, station-keeping.
      const dir = this.chasePos.clone().sub(center);
      if (dir.lengthSq() < 1e-9) dir.set(0.3, 0.25, 1);
      desired = center.clone().addScaledVector(dir.normalize(), dist);
    }

    if (this.blend >= 1) {
      // Frame-rate-independent exponential spring on both position and look.
      this.chasePos.lerp(desired, 1 - Math.exp(-dt * 3.0));
      this.chaseLook.lerp(center, 1 - Math.exp(-dt * 5.0));
    } else {
      this.chasePos.copy(desired);
      this.chaseLook.copy(center);
    }
    return { pos: this.chasePos.clone(), quat: lookQuat(this.chasePos, this.chaseLook) };
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
