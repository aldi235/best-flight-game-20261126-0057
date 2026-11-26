// Flight physics: throttle, lift, drag, stall, banking turns, fuel burn,
// ground and water collision, ring threading and runway landings. Pure state
// in, events out — no drawing and no browser in here.
import { AIRSTRIPS, PLANE, SCORE, WORLD, clamp, degToRad, lerp, radToDeg, wrapAngle } from './config.js';
import { groundHeight } from './terrain.js';

export const EVENT_NONE = 0;
export const EVENT_RING = 1;
export const EVENT_LANDED = 2;
export const EVENT_CRASHED = 4;
export const EVENT_DELIVERED = 8;
export const EVENT_FUEL_EMPTY = 16;
export const EVENT_STALL = 32;

const MAX_BANK = 0.9; // rad
const MAX_PITCH = 0.55; // rad
const TAKEOFF_SPEED = 26;

/** Fresh flight state, parked on the given airstrip, nose down the runway. */
export function createFlightState(strip) {
  const heading = degToRad(strip.heading);
  return {
    x: strip.x,
    y: groundHeight(strip.x, strip.z) + 2.4,
    z: strip.z,
    heading,
    pitch: 0,
    roll: 0,
    speed: 0,
    throttle: 0,
    fuel: PLANE.fuelCapacity,
    damage: 0,
    verticalSpeed: 0,
    stalled: false,
    onGround: true,
    airborne: false,
    airborneSince: 0, // sim time the wheels last left the ground
    engineOn: true,
    time: 0,
  };
}

/** Horizontal distance and bearing from the plane to a point. */
export function bearingTo(state, x, z) {
  const dx = x - state.x;
  const dz = z - state.z;
  const distance = Math.sqrt(dx * dx + dz * dz);
  // Forward is (-sin h, -cos h); bearing 0 means straight ahead.
  const bearing = wrapAngle(Math.atan2(-dx, -dz) - state.heading);
  return { distance, bearing };
}

function nearestStrip(state) {
  let best = null;
  let bestDist = Infinity;
  for (const strip of AIRSTRIPS) {
    const dx = state.x - strip.x;
    const dz = state.z - strip.z;
    const dist = Math.sqrt(dx * dx + dz * dz);
    if (dist < bestDist) {
      bestDist = dist;
      best = strip;
    }
  }
  return { strip: best, distance: bestDist };
}

/**
 * Advance the flight model one fixed step. `control` is { pitch, roll, throttle }
 * in -1..1. `rings` is the mission's ring list (may be null) and `onRing` is
 * called with the ring index when one is threaded. Returns EVENT_* flags.
 */
