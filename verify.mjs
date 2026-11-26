// AURORA CARGO — own verify + screenshot harness.
//
// Why not proto-shots.mjs's `verify`: that harness is written for a
// different game (it drives window.__LASTLIGHT__ and checks lighthouse
// rules — foghorn, wraiths, oil barrels). This one follows its pattern
// exactly (same stock Chromium, same CDP driver, same static server on
// 127.0.0.1, same JPEG screenshots) but drives this game's own hook,
// window.__FLIGHT__, and checks this game's own rules.
//
// Usage:
//   node verify.mjs verify        playtest the rules (12 checks)
//   node verify.mjs all           take the 4 screenshots from shots.json
//   node verify.mjs 01|02|03|04   take one screenshot
//   node verify.mjs bench         5 full autopilot games, count wins
import { spawn } from 'node:child_process';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const GAME_DIR = path.join(ROOT, 'game');
const SHOT_DIR = path.join(ROOT, 'screenshots');
const CHROME = path.join(process.env.HOME, 'workspace', '.chrome-tmp', 'chrome-linux64', 'chrome');
const PORT = 8931;
const DEBUG_PORT = 9241;
const PROFILE = path.join(process.env.HOME, 'workspace', '.chrome-tmp', 'profile-aurora-' + path.basename(ROOT));

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.json': 'application/json' };

function serve() {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      const url = decodeURIComponent(req.url.split('?')[0]);
      const file = path.join(GAME_DIR, url === '/' ? 'index.html' : url);
      if (!file.startsWith(GAME_DIR)) { res.writeHead(403); return res.end(); }
      fs.readFile(file, (err, data) => {
        if (err) { res.writeHead(404); return res.end('nf'); }
        res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
        res.end(data);
      });
    });
    server.listen(PORT, '127.0.0.1', () => resolve(server));
  });
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

class Cdp {
  constructor(wsUrl) {
    this.ws = new WebSocket(wsUrl);
    this.id = 0;
    this.pending = new Map();
    this.errors = [];
    this.ready = new Promise((resolve, reject) => {
      this.ws.onopen = resolve;
      this.ws.onerror = reject;
    });
    this.ws.onmessage = (ev) => {
      const msg = JSON.parse(ev.data);
      if (msg.id && this.pending.has(msg.id)) {
        const { resolve, reject } = this.pending.get(msg.id);
        this.pending.delete(msg.id);
        if (msg.error) reject(new Error(JSON.stringify(msg.error)));
        else resolve(msg.result);
      } else if (msg.method === 'Runtime.exceptionThrown') {
        this.errors.push(JSON.stringify(msg.params.exceptionDetails).slice(0, 500));
      } else if (msg.method === 'Runtime.consoleAPICalled' && msg.params.type === 'error') {
        this.errors.push(msg.params.args.map((a) => a.value || a.description || '').join(' ').slice(0, 300));
      }
    };
  }
  call(method, params = {}) {
    const id = ++this.id;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }
  async eval(expr, awaitPromise = false) {
    const r = await this.call('Runtime.evaluate', { expression: expr, awaitPromise, returnByValue: true });
    if (r.exceptionDetails) throw new Error('eval failed: ' + JSON.stringify(r.exceptionDetails).slice(0, 400));
    return r.result.value;
  }
  async shot(file) {
    const r = await this.call('Page.captureScreenshot', { format: 'jpeg', quality: 88 });
    fs.writeFileSync(file, Buffer.from(r.data, 'base64'));
    return fs.statSync(file).size;
  }
  async poll(expr, timeoutMs, intervalMs = 500) {
    const end = Date.now() + timeoutMs;
    while (Date.now() < end) {
      try {
        if (await this.eval(expr)) return true;
      } catch { /* page still loading */ }
      await sleep(intervalMs);
    }
    return false;
  }
  async key(type, key, code, keyCode) {
    await this.call('Input.dispatchKeyEvent', { type: type === 'keyDown' ? 'rawKeyDown' : type, key, code, windowsVirtualKeyCode: keyCode, nativeVirtualKeyCode: keyCode });
  }
}

