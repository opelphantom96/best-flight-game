// AURORA CARGO — world: one state object + one step() holding every rule.
// 3D flight over an arctic fjord: rings, cargo pickup, ice-strip landings,
// icing in clouds, storm wind, fuel, damage. Pure logic, no rendering here.

import { STEP, PLANE, FUEL, ICE, DAMAGE, SCORE, MISSIONS, RING_RADIUS, STRIP, SCREEN } from './config.js';

export { STEP, SCREEN };

/** Seeded RNG (mulberry32) — every spawn replays exactly from a seed. */
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// --- deterministic value noise (for the terrain, shared with render) -------
function hash2(ix, iz) {
  const s = Math.sin(ix * 127.1 + iz * 311.7) * 43758.5453;
  return s - Math.floor(s);
}
export function noise2(x, z) {
  const ix = Math.floor(x);
  const iz = Math.floor(z);
  const fx = x - ix;
  const fz = z - iz;
  const sx = fx * fx * (3 - 2 * fx);
  const sz = fz * fz * (3 - 2 * fz);
  const a = hash2(ix, iz);
  const b = hash2(ix + 1, iz);
  const c = hash2(ix, iz + 1);
  const d = hash2(ix + 1, iz + 1);
  return (a + (b - a) * sx + (c - a) * sz + (a - b - c + d) * sx * sz) * 2 - 1;
}

/** The fjord's centreline meanders gently down the x axis. */
export function fjordCenter(x) {
  return 40 * Math.sin(x * 0.0012);
}

/**
 * Terrain height at (x, z). Water channel at -2 (below the water plane at
 * y=0), banks rising to cliffs of ~76, plateau beyond with rolling hills.
 * Strips sit on the frozen channel, so their ground is water level.
 */
export function terrainHeight(x, z) {
  const d = Math.abs(z - fjordCenter(x));
  const n = noise2(x * 0.008, z * 0.008);
  if (d < 55) return -2;
  if (d < 170) {
    const t = (d - 55) / 115;
    return -2 + t * t * 78 + n * 6 * t;
  }
  return 76 + n * 14 + 10 * Math.sin(x * 0.004 + 1.7);
}

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
const wrapAngle = (a) => {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
};
const dist3 = (ax, ay, az, bx, by, bz) =>
  Math.hypot(ax - bx, ay - by, az - bz);

function buildMission(seed, index) {
  const m = MISSIONS[index];
  const rng = mulberry32(seed + index * 977 + 13);
  const destZ = fjordCenter(m.destX);
  const home = { x: 0, z: fjordCenter(0), len: STRIP.homeLen, w: STRIP.width };
  const destLen = index === MISSIONS.length - 1 ? STRIP.destLenLast : STRIP.destLen;
  const dest = { x: m.destX, z: destZ, len: destLen, w: STRIP.width };
  const rings = [];
  for (let i = 0; i < m.rings; i++) {
    const fx = 140 + ((m.destX - 260) * (i + 0.5)) / m.rings;
    const x = fx + (rng() - 0.5) * 60;
    rings.push({
      x,
      y: 26 + rng() * 16,
      z: fjordCenter(x) + (rng() - 0.5) * 50,
      r: RING_RADIUS,
      collected: false,
    });
  }
  const clouds = [];
  for (let i = 0; i < m.clouds; i++) {
    const x = 150 + rng() * (m.destX - 200);
    clouds.push({
      x,
      y: 48 + rng() * 12,
      z: fjordCenter(x) + (rng() - 0.5) * 240,
      r: 22 + rng() * 9,
    });
  }
  // A small lit settlement on the bank, far enough to read in screenshots.
  const town = [];
  for (let i = 0; i < 12; i++) {
    const x = 250 + rng() * 900;
    const side = rng() > 0.5 ? 1 : -1;
    town.push({
      x,
      z: fjordCenter(x) + side * (120 + rng() * 60),
      w: 8 + rng() * 8,
      h: 5 + rng() * 7,
      d: 8 + rng() * 8,
    });
  }
  return { def: m, home, dest, rings, clouds, town };
}

