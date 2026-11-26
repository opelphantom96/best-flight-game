// AURORA CARGO — audio: every sound synthesised with WebAudio, no files.
// Engine drone follows the throttle, wind follows speed, plus a ring ding,
// landing thud, alarm, crash burst and a win fanfare. Never throws.

export function createAudio() {
  let ctx = null;
  let engineOsc = null;
  let engineGain = null;
  let windGain = null;
  let noiseBuf = null;
  let muted = false;

  function ensure() {
    if (ctx) return true;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      ctx = new AC();
      // Engine: two detuned saws through a lowpass, gain by throttle.
      engineOsc = ctx.createOscillator();
      engineOsc.type = 'sawtooth';
      engineOsc.frequency.value = 55;
      const engineOsc2 = ctx.createOscillator();
      engineOsc2.type = 'sawtooth';
      engineOsc2.frequency.value = 55 * 1.5;
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 420;
      engineGain = ctx.createGain();
      engineGain.gain.value = 0;
      engineOsc.connect(filter);
      engineOsc2.connect(filter);
      filter.connect(engineGain);
      engineGain.connect(ctx.destination);
      engineOsc.start();
      engineOsc2.start();
      // Wind: looped noise buffer, gain by speed.
      const len = ctx.sampleRate * 2;
      noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
      const data = noiseBuf.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
      const windSrc = ctx.createBufferSource();
      windSrc.buffer = noiseBuf;
      windSrc.loop = true;
      const windFilter = ctx.createBiquadFilter();
      windFilter.type = 'bandpass';
      windFilter.frequency.value = 700;
      windGain = ctx.createGain();
      windGain.gain.value = 0;
      windSrc.connect(windFilter);
      windFilter.connect(windGain);
      windGain.connect(ctx.destination);
      windSrc.start();
      return true;
    } catch {
      ctx = null;
      return false;
    }
  }

  function tone(freq, dur, type, vol, when) {
    if (!ctx || muted) return;
    try {
      const o = ctx.createOscillator();
      o.type = type || 'sine';
      o.frequency.value = freq;
      const g = ctx.createGain();
      const t0 = ctx.currentTime + (when || 0);
      g.gain.setValueAtTime(0, t0);
      g.gain.linearRampToValueAtTime(vol || 0.16, t0 + 0.015);
      g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
      o.connect(g);
      g.connect(ctx.destination);
      o.start(t0);
      o.stop(t0 + dur + 0.05);
    } catch { /* sound is never fatal */ }
  }

  function noiseBurst(dur, vol) {
    if (!ctx || muted || !noiseBuf) return;
    try {
      const src = ctx.createBufferSource();
      src.buffer = noiseBuf;
      const g = ctx.createGain();
      const t0 = ctx.currentTime;
      g.gain.setValueAtTime(vol || 0.3, t0);
      g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
      src.connect(g);
      g.connect(ctx.destination);
      src.start(t0);
      src.stop(t0 + dur);
    } catch { /* sound is never fatal */ }
  }

  return {
    unlock() {
      if (!ensure()) return;
      try {
        if (ctx.state === 'suspended') ctx.resume();
      } catch { /* ignore */ }
    },
    /** Called every frame with the live state: engine + wind follow it. */
    update(state) {
      if (!ctx || muted) {
        if (engineGain) engineGain.gain.value = 0;
        if (windGain) windGain.gain.value = 0;
        return;
      }
      try {
        const on = state.screen === 'play';
        const target = on ? 0.03 + (state.throttle / 100) * 0.075 : 0;
        engineGain.gain.setTargetAtTime(target, ctx.currentTime, 0.1);
        engineOsc.frequency.setTargetAtTime(48 + state.throttle * 0.9, ctx.currentTime, 0.1);
        const windTarget = on ? Math.min(0.12, (state.speed / 90) * 0.12) : 0;
        windGain.gain.setTargetAtTime(windTarget, ctx.currentTime, 0.15);
      } catch { /* ignore */ }
    },
    ring() {
      tone(880, 0.35, 'sine', 0.2);
      tone(1318, 0.4, 'sine', 0.14, 0.07);
    },
    cargo() {
      tone(523, 0.18, 'triangle', 0.18);
      tone(784, 0.25, 'triangle', 0.18, 0.1);
    },
    landing() {
      noiseBurst(0.25, 0.2);
      tone(180, 0.3, 'sine', 0.2);
    },
    alarm() {
      tone(660, 0.16, 'square', 0.07);
      tone(660, 0.16, 'square', 0.07, 0.2);
    },
    crash() {
      noiseBurst(0.7, 0.4);
      tone(70, 0.8, 'sawtooth', 0.25);
    },
    win() {
      [523, 659, 784, 1046].forEach((f, i) => tone(f, 0.5, 'triangle', 0.18, i * 0.16));
    },
    click() {
      tone(1200, 0.06, 'sine', 0.1);
    },
    toggleMute() {
      muted = !muted;
      if (muted && engineGain) engineGain.gain.value = 0;
      if (muted && windGain) windGain.gain.value = 0;
      return muted;
    },
    get muted() {
      return muted;
    },
  };
}