async function newTab(url) {
  const res = await fetch(`http://127.0.0.1:${DEBUG_PORT}/json/new?${encodeURIComponent(url)}`, { method: 'PUT' });
  const target = await res.json();
  try { await fetch(`http://127.0.0.1:${DEBUG_PORT}/json/activate/${target.id}`); } catch { /* already active */ }
  const cdp = new Cdp(target.webSocketDebuggerUrl);
  await cdp.ready;
  await cdp.call('Page.enable');
  await cdp.call('Runtime.enable');
  await cdp.call('Page.bringToFront');
  await cdp.call('Emulation.setDeviceMetricsOverride', { width: 960, height: 540, deviceScaleFactor: 1, mobile: false });
  return cdp;
}

function loadShots() {
  const list = JSON.parse(fs.readFileSync(path.join(ROOT, 'shots.json'), 'utf8'));
  return list.map((s, i) => [String(i + 1).padStart(2, '0'), s.query, s.name]);
}

async function takeShots(keys) {
  fs.mkdirSync(SHOT_DIR, { recursive: true });
  for (const [k, query, file] of loadShots().filter(([k]) => keys.includes(k))) {
    console.log('scenario', k, query);
    const cdp = await newTab(`http://127.0.0.1:${PORT}/index.html${query}`);
    try {
      const ready = await cdp.poll(`window.__shotReady === true`, 60000);
      console.log('  shotReady:', ready);
      await sleep(400);
      const size = await cdp.shot(path.join(SHOT_DIR, file));
      console.log(' ', file, size, 'bytes; errors:', cdp.errors.length);
      if (cdp.errors.length) console.log('  page errors:', cdp.errors.slice(0, 5));
    } finally {
      cdp.ws.close();
    }
  }
}

