// AURORA CARGO — shot staging: each scene starts from a fresh seeded
// world (seed 20261126), plays the real rules forward through the
// autopilot, then places one fixed "hero moment" with constant values only
// (never Math.random), so every frame is deterministic.

import { createWorld, terrainHeight, fjordCenter } from './world.js';
import { SCREEN, SEED } from './config.js';

function stepAutopilot(world, seconds) {
  const steps = Math.round(seconds * 60);
  for (let i = 0; i < steps; i++) {
    if (world.state.screen !== 'play') break;
    world.step(1 / 60, world.autopilot());
  }
}

export function createShotWorld(name) {
  const world = createWorld(SEED);
  stageShot(name, world);
  return world;
}

export function stageShot(name, world) {
  const s = world.state;
  if (name === 'title') {
    // Title card over a living fjord: plane mid-flight, aurora overhead,
    // sunrise ahead, home strip glowing below.
    s.screen = SCREEN.title;
    s.x = 120;
    s.y = 36;
    s.z = fjordCenter(120) - 8;
    s.heading = 0.12;
    s.pitch = 0.02;
    s.speed = 55;
    s.throttle = 55;
    s.parked = false;
    return;
  }

  if (name === 'play') {
    // Eight seconds of real autopilot — mission 1 takes ~16 s to clear,
    // so the screen is still 'play' — then freeze the hero moment: the
    // plane about to thread the first gold ring between the ice cliffs,
    // settlement lights far ahead, full HUD.
    s.screen = SCREEN.play;
    stepAutopilot(world, 8);
    const ring = s.missionData.rings.find((r) => !r.collected) || s.missionData.rings[0];
    const fx = Math.cos(s.heading);
    const fz = Math.sin(s.heading);
    s.x = ring.x - fx * 46;
    s.y = ring.y;
    s.z = ring.z - fz * 46;
    s.heading = Math.atan2(ring.z - s.z, ring.x - s.x);
    s.pitch = 0.02;
    s.speed = 58;
    s.throttle = 62;
    s.fuel = 92;
    s.ice = 0;
    s.cargo = true;
    s.banner = 'THREAD THE GOLD RING';
    s.bannerUntil = 99;
    return;
  }

  if (name === 'action') {
    // The landing moment, mission 4's partial storm: skis out, low over
    // the glowing destination strip, snow in the air, last ring behind.
    world.nextMission();
    world.nextMission();
    world.nextMission();
    const n = world.state;
    n.screen = SCREEN.play;
    stepAutopilot(world, 12);
    const dest = n.missionData.dest;
    n.x = dest.x - 70;
    n.y = 5;
    n.z = dest.z;
    n.heading = 0;
    n.pitch = 0.1;
    n.speed = 34;
    n.throttle = 32;
    n.skis = true;
    n.cargo = true;
    n.fuel = 61;
    n.ice = 34;
    n.ringsCollected = 4;
    n.score = 200;
    n.banner = 'FLARE — SKIS DOWN';
    n.bannerUntil = 99;
    return;
  }

  if (name === 'win') {
    // Victory: all five freights home, plane parked on the destination
    // strip at dawn, aurora fading, fjord calm.
    for (let i = 0; i < 4; i++) world.nextMission();
    const w = world.state;
    w.screen = SCREEN.win;
    w.score = 2140;
    w.time = 612;
    w.fuel = 48;
    w.ringsCollected = 7;
    w.mission = 4;
    const dest = w.missionData.dest;
    w.x = dest.x + 10;
    w.y = 1.3;
    w.z = dest.z;
    w.heading = 0;
    w.pitch = 0;
    w.speed = 0;
    w.throttle = 0;
    w.skis = true;
    w.cargo = false;
    w.parked = true;
    return;
  }

  // Unknown scene name: fall back to the title.
  s.screen = SCREEN.title;
}
