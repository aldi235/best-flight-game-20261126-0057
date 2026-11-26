// Meridian Courier — shared tuning constants and world layout.
// One source of truth for speeds, fuel, scoring and the island map so the
// physics, missions and renderer can never disagree about the world.
export const WORLD = {
  size: 4200, // playable square, metres, centred on (0, 0)
  seaLevel: 0,
  maxAltitude: 900,
};

export const PLANE = {
  maxSpeed: 92, // m/s at full throttle
  cruiseSpeed: 58,
  minFlySpeed: 26, // below this the wing stalls
  accel: 14, // m/s^2 toward target speed
  climbRate: 16, // m/s at full climb, scaled by speed
  rollRate: 1.9, // rad/s at full stick
  pitchRate: 1.1,
  turnRate: 0.55, // rad/s at full bank
  fuelCapacity: 100,
  fuelBurn: 1.15, // % per second at full throttle
  fuelBurnIdle: 0.25,
};

export const SCORE = {
  ring: 250,
  landing: 500,
  perfectLanding: 400,
  delivery: 300,
};

export const BEST_KEY = 'meridian-courier-best';
export const STEP = 1 / 60;

// Island airstrips: name, centre, runway heading (deg), runway length (m).
export const AIRSTRIPS = [
  { id: 'home', name: 'Meridian Field', x: 0, z: 0, heading: 90, length: 320, width: 26 },
  { id: 'north', name: 'Cape Lark', x: 1150, z: -1250, heading: 30, length: 300, width: 24 },
  { id: 'west', name: 'Gull Rock', x: -1350, z: -650, heading: 150, length: 280, width: 24 },
  { id: 'south', name: 'Palm Cay', x: 650, z: 1350, heading: 200, length: 300, width: 24 },
  { id: 'east', name: 'Tern Bluff', x: 1500, z: 900, heading: 280, length: 280, width: 24 },
];

export const ISLANDS = [
  { x: 0, z: 0, radius: 620, peak: 68 },
  { x: 1150, z: -1250, radius: 520, peak: 130 },
  { x: -1350, z: -650, radius: 480, peak: 110 },
  { x: 650, z: 1350, radius: 540, peak: 85 },
  { x: 1500, z: 900, radius: 470, peak: 150 },
  { x: -700, z: 1250, radius: 300, peak: 60 }, // small uninhabited islet
  { x: 200, z: -1750, radius: 260, peak: 45 },
];

export function clamp(value, min, max) {
  return value < min ? min : value > max ? max : value;
}
export function lerp(a, b, t) {
  return a + (b - a) * t;
}
export function degToRad(deg) {
  return (deg * Math.PI) / 180;
}
export function radToDeg(rad) {
  return (rad * 180) / Math.PI;
}
export function wrapAngle(rad) {
  while (rad > Math.PI) rad -= Math.PI * 2;
  while (rad < -Math.PI) rad += Math.PI * 2;
  return rad;
}
