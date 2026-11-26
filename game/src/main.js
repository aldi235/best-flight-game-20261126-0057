// Boot and the one loop: input is read every frame, the flight model advances
// in fixed 1/60 s steps, and the renderer paints what is there. Screens:
// menu, play, paused, over (mission complete / crashed / out of time).
//
// ?shot=cover|ring|cockpit|landing stages that scene instead of the menu,
// paints it and sets window.__shotReady for a screenshot.
import { BEST_KEY, PLANE, STEP, clamp } from './config.js';
import { createInput, ACTION_CAMERA, ACTION_CONFIRM, ACTION_MUTE, ACTION_PAUSE, ACTION_RESTART } from './input.js';
import { createAudio } from './audio.js';
import { createRenderer, SCREEN_OVER, SCREEN_PAUSED, SCREEN_PLAY, SCREEN_TITLE } from './render.js';
import { groundHeight } from './terrain.js';
import {
  EVENT_CRASHED, EVENT_DELIVERED, EVENT_FUEL_EMPTY, EVENT_LANDED, EVENT_RING,
  createFlightState, landingScore, ringScore, stepFlight,
} from './flight.js';
import {
  MISSIONS, createMissionRun, endStripOf, missionById, missionComplete,
  nextObjective, startStripOf,
} from './missions.js';
import { createHud } from './hud.js';
import { autopilotControl, stageShot } from './shots.js';

const MAX_FRAME = 0.25;
const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');

const app = document.getElementById('app');
const statusEl = document.getElementById('status');
const menuEl = document.getElementById('menu');
const missionListEl = document.getElementById('mission-list');
const menuBestEl = document.getElementById('menu-best');
const pauseEl = document.getElementById('pause-panel');
const endEl = document.getElementById('end-panel');
const endTitleEl = document.getElementById('end-title');
const endLinesEl = document.getElementById('end-lines');
const endScoreEl = document.getElementById('end-score');
const helpEl = document.getElementById('help-panel');

const renderer = createRenderer(app);
const hud = createHud();
const input = createInput(renderer.renderer.domElement);
const audio = createAudio();

function readBest() {
  try {
    return Number.parseInt(window.localStorage.getItem(BEST_KEY) ?? '0', 10) || 0;
  } catch {
    return 0;
  }
}
function saveBest(value) {
  try {
    window.localStorage.setItem(BEST_KEY, String(value));
  } catch {
    // Storage can be off: the best score then lasts this visit only.
  }
}

const game = {
  screen: SCREEN_TITLE,
  state: null,
  run: null,
  rings: null,
  cameraMode: 'chase',
  frozen: false, // screenshot staging holds the sim still after staging
  best: readBest(),
  endReason: '',
  time: 0,
};

function announce(message) {
  statusEl.textContent = message;
}

function showOnly(element) {
  for (const el of [menuEl, pauseEl, endEl, helpEl]) el.classList.toggle('hidden', el !== element);
  if (!element) {
    for (const el of [menuEl, pauseEl, endEl, helpEl]) el.classList.add('hidden');
  }
}

function buildMenu() {
  missionListEl.innerHTML = '';
  for (const mission of MISSIONS) {
    const card = document.createElement('button');
    card.className = 'mission-card';
    card.type = 'button';
    card.innerHTML =
      `<span class="mission-name">${mission.name}</span>` +
      `<span class="mission-tag">${mission.tagline}</span>` +
      `<span class="mission-meta">Fuel ${mission.fuel}% · ${Math.floor(mission.timeLimit / 60)}:${String(mission.timeLimit % 60).padStart(2, '0')} limit · ${mission.rings.length} rings</span>`;
    card.addEventListener('click', () => {
      audio.unlock();
      audio.blip();
      game.startMission(mission);
    });
    missionListEl.appendChild(card);
  }
  menuBestEl.textContent = game.best > 0 ? `Best score: ${game.best}` : 'No sorties flown yet — the sky is yours.';
}

