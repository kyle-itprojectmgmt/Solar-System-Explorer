// ---------------------------------------------------------------------------
// Physics engine — system-agnostic orbital mechanics.
//   * N-body velocity-Verlet integration for major moons
//   * Simplified Keplerian circular orbits for small inner moons
//   * Simulation clock with time multipliers
//   * Eclipse (moon in primary's shadow) and transit detection
//   * Prediction of upcoming eclipse events for the HUD ticker
// Works entirely in km / kg / seconds; the renderer converts to scene units.
// ---------------------------------------------------------------------------

import { G } from '../config.js';

export const TIME_STEPS = [0, 1, 10, 100, 1000, 10000];

// -- Date <-> simulation-seconds utility --------------------------------------
// ALL conversions between calendar dates and simSeconds (presets, the date
// picker, HUD display, URL sharing) must go through these two functions, so
// presets stored as ISO 8601 UTC strings stay valid even if engine internals
// change. The epoch is NOT hardcoded — it comes from the active system config
// (system.epoch, e.g. Voyager 1 flyby '1979-03-05T12:00:00Z'; note: noon
// UTC, so a hardcoded midnight constant would put every date 12 h off) via
// physics.epochMs, keeping the utility valid for any future system.

export function dateToSimSeconds(isoString, epochMs) {
  return (new Date(isoString).getTime() - epochMs) / 1000;
}

export function simSecondsToDate(simSeconds, epochMs) {
  return new Date(epochMs + simSeconds * 1000).toISOString();
}

const TWO_PI = Math.PI * 2;

export class PhysicsEngine {
  constructor(system) {
    this.system = system;
    this.epochMs = Date.parse(system.epoch);
    this.simSeconds = 0;              // seconds since epoch
    this.timeIndex = 1;               // index into TIME_STEPS (1x)
    this.pausedIndex = 1;             // restore point for pause toggle
    this.primaryMass = system.primary.massKg;
    this.primaryRotation = 0;         // radians
    this.rotationRate = TWO_PI / (system.primary.rotationPeriodHours * 3600);

    // Sun direction (unit vector, primary equatorial frame).
    const d = system.star.direction;
    const dl = Math.hypot(d[0], d[1], d[2]);
    this.sunDir = { x: d[0] / dl, y: d[1] / dl, z: d[2] / dl };

    this.bodies = system.bodies.map((cfg) => {
      const a = cfg.semiMajorAxisKm;
      const period = cfg.periodDays * 86400;
      const phase = ((cfg.phaseDeg || 0) * Math.PI) / 180;
      const v = TWO_PI * a / period; // circular orbital speed, km/s
      return {
        cfg,
        name: cfg.name,
        a,
        period,
        phase,
        nbody: cfg.physics === 'nbody',
        mass: cfg.massKg,
        pos: { x: a * Math.cos(phase), y: 0, z: -a * Math.sin(phase) },
        vel: { x: -v * Math.sin(phase), y: 0, z: -v * Math.cos(phase) },
        acc: { x: 0, y: 0, z: 0 },
        eclipseFactor: 0,   // 0 = sunlit, 1 = fully in primary's shadow
        inTransit: false,
        transitPoint: null, // surface point of shadow on primary (km, primary frame)
      };
    });
    this._computeAccelerations();
  }

  get timeMultiplier() { return TIME_STEPS[this.timeIndex]; }
  get paused() { return this.timeIndex === 0; }

  setTimeIndex(i) {
    this.timeIndex = Math.max(0, Math.min(TIME_STEPS.length - 1, i));
    if (this.timeIndex > 0) this.pausedIndex = this.timeIndex;
  }
  faster() { this.setTimeIndex(this.timeIndex + 1); }
  slower() { this.setTimeIndex(this.timeIndex - 1); }
  togglePause() { this.setTimeIndex(this.paused ? this.pausedIndex : 0); }

  get simDate() { return new Date(this.epochMs + this.simSeconds * 1000); }

