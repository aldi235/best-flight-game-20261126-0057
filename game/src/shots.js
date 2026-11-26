// Screenshot scenes behind ?shot=cover|ring|cockpit|landing. Each one plays
// the real rules forward from a fresh mission, steered by a simple autopilot
// (bank toward the next ring, climb toward its height, throttle up), so the
// frame is what a short sortie really looks like and is repeatable. When the
// staging ends the plane is levelled and the sim is frozen, so the screenshot
// is exactly the staged frame.
import { STEP } from './config.js';
import { bearingTo } from './flight.js';
import { missionById, nextObjective } from './missions.js';
import { SCREEN_OVER, SCREEN_PLAY } from './render.js';

/** Autopilot control toward the next objective: bank to the bearing, pitch to the height gap. */
export function autopilotControl(state, run) {
  const obj = nextObjective(run);
  const tx = obj.kind === 'ring' ? obj.ring.x : obj.strip.x;
  const tz = obj.kind === 'ring' ? obj.ring.z : obj.strip.z;
  const ty = obj.kind === 'ring' ? obj.ring.y : obj.strip.y + 60;
  const { bearing } = bearingTo(state, tx, tz);
  // Control convention (see flight.js): control.pitch -1 = nose up,
  // control.roll +1 = bank right (heading decreases). Bearing > 0 means the
  // target is to the left, so roll the other way.
  const roll = Math.max(-1, Math.min(1, -bearing * 2.2));
  const heightError = ty - state.y;
  const pitch = Math.max(-1, Math.min(1, -heightError / 90));
  const throttle = state.speed < 62 ? 1 : state.speed > 78 ? -1 : 0;
  return { pitch, roll, throttle };
}

/** Metres to the next objective, so staging can stop with the ring in sight. */
function distanceToObjective(state, run) {
  const obj = nextObjective(run);
  const tx = obj.kind === 'ring' ? obj.ring.x : obj.strip.x;
  const tz = obj.kind === 'ring' ? obj.ring.z : obj.strip.z;
  const ty = obj.kind === 'ring' ? obj.ring.y : obj.strip.y + 60;
  const dx = tx - state.x;
  const dy = ty - state.y;
  const dz = tz - state.z;
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

/**
 * Stage a named scene on a live game object (the one main.js owns) and return
 * the screen to show. The game keeps rendering afterwards but the sim is
 * frozen, so a staged shot is a real frame of a real sortie, held still.
 */
export function stageShot(name, game) {
  const missionId = name === 'landing' ? 'island-delivery' : 'ring-run';
  const mission = missionById(missionId);
  game.startMission(mission, { quiet: true });
  const run = game.run;
  const state = game.state;

  if (name === 'landing') {
    // Put the plane on the runway itself, rolling out after a good landing,
    // with the mission-complete panel over it: runway, plane and HUD all read.
    game.forceObjectiveToLanding();
    const end = game.endStrip;
    const heading = (end.heading * Math.PI) / 180;
    state.heading = heading;
    state.x = end.x;
    state.z = end.z;
    state.y = game.groundAt(state.x, state.z) + 2.4;
    state.pitch = 0;
    state.roll = 0;
    state.speed = 22;
    state.throttle = 0.25;
    state.airborne = false;
    state.onGround = true;
    // Plausible sortie numbers for the result panel (a real 3-minute flight).
    run.elapsed = 187;
    state.fuel = 62;
    game.setCamera('side');
    game.finishMissionAsComplete();
    // Slide the result panel to the left so the parked plane stays visible.
    document.getElementById('end-panel').classList.add('side-panel');
    return { screen: SCREEN_OVER };
  }

  // Fly the mission until the target number of rings is threaded and the next
  // ring is close enough to read in the frame, then level the wings and hold.
  const targetRings = name === 'ring' ? 2 : 1;
  const targetDistance = name === 'cockpit' ? 500 : 380;
  const maxSeconds = 60;
  let seconds = 0;
  const control = { pitch: 0, roll: 0, throttle: 1 };
  while (seconds < maxSeconds) {
    const auto = autopilotControl(state, run);
    control.pitch = state.speed > 26 ? auto.pitch : -1;
    control.roll = state.airborne ? auto.roll : 0;
    control.throttle = 1;
    game.stepOnce(control);
    seconds += STEP;
    if (game.screen !== SCREEN_PLAY) break;
    if (run.ringsPassed >= targetRings && distanceToObjective(state, run) < targetDistance) break;
  }
  // Level the wings for a readable frame, then freeze the sim.
  state.roll = 0;
  state.pitch = Math.max(-0.05, Math.min(0.08, state.pitch));
  game.frozen = true;
  if (name === 'cockpit') {
    game.setCamera('cockpit');
  } else {
    game.setCamera('chase');
  }
  return { screen: SCREEN_PLAY };
}