async function verify() {
  const cdp = await newTab(`http://127.0.0.1:${PORT}/index.html`);
  const results = [];
  const check = (name, ok, detail = '') => {
    results.push({ name, ok, detail });
    console.log((ok ? 'PASS' : 'FAIL'), '-', name, detail);
  };
  try {
    await cdp.poll(`window.__FLIGHT__`, 60000);
    check('page loads, debug hook present', true);
    check('title screen shown', await cdp.eval(`window.__FLIGHT__.state.screen === 'title'`));
    await sleep(1200);
    await cdp.key('keyDown', 'Enter', 'Enter', 13);
    await cdp.key('keyUp', 'Enter', 'Enter', 13);
    await sleep(1200);
    check('Enter starts the game', await cdp.eval(`window.__FLIGHT__.state.screen === 'play'`));
    console.log('  draw calls:', await cdp.eval(`window.__FLIGHT__.drawCalls()`));
    const play = await cdp.eval(`(() => {
      const R = window.__FLIGHT__;
      const W = R.world;
      let ev = 0;
      for (let i = 0; i < 90 * 60; i++) {
        const e = W.step(1/60, R.autopilot());
        if (e.length) ev++;
        if (W.state.screen !== 'play') break;
      }
      const s = W.state;
      return { screen: s.screen, score: s.score, rings: s.ringsCollected, cargo: s.cargo,
        fuel: Math.round(s.fuel), mission: s.mission + 1, events: ev };
    })()`);
    console.log('  90 s autopilot:', JSON.stringify(play));
    check('autopilot 90 s scores (score > 0, >= 1 ring)', play.score > 0 && play.rings >= 1, JSON.stringify(play));
    const ring = await cdp.eval(`(() => {
      const R = window.__FLIGHT__;
      const W = R.world;
      if (W.state.screen !== 'play') W.startGame();
      const s = W.state;
      const r = s.missionData.rings[0];
      const before = s.score;
      s.x = r.x; s.y = r.y; s.z = r.z; s.speed = 40;
      W.step(1/60, { throttle: 60, turn: 0, pitch: 0, brake: false });
      return { before, after: s.score, collected: r.collected, delta: s.score - before };
    })()`);
    check('flying through a ring gives +50', ring.delta === 50 && ring.collected, JSON.stringify(ring));
    const delivery = await cdp.eval(`(() => {
      const R = window.__FLIGHT__;
      const W = R.world;
      W.startGame();
      const s = W.state;
      // Load cargo: low fast pass over the home strip.
      s.x = s.missionData.home.x; s.y = 5; s.z = s.missionData.home.z; s.speed = 40;
      W.step(1/60, { throttle: 60, turn: 0, pitch: 0, brake: false });
      const cargo = s.cargo;
      const before = s.score;
      // Land on the destination strip, skis out, gentle descent.
      const d = s.missionData.dest;
      s.x = d.x; s.y = 1.4; s.z = d.z; s.speed = 30; s.skis = true; s.vy = -2;
      const ev = W.step(1/60, { throttle: 30, turn: 0, pitch: 0.1, brake: true });
      return { cargo, before, after: s.score, delta: s.score - before, screen: s.screen, ev };
    })()`);
    check('cargo pickup + delivery gives +200 and clears the mission', delivery.cargo && delivery.delta >= 200 && delivery.screen === 'missionclear', JSON.stringify(delivery));
    const icing = await cdp.eval(`(() => {
      const R = window.__FLIGHT__;
      const W = R.world;
      W.startGame();
      // Mission 2 has clouds. Hold the plane inside one (it flies out in
      // under a second at speed), then hold it below the cloud base.
      W.nextMission();
      const s = W.state;
      const c = s.missionData.clouds[0];
      for (let i = 0; i < 10 * 60; i++) {
        s.x = c.x; s.y = c.y; s.z = c.z; s.speed = 50; s.throttle = 60;
        W.step(1/60, { throttle: 60, turn: 0, pitch: 0, brake: false });
      }
      const inCloud = s.ice;
      for (let i = 0; i < 10 * 60; i++) {
        s.x = c.x; s.y = 5; s.z = c.z; s.speed = 50; s.throttle = 60;
        W.step(1/60, { throttle: 60, turn: 0, pitch: 0, brake: false });
      }
      return { inCloud, after: s.ice };
    })()`);
    check('icing rises in a cloud and melts below it', icing.inCloud > 10 && icing.after < icing.inCloud, JSON.stringify(icing));
    const noSkis = await cdp.eval(`(() => {
      const R = window.__FLIGHT__;
      const W = R.world;
      W.startGame();
      const s = W.state;
      s.cargo = true;
      const d = s.missionData.dest;
      s.x = d.x; s.y = 1.4; s.z = d.z; s.speed = 30; s.skis = false; s.vy = -2;
      W.step(1/60, { throttle: 30, turn: 0, pitch: 0.1, brake: true });
      return { screen: s.screen, reason: s.endReason };
    })()`);
    check('landing without skis = crash', noSkis.screen === 'end' && /SKIS/.test(noSkis.reason), JSON.stringify(noSkis));
    const hard = await cdp.eval(`(() => {
      const R = window.__FLIGHT__;
      const W = R.world;
      W.startGame();
      const s = W.state;
      s.cargo = true;
      const d = s.missionData.dest;
      s.x = d.x; s.y = 1.4; s.z = d.z; s.speed = 60; s.skis = true;
      // Already diving steeply at speed: vy ~ -23, past the -14 limit.
      s.pitch = -0.42;
      W.step(1/60, { throttle: 60, turn: 0, pitch: -0.42, brake: false });
      return { screen: s.screen, reason: s.endReason, vy: s.vy };
    })()`);
    check('landing too hard = crash', hard.screen === 'end' && /HARD/.test(hard.reason), JSON.stringify(hard));
    const fuel = await cdp.eval(`(() => {
      const R = window.__FLIGHT__;
      const W = R.world;
      // (a) Gliding onto the home strip within 8 s refuels and saves the flight.
      W.startGame();
      let s = W.state;
      s.fuel = 0.05;
      s.x = s.missionData.home.x; s.y = 8; s.z = s.missionData.home.z; s.speed = 40; s.throttle = 60;
      let saved = null;
      for (let i = 0; i < 12 * 60; i++) {
        W.step(1/60, { throttle: 60, turn: 0, pitch: 0, brake: false });
        if (s.fuel >= 50) { saved = 'refuelled:' + Math.round(s.fuel); break; }
        if (s.screen !== 'play') { saved = 'ended:' + s.endReason; break; }
      }
      // (b) High over open water with the engine out: 8 s of glide, then out.
      W.startGame();
      s = W.state;
      s.fuel = 0.05;
      s.y = 150; s.x = 300; s.z = 0; s.speed = 80; s.throttle = 60;
      let end = null;
      for (let i = 0; i < 12 * 60; i++) {
        W.step(1/60, { throttle: 60, turn: 0, pitch: 0.42, brake: false });
        if (s.screen !== 'play') { end = s.screen + ':' + s.endReason; break; }
      }
      return { saved, end };
    })()`);
    check('fuel empty: glide to a strip refuels, glide expiry ends the flight', fuel.saved === 'refuelled:50' && fuel.end === 'end:OUT OF FUEL', JSON.stringify(fuel));
    const win = await cdp.eval(`(() => {
      const R = window.__FLIGHT__;
      const W = R.world;
      W.startGame();
      // Jump to mission 5, then deliver like the delivery check.
      for (let i = 0; i < 4; i++) W.nextMission();
      const s = W.state;
      s.cargo = true;
      const d = s.missionData.dest;
      s.x = d.x; s.y = 1.4; s.z = d.z; s.speed = 30; s.skis = true;
      W.step(1/60, { throttle: 30, turn: 0, pitch: 0.1, brake: true });
      return { screen: s.screen, mission: s.mission + 1, score: s.score };
    })()`);
    check('delivering mission 5 = win', win.screen === 'win', JSON.stringify(win));
    await cdp.key('keyDown', 'r', 'KeyR', 82);
    await cdp.key('keyUp', 'r', 'KeyR', 82);
    await sleep(1200);
    check('R restarts from the end screen, zero page errors overall',
      (await cdp.eval(`window.__FLIGHT__.state.screen === 'play' && window.__FLIGHT__.state.mission === 0`)) && cdp.errors.length === 0,
      cdp.errors.slice(0, 5).join(' | '));
    const failed = results.filter((r) => !r.ok).length;
    console.log(failed === 0 ? 'ALL CHECKS PASSED' : `${failed} CHECK(S) FAILED`);
    process.exitCode = failed === 0 ? 0 : 1;
  } finally {
    cdp.ws.close();
  }
}

