import { clamp } from "./lib/utils.js";

export class Soundscape {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.started = false;
    this.muted = false;
    this.tickDistance = 0;
    this.gullTimer = 7;
    this.night = 0;
    this.speed = 0;
    this.nodes = {};
  }

  ensure() {
    if (this.ctx) return this.ctx;
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return null;
    const ctx = new Ctx();
    this.ctx = ctx;

    const compressor = ctx.createDynamicsCompressor();
    compressor.threshold.value = -20;
    compressor.knee.value = 18;
    compressor.ratio.value = 3;
    compressor.attack.value = 0.008;
    compressor.release.value = 0.28;

    const master = ctx.createGain();
    master.gain.value = 0;
    master.connect(compressor);
    compressor.connect(ctx.destination);
    this.master = master;
    this.compressor = compressor;

    const noiseBuffer = ctx.createBuffer(2, ctx.sampleRate * 4, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const data = noiseBuffer.getChannelData(ch);
      let last = 0;
      for (let i = 0; i < data.length; i++) {
        const white = Math.random() * 2 - 1;
        last = last * 0.985 + white * 0.015;
        data[i] = last * 3.2;
      }
    }
    this.noiseBuffer = noiseBuffer;

    // Ocean bed
    const oceanSrc = ctx.createBufferSource();
    oceanSrc.buffer = noiseBuffer;
    oceanSrc.loop = true;
    const oceanFilter = ctx.createBiquadFilter();
    oceanFilter.type = "lowpass";
    oceanFilter.frequency.value = 420;
    oceanFilter.Q.value = 0.4;
    const oceanGain = ctx.createGain();
    oceanGain.gain.value = 0.12;
    oceanSrc.connect(oceanFilter).connect(oceanGain).connect(master);
    oceanSrc.start();

    const oceanLfo = ctx.createOscillator();
    oceanLfo.frequency.value = 0.075;
    const oceanLfoGain = ctx.createGain();
    oceanLfoGain.gain.value = 0.035;
    oceanLfo.connect(oceanLfoGain).connect(oceanGain.gain);
    oceanLfo.start();

    // Wind
    const windSrc = ctx.createBufferSource();
    windSrc.buffer = noiseBuffer;
    windSrc.loop = true;
    windSrc.playbackRate.value = 1.2;
    const windFilter = ctx.createBiquadFilter();
    windFilter.type = "bandpass";
    windFilter.frequency.value = 740;
    windFilter.Q.value = 0.55;
    const windGain = ctx.createGain();
    windGain.gain.value = 0.012;
    windSrc.connect(windFilter).connect(windGain).connect(master);
    windSrc.start();

    // Warm drone, very quiet
    const droneGain = ctx.createGain();
    droneGain.gain.value = 0.012;
    const droneFilter = ctx.createBiquadFilter();
    droneFilter.type = "lowpass";
    droneFilter.frequency.value = 520;
    droneGain.connect(droneFilter).connect(master);
    const droneFreqs = [110, 164.81, 220];
    const drones = droneFreqs.map((freq, i) => {
      const osc = ctx.createOscillator();
      osc.type = i === 1 ? "triangle" : "sine";
      osc.frequency.value = freq;
      osc.detune.value = (i - 1) * 5;
      const g = ctx.createGain();
      g.gain.value = i === 0 ? 1 : 0.45;
      osc.connect(g).connect(droneGain);
      osc.start();
      return osc;
    });

    // Tick click buffer
    const tickLen = Math.floor(ctx.sampleRate * 0.035);
    const tickBuffer = ctx.createBuffer(1, tickLen, ctx.sampleRate);
    const tickData = tickBuffer.getChannelData(0);
    for (let i = 0; i < tickLen; i++) {
      const t = i / tickLen;
      tickData[i] = (Math.random() * 2 - 1) * Math.exp(-t * 26) * 0.9;
    }
    this.tickBuffer = tickBuffer;

    this.nodes = { oceanGain, windGain, windFilter, droneGain, droneFilter, drones };
    this.started = true;
    return ctx;
  }

  async start() {
    const ctx = this.ensure();
    if (!ctx) return;
    if (ctx.state === "suspended") {
      try {
        await ctx.resume();
      } catch {
        // Ignore; the browser will allow it on a later gesture.
      }
    }
    const t = ctx.currentTime;
    this.master.gain.cancelScheduledValues(t);
    this.master.gain.setTargetAtTime(this.muted ? 0 : 0.68, t, 0.7);
  }

  setMuted(muted) {
    this.muted = muted;
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.master.gain.setTargetAtTime(muted ? 0 : 0.68, t, 0.25);
  }

  update(dt, speed, distanceDelta, night) {
    this.speed = speed;
    this.night = night;
    if (!this.ctx) return;
    const t = this.ctx.currentTime;

    if (this.nodes.windGain) {
      this.nodes.windGain.gain.setTargetAtTime(0.012 + clamp(speed / 8) * 0.045, t, 0.4);
      this.nodes.windFilter.frequency.setTargetAtTime(650 + speed * 90, t, 0.6);
    }
    if (this.nodes.oceanGain) {
      this.nodes.oceanGain.gain.setTargetAtTime(0.1 + night * 0.03, t, 1.5);
    }
    if (this.nodes.droneGain) {
      this.nodes.droneGain.gain.setTargetAtTime(0.008 + night * 0.01, t, 1.2);
      this.nodes.droneFilter.frequency.setTargetAtTime(420 + night * 180, t, 1.2);
    }

    // Freewheel tick
    this.tickDistance += distanceDelta;
    const interval = 0.22;
    while (this.tickDistance > interval) {
      this.tickDistance -= interval;
      if (speed > 0.25) this.playTick(clamp(speed / 8, 0.2, 1));
    }

    if (this.gullTimer !== null) {
      this.gullTimer -= dt;
      if (this.gullTimer <= 0) {
        this.gullCry();
        this.gullTimer = 10 + Math.random() * 16;
      }
    }
  }

  playTick(intensity = 0.5) {
    if (!this.ctx || !this.tickBuffer || this.muted) return;
    const src = this.ctx.createBufferSource();
    src.buffer = this.tickBuffer;
    const filter = this.ctx.createBiquadFilter();
    filter.type = "highpass";
    filter.frequency.value = 1500 + Math.random() * 800;
    const gain = this.ctx.createGain();
    gain.gain.value = 0.02 + intensity * 0.035;
    src.connect(filter).connect(gain).connect(this.master);
    src.start();
  }

  bell() {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const partials = [
      [1568, 0.16, 1.3],
      [2093, 0.1, 1.0],
      [3136, 0.055, 0.7],
      [1176, 0.06, 1.6],
    ];
    for (const [freq, level, decay] of partials) {
      const osc = ctx.createOscillator();
      osc.type = "sine";
      osc.frequency.value = freq;
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0, t);
      gain.gain.linearRampToValueAtTime(level, t + 0.006);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + decay);
      osc.connect(gain).connect(this.master);
      osc.start(t);
      osc.stop(t + decay + 0.02);
    }
  }

  squawk() {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    osc.type = "sawtooth";
    osc.frequency.setValueAtTime(560, t);
    osc.frequency.exponentialRampToValueAtTime(320, t + 0.09);
    osc.frequency.exponentialRampToValueAtTime(470, t + 0.17);
    osc.frequency.exponentialRampToValueAtTime(210, t + 0.32);
    const filter = ctx.createBiquadFilter();
    filter.type = "bandpass";
    filter.frequency.setValueAtTime(900, t);
    filter.frequency.exponentialRampToValueAtTime(620, t + 0.3);
    filter.Q.value = 1.4;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(0.12, t + 0.018);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.36);
    osc.connect(filter).connect(gain).connect(this.master);
    osc.start(t);
    osc.stop(t + 0.4);

    // A small breathy noise layer
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    src.playbackRate.value = 1.8;
    const ng = ctx.createGain();
    ng.gain.setValueAtTime(0.04, t);
    ng.gain.exponentialRampToValueAtTime(0.001, t + 0.28);
    const nf = ctx.createBiquadFilter();
    nf.type = "bandpass";
    nf.frequency.value = 1000;
    nf.Q.value = 0.8;
    src.connect(nf).connect(ng).connect(this.master);
    src.start(t, Math.random() * 2, 0.3);
  }

  gullCry() {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const base = 900 + Math.random() * 500;
    for (let i = 0; i < 2 + Math.floor(Math.random() * 2); i++) {
      const start = t + i * 0.16;
      const osc = ctx.createOscillator();
      osc.type = "sine";
      osc.frequency.setValueAtTime(base, start);
      osc.frequency.exponentialRampToValueAtTime(base * 0.58, start + 0.13);
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0, start);
      gain.gain.linearRampToValueAtTime(0.008 + Math.random() * 0.01, start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.18);
      const pan = ctx.createStereoPanner();
      pan.pan.value = Math.random() * 1.4 - 0.7;
      osc.connect(gain).connect(pan).connect(this.master);
      osc.start(start);
      osc.stop(start + 0.2);
    }
  }

  shutter() {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = this.tickBuffer;
    const gain = ctx.createGain();
    gain.gain.value = 0.22;
    const filter = ctx.createBiquadFilter();
    filter.type = "highpass";
    filter.frequency.value = 900;
    src.connect(filter).connect(gain).connect(this.master);
    src.start(t);
    const osc = ctx.createOscillator();
    osc.type = "square";
    osc.frequency.value = 160;
    const og = ctx.createGain();
    og.gain.setValueAtTime(0.05, t);
    og.gain.exponentialRampToValueAtTime(0.001, t + 0.05);
    osc.connect(og).connect(this.master);
    osc.start(t);
    osc.stop(t + 0.06);
  }

  setPaused(paused) {
    if (!this.ctx || !this.started) return;
    const t = this.ctx.currentTime;
    if (this.nodes.windGain) this.nodes.windGain.gain.setTargetAtTime(paused ? 0.006 : 0.02, t, 0.5);
  }
}