game.startMission = function startMission(mission, opts = {}) {
  const run = createMissionRun(mission);
  const strip = startStripOf(mission);
  const state = createFlightState(strip);
  state.fuel = mission.fuel;
  game.state = state;
  game.run = run;
  game.endStrip = endStripOf(mission);
  game.rings = renderer.setRings(run.rings);
  game.screen = SCREEN_PLAY;
  game.endReason = '';
  game.frozen = false;
  game.cameraMode = 'chase';
  hud.setCameraMode('chase');
  hud.show(true);
  showOnly(null);
  document.getElementById('end-panel').classList.remove('side-panel');
  if (!opts.quiet) announce(`${mission.name}. ${mission.brief}`);
  run.message = mission.brief;
  run.messageTimer = 6;
  updateObjective();
  return game;
};

function updateObjective() {
  const run = game.run;
  if (!run) return;
  const obj = nextObjective(run);
  run.objective = obj;
  run.objectiveLabel = obj.kind === 'ring'
    ? `◉ ${obj.label} — then land at ${endStripOf(run.mission).name}`
    : `🛬 ${obj.label}`;
  if (game.rings) game.rings.highlight(run.rings.findIndex((r) => !r.passed));
}

game.setCamera = function setCamera(mode) {
  game.cameraMode = mode;
  hud.setCameraMode(mode);
};

game.groundAt = function groundAt(x, z) {
  return groundHeight(x, z);
};

/** Shot staging helper: mark every ring passed and every delivery done. */
game.forceObjectiveToLanding = function forceObjectiveToLanding() {
  const run = game.run;
  run.rings.forEach((r) => { r.passed = true; });
  run.ringsPassed = run.rings.length;
  run.deliveriesDone = run.mission.deliveries ? run.mission.deliveries.length : 0;
  run.score += 1850;
  updateObjective();
};

/** Shot staging helper: end the sortie as a completed mission. */
game.finishMissionAsComplete = function finishMissionAsComplete() {
  endSortie(true, 'Mission complete — cargo delivered, plane in one piece.');
};

game.stepOnce = function stepOnce(control) {
  const state = game.state;
  const run = game.run;
  if (!state || !run) return;
  const wind = run.mission.wind;
  const events = stepFlight(state, control, STEP, run.rings, (index) => {
    run.ringsPassed += 1;
    const gained = ringScore(state);
    run.score += gained;
    run.message = `Ring ${index + 1} threaded! +${gained}`;
    run.messageTimer = 2.5;
    audio.ring();
    updateObjective();
  }, wind);

  run.elapsed += STEP;
  if (run.messageTimer > 0) {
    run.messageTimer -= STEP;
    if (run.messageTimer <= 0) run.message = '';
  }

  if (events & EVENT_RING) {
    // Score and sound handled in the onRing callback above.
  }
  if (events & EVENT_FUEL_EMPTY) {
    run.message = 'Fuel empty! Glide to the nearest runway.';
    run.messageTimer = 4;
  }
  if (events & EVENT_LANDED) {
    const aligned = Boolean(events & EVENT_DELIVERED);
    const gained = landingScore(state, aligned);
    run.score += gained;
    audio.touchdown(state.verticalSpeed < -7);
    if (run.mission.deliveries) {
      const stripId = nearestStripId(state);
      const nextDelivery = run.mission.deliveries[run.deliveriesDone];
      if (stripId === nextDelivery) {
        run.deliveriesDone += 1;
        run.score += 300;
        state.fuel = Math.min(PLANE.fuelCapacity, state.fuel + 25);
        run.message = `Cargo delivered at ${stripId}! +300 · refuelled +25%`;
        run.messageTimer = 4;
        audio.fanfare();
        updateObjective();
        if (missionComplete(run)) {
          endSortie(true, 'All deliveries made — the islands are stocked.');
          return;
        }
      } else {
        run.message = `Landed +${gained}. Next delivery: ${nextDelivery}.`;
        run.messageTimer = 3;
      }
    } else {
      const ringsDone = run.rings.every((r) => r.passed);
      if (ringsDone) {
        run.message = `Landed +${gained}.`;
        run.messageTimer = 3;
        run.landed = true;
        if (missionComplete(run)) {
          endSortie(true, 'Mission complete — rings threaded, wheels down safe.');
          return;
        }
      } else {
        // Touching down early is fine — score it, but the sortie is not over
        // until every ring is threaded. The pilot can take off again.
        const remaining = run.rings.filter((r) => !r.passed).length;
        run.message = `Landed +${gained} — ${remaining} ring${remaining === 1 ? '' : 's'} still to go. Take off again!`;
        run.messageTimer = 4;
      }
    }
  }
  if (events & EVENT_CRASHED) {
    audio.crash();
    endSortie(false, crashCause(state));
    return;
  }
  if (run.elapsed >= run.mission.timeLimit) {
    endSortie(false, 'Out of time — the cargo window closed.');
    return;
  }
  audio.engine(state.throttle, state.speed, state.engineOn);
  audio.alarm(STEP, state.stalled || (!state.engineOn && state.airborne) || state.fuel < 15);
};