async function bench() {
  const cdp = await newTab(`http://127.0.0.1:${PORT}/index.html`);
  try {
    await cdp.poll(`window.__FLIGHT__`, 60000);
    const wins = [];
    for (let run = 0; run < 5; run++) {
      const r = await cdp.eval(`(() => {
        const R = window.__FLIGHT__;
        const W = R.world;
        W.reseed(20261126 + ${run} * 7919);
        W.startGame();
        let simSeconds = 0;
        while (simSeconds < 1800) {
          const e = W.step(1/60, R.autopilot());
          simSeconds += 1/60;
          if (W.state.screen === 'missionclear') { W.nextMission(); continue; }
          if (W.state.screen !== 'play') break;
        }
        const s = W.state;
        return { screen: s.screen, mission: s.mission + 1, score: Math.round(s.score),
          rings: s.ringsCollected, reason: s.endReason || '', simSeconds: Math.round(simSeconds) };
      })()`);
      wins.push(r);
      console.log(`run ${run + 1}:`, JSON.stringify(r));
    }
    const n = wins.filter((r) => r.screen === 'win').length;
    console.log(`autopilot benchmark: ${n}/5 wins`);
  } finally {
    cdp.ws.close();
  }
}

async function main() {
  const which = process.argv[2] || 'all';
  const server = await serve();
  const chrome = spawn(CHROME, [
    '--headless=new', `--remote-debugging-port=${DEBUG_PORT}`, '--no-sandbox',
    '--disable-dev-shm-usage', '--window-size=960,540', '--hide-scrollbars',
    '--use-angle=swiftshader', '--mute-audio',
    `--user-data-dir=${PROFILE}`,
    'about:blank',
  ], { stdio: 'ignore' });
  try {
    for (let i = 0; i < 30; i++) {
      try {
        const r = await fetch(`http://127.0.0.1:${DEBUG_PORT}/json/version`);
        if (r.ok) break;
      } catch { /* not up yet */ }
      await sleep(500);
    }
    if (which === 'verify') await verify();
    else if (which === 'bench') await bench();
    else await takeShots(which === 'all' ? ['01', '02', '03', '04'] : [which]);
    console.log('done');
  } finally {
    chrome.kill('SIGKILL');
    server.close();
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
