# Solar System Explorer — V3b Prompt
# Fix: Surface Movement During Orbit — Surface Should Pass Beneath Camera

---

## CONTEXT

Currently when orbiting Jupiter or any moon, the surface appears
stationary — the same patch of terrain stays centered in view. Moons,
shadows, and stars move correctly but the body being orbited feels
pinned in place. This prompt fixes all orbit-related camera modes so
the surface visibly sweeps beneath the camera as expected.

There are two related but distinct bugs to fix.

---

## BUG 1 — ORBIT MODE (O key)

### What is happening:
The camera orbits the body's center point with a fixed lookAt aimed
at that center. The result: the same surface point stays centered
in view regardless of where in the orbit the camera is. The body
appears to rotate in place rather than having terrain pass beneath.

### What should happen:
As the camera moves along its orbital path around the body, the
surface should visibly sweep beneath — terrain passes from one side
of the screen to the other at the correct orbital speed. The camera
should look toward the body center but the motion of the orbital
path itself makes different surface regions pass beneath the view.

### The fix:
The camera position must move along the orbital path each frame,
driven by the orbital angular velocity. Do not update lookAt to
track a fixed surface point — keep lookAt aimed at body center
but advance the camera's orbital position continuously:

```javascript
// Each frame in orbit mode:
orbitAngle += (2 * Math.PI / orbitalPeriodSeconds) * deltaTime * timeMultiplier;

camera.position.set(
  bodyPosition.x + Math.cos(orbitAngle) * orbitRadius,
  bodyPosition.y + orbitHeight,
  bodyPosition.z + Math.sin(orbitAngle) * orbitRadius
);

camera.lookAt(bodyPosition);
```

The orbital period should default to a visually interesting speed
when first entering orbit mode — not the real orbital period (too
slow at 1x), but scaled so the surface visibly moves. Use a default
visual orbit period of 60 seconds at 1x time, scaling with the
time multiplier. At 100x this becomes a fast dramatic sweep.

Add a "Orbital Speed" control to the orbit mode UI — a slider
that adjusts how fast the camera orbits independently of time
multiplier. This lets users control the sweep speed.

### Camera orientation in orbit:
Camera should be nadir-pointing (looking down at the surface below)
with a slight forward tilt in the direction of orbital travel —
about 15 degrees forward of straight down. This gives the classic
low-orbit spacecraft window view where the horizon is visible ahead
and the surface sweeps beneath and behind.

---

## BUG 2 — ORBIT INSERTION MODE (I key) — Non-GeoSync Orbits

### What is happening:
In Orbit Insertion mode with "Lock to body rotation" OFF, the camera
position is not advancing along the orbital path. The camera hovers
at a fixed point while the body rotates beneath — which is backwards
from reality (in a real orbit the spacecraft moves, not the planet).

### What should happen:
The camera moves along its orbital path at the correct orbital
velocity. The surface sweeps beneath at a rate determined by the
difference between orbital velocity and the body's rotation rate.

For most orbits over Jupiter this means the surface sweeps rapidly
beneath you (Jupiter rotates in 9.9 hours but a low orbit has a
much shorter period). Over the moons, the moon's surface sweeps
beneath at the orbital rate.

### The fix:
In Orbit Insertion mode with geosync OFF:

```javascript
// Calculate orbital angular velocity
const GM = GRAVITATIONAL_CONSTANT * body.mass;
const r = body.radius + altitude; // in km, convert to meters
const orbitalVelocity = Math.sqrt(GM / r); // m/s
const orbitalPeriod = (2 * Math.PI * r) / orbitalVelocity; // seconds

// Advance camera along orbit each frame
orbitAngle += (2 * Math.PI / orbitalPeriod) * deltaTime * timeMultiplier;

// Apply inclination
const x = orbitRadius * Math.cos(orbitAngle);
const z = orbitRadius * Math.sin(orbitAngle);
const y = orbitRadius * Math.sin(inclination * DEG2RAD) * Math.sin(orbitAngle);

camera.position.copy(bodyPosition).add(new THREE.Vector3(x, y, z));
```

Camera orientation: nadir-pointing with 15 degree forward tilt
in direction of orbital travel (same as Orbit mode above).

### Orbital period HUD display:
Update the Orbit Insertion HUD to show the actual orbital period
so the user understands how fast they are moving:

```
ORBITAL INSERTION
Altitude:    500 km above surface
Velocity:    17.3 km/s
Period:      1h 47m 22s        ← time for one full orbit
Inc:         0° (equatorial)
Surface speed: 15.2 km/s      ← speed of surface passing beneath
```

"Surface speed" is the relative velocity between camera and the
surface below — the rate at which terrain sweeps beneath the camera.
For GeoSync this reads "0.0 km/s (Geosynchronous)".

---

## BUG 3 — GEOSYNC ORBIT — Verify Surface Is Truly Stationary

### What should happen:
In GeoSync mode (Lock to body rotation ON), the camera's orbital
angular velocity exactly matches the body's rotation rate. The
surface should appear completely stationary below — only the
procedural cloud animation moves, not the underlying texture.

### Verify the math:
GeoSync requires camera orbital period = body rotation period exactly.