export function stepFlight(state, control, dt, rings, onRing, wind) {
  let events = EVENT_NONE;
  state.time += dt;
  const w = wind || { x: 0, z: 0 };

  // Throttle: the lever moves at a fixed rate; the engine dies when fuel is gone.
  state.throttle = clamp(state.throttle + control.throttle * dt * 0.7, 0, 1);
  if (state.fuel <= 0 && state.engineOn) {
    state.engineOn = false;
    events |= EVENT_FUEL_EMPTY;
  }
  if (state.engineOn) {
    state.fuel = Math.max(0, state.fuel - (PLANE.fuelBurnIdle + (PLANE.fuelBurn - PLANE.fuelBurnIdle) * state.throttle) * dt);
  }

  // Speed chases the throttle's target; drag bites harder the faster you fly.
  const targetSpeed = state.engineOn ? state.throttle * PLANE.maxSpeed : 0;
  const drag = 1 + Math.max(0, state.speed - PLANE.cruiseSpeed) * 0.012;
  state.speed += clamp(targetSpeed - state.speed, -PLANE.accel * drag * dt, PLANE.accel * dt);
  if (state.speed < 0) state.speed = 0;

  // Attitude: the stick banks and pitches toward its target; the nose follows.
  const targetRoll = -control.roll * MAX_BANK;
  const targetPitch = -control.pitch * MAX_PITCH;
  state.roll = lerp(state.roll, targetRoll, Math.min(1, dt * 4));
  state.pitch = lerp(state.pitch, targetPitch, Math.min(1, dt * 3));

  // A banked wing turns the plane; the turn tightens with speed.
  const speedFactor = clamp(state.speed / PLANE.cruiseSpeed, 0.25, 1.4);
  state.heading = wrapAngle(state.heading + state.roll * PLANE.turnRate * speedFactor * dt);

  // Takeoff: fast enough on the ground with the nose up and the wheels leave
  // the runway. This runs before the climb is computed, so a rotating plane
  // gains altitude in the same step instead of being bounced back down.
  const ground = groundHeight(state.x, state.z);
  if (state.onGround) {
    state.y = ground + 2.4;
    if (state.speed > TAKEOFF_SPEED && state.pitch > 0.08) {
      state.onGround = false;
      state.airborne = true;
      state.airborneSince = state.time;
    }
  }

  // Stall: below flying speed the wing quits, the nose drops and the plane sinks.
  state.stalled = state.airborne && state.speed < PLANE.minFlySpeed;
  if (state.stalled) {
    events |= EVENT_STALL;
    state.pitch = lerp(state.pitch, -0.25, Math.min(1, dt * 2));
  }

  // Climb: pitch converts speed into altitude; a stalled wing converts it into a sink.
  const climbPower = state.stalled ? -1 : 1;
  const vertical = state.airborne
    ? Math.sin(state.pitch) * state.speed * 1.0 * climbPower - (state.stalled ? 9 : 0)
    : 0;
  state.verticalSpeed = vertical;

  // Move: forward along heading and pitch, plus the wind's push.
  const cosPitch = Math.cos(state.pitch);
  const forwardX = -Math.sin(state.heading) * cosPitch;
  const forwardZ = -Math.cos(state.heading) * cosPitch;
  state.x += (forwardX * state.speed + w.x) * dt;
  state.z += (forwardZ * state.speed + w.z) * dt;
  state.y += vertical * dt;

  // World edge: turn the plane gently back toward the islands.
  const edge = WORLD.size / 2;
  if (Math.abs(state.x) > edge || Math.abs(state.z) > edge) {
    const home = Math.atan2(-state.x, -state.z);
    state.heading = wrapAngle(state.heading + wrapAngle(home - state.heading) * Math.min(1, dt * 2));
  }
  state.y = Math.min(state.y, WORLD.maxAltitude);

  // Rings: thread the glowing hoop and it turns green.
  if (rings) {
    for (let i = 0; i < rings.length; i += 1) {
      const ring = rings[i];
      if (ring.passed) continue;
      const dx = state.x - ring.x;
      const dy = state.y - ring.y;
      const dz = state.z - ring.z;
      const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
      if (dist < ring.radius + 6) {
        ring.passed = true;
        events |= EVENT_RING;
        if (onRing) onRing(i);
      }
    }
  }

  // Ground contact (ground re-read at the new position).
  const groundNow = groundHeight(state.x, state.z);
  if (state.y <= groundNow + 2.4) {
    const { strip, distance } = nearestStrip(state);
    const onRunway = strip && distance < strip.length / 2 + 10;
    const along = strip
      ? Math.abs(Math.sin(degToRad(strip.heading)) * (state.x - strip.x) + Math.cos(degToRad(strip.heading)) * (state.z - strip.z))
      : Infinity;
    const across = strip
      ? Math.abs(Math.cos(degToRad(strip.heading)) * (state.x - strip.x) - Math.sin(degToRad(strip.heading)) * (state.z - strip.z))
      : Infinity;
    const aligned = strip && Math.abs(wrapAngle(state.heading - degToRad(strip.heading))) < 0.45;
    if (state.airborne && onRunway && along < strip.length / 2 && across < strip.width / 2 + 4) {
      // A wheels-touch inside two seconds of liftoff is a bounce, not a
      // landing: settle back onto the runway with no score and no damage.
      // The pitch is kept, so the next rotation lifts off properly.
      if (state.time - state.airborneSince < 2) {
        state.y = groundNow + 2.4;
        state.onGround = true;
        state.airborne = false;
        state.roll *= 0.4;
      } else {
        // Landing on a runway: hard touchdowns damage the airframe.
      const hard = state.verticalSpeed < -7 || state.speed > 75 || Math.abs(state.roll) > 0.45;
      const veryHard = state.verticalSpeed < -12 || state.speed > 88;
      state.y = groundNow + 2.4;
      state.onGround = true;
      state.airborne = false;
      state.pitch = 0;
      state.roll *= 0.4;
      state.speed *= 0.82;
      if (veryHard) {
        state.damage = Math.min(100, state.damage + 55);
        events |= EVENT_CRASHED;
      } else {
        if (hard) state.damage = Math.min(100, state.damage + 18);
        events |= EVENT_LANDED;
        if (aligned) events |= EVENT_DELIVERED;
      }
      }
    } else if (state.airborne) {
      // Terrain or water: a crash, unless it is a gentle ditching on flat sand.
      state.y = groundNow + 2.4;
      events |= EVENT_CRASHED;
    } else {
      state.y = groundNow + 2.4;
    }
    if (state.onGround) {
      // Light rolling resistance; braking only when the throttle is near idle.
      state.speed = Math.max(0, state.speed - 3 * dt);
      if (state.throttle < 0.15) state.speed = Math.max(0, state.speed - 14 * dt);
      // Running off an island into the sea at speed is a ditching, not a taxi.
      if (groundNow <= 1 && state.speed > 25) events |= EVENT_CRASHED;
    }
  }

  // Damage over 100% is a structural failure.
  if (state.damage >= 100) events |= EVENT_CRASHED;
  return events;
}

/** Score for threading a ring: base plus a bonus for keeping speed up. */
export function ringScore(state) {
  return SCORE.ring + Math.round(clamp(state.speed / PLANE.maxSpeed, 0, 1) * 80);
}

/** Score for a landing: base, plus a gentle-touchdown bonus, minus damage. */
export function landingScore(state, aligned) {
  let score = SCORE.landing;
  if (Math.abs(state.verticalSpeed) < 4 && state.speed < 55) score += SCORE.perfectLanding;
  if (aligned) score += SCORE.delivery;
  return Math.max(50, score - Math.round(state.damage));
}

export function hudNumbers(state) {
  return {
    altitude: Math.max(0, Math.round((state.y - groundHeight(state.x, state.z)) * 3.281)),
    speedKnots: Math.round(state.speed * 1.944),
    headingDeg: Math.round((radToDeg(wrapAngle(state.heading)) + 360) % 360),
    verticalFpm: Math.round(state.verticalSpeed * 196.85),
    fuel: Math.round(state.fuel),
    throttle: Math.round(state.throttle * 100),
    damage: Math.round(state.damage),
  };
}