  /**
   * Jump the simulation to an arbitrary moment (date picker / presets /
   * LIVE mode). N-body moons integrate numerically, so a bare simSeconds
   * write cannot move them across years — positions and velocities are
   * re-initialized analytically from their circular elements at the target
   * time; the n-body integration (and the Laplace resonance) resumes from
   * there.
   */
  jumpToSimSeconds(s) {
    this.simSeconds = s;
    const TWO_PI = Math.PI * 2;
    this.primaryRotation = ((this.rotationRate * s) % TWO_PI + TWO_PI) % TWO_PI;
    for (const b of this.bodies) {
      const ang = b.phase + TWO_PI * (s / b.period);
      const v = TWO_PI * b.a / b.period;
      b.pos.x = b.a * Math.cos(ang); b.pos.y = 0; b.pos.z = -b.a * Math.sin(ang);
      b.vel.x = -v * Math.sin(ang); b.vel.y = 0; b.vel.z = -v * Math.cos(ang);
    }
    this._computeAccelerations();
    this._updateShadows();
  }

  /** Advance the simulation by realDt seconds of wall-clock time. */
  update(realDt) {
    const simDt = Math.min(realDt, 0.1) * this.timeMultiplier;
    if (simDt <= 0) return;

    this.simSeconds += simDt;
    this.primaryRotation = (this.primaryRotation + this.rotationRate * simDt) % TWO_PI;

    // Verlet integration for n-body moons, adaptive substep count so the
    // step never exceeds ~1/60 of the fastest n-body orbit.
    const steps = Math.max(1, Math.min(96, Math.ceil(simDt / 1800)));
    const dt = simDt / steps;
    for (let s = 0; s < steps; s++) this._verletStep(dt);

    // Kepler moons: analytic circular orbit.
    for (const b of this.bodies) {
      if (b.nbody) continue;
      const ang = b.phase + TWO_PI * (this.simSeconds / b.period);
      b.pos.x = b.a * Math.cos(ang);
      b.pos.z = -b.a * Math.sin(ang);
    }

    this._updateShadows();
  }

  _verletStep(dt) {
    for (const b of this.bodies) {
      if (!b.nbody) continue;
      // half-kick + drift
      b.vel.x += b.acc.x * dt * 0.5; b.vel.y += b.acc.y * dt * 0.5; b.vel.z += b.acc.z * dt * 0.5;
      b.pos.x += b.vel.x * dt; b.pos.y += b.vel.y * dt; b.pos.z += b.vel.z * dt;
    }
    this._computeAccelerations();
    for (const b of this.bodies) {
      if (!b.nbody) continue;
      b.vel.x += b.acc.x * dt * 0.5; b.vel.y += b.acc.y * dt * 0.5; b.vel.z += b.acc.z * dt * 0.5;
    }
  }

  _computeAccelerations() {
    const nb = this.bodies.filter((b) => b.nbody);
    for (const b of nb) {
      // Primary's gravity (dominant term).
      const r2 = b.pos.x ** 2 + b.pos.y ** 2 + b.pos.z ** 2;
      const r = Math.sqrt(r2);
      const g = -G * this.primaryMass / (r2 * r);
      b.acc.x = g * b.pos.x; b.acc.y = g * b.pos.y; b.acc.z = g * b.pos.z;
    }
    // Mutual perturbations (this is what expresses the Laplace resonance).
    for (let i = 0; i < nb.length; i++) {
      for (let j = i + 1; j < nb.length; j++) {
        const a = nb[i], b = nb[j];
        const dx = b.pos.x - a.pos.x, dy = b.pos.y - a.pos.y, dz = b.pos.z - a.pos.z;
        const r2 = dx * dx + dy * dy + dz * dz;
        const inv = 1 / (r2 * Math.sqrt(r2));
        const fa = G * b.mass * inv, fb = G * a.mass * inv;
        a.acc.x += fa * dx; a.acc.y += fa * dy; a.acc.z += fa * dz;
        b.acc.x -= fb * dx; b.acc.y -= fb * dy; b.acc.z -= fb * dz;
      }
    }
  }