For Jupiter GeoSync:
- Jupiter rotation period: 9.925 hours = 35,730 seconds
- GeoSync orbital radius: 160,000 km from center
- Camera must complete one orbit in exactly 35,730 seconds
  (scaled by time multiplier)

Check that `orbitAngle` advances at exactly the same rate as
Jupiter's texture rotation uniform. If there is any mismatch,
the surface will slowly drift. Synchronize both to the same
time accumulator.

For moon GeoSync:
- Use each moon's actual rotation period (tidally locked moons
  rotate once per orbit — Io: 1.769 days, Europa: 3.551 days,
  Ganymede: 7.155 days, Callisto: 16.689 days)
- GeoSync orbit radius for each moon calculated from their mass

### What GeoSync should look like:
- Cloud bands / surface completely still below camera
- Stars drift overhead at the body's rotation rate
- Other moons arc across the sky at their orbital speeds
- At 10,000x time: moons sweep visibly across the sky, sun
  rises and sets, but the surface below remains locked

---

## BUG 4 — CHASE MODE — Surface of Chased Body Should Be Visible

### What is happening:
In Chase mode following a moon, the camera trails behind the moon
but points at the moon's center. The moon fills the view as a
sphere but you cannot see its surface passing beneath you or
get the sense of flying alongside it.

### What should happen:
In Chase mode the camera should position itself slightly above
and behind the moon (not directly behind at the same altitude),
angled so you can see:
- The moon's surface below and ahead of you
- Jupiter in the background (if chasing an inner moon)
- The direction of travel ahead

### The fix — Chase camera position:
```javascript
// Position: above and behind in direction of travel
const behindOffset = travelDirection.clone().multiplyScalar(-chaseDistance);
const upOffset = new THREE.Vector3(0, chaseHeight, 0);
// chaseDistance: 3x moon radius behind
// chaseHeight: 1.5x moon radius above

targetCameraPos = moonPosition
  .clone()
  .add(behindOffset)
  .add(upOffset);

// Look at a point slightly ahead of the moon in its travel direction
const lookAheadPoint = moonPosition.clone()
  .add(travelDirection.multiplyScalar(moonRadius * 2));

camera.lookAt(lookAheadPoint);
```

This gives the classic fighter jet chase cam — you can see the
surface of the moon below you, the horizon ahead, and Jupiter
in the background growing or shrinking as the moon orbits.

Add a "Chase Height" slider to the side panel when in Chase mode:
- Low: skimming just above the surface (0.2x moon radius above)
- Medium: standard chase view (1.5x moon radius — default)
- High: wide view showing full moon and surroundings (4x moon radius)

---

## VISUAL RESULT AFTER FIXES

What the user experiences in each mode after these fixes:

**Orbit Mode over Jupiter:**
Surface cloud bands sweep steadily from ahead to beneath to behind.
At 100x time speed, bands rush past dramatically. The Great Red Spot
sweeps into view, passes beneath, disappears behind. Stars rotate
overhead. It feels like being in a spacecraft in low Jupiter orbit.

**Orbit Insertion — Low orbit over Io (500 km, non-geosync):**
Io's sulfur plains rush beneath at 17+ km/s orbital velocity.
Volcanic regions sweep past. Jupiter hangs massive on the horizon
ahead, slowly rotating. At 100x: the entire surface of Io passes
beneath in minutes.

**Orbit Insertion — Jupiter GeoSync:**
Cloud bands completely locked below. The Great Red Spot sits
stationary. Stars wheel overhead. Io arcs past periodically.
At 10,000x: Io laps the camera every few simulated minutes.

**Chase Mode following Europa:**
Camera flies alongside Europa, slightly above and behind. Europa's
fractured ice surface visible below. Jupiter looms ahead, growing
as Europa approaches in its orbit, shrinking as it recedes.
Ice cracks sweep slowly beneath the camera.

---

## IMPLEMENTATION ORDER

1. Fix Orbit Mode camera path advancement (Bug 1)
2. Fix Orbit Insertion non-geosync orbital motion (Bug 2)
3. Verify and fix GeoSync synchronization (Bug 3)
4. Fix Chase mode camera position and angle (Bug 4)
5. Add "Surface speed" to Orbit Insertion HUD
6. Add "Chase Height" slider to Chase mode panel
7. Add "Orbital Speed" slider to Orbit mode panel
8. Smoke test all modes on Jupiter and all four Galilean moons

Commit after each bug fix:
`fix: orbit mode — surface sweeps beneath camera during orbit`
`fix: orbit insertion — camera advances along orbital path`
`fix: geosync — verify surface lock synchronization`
`fix: chase cam — position above and behind with surface visible`
`feat: orbital speed + chase height controls`

Final commit:
`fix: v3b complete — surface movement in all orbit camera modes`

---

## STYLE GUIDE REMINDER

All new UI controls use:
- Headings: Montserrat
- Body / data: Lato
- Primary Blue: #0077CC (active states)
- Light Blue Accent: #66B2FF (sliders, readouts)
- White: #FFFFFF (primary text)
- Light Gray: #D9D9D9 (secondary text)
- Dark Gray: #4D4D4D at 85% opacity (panel backgrounds)
- Space Black: #050510 (scene background)
