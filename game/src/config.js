// AURORA CARGO — shared constants. Every tunable number of the game lives
// here so world.js, render.js and shots.js all read the same truth.
// World units: 1 unit = 10 ft. Displayed ALT = y * 10 ft, SPD = speed * 3 kt,
// vertical speed shown as vy * 10 ft/s (so the 140 ft/s hard-landing limit
// is 14 world units/s in the physics).

export const STEP = 1 / 60;
export const FIELD_W = 960;
export const FIELD_H = 540;
export const SEED = 20261126;

// --- aircraft -------------------------------------------------------------
export const PLANE = {
  maxSpeed: 90, // world units/s at 100% throttle (~270 kt shown)
  minFlyThrottle: 35, // below this the plane sinks
  accel: 14, // units/s^2 spooling up
  decel: 20,
  turnRate: 0.55, // rad/s at full deflection
  pitchMax: 0.42, // rad, nose up/down
  liftSink: 6, // units/s sink when throttle is below minFlyThrottle
  climbBonus: 1.5, // units/s lift while powered
};

// --- fuel / ice / damage --------------------------------------------------
export const FUEL = {
  start: 100,
  drainBase: 0.8, // per second at idle
  drainFull: 1.5, // per second at 100% throttle
  lowWarn: 15,
  glideSeconds: 8, // seconds of gliding after fuel hits 0
  refuel: 50, // fuel restored by landing on a strip while gliding
};
export const ICE = {
  inCloudPerSec: 1.5,
  meltPerSec: 3, // below the cloud base
  sluggishAt: 60, // above this: turns 40% slower, top speed -20%
  stallAt: 100, // full stall: fast descent until ICE < 60
  stallSink: 22,
};
export const DAMAGE = {
  maxHits: 3,
  hardLandingVy: 14, // world units/s (~140 ft/s shown)
};

// --- scoring --------------------------------------------------------------
export const SCORE = {
  ring: 50,
  ringTimeBonus: 6, // seconds added per ring
  delivery: 200,
  missionBonus: 200,
  fuelBonusPerUnit: 2, // leftover fuel x 2 on mission clear
};

// --- the five missions ----------------------------------------------------
// destX grows down the fjord; ring count, clouds, wind and storm grow too.
export const MISSIONS = [
  { name: 'FIRST LIGHT', rings: 1, clouds: 0, wind: 0, storm: 0.0, destX: 600, time: 150 },
  { name: 'TWO FJORDS', rings: 3, clouds: 4, wind: 1.5, storm: 0.0, destX: 950, time: 170 },
  { name: 'THE AURORA RUN', rings: 5, clouds: 6, wind: 3, storm: 0.25, destX: 1300, time: 190 },
  { name: 'WHITE OUT', rings: 5, clouds: 8, wind: 5, storm: 0.6, destX: 1500, time: 200 },
  { name: 'STORM FREIGHT', rings: 7, clouds: 10, wind: 8, storm: 1.0, destX: 1700, time: 220 },
];

export const RING_RADIUS = 12;
export const STRIP = { homeLen: 140, destLen: 140, destLenLast: 100, width: 24 };

// --- palette: one bright arctic-dawn style --------------------------------
export const PALETTE = {
  skyTop: 0x6fa8dc,
  skyMid: 0xf2a0a0,
  skyBot: 0x2c4a6b,
  fog: 0xd8e6f2,
  auroraGreen: 0x7dff9a,
  auroraTeal: 0x5fe8c8,
  auroraViolet: 0x9a8cff,
  snow: 0xf4f8ff,
  rock: 0x5a7a9c,
  water: 0x1e4a6b,
  planeOrange: 0xe8632c,
  planeWhite: 0xf8f4ec,
  ringGold: 0xffd97a,
  townLight: 0xffb347,
  hudPanel: 'rgba(10,18,38,0.72)',
  hudText: '#ffe9b0',
  hudDim: '#bcd6f5',
};

// --- screens ---------------------------------------------------------------
export const SCREEN = {
  title: 'title',
  play: 'play',
  pause: 'pause',
  missionClear: 'missionclear',
  win: 'win',
  end: 'end',
};
