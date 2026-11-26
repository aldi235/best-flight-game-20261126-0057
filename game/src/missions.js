// The three missions. Each one is a route of glowing rings and a landing
// strip, with its own fuel, wind and time limit, so every sortie asks for a
// different kind of flying.
import { AIRSTRIPS, degToRad } from './config.js';
import { groundHeight, stripPosition } from './terrain.js';

function stripById(id) {
  return AIRSTRIPS.find((strip) => strip.id === id);
}

function ring(x, z, altitude, radius, facingDeg) {
  return { x, z, y: groundHeight(x, z) + altitude, radius, facing: degToRad(facingDeg), passed: false };
}

export const MISSIONS = [
  {
    id: 'ring-run',
    name: 'Ring Run',
    tagline: 'Thread all 6 rings over the islands, then land home. Fast and clean wins.',
    brief: 'Six rings arc from Meridian Field to Cape Lark and back. Keep the throttle up, bank early, and mind the hills — the clock is running.',
    startStrip: 'home',
    endStrip: 'home',
    fuel: 100,
    timeLimit: 300,
    wind: { x: 2, z: 0 },
    rings: [
      ring(-400, -250, 120, 26, 238),
      ring(-900, -500, 140, 26, 243),
      ring(-1350, -650, 110, 24, 251),
      ring(-700, -1100, 150, 26, 125),
      ring(200, -1400, 160, 26, 109),
      ring(1150, -1250, 130, 24, 81),
    ],
  },
  {
    id: 'island-delivery',
    name: 'Island Delivery',
    tagline: 'Land at three airstrips in order, delivering cargo at each one.',
    brief: 'Cargo for Gull Rock, Palm Cay and Tern Bluff. Touch down on each strip in order — a gentle landing counts as a delivery. Fuel is tight, so fly direct.',
    startStrip: 'home',
    endStrip: 'east',
    fuel: 100,
    timeLimit: 600,
    wind: { x: -3, z: 2 },
    rings: [
      ring(-700, -350, 140, 28, 243),
      ring(-1350, -650, 110, 26, 246),
      ring(-350, 350, 150, 28, 45),
      ring(650, 1350, 110, 26, 45),
      ring(1100, 1150, 150, 28, 114),
      ring(1500, 900, 110, 26, 122),
    ],
    deliveries: ['west', 'south', 'east'],
  },
  {
    id: 'storm-landing',
    name: 'Storm Landing',
    tagline: 'Crosswind, low fuel, one runway: put her down on Cape Lark.',
    brief: 'A squall is blowing across Cape Lark and the tanks are nearly dry. Thread the two guide rings, crab into the crosswind and land slow and straight — or ditch trying.',
    startStrip: 'home',
    endStrip: 'north',
    fuel: 55,
    timeLimit: 360,
    wind: { x: 14, z: -6 },
    rings: [
      ring(-600, -600, 150, 28, 45),
      ring(300, -1100, 130, 26, 119),
    ],
  },
];

export function missionById(id) {
  return MISSIONS.find((mission) => mission.id === id) || MISSIONS[0];
}

export function startStripOf(mission) {
  return stripById(mission.startStrip);
}

export function endStripOf(mission) {
  return stripById(mission.endStrip);
}

/** Fresh per-sortie mission progress (rings are copied so replays stay clean). */
export function createMissionRun(mission) {
  return {
    mission,
    rings: mission.rings.map((r) => ({ ...r })),
    ringIndex: 0,
    ringsPassed: 0,
    deliveriesDone: 0,
    landed: false,
    elapsed: 0,
    score: 0,
    message: '',
    messageTimer: 0,
  };
}

/** The next objective: the ring to fly through, or the strip to land on. */
export function nextObjective(run) {
  const nextRing = run.rings.find((r) => !r.passed);
  if (nextRing) return { kind: 'ring', ring: nextRing, label: `Ring ${run.ringsPassed + 1} of ${run.rings.length}` };
  const end = endStripOf(run.mission);
  return { kind: 'land', strip: end, label: `Land at ${end.name}` };
}

/** Has the sortie reached its goal? Ring Run / Storm Landing end on a landing
 *  at the home/end strip; Delivery ends when every strip has been visited. */
export function missionComplete(run) {
  if (run.mission.deliveries) return run.deliveriesDone >= run.mission.deliveries.length;
  return run.landed;
}

export function stripWorldPosition(strip) {
  return stripPosition(strip);
}