function nearestStripId(state) {
  let best = null;
  let bestDist = Infinity;
  // Every strip is a start or an end strip of some mission.
  const candidates = [];
  for (const mission of MISSIONS) {
    candidates.push(startStripOf(mission), endStripOf(mission));
  }
  for (const strip of candidates) {
    const dx = state.x - strip.x;
    const dz = state.z - strip.z;
    const dist = Math.sqrt(dx * dx + dz * dz);
    if (dist < bestDist) {
      bestDist = dist;
      best = strip;
    }
  }
  return bestDist < 200 ? best.id : null;
}

function crashCause(state) {
  if (state.damage >= 100) return 'Airframe broke apart — too much damage.';
  if (state.y - groundHeight(state.x, state.z) <= 3 && state.speed > 40) return 'Crashed into the terrain.';
  if (groundHeight(state.x, state.z) <= 1) return 'Ditched in the sea.';
  return 'Crashed — the landing was too hard.';
}

function endSortie(success, reason) {
  const run = game.run;
  game.endReason = reason;
  if (success) {
    const fuelBonus = Math.round(game.state.fuel * 2);
    const timeBonus = Math.max(0, Math.round((run.mission.timeLimit - run.elapsed) * 2));
    run.score += fuelBonus + timeBonus;
    audio.fanfare();
  }
  if (run.score > game.best) {
    game.best = run.score;
    saveBest(run.score);
  }
  game.screen = SCREEN_OVER;
  hud.show(false);
  endTitleEl.textContent = success ? '✈ Mission Complete' : '💥 Sortie Failed';
  endTitleEl.style.color = success ? '#37d67a' : '#ff534b';
  endLinesEl.innerHTML =
    `<div>${reason}</div>` +
    `<div>Rings threaded: ${run.ringsPassed} / ${run.rings.length}</div>` +
    `<div>Time: ${Math.floor(run.elapsed / 60)}:${String(Math.floor(run.elapsed % 60)).padStart(2, '0')} · Fuel left: ${Math.round(game.state.fuel)}% · Damage: ${Math.round(game.state.damage)}%</div>` +
    (success ? `<div>Fuel bonus +${Math.round(game.state.fuel * 2)} · Time bonus included</div>` : '');
  endScoreEl.textContent = `Score ${run.score} · Best ${game.best}`;
  showOnly(endEl);
  announce(`${success ? 'Mission complete' : 'Sortie failed'}. Score ${run.score}. ${reason}`);
}

function handleActions() {
  const actions = input.takeActions();
  if (actions & ACTION_MUTE) {
    const muted = audio.toggleMute();
    announce(muted ? 'Sound off.' : 'Sound on.');
  }
  if (game.screen === SCREEN_TITLE) {
    if (actions & ACTION_CONFIRM) {
      const first = MISSIONS[0];
      audio.unlock();
      game.startMission(first);
    }
    return;
  }
  if (game.screen === SCREEN_PLAY) {
    if (actions & ACTION_PAUSE) {
      game.screen = SCREEN_PAUSED;
      showOnly(pauseEl);
      announce('Paused.');
    } else if (actions & ACTION_CAMERA) {
      game.setCamera(game.cameraMode === 'chase' ? 'cockpit' : 'chase');
      audio.blip();
    } else if (actions & ACTION_RESTART) {
      game.startMission(game.run.mission);
    }
    return;
  }
  if (game.screen === SCREEN_PAUSED) {
    if (actions & ACTION_PAUSE || actions & ACTION_CONFIRM) {
      game.screen = SCREEN_PLAY;
      showOnly(null);
      announce('Flying.');
    } else if (actions & ACTION_RESTART) {
      game.startMission(game.run.mission);
    }
    return;
  }
  if (game.screen === SCREEN_OVER) {
    if (actions & ACTION_CONFIRM || actions & ACTION_RESTART) {
      game.startMission(game.run.mission);
    }
  }
}

