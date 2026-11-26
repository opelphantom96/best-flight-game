// AURORA CARGO — main: fixed-step loop, screens, sounds, best score, and
// the debug hook the harness drives. `?shot=<name>` stages a screenshot
// scene instead of playing; otherwise the game runs on requestAnimationFrame.
//
// NOTE: world.startGame() / nextMission() replace world.state with a fresh
// object, so nothing here caches `state` — every read goes through
// world.state (via the state() helper and the hook's getter).

import { createWorld, STEP } from './world.js';
import { createRenderer } from './render.js';
import { createInput } from './input.js';
import { createAudio } from './audio.js';
import { createShotWorld } from './shots.js';
import { SCREEN, SEED } from './config.js';

const BEST_KEY = 'best-flight-game-20261126-0057.best';
const canvas = document.getElementById('game');
const params = new URLSearchParams(location.search);
const shotName = params.get('shot');
const seedParam = Number(params.get('seed'));
const seed = Number.isFinite(seedParam) && seedParam > 0 ? seedParam : SEED;

const world = shotName ? createShotWorld(shotName) : createWorld(seed);
const state = () => world.state;
try {
  world.state.best = Number(localStorage.getItem(BEST_KEY) || 0) || 0;
  world.best = world.state.best;
} catch {
  world.state.best = 0;
}

const renderer = createRenderer(canvas);
const input = createInput(canvas);
const audio = createAudio();

function saveBest() {
  const s = state();
  if (s.score > s.best) {
    s.best = Math.round(s.score);
    world.best = s.best;
    try {
      localStorage.setItem(BEST_KEY, String(s.best));
    } catch { /* best score is a nicety, never fatal */ }
  }
}

function handleEvents(events) {
  for (const ev of events) {
    if (ev === 'ring') audio.ring();
    else if (ev === 'cargo') audio.cargo();
    else if (ev === 'delivered') audio.landing();
    else if (ev === 'alarm') audio.alarm();
    else if (ev === 'crash') audio.crash();
    else if (ev === 'win') {
      audio.win();
      saveBest();
    } else if (ev === 'missionclear') {
      audio.win();
      saveBest();
    }
  }
  if (events.includes('crash') || events.includes('win')) saveBest();
}

function onKeyOnce(code) {
  const s = state();
  if (code === 'Enter') {
    audio.unlock();
    audio.click();
    if (s.screen === SCREEN.title) {
      world.startGame();
    } else if (s.screen === SCREEN.missionClear) {
      world.nextMission();
    }
  } else if (code === 'KeyR') {
    audio.unlock();
    if (s.screen !== SCREEN.title) world.startGame();
  } else if (code === 'KeyP' || code === 'Escape') {
    if (s.screen === SCREEN.play) s.screen = SCREEN.pause;
    else if (s.screen === SCREEN.pause) s.screen = SCREEN.play;
  } else if (code === 'KeyM') {
    audio.toggleMute();
  } else if (code === 'KeyL') {
    if (s.screen === SCREEN.play) world.setSkis(!s.skis);
  }
}

// The harness hook: the world, its live state, start, and the autopilot.
window.__FLIGHT__ = {
  world,
  get state() {
    return world.state;
  },
  start() {
    world.startGame();
  },
  autopilot() {
    return world.autopilot();
  },
  drawCalls() {
    return renderer.drawCalls();
  },
};

let last = performance.now();
let acc = 0;
let shotFrames = 0;

function frame(now) {
  requestAnimationFrame(frame);
  let elapsed = (now - last) / 1000;
  last = now;
  if (elapsed > 0.25) elapsed = 0.25;

  // One-shot keys.
  for (const code of input.pressed) onKeyOnce(code);
  input.clearPressed();

  if (shotName) {
    // Screenshot mode: the staged hero moment is frozen; only the sky,
    // aurora and clouds animate, then the harness takes the frame.
    renderer.render(state(), false, now / 1000);
    shotFrames++;
    if (shotFrames === 3) window.__shotReady = true;
    return;
  }

  acc += elapsed;
  while (acc >= STEP) {
    acc -= STEP;
    const s = state();
    if (s.screen === SCREEN.play) {
      const events = world.step(STEP, input.read());
      handleEvents(events);
    } else if (s.screen === SCREEN.title || s.screen === SCREEN.win || s.screen === SCREEN.end) {
      world.stepBackground(STEP);
    }
  }
  audio.update(state());
  renderer.render(state(), state().screen === SCREEN.pause, now / 1000);
}

requestAnimationFrame(frame);