  // -- Shadow geometry -------------------------------------------------------

  /**
   * Eclipse: moon on the anti-sun side of the primary with its center closer
   * to the shadow axis than the primary's radius. Transit: moon on the sun
   * side, its shadow landing on the primary's disc.
   */
  _updateShadows() {
    const R = this.system.primary.radiusKm;
    const s = this.sunDir;
    for (const b of this.bodies) {
      const along = b.pos.x * s.x + b.pos.y * s.y + b.pos.z * s.z; // + = sunward
      const px = b.pos.x - along * s.x, py = b.pos.y - along * s.y, pz = b.pos.z - along * s.z;
      const perp = Math.hypot(px, py, pz);
      const moonR = b.cfg.radiusKm;

      if (along < 0) {
        // Behind the primary — candidate for eclipse. Smooth over penumbra.
        const t = (R + moonR - perp) / (2 * moonR);
        b.eclipseFactor = Math.max(0, Math.min(1, t));
        b.inTransit = false;
        b.transitPoint = null;
      } else {
        b.eclipseFactor = 0;
        // Moon between sun and primary: does its shadow hit the disc?
        b.inTransit = perp < R * 0.98 && along > R;
        b.transitPoint = b.inTransit
          ? {
              // Point on the primary's surface along the shadow ray.
              x: px + Math.sqrt(Math.max(0, R * R - perp * perp)) * s.x,
              y: py + Math.sqrt(Math.max(0, R * R - perp * perp)) * s.y,
              z: pz + Math.sqrt(Math.max(0, R * R - perp * perp)) * s.z,
            }
          : null;
      }
    }
  }

  // -- Event prediction (HUD ticker) ----------------------------------------

  /**
   * Predict the next `count` eclipse entries / transits assuming circular
   * orbits (good enough for a countdown ticker). Returns
   * [{ body, type: 'eclipse'|'transit', inSeconds }] sorted by time.
   */
  predictEvents(count = 5) {
    const R = this.system.primary.radiusKm;
    const s = this.sunDir;
    // Angle of the anti-sun direction in the orbital (x,-z) plane.
    const sunAngle = Math.atan2(-s.z, s.x);
    const events = [];
    for (const b of this.bodies) {
      if (b.cfg.radiusKm < 500) continue; // ticker covers major moons only
      // Half-width of the shadow crossing, as an angle along the orbit.
      const half = Math.asin(Math.min(1, R / b.a));
      const rate = TWO_PI / b.period; // rad/s
      const curAngle = Math.atan2(-b.pos.z, b.pos.x);
      for (const [type, center] of [
        ['eclipse', sunAngle + Math.PI],
        ['transit', sunAngle],
      ]) {
        // Time until the moon reaches the entry edge of the crossing.
        let delta = (center - half - curAngle) % TWO_PI;
        if (delta < 0) delta += TWO_PI;
        events.push({ body: b.name, type, inSeconds: delta / rate });
      }
    }
    events.sort((a, b) => a.inSeconds - b.inSeconds);
    return events.slice(0, count);
  }

  /** Light travel time from primary to Earth, in seconds (approximate). */
  lightDelayToEarthSeconds() {
    const AU = 149597870.7;
    const jd = this.epochMs / 86400000 + this.simSeconds / 86400;
    // Mean anomalies (very rough — fine for a HUD readout).
    const earthAng = TWO_PI * (jd / 365.25);
    const jupAng = TWO_PI * (jd / 4332.6);
    const rE = 1.0 * AU, rJ = this.system.star.distanceAU * AU;
    const d = Math.sqrt(rE * rE + rJ * rJ - 2 * rE * rJ * Math.cos(jupAng - earthAng));
    return d / 299792.458;
  }

  getBody(name) {
    return this.bodies.find((b) => b.name === name);
  }
}