function readControl() {
  return {
    pitch: input.pitch(),
    roll: input.roll(),
    throttle: input.throttle(),
  };
}

function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min((now - last) / 1000, MAX_FRAME);
  last = now;
  game.time += dt;
  handleActions();
  if (game.screen === SCREEN_PLAY && !game.frozen) {
    accumulator += dt;
    while (accumulator >= STEP) {
      game.stepOnce(readControl());
      accumulator -= STEP;
      if (game.screen !== SCREEN_PLAY) {
        accumulator = 0;
        break;
      }
    }
    input.decayLook(0.9);
  } else {
    accumulator = 0;
  }
  if (game.state) {
    hud.update(game.state, game.run, game.screen);
    renderer.draw(game.state, game.run, game.cameraMode, input.look(), game.time, dt);
  }
  if (shotMode && !shotReady) {
    painted += 1;
    if (painted >= 3) {
      shotReady = true;
      window.__shotReady = true;
    }
  }
}

let last = performance.now();
let accumulator = 0;
let shotMode = false;
let shotReady = false;
let painted = 0;

// Menu buttons.
document.getElementById('btn-help').addEventListener('click', () => {
  audio.unlock();
  showOnly(helpEl);
});
document.getElementById('btn-help-close').addEventListener('click', () => showOnly(menuEl));
document.getElementById('btn-resume').addEventListener('click', () => {
  game.screen = SCREEN_PLAY;
  showOnly(null);
});
document.getElementById('btn-pause-restart').addEventListener('click', () => {
  game.startMission(game.run.mission);
});
document.getElementById('btn-pause-menu').addEventListener('click', () => {
  game.screen = SCREEN_TITLE;
  hud.show(false);
  buildMenu();
  showOnly(menuEl);
});
document.getElementById('btn-again').addEventListener('click', () => {
  game.startMission(game.run.mission);
});
document.getElementById('btn-end-menu').addEventListener('click', () => {
  game.screen = SCREEN_TITLE;
  hud.show(false);
  buildMenu();
  showOnly(menuEl);
});
document.getElementById('btn-mute').addEventListener('click', (event) => {
  const muted = audio.toggleMute();
  event.currentTarget.textContent = muted ? '🔇 Sound off' : '🔊 Sound on';
});
// Number keys 1-3 pick a mission from the menu.
window.addEventListener('keydown', (event) => {
  if (game.screen !== SCREEN_TITLE) return;
  const index = ['Digit1', 'Digit2', 'Digit3'].indexOf(event.code);
  if (index >= 0) {
    audio.unlock();
    game.startMission(MISSIONS[index]);
  }
});

// Expose live state for play-testing and screenshots.
window.__game = game;
window.__missions = MISSIONS;
window.__camera = renderer.camera;

if (shot) {
  shotMode = true;
  buildMenu();
  game.startMission(missionById('ring-run'), { quiet: true });
  const scene = stageShot(shot, game);
  game.screen = scene.screen;
  if (scene.screen === SCREEN_OVER) {
    // End panel is already shown by finishMissionAsComplete; keep rendering behind it.
  } else {
    hud.show(true);
    showOnly(null);
  }
  announce(`Screenshot scene: ${shot}.`);
} else {
  buildMenu();
  showOnly(menuEl);
  announce('Meridian Courier. Pick a mission, or press 1, 2 or 3.');
}

document.addEventListener('visibilitychange', () => {
  if (document.hidden && game.screen === SCREEN_PLAY) {
    game.screen = SCREEN_PAUSED;
    showOnly(pauseEl);
    announce('Paused.');
  }
});

requestAnimationFrame(frame);
