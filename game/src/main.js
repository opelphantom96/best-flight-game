// AURORA CARGO — main: fixed-step loop, screens, sounds, best score, and
// the debug hook the harness drives. `?shot=<name>` stages a screenshot
// scene instead of playing; otherwise the game runs on requestAnimationFrame.

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
const state = world.state;
try {
  state.best = Number(localStorage.getItem(BEST_KEY) || 0) || 0;
  world.best = state.best;
} catch {
  state.best = 0;
}

const renderer = createRenderer(canvas);
const input = createInput(canvas);
const audio = createAudio();

function saveBest() {
  if (state.score > state.best) {
    state.best = Math.round(state.score);
    world.best = state.best;
    try {
      localStorage.setItem(BEST_KEY, String(state.best));
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
  if (code === 'Enter') {
    audio.unlock();
    audio.click();
    if (state.screen === SCREEN.title) {
      world.startGame();
    } else if (state.screen === SCREEN.missionClear) {
      world.nextMission();
    }
  } else if (code === 'KeyR') {
    audio.unlock();
    if (state.screen !== SCREEN.title) world.startGame();
  } else if (code === 'KeyP' || code === 'Escape') {
    if (state.screen === SCREEN.play) state.screen = SCREEN.pause;
    else if (state.screen === SCREEN.pause) state.screen = SCREEN.play;
  } else if (code === 'KeyM') {
    audio.toggleMute();
  } else if (code === 'KeyL') {
    if (state.screen === SCREEN.play) world.setSkis(!state.skis);
  }
}

// The harness hook: the world, its live state, start, and the autopilot.
window.__FLIGHT__ = {
  world,
  state,
  start() {
    world.startGame();
  },
  autopilot() {
    return world.autopilot();
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
    renderer.render(state, false, now / 1000);
    shotFrames++;
    if (shotFrames === 3) window.__shotReady = true;
    return;
  }

  acc += elapsed;
  while (acc >= STEP) {
    acc -= STEP;
    if (state.screen === SCREEN.play) {
      const events = world.step(STEP, input.read());
      handleEvents(events);
    } else if (state.screen === SCREEN.title || state.screen === SCREEN.win || state.screen === SCREEN.end) {
      world.stepBackground(STEP);
    }
  }
  audio.update(state);
  renderer.render(state, state.screen === SCREEN.pause, now / 1000);
}

requestAnimationFrame(frame);