export function createWorld(seed) {
  const world = {
    seed,
    state: null,
    events: [],

    reset() {
      const s = {
        screen: SCREEN.title,
        time: 0,
        mission: 0, // index into MISSIONS
        score: 0,
        best: 0,
        fuel: FUEL.start,
        ice: 0,
        damage: 0,
        throttle: 0,
        speed: 0,
        heading: 0,
        pitch: 0,
        roll: 0,
        vy: 0,
        x: -40,
        y: 1.3,
        z: 0,
        skis: false,
        cargo: false,
        ringsCollected: 0,
        timeLeft: MISSIONS[0].time,
        glideLeft: FUEL.glideSeconds,
        gliding: false,
        stalled: false,
        storm: 0,
        wind: 0,
        banner: '',
        bannerUntil: 0,
        shake: 0,
        flash: 0,
        endReason: '',
        stats: null,
        parked: false,
        particles: [],
        floaters: [],
        missionData: buildMission(seed, 0),
      };
      s.storm = s.missionData.def.storm;
      s.wind = s.missionData.def.wind;
      world.state = s;
      world.events = [];
      world._apCache = null;
      world._apCalls = 0;
      return s;
    },

    startGame() {
      const s = world.reset();
      s.screen = SCREEN.play;
      s.best = world.best || 0;
      return s;
    },

    nextMission() {
      const s = world.state;
      const next = s.mission + 1;
      const keepScore = s.score;
      const keepBest = s.best;
      world.reset();
      const n = world.state;
      n.screen = SCREEN.play;
      n.score = keepScore;
      n.best = keepBest;
      n.mission = next;
      n.missionData = buildMission(world.seed, next);
      n.storm = n.missionData.def.storm;
      n.wind = n.missionData.def.wind;
      n.timeLeft = n.missionData.def.time;
      n.banner = 'MISSION ' + (next + 1) + ' — ' + n.missionData.def.name;
      n.bannerUntil = 4;
      return n;
    },

    resetMission() {
      const s = world.state;
      const keepScore = s.score;
      const keepBest = s.best;
      const keepMission = s.mission;
      world.reset();
      const n = world.state;
      n.screen = SCREEN.play;
      n.score = keepScore;
      n.best = keepBest;
      n.mission = keepMission;
      n.missionData = buildMission(world.seed, keepMission);
      n.storm = n.missionData.def.storm;
      n.wind = n.missionData.def.wind;
      n.timeLeft = n.missionData.def.time;
      return n;
    },

    setSkis(out) {
      world.state.skis = !!out;
    },

    /** Point the world at a new seed (harness benchmark runs). */
    reseed(newSeed) {
      world.seed = newSeed;
      world.reset();
    },

    // -- helpers -----------------------------------------------------------
    onStrip(strip) {
      const s = world.state;
      return (
        Math.abs(s.x - strip.x) < strip.len / 2 &&
        Math.abs(s.z - strip.z) < strip.w / 2
      );
    },

    addFloater(text, color) {
      const s = world.state;
      s.floaters.push({ text, color: color || '#ffe9b0', t: 0 });
      if (s.floaters.length > 6) s.floaters.shift();
    },

    burst(x, y, z, color, n) {
      const s = world.state;
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2;
        s.particles.push({
          x, y, z,
          vx: Math.cos(a) * 8,
          vy: Math.sin(a * 2.3) * 6 + 4,
          vz: Math.sin(a) * 8,
          life: 0.9,
          color,
        });
      }
      if (s.particles.length > 220) s.particles.splice(0, s.particles.length - 220);
    },

    showBanner(text, seconds) {
      const s = world.state;
      s.banner = text;
      s.bannerUntil = seconds || 2.5;
    },

    crash(reason) {
      const s = world.state;
      if (s.screen !== SCREEN.play) return;
      s.screen = SCREEN.end;
      s.endReason = reason;
      s.flash = 1;
      s.shake = 1.4;
      s.stats = world.statsLine();
      world.events.push('crash');
    },

    statsLine() {
      const s = world.state;
      return {
        score: Math.round(s.score),
        mission: s.mission + 1,
        rings: s.ringsCollected,
        fuel: Math.max(0, Math.round(s.fuel)),
        time: Math.round(s.time),
      };
    },

    // -- autopilot: flies the mission the way a decent pilot would --------
    // A mediocre pilot en route: it only corrects its controls every 0.25 s,
    // holding the last command between corrections, so it arcs wide and
    // sometimes needs a second pass at a ring. On final approach it
    // concentrates and corrects every step — landings are where it focuses.
    autopilot() {
      world._apCalls = (world._apCalls || 0) + 1;
      if (world._apCache && !world._apCache.landing && world._apCalls % 15 !== 1) {
        return world._apCache;
      }
      const out = world._autopilotNow();
      world._apCache = out;
      return out;
    },

    _autopilotNow() {
      const s = world.state;
      if (s.screen !== SCREEN.play) return { throttle: 0, turn: 0, pitch: 0, brake: false, skis: s.skis };
      const md = s.missionData;
      let tx, ty, tz;
      let landing = false;
      const ring = md.rings.find((r) => !r.collected);
      if (!s.cargo) {
        // Fly low over the home strip to pick the cargo up.
        tx = md.home.x + 10;
        ty = 5;
        tz = md.home.z;
      } else if (ring) {
        tx = ring.x;
        ty = ring.y;
        tz = ring.z;
      } else {
        // Landing is an approach LINE, not a point: aim at the strip's
        // threshold, low and on the centreline, and only once past it aim
        // at the strip centre. Aiming at the centre from far away flies
        // the plane over the strip still descending and then climbs away.
        landing = true;
        const thresholdX = md.dest.x - md.dest.len / 2;
        const pastThreshold = s.x > thresholdX - 10;
        if (pastThreshold) {
          tx = md.dest.x;
          ty = 2;
          tz = md.dest.z;
        } else {
          tx = thresholdX;
          ty = 4;
          tz = md.dest.z;
        }
      }
      const dx = tx - s.x;
      const dz = tz - s.z;
      const dist = Math.hypot(dx, dz);
      const desiredHeading = Math.atan2(dz, dx);
      const turn = clamp(wrapAngle(desiredHeading - s.heading) * 1.6, -1, 1);

      // Landing alignment: how far off the destination strip's centreline,
      // and whether the plane has flown past the strip's far end. A low,
      // slow, misaligned final is a trap (wind outruns the plane), so a
      // bad approach climbs away and tries again — go-around.
      const aligned = !landing || Math.abs(s.missionData.dest.z - s.z) < 14;
      const overshot = landing && s.x > s.missionData.dest.x + s.missionData.dest.len / 2 + 30;
      const goAround = landing && (!aligned || overshot) && s.y < 18;

      // Cruise altitude, higher over the cliffs ahead. On final the
      // target altitude is the touchdown height itself: arrive low.
      let desiredY = landing ? (goAround ? 32 : 2.5) : ty;
      if (!landing) desiredY = Math.max(desiredY, 30);
      const aheadX = s.x + Math.cos(s.heading) * 55;
      const aheadZ = s.z + Math.sin(s.heading) * 55;
      const thAhead = terrainHeight(aheadX, aheadZ);
      if (thAhead + 12 > desiredY) desiredY = thAhead + 14;

      let pitch = clamp((desiredY - s.y) * 0.055, -PLANE.pitchMax, PLANE.pitchMax);
      if (s.y <= 1.4 && s.speed < 30) pitch = 0.28; // rotate on takeoff roll
      if (landing && s.y < 9 && aligned && !overshot) pitch = 0.12; // flare

      let throttle = 80; // cruise fast: more fuel-efficient per distance
      if (landing) {
        if (goAround) throttle = 85;
        else if (dist < 250) throttle = 30; // sink gently onto the ice
        else throttle = 45;
      }
      if (!landing && dist < 160) throttle = 50; // slow down to thread a ring
      if (!landing && desiredY - s.y > 14) throttle = 85;
      if (!s.cargo) throttle = 48;
      if (s.y <= 1.4 && s.speed < 30) throttle = 85; // takeoff roll

      const d0 = s.missionData.dest;
      const brake = landing && aligned && s.x > d0.x - d0.len / 2 && s.x < d0.x + d0.len / 2 &&
        Math.abs(s.z - d0.z) < d0.w / 2 && s.y < 7;
      const skis = landing ? dist < 260 : s.skis;
      return { throttle, turn, pitch, brake, skis, landing };
    },

    // -- the one step that implements every rule ---------------------------
    step(dt, input) {
      const s = world.state;
      const ev = world.events;
      ev.length = 0;
      if (s.screen !== SCREEN.play) return ev;
      input = input || {};
      s.time += dt;

      // Throttle: autopilot sets a target, keys nudge it.
      if (typeof input.throttle === 'number') {
        const rate = 65;
        s.throttle += clamp(input.throttle - s.throttle, -rate * dt, rate * dt);
      } else {
        if (input.throttleUp) s.throttle += 55 * dt;
        if (input.throttleDown) s.throttle -= 55 * dt;
      }
      s.throttle = clamp(s.throttle, 0, 100);
      if (typeof input.skis === 'boolean') s.skis = input.skis;

      // Turn: sluggish when iced over.
      const sluggish = s.ice > ICE.sluggishAt ? 0.6 : 1;
      const turnIn = clamp(input.turn || 0, -1, 1);
      const speedFactor = clamp(s.speed / 40, 0.25, 1);
      s.heading += turnIn * PLANE.turnRate * sluggish * speedFactor * dt;
      s.roll += (clamp(-turnIn, -1, 1) * 0.5 - s.roll) * Math.min(1, 6 * dt);

      // Pitch from the mouse (or the autopilot's target).
      const pitchTarget = clamp(
        typeof input.pitch === 'number' ? input.pitch : s.pitch,
        -PLANE.pitchMax,
        PLANE.pitchMax,
      );
      s.pitch += (pitchTarget - s.pitch) * Math.min(1, 8 * dt);

      // Speed follows throttle; ice caps the top speed. Gliding (fuel out)
      // means the engine is dead: no thrust, only the speed you carry.
      const effThrottle = s.gliding ? 0 : s.throttle;
      const topSpeed = PLANE.maxSpeed * (s.ice > ICE.sluggishAt ? 0.8 : 1);
      const targetSpeed = (effThrottle / 100) * topSpeed;
      const rate = targetSpeed > s.speed ? PLANE.accel : PLANE.decel;
      s.speed += clamp(targetSpeed - s.speed, -rate * dt, rate * dt);
      if (input.brake) s.speed = Math.max(0, s.speed - 26 * dt);

      // Vertical speed: pitch + powered lift, or sink when underpowered.
      let vy = s.speed * Math.sin(s.pitch);
      vy += effThrottle >= PLANE.minFlyThrottle ? PLANE.climbBonus : -PLANE.liftSink;
      if (s.ice >= ICE.stallAt) {
        vy -= ICE.stallSink;
        s.stalled = true;
      } else if (s.ice < ICE.sluggishAt) {
        s.stalled = false;
      }
      s.vy = vy;

      // Move: forward along heading, storm wind pushes sideways.
      const fx = Math.cos(s.heading);
      const fz = Math.sin(s.heading);
      s.x += fx * s.speed * dt;
      s.z += fz * s.speed * dt + s.wind * s.storm * dt;
      s.y += vy * dt;

      // Ground handling on a strip: roll, don't sink through the ice.
      const overHome = world.onStrip(s.missionData.home);
      const overDest = world.onStrip(s.missionData.dest);
      const overStrip = overHome || overDest;
      if (overStrip && s.y <= 1.3 && vy <= 0) {
        s.y = 1.3;
        s.vy = 0;
      }

      // Fuel: drain scales with throttle; empty means glide.
      const drain = FUEL.drainBase + (FUEL.drainFull - FUEL.drainBase) * (s.throttle / 100);
      s.fuel -= drain * dt;
      if (s.fuel <= 0) {
        s.fuel = 0;
        if (!s.gliding) {
          s.gliding = true;
          s.glideLeft = FUEL.glideSeconds;
          world.showBanner('FUEL EMPTY — GLIDE TO A STRIP!', 3);
          ev.push('alarm');
        }
        s.glideLeft -= dt;
        if (overStrip && s.y <= 1.6) {
          s.fuel = FUEL.refuel;
          s.gliding = false;
          s.glideLeft = FUEL.glideSeconds;
          world.showBanner('REFUELLED +50', 2);
          ev.push('refuel');
        } else if (s.glideLeft <= 0) {
          world.crash('OUT OF FUEL');
          return ev;
        }
      }
      if (s.fuel <= FUEL.lowWarn && s.fuel > 0 && Math.floor(s.time * 2) !== Math.floor((s.time - dt) * 2)) {
        ev.push('alarm');
      }

      // Icing: inside a cloud it grows, below the cloud base it melts.
      let inCloud = false;
      let belowClouds = s.missionData.clouds.length === 0;
      for (const c of s.missionData.clouds) {
        if (dist3(s.x, s.y, s.z, c.x, c.y, c.z) < c.r) inCloud = true;
        if (s.y < c.y - c.r) belowClouds = true;
      }
      if (inCloud) {
        s.ice = clamp(s.ice + ICE.inCloudPerSec * dt, 0, 100);
      } else if (belowClouds) {
        s.ice = clamp(s.ice - ICE.meltPerSec * dt, 0, 100);
      }

      // Rings: fly through the gold torus.
      for (const r of s.missionData.rings) {
        if (r.collected) continue;
        if (dist3(s.x, s.y, s.z, r.x, r.y, r.z) < r.r) {
          r.collected = true;
          s.ringsCollected++;
          s.score += SCORE.ring;
          s.timeLeft += SCORE.ringTimeBonus;
          world.burst(r.x, r.y, r.z, '#ffd97a', 18);
          world.addFloater('+50  RING!', '#ffd97a');
          world.showBanner('RING +50  •  +6s', 1.6);
          ev.push('ring');
        }
      }

      // Cargo: fly low and fast over the home strip to pick it up.
      if (!s.cargo && overHome && s.y > 1.8 && s.y < 10 && s.speed > 20) {
        s.cargo = true;
        world.addFloater('CARGO LOADED ✓', '#7dff9a');
        world.showBanner('CARGO LOADED — FLY TO THE DESTINATION STRIP', 2.5);
        ev.push('cargo');
      }

      // Landing on the destination strip with cargo delivers the mission.
      if (overDest && s.y <= 1.6 && vy <= 0) {
        if (s.cargo) {
          if (!s.skis) {
            world.crash('LANDED WITHOUT SKIS');
            return ev;
          }
          if (vy < -DAMAGE.hardLandingVy) {
            world.crash('LANDED TOO HARD');
            return ev;
          }
          s.score += SCORE.delivery;
          const bonus = SCORE.missionBonus + Math.round(s.fuel) * SCORE.fuelBonusPerUnit;
          s.score += bonus;
          s.stats = world.statsLine();
          world.burst(s.x, 3, s.z, '#7dff9a', 24);
          ev.push('delivered');
          if (s.mission >= MISSIONS.length - 1) {
            s.screen = SCREEN.win;
            s.stats = world.statsLine();
            ev.push('win');
          } else {
            s.screen = SCREEN.missionClear;
            ev.push('missionclear');
          }
          return ev;
        }
        // Touch-and-go without cargo: roll on, take off again.
      }

      // Water: ditching in the fjord (not a seaplane).
      if (!overStrip && s.y <= 0.4) {
        world.crash('DITCHED IN THE FJORD');
        return ev;
      }

      // Terrain: clipping a cliff costs one damage and bounces the plane up.
      const ground = terrainHeight(s.x, s.z);
      if (s.y < ground + 2) {
        s.damage += 1;
        s.y = ground + 6;
        s.speed *= 0.7;
        s.shake = 1;
        world.addFloater('CLIFF HIT!  DAMAGE ' + s.damage + '/3', '#ff9a7a');
        world.showBanner('CLIFF HIT — DAMAGE ' + s.damage + '/3', 2);
        ev.push('hit');
        if (s.damage >= DAMAGE.maxHits) {
          world.crash('HIT THE CLIFFS');
          return ev;
        }
      }

      // Mission clock.
      s.timeLeft -= dt;
      if (s.timeLeft <= 0) {
        world.crash('TIME UP — THE STORM ARRIVED');
        return ev;
      }

      // Decay banner / shake / flash, age particles and floaters.
      if (s.bannerUntil > 0) {
        s.bannerUntil -= dt;
        if (s.bannerUntil <= 0) s.banner = '';
      }
      s.shake = Math.max(0, s.shake - dt * 1.6);
      s.flash = Math.max(0, s.flash - dt * 2);
      for (let i = s.particles.length - 1; i >= 0; i--) {
        const p = s.particles[i];
        p.life -= dt;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.z += p.vz * dt;
        p.vy -= 12 * dt;
        if (p.life <= 0) s.particles.splice(i, 1);
      }
      for (let i = s.floaters.length - 1; i >= 0; i--) {
        s.floaters[i].t += dt;
        if (s.floaters[i].t > 2.2) s.floaters.splice(i, 1);
      }
      return ev;
    },

    // Background life for title / win / end screens: the plane keeps flying
    // a gentle circuit, but nothing scores, breaks or runs dry.
    stepBackground(dt) {
      const s = world.state;
      if (s.parked) return;
      s.time += dt;
      const tx = 300 + 260 * Math.sin(s.time * 0.05);
      const tz = fjordCenter(tx) + 60 * Math.sin(s.time * 0.11);
      const desired = Math.atan2(tz - s.z, tx - s.x);
      s.heading += clamp(wrapAngle(desired - s.heading), -0.5 * dt, 0.5 * dt) * 2;
      const desiredY = 34 + 6 * Math.sin(s.time * 0.2);
      s.pitch += (clamp((desiredY - s.y) * 0.05, -0.3, 0.3) - s.pitch) * Math.min(1, 4 * dt);
      s.speed += (55 - s.speed) * Math.min(1, 2 * dt);
      s.throttle = 55;
      s.x += Math.cos(s.heading) * s.speed * dt;
      s.z += Math.sin(s.heading) * s.speed * dt;
      s.y += s.speed * Math.sin(s.pitch) * dt;
      const ground = terrainHeight(s.x, s.z);
      if (s.y < ground + 10) s.y = ground + 10;
      if (s.y > 90) s.y = 90;
      s.roll += (clamp(wrapAngle(desired - s.heading) * -0.8, -0.4, 0.4) - s.roll) * Math.min(1, 4 * dt);
      s.shake = Math.max(0, s.shake - dt);
      s.flash = Math.max(0, s.flash - dt);
    },
  };

  world.best = 0;
  world.reset();
  return world;
}
