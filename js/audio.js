// Rally Legends — synthesized audio (Web Audio API only, no files).
// export class RallyAudio — see API at bottom of header in README of integrator notes.

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;

// Engine character presets. harm = harmonic amplitudes relative to firing freq (index 1 = fundamental).
const CHAR = {
  i4:     { cyl: 4, harm: [0, 1, 0.55, 0.35, 0.28, 0.18, 0.14, 0.1, 0.08, 0.06, 0.05], sub: 0.15, subRatio: 0.5, noise: 0.35, rasp: 0.5, bright: 1.0 },
  i4t:    { cyl: 4, harm: [0, 1, 0.5, 0.3, 0.22, 0.15, 0.1, 0.07, 0.05, 0.04], sub: 0.18, subRatio: 0.5, noise: 0.45, rasp: 0.35, bright: 0.85 },
  i5:     { cyl: 5, harm: [0, 1, 0.25, 0.6, 0.18, 0.45, 0.12, 0.3, 0.08, 0.2, 0.05, 0.12], sub: 0.35, subRatio: 0.4, noise: 0.45, rasp: 0.45, bright: 0.95 },
  boxer:  { cyl: 4, harm: [0, 0.8, 0.6, 0.3, 0.25, 0.12, 0.08, 0.05], sub: 0.8, subRatio: 0.5, noise: 0.5, rasp: 0.25, bright: 0.7 },
  bda:    { cyl: 4, harm: [0, 1, 0.7, 0.55, 0.45, 0.38, 0.3, 0.26, 0.22, 0.18, 0.15, 0.12, 0.1], sub: 0.1, subRatio: 0.5, noise: 0.3, rasp: 1.0, bright: 1.3 },
  v6:     { cyl: 6, harm: [0, 1, 0.35, 0.25, 0.5, 0.15, 0.1, 0.35, 0.06, 0.05, 0.2], sub: 0.12, subRatio: 0.5, noise: 0.25, rasp: 0.3, bright: 1.25, wail: 0.35 },
  mini:   { cyl: 4, harm: [0, 0.7, 0.8, 0.6, 0.55, 0.45, 0.4, 0.3, 0.25, 0.2, 0.18], sub: 0.05, subRatio: 0.5, noise: 0.3, rasp: 0.8, bright: 1.4 },
};
const CAR_CHAR = { integrale: 'i4t', s1e2: 'i5', '205t16': 'i4t', impreza: 'boxer', evo6: 'i4t', rs1800: 'bda', stratos: 'v6', rally1: 'i4t', mini: 'mini' };

const SURF = {
  // rumble(lowpass), crunch(bandpass), hiss(highpass), hum(tyre), pings/s at 20m/s, rattle, squealAllowed
  tarmac:   { rumble: 0.25, crunch: 0.0, hiss: 0.08, hum: 0.5, pings: 0, rattle: 0.05, squeal: 1, cf: 1200 },
  pavement: { rumble: 0.3, crunch: 0.02, hiss: 0.08, hum: 0.45, pings: 0, rattle: 0.1, squeal: 1, cf: 1200 },
  gravel:   { rumble: 0.45, crunch: 0.7, hiss: 0.25, hum: 0.05, pings: 14, rattle: 0.5, squeal: 0, cf: 2600 },
  rocky:    { rumble: 0.6, crunch: 0.6, hiss: 0.15, hum: 0.05, pings: 18, rattle: 0.9, squeal: 0, cf: 1800 },
  dirt:     { rumble: 0.6, crunch: 0.2, hiss: 0.1, hum: 0.05, pings: 3, rattle: 0.35, squeal: 0, cf: 900 },
  sand:     { rumble: 0.55, crunch: 0.25, hiss: 0.2, hum: 0.0, pings: 1, rattle: 0.2, squeal: 0, cf: 1400 },
  mud:      { rumble: 0.75, crunch: 0.05, hiss: 0.0, hum: 0.0, pings: 0, rattle: 0.3, squeal: 0, cf: 400, slosh: 1 },
  grass:    { rumble: 0.25, crunch: 0.1, hiss: 0.35, hum: 0.0, pings: 0, rattle: 0.2, squeal: 0, cf: 3500 },
  snow:     { rumble: 0.2, crunch: 0.45, hiss: 0.2, hum: 0.05, pings: 0, rattle: 0.1, squeal: 0.3, cf: 3200 },
  deepsnow: { rumble: 0.35, crunch: 0.4, hiss: 0.15, hum: 0.0, pings: 0, rattle: 0.1, squeal: 0, cf: 2200 },
  slush:    { rumble: 0.4, crunch: 0.1, hiss: 0.3, hum: 0.05, pings: 0, rattle: 0.1, squeal: 0, cf: 700, slosh: 0.6 },
  ice:      { rumble: 0.1, crunch: 0.05, hiss: 0.35, hum: 0.15, pings: 0, rattle: 0.05, squeal: 0.4, cf: 4500 },
};

export class RallyAudio {
  constructor() {
    this.ctx = null;
    this.ready = false;
    this.paused = false;
    this.vol = { master: 0.8, engine: 0.8, fx: 0.8, codriver: 1 };
    this.car = null;
    this._carSpec = null;
    this._prev = { throttle: 0, boost: 0 };
    this._limT = 0; this._shiftT = 0; this._popT = 0; this._pingAcc = 0; this._rattleAcc = 0; this._squeakAcc = 0;
    this._duck = 1; this._speaking = 0;
    this._voice = null;
    this._inside = false;
  }

  // ---------- setup ----------
  async unlock() {
    try {
      if (!this.ctx) {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return false;
        this.ctx = new AC();
        this._build();
      }
      if (this.ctx.state !== 'running') await this.ctx.resume();
      // iOS: play a silent buffer inside the gesture
      const b = this.ctx.createBufferSource(); b.buffer = this.ctx.createBuffer(1, 1, 22050);
      b.connect(this.ctx.destination); b.start(0);
      this.ready = true;
      if (this._carSpec && !this.car) this.setCar(this._carSpec);
      this._pickVoice();
      return true;
    } catch (e) { console.warn('[audio] unlock failed', e); return false; }
  }

  _build() {
    const c = this.ctx;
    this.comp = c.createDynamicsCompressor();
    this.comp.threshold.value = -14; this.comp.knee.value = 12; this.comp.ratio.value = 6;
    this.comp.attack.value = 0.004; this.comp.release.value = 0.2;
    this.master = c.createGain(); this.master.gain.value = this.vol.master;
    this.comp.connect(this.master); this.master.connect(c.destination);

    this.engineBus = c.createGain(); this.engineBus.gain.value = this.vol.engine; this.engineBus.connect(this.comp);
    this.fxBus = c.createGain(); this.fxBus.gain.value = this.vol.fx; this.fxBus.connect(this.comp);
    this.uiBus = c.createGain(); this.uiBus.gain.value = 0.6; this.uiBus.connect(this.comp);
    this.voiceBus = c.createGain(); this.voiceBus.gain.value = this.vol.codriver * 0.5; this.voiceBus.connect(this.comp);
    // outside world (surface, wind) -> lowpass when in cockpit
    this.outLP = c.createBiquadFilter(); this.outLP.type = 'lowpass'; this.outLP.frequency.value = 18000;
    this.outLP.connect(this.fxBus);

    // shared noise buffers
    const mk = (sec, fn) => { const n = Math.floor(c.sampleRate * sec); const b = c.createBuffer(1, n, c.sampleRate); const d = b.getChannelData(0); fn(d, n); return b; };
    this.white = mk(2, (d, n) => { for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1; });
    this.brown = mk(2, (d, n) => { let l = 0; for (let i = 0; i < n; i++) { l = (l + 0.02 * (Math.random() * 2 - 1)) / 1.02; d[i] = l * 3.5; } });
    this.shortNoise = mk(0.5, (d, n) => { for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1; });

    this._buildWorld();
  }

  _loop(buf) { const s = this.ctx.createBufferSource(); s.buffer = buf; s.loop = true; s.loopStart = 0; s.start(0, Math.random() * buf.duration); return s; }
  _gain(v = 0, dest) { const g = this.ctx.createGain(); g.gain.value = v; if (dest) g.connect(dest); return g; }
  _filt(type, f, Q = 1, gain = 0) { const b = this.ctx.createBiquadFilter(); b.type = type; b.frequency.value = f; b.Q.value = Q; b.gain.value = gain; return b; }
  _set(p, v, tc = 0.03) { if (!p || !isFinite(v)) return; p.setTargetAtTime(v, this.ctx.currentTime, tc); }

  _buildWorld() {
    const c = this.ctx;
    const wn = this._loop(this.white), bn = this._loop(this.brown);
    this._worldSrc = [wn, bn];
    const w = this.world = {};
    // rumble
    w.rumbleF = this._filt('lowpass', 180, 0.7); w.rumble = this._gain(0, this.outLP); bn.connect(w.rumbleF).connect(w.rumble);
    // crunch (gravel/snow) — bandpass white, AM by a random-ish low osc to make it granular
    w.crunchF = this._filt('bandpass', 2500, 0.9); w.crunchAM = this._gain(0.5); w.crunch = this._gain(0, this.outLP);
    wn.connect(w.crunchF).connect(w.crunchAM).connect(w.crunch);
    w.gran = c.createOscillator(); w.gran.type = 'square'; w.gran.frequency.value = 23; const gd = this._gain(0.45); w.gran.connect(gd).connect(w.crunchAM.gain); w.gran.start();
    // hiss/swish
    w.hissF = this._filt('highpass', 3000, 0.7); w.hiss = this._gain(0, this.outLP); wn.connect(w.hissF).connect(w.hiss);
    // tyre hum (tarmac)
    w.humF = this._filt('bandpass', 120, 2); w.hum = this._gain(0, this.outLP); bn.connect(w.humF).connect(w.hum);
    // slosh (mud) — lowpassed brown with slow LFO wobble on filter
    w.sloshF = this._filt('lowpass', 300, 4); w.slosh = this._gain(0, this.outLP); bn.connect(w.sloshF).connect(w.slosh);
    w.sloshL = c.createOscillator(); w.sloshL.frequency.value = 3.1; const sl = this._gain(180); w.sloshL.connect(sl).connect(w.sloshF.frequency); w.sloshL.start();
    // tyre squeal
    w.squealF = this._filt('bandpass', 1100, 18); w.squealF2 = this._filt('peaking', 2200, 6, 10); w.squeal = this._gain(0, this.outLP);
    wn.connect(w.squealF).connect(w.squealF2).connect(w.squeal);
    w.sqL = c.createOscillator(); w.sqL.frequency.value = 7; const sqd = this._gain(60); w.sqL.connect(sqd).connect(w.squealF.frequency); w.sqL.start();
    // wind
    w.windF = this._filt('bandpass', 500, 0.6); w.wind = this._gain(0, this.outLP); wn.connect(w.windF).connect(w.wind);
    w.windL = c.createOscillator(); w.windL.frequency.value = 0.37; const wd = this._gain(150); w.windL.connect(wd).connect(w.windF.frequency); w.windL.start();
  }

  // ---------- engine ----------
  setCar(spec) {
    this._carSpec = spec;
    if (!this.ctx) return;
    this._teardownCar();
    const c = this.ctx;
    const id = typeof spec === 'string' ? spec : (spec && spec.id) || 'integrale';
    const eng = (spec && spec.engine) || {};
    const ch = { ...CHAR[CAR_CHAR[id] || (eng.boxer ? 'boxer' : eng.v6 ? 'v6' : eng.turbo ? 'i4t' : 'i4')] };
    const E = this.car = {
      id, ch, eng: { idle: eng.idle || 1000, redline: eng.redline || 7500, limiter: eng.limiter || 7700, turbo: !!eng.turbo, antilag: !!eng.antilag, hybrid: !!eng.hybrid },
      drivetrain: (spec && spec.drivetrain) || 'AWD', nodes: [], srcs: [],
    };
    E.dogbox = E.eng.turbo && E.drivetrain === 'AWD';
    const keep = (n) => { E.nodes.push(n); return n; };
    const src = (n) => { E.srcs.push(n); E.nodes.push(n); return n; };

    // output chain: sum -> formants -> lowpass tone -> throttleGain -> limiter cut -> shift cut -> duck -> engineBus
    E.sum = keep(this._gain(1));
    E.exh = keep(this._filt('peaking', 180, 1.2, 6));      // exhaust body
    E.intake = keep(this._filt('peaking', 900, 2.0, 0));   // intake honk (throttle)
    E.rasp = keep(this._filt('peaking', 2800, 1.5, 0));    // high rpm rasp
    E.tone = keep(this._filt('lowpass', 1500, 0.8));
    E.vol = keep(this._gain(0));
    E.cut = keep(this._gain(1));
    E.duck = keep(this._gain(1));
    E.sum.connect(E.exh).connect(E.intake).connect(E.rasp).connect(E.tone).connect(E.vol).connect(E.cut).connect(E.duck).connect(this.engineBus);

    // harmonic bank
    const h = ch.harm; const re = new Float32Array(h.length), im = new Float32Array(h.length);
    for (let i = 1; i < h.length; i++) im[i] = h[i] * (i % 2 ? 1 : -1) * (1 + 0.05 * Math.sin(i * 1.7));
    const wave = c.createPeriodicWave(re, im);
    E.osc = src(c.createOscillator()); E.osc.setPeriodicWave(wave);
    E.osc2 = src(c.createOscillator()); E.osc2.setPeriodicWave(wave); E.osc2.detune.value = 9; // chorus / cylinder mismatch
    E.oscG = keep(this._gain(0.5)); E.osc2G = keep(this._gain(0.28));
    E.osc.connect(E.oscG).connect(E.sum); E.osc2.connect(E.osc2G).connect(E.sum);
    // uneven firing roughness: AM of bank at crank rate
    E.am = src(c.createOscillator()); E.am.type = 'sine'; E.amD = keep(this._gain(0.25));
    E.am.connect(E.amD).connect(E.oscG.gain);
    // sub-harmonic (boxer burble / I5 warble)
    E.sub = src(c.createOscillator()); E.sub.type = 'triangle'; E.subG = keep(this._gain(ch.sub * 0.4));
    E.sub.connect(E.subG).connect(E.sum);
    // V6 wail
    if (ch.wail) { E.wail = src(c.createOscillator()); E.wail.type = 'sine'; E.wailG = keep(this._gain(0)); E.wail.connect(E.wailG).connect(E.sum); }
    // combustion noise, AM at firing frequency
    E.noise = src(this._loop(this.white)); E.nF = keep(this._filt('bandpass', 600, 0.8));
    E.nAM = keep(this._gain(0.0)); E.nG = keep(this._gain(ch.noise));
    E.noise.connect(E.nF).connect(E.nAM).connect(E.nG).connect(E.sum);
    E.fire = src(c.createOscillator()); E.fire.type = 'sawtooth'; E.fireD = keep(this._gain(0.5));
    E.fire.connect(E.fireD).connect(E.nAM.gain);
    // mechanical: gearbox whine (dogbox) + valvetrain tick
    E.gear = src(c.createOscillator()); E.gear.type = 'sine'; E.gearG = keep(this._gain(0));
    E.gear.connect(E.gearG).connect(E.duck);
    // turbo whistle
    if (E.eng.turbo) {
      E.tb = src(c.createOscillator()); E.tb.type = 'sine'; E.tbG = keep(this._gain(0));
      E.tb.connect(E.tbG).connect(E.duck);
      E.tbN = src(this._loop(this.white)); E.tbNF = keep(this._filt('bandpass', 4000, 6)); E.tbNG = keep(this._gain(0));
      E.tbN.connect(E.tbNF).connect(E.tbNG).connect(E.duck);
    }
    if (E.eng.hybrid) { E.hy = src(c.createOscillator()); E.hy.type = 'sine'; E.hyG = keep(this._gain(0)); E.hy.connect(E.hyG).connect(E.duck); }

    for (const s of E.srcs) if (s.start && !s.loop) { try { s.start(); } catch (_) {} }
    E.rpm = E.eng.idle;
  }

  _teardownCar() {
    const E = this.car; if (!E) return;
    const t = this.ctx.currentTime;
    try { E.duck.gain.setTargetAtTime(0, t, 0.02); } catch (_) {}
    setTimeout(() => { for (const s of E.srcs) { try { s.stop(); } catch (_) {} } for (const n of E.nodes) { try { n.disconnect(); } catch (_) {} } }, 150);
    this.car = null;
  }

  // ---------- per-frame ----------
  update(dt, s = {}) {
    if (!this.ctx || !this.ready) return;
    if (s.paused) { if (!this.paused) this.pause(); return; } else if (this.paused) this.resume();
    const c = this.ctx, t = c.currentTime, E = this.car;
    dt = clamp(dt || 0.016, 0, 0.1);
    const speed = Math.abs(s.speed || 0), thr = clamp(s.throttle || 0, 0, 1), load = clamp(s.load ?? thr, -1, 1);
    const boost = clamp(s.turboBoost || 0, 0, 1);
    const slips = s.wheelSlip || [0, 0, 0, 0]; const slip = Math.max(...slips.map(x => x || 0));
    const onG = s.onGround !== false;

    // cockpit filter
    if (this._inside !== !!s.camInside) { this._inside = !!s.camInside; this._set(this.outLP.frequency, this._inside ? 2400 : 18000, 0.1); }

    // speech duck
    const speaking = typeof speechSynthesis !== 'undefined' && speechSynthesis.speaking;
    this._duck = speaking ? 0.7 : 1;

    if (E) {
      const ch = E.ch, eng = E.eng;
      const rpm = clamp(s.rpm || eng.idle, 300, eng.limiter + 300); E.rpm = rpm;
      const n = clamp((rpm - eng.idle) / (eng.redline - eng.idle), 0, 1.1);
      const crank = rpm / 60, f = crank * ch.cyl / 2;
      const tc = 0.012;
      this._set(E.osc.frequency, f, tc); this._set(E.osc2.frequency, f, tc);
      this._set(E.am.frequency, crank * 0.5, tc);
      this._set(E.fire.frequency, f, tc);
      this._set(E.sub.frequency, f * ch.subRatio, tc);
      if (E.wail) { this._set(E.wail.frequency, f * 3, tc); this._set(E.wailG.gain, ch.wail * n * (0.3 + 0.7 * thr) * 0.3, 0.05); }
      // roughness: more at low rpm
      this._set(E.amD.gain, lerp(0.35, 0.08, n) * (ch.sub + 0.3), 0.05);
      this._set(E.subG.gain, ch.sub * 0.35 * lerp(1, 0.4, n) * (0.5 + 0.5 * thr), 0.05);
      // tone: deep at low rpm, raspy high
      const pos = load > 0 ? load : 0, neg = load < 0 ? -load : 0;
      this._set(E.tone.frequency, clamp((400 + 4200 * n * ch.bright) * (0.55 + 0.45 * Math.max(thr, 0.2)) , 200, 12000), 0.03);
      this._set(E.exh.frequency, 90 + 180 * n, 0.05);
      this._set(E.exh.gain, 6 + 4 * pos, 0.05);
      this._set(E.intake.frequency, 600 + 900 * n, 0.05);
      this._set(E.intake.gain, 9 * thr * (0.4 + 0.6 * pos), 0.04);
      this._set(E.rasp.gain, 10 * ch.rasp * n * n * thr, 0.04);
      this._set(E.nF.frequency, 300 + 2200 * n, 0.04);
      this._set(E.nG.gain, ch.noise * (0.25 + 0.9 * thr) * (E.eng.turbo ? 0.8 : 1), 0.04);
      const vol = (0.22 + 0.45 * thr + 0.15 * n) * (neg > 0 ? lerp(1, 0.55, neg) : 1);
      this._set(E.vol.gain, vol, 0.03);

      // limiter stutter
      if (rpm >= eng.limiter - 50) {
        this._limT -= dt;
        if (this._limT <= 0) { this._limT = 0.06 + Math.random() * 0.03; E.cut.gain.cancelScheduledValues(t); E.cut.gain.setValueAtTime(0.15, t); E.cut.gain.setTargetAtTime(1, t + 0.03, 0.008); }
      }
      // shift
      if (s.shift) {
        E.cut.gain.cancelScheduledValues(t); E.cut.gain.setTargetAtTime(0.1, t, 0.008); E.cut.gain.setTargetAtTime(1, t + 0.09, 0.03);
        this._burst({ type: 'lowpass', f: 260, Q: 3, dur: 0.07, gain: E.dogbox ? 0.6 : 0.3, when: t + 0.05, bus: this.fxBus });
        this._tone(E.dogbox ? 1900 : 1400, 0.03, 0.06, 'square', this.fxBus, t + 0.05, 0.4);
        if (E.eng.turbo && boost > 0.4 && Math.random() < 0.7) this._pssh(0.35 * boost, t + 0.02);
      }
      // dogbox / gearbox whine
      const gw = (E.dogbox ? 0.05 : 0.012) * clamp(speed / 30, 0, 1) * (this._inside ? 2 : 0.7) * (0.4 + 0.6 * Math.abs(load));
      this._set(E.gear.frequency, 180 + speed * 38, 0.05); this._set(E.gearG.gain, gw, 0.08);
      // turbo
      if (E.tb) {
        this._set(E.tb.frequency, 2200 + 5500 * boost, 0.06);
        this._set(E.tbG.gain, 0.03 * boost * boost * (0.3 + 0.7 * thr), 0.06);
        this._set(E.tbNF.frequency, 3000 + 4000 * boost, 0.06);
        this._set(E.tbNG.gain, 0.08 * boost * thr, 0.06);
        if (this._prev.throttle > 0.6 && thr < 0.2 && Math.max(boost, this._prev.boost) > 0.5) this._pssh(0.7, t);
      }
      if (E.hy) { this._set(E.hy.frequency, clamp(1500 + speed * 55, 1500, 4000), 0.05); this._set(E.hyG.gain, 0.012 * clamp(speed / 10, 0, 1) * (0.4 + Math.abs(load)), 0.08); }
      // anti-lag bang
      if (s.antilagPop) this._bang(0.9);
      // overrun pops/crackles
      if (thr < 0.15 && n > 0.3) {
        const rate = (eng.antilag ? 9 : 3) * n * (0.5 + neg);
        this._popT -= dt;
        if (this._popT <= 0) {
          this._popT = -Math.log(Math.random() + 1e-4) / rate;
          const g = (eng.antilag ? 0.5 : 0.3) * (0.4 + Math.random() * 0.6);
          this._burst({ type: 'bandpass', f: 500 + Math.random() * 1400, Q: 1.2, dur: 0.02 + Math.random() * 0.05, gain: g, bus: this.fxBus });
        }
      }
      E.duck.gain.setTargetAtTime(this._duck, t, 0.1);
    }
    this._prev.throttle = thr; this._prev.boost = boost;

    // ---------- world ----------
    const w = this.world, sp = SURF[s.surface] || SURF.gravel;
    const g = onG ? clamp(speed / 25, 0, 1.4) : 0;
    const gs = Math.sqrt(g);
    this._set(w.rumble.gain, sp.rumble * 0.5 * gs, 0.08); this._set(w.rumbleF.frequency, 120 + speed * 5, 0.1);
    this._set(w.crunch.gain, sp.crunch * 0.35 * g * (1 + slip), 0.06); this._set(w.crunchF.frequency, sp.cf, 0.1);
    this._set(w.gran.frequency, 8 + speed * 2.2, 0.1);
    this._set(w.hiss.gain, sp.hiss * 0.15 * g, 0.08);
    this._set(w.hum.gain, sp.hum * 0.6 * gs, 0.08); this._set(w.humF.frequency, 70 + speed * 4, 0.1);
    this._set(w.slosh.gain, (sp.slosh || 0) * 0.6 * gs, 0.08);
    const sq = onG && sp.squeal ? clamp((slip - 0.3) / 0.5, 0, 1) * clamp(speed / 5, 0, 1) * sp.squeal : 0;
    this._set(w.squeal.gain, sq * 0.22, 0.04); this._set(w.squealF.frequency, 850 + 500 * clamp(slip - 0.3, 0, 1), 0.05);
    const ws = clamp(speed / 50, 0, 1.3); this._set(w.wind.gain, 0.25 * ws * ws * (this._inside ? 0.6 : 1), 0.1);
    this._set(w.windF.frequency, 350 + speed * 18, 0.2);

    if (onG && speed > 2) {
      // stone pings
      if (sp.pings) {
        this._pingAcc += dt * sp.pings * (speed / 20) * (1 + 2 * slip);
        while (this._pingAcc >= 1) { this._pingAcc -= Math.random() * 1.6 + 0.2; this._ping(); }
      }
      // body rattles
      if (sp.rattle > 0.15) {
        this._rattleAcc += dt * sp.rattle * speed * 0.25;
        if (this._rattleAcc >= 1) { this._rattleAcc = 0; this._burst({ type: 'bandpass', f: 250 + Math.random() * 500, Q: 5, dur: 0.03, gain: 0.08 * sp.rattle, bus: this.fxBus }); }
      }
      // snow squeak
      if (s.surface === 'snow' || s.surface === 'deepsnow') {
        this._squeakAcc += dt * speed * 0.3;
        if (this._squeakAcc >= 1) { this._squeakAcc = 0; this._tone(1400 + Math.random() * 900, 0.04, 0.025, 'triangle', this.outLP, 0, 0.8); }
      }
    }
    if (s.suspHit > 0.05) this._thump(clamp(s.suspHit, 0, 1));
  }

  // ---------- one-shots ----------
  _burst({ type = 'bandpass', f = 1000, Q = 1, dur = 0.05, gain = 0.3, when = 0, bus, buf, attack = 0.002 }) {
    const c = this.ctx; if (!c) return;
    const t = Math.max(when || 0, c.currentTime);
    const s = c.createBufferSource(); s.buffer = buf || this.shortNoise;
    const fl = c.createBiquadFilter(); fl.type = type; fl.frequency.value = f; fl.Q.value = Q;
    const g = c.createGain(); g.gain.value = 0;
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(gain, t + attack); g.gain.setTargetAtTime(0, t + attack, dur / 3);
    s.connect(fl).connect(g).connect(bus || this.fxBus);
    s.start(t, Math.random() * 0.3, dur * 3 + 0.05);
    s.onended = () => { try { g.disconnect(); } catch (_) {} };
  }
  _tone(freq, gain, dur, type = 'sine', bus, when = 0, slideTo = 1) {
    const c = this.ctx; if (!c) return;
    const t = Math.max(when || 0, c.currentTime);
    const o = c.createOscillator(); o.type = type; o.frequency.setValueAtTime(freq, t);
    if (slideTo !== 1) o.frequency.exponentialRampToValueAtTime(Math.max(20, freq * slideTo), t + dur);
    const g = c.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(gain, t + 0.005); g.gain.setTargetAtTime(0, t + 0.005, dur / 3);
    o.connect(g).connect(bus || this.fxBus); o.start(t); o.stop(t + dur * 3 + 0.05);
    o.onended = () => { try { g.disconnect(); } catch (_) {} };
  }
  _pssh(gain, when) {
    this._burst({ type: 'highpass', f: 2500, Q: 0.7, dur: 0.25, gain, when, attack: 0.01 });
    this._burst({ type: 'bandpass', f: 5500, Q: 2, dur: 0.18, gain: gain * 0.5, when });
  }
  _bang(k) {
    this._burst({ type: 'lowpass', f: 700, Q: 1, dur: 0.06, gain: 1.0 * k });
    this._burst({ type: 'bandpass', f: 1800, Q: 1, dur: 0.03, gain: 0.5 * k });
    this._tone(90, 0.8 * k, 0.08, 'sine', this.fxBus, 0, 0.5);
  }
  _ping() {
    const f = 2500 + Math.random() * 4500;
    this._tone(f, 0.03 + Math.random() * 0.05, 0.02 + Math.random() * 0.03, 'triangle', this.outLP, 0, 0.9);
    this._burst({ type: 'highpass', f: 3000, Q: 1, dur: 0.006, gain: 0.08, bus: this.outLP });
  }
  _thump(k) {
    this._tone(70, 0.9 * k, 0.12, 'sine', this.fxBus, 0, 0.55);
    this._burst({ type: 'lowpass', f: 300, Q: 1, dur: 0.08, gain: 0.7 * k, buf: this.brown });
    if (k > 0.4) this._burst({ type: 'bandpass', f: 900, Q: 3, dur: 0.05, gain: 0.25 * k });
  }

  impact(strength = 0.5, kind = 'barrier') {
    if (!this.ctx || !this.ready) return;
    const k = clamp(strength, 0.05, 1), t = this.ctx.currentTime;
    if (kind === 'barrier' || kind === 'car') {
      this._tone(60, 0.9 * k, 0.12, 'sine', this.fxBus, 0, 0.6);
      this._burst({ type: 'lowpass', f: 900, Q: 1, dur: 0.1, gain: 0.8 * k });
      for (let i = 0; i < 4; i++) this._burst({ type: 'bandpass', f: 1200 + Math.random() * 3000, Q: 12, dur: 0.15 + Math.random() * 0.2, gain: 0.35 * k, when: t + i * 0.012 });
      this._burst({ type: 'highpass', f: 3500, Q: 1, dur: 0.12, gain: 0.3 * k, when: t + 0.03 }); // glass/debris
    } else if (kind === 'tree') {
      this._tone(85, 1.0 * k, 0.15, 'sine', this.fxBus, 0, 0.6);
      this._burst({ type: 'bandpass', f: 350, Q: 4, dur: 0.12, gain: 0.8 * k });
      this._burst({ type: 'bandpass', f: 1600, Q: 2, dur: 0.03, gain: 0.6 * k, when: t + 0.04 }); // crack
      this._burst({ type: 'highpass', f: 2500, Q: 0.8, dur: 0.35, gain: 0.12 * k, when: t + 0.06 }); // leaves
    } else if (kind === 'rock') {
      this._tone(110, 0.9 * k, 0.06, 'triangle', this.fxBus, 0, 0.5);
      this._burst({ type: 'bandpass', f: 700, Q: 3, dur: 0.05, gain: 0.9 * k });
      this._burst({ type: 'bandpass', f: 2600, Q: 8, dur: 0.1, gain: 0.25 * k, when: t + 0.01 });
    } else {
      this._thump(k);
    }
  }

  ui(kind = 'click') {
    if (!this.ctx || !this.ready) return;
    const t = this.ctx.currentTime, B = this.uiBus;
    switch (kind) {
      case 'click': this._tone(1800, 0.15, 0.02, 'square', B); break;
      case 'select': this._tone(880, 0.25, 0.05, 'triangle', B); this._tone(1320, 0.25, 0.08, 'triangle', B, t + 0.05); break;
      case 'back': this._tone(660, 0.25, 0.05, 'triangle', B); this._tone(440, 0.25, 0.08, 'triangle', B, t + 0.05); break;
      case 'countdown': this._tone(880, 0.45, 0.12, 'square', B); break;
      case 'go': this._tone(1760, 0.5, 0.45, 'square', B); this._tone(880, 0.3, 0.45, 'sine', B); break;
      case 'split': [1046, 1318, 1568].forEach((f, i) => this._tone(f, 0.3, 0.2, 'sine', B, t + i * 0.07)); break;
      case 'finish': [523, 659, 784, 1046, 784, 1046].forEach((f, i) => { this._tone(f, 0.35, i === 5 ? 0.8 : 0.15, 'triangle', B, t + i * 0.12); this._tone(f * 2, 0.1, 0.15, 'sine', B, t + i * 0.12); }); break;
      case 'penalty': this._tone(220, 0.5, 0.25, 'sawtooth', B); this._tone(165, 0.5, 0.4, 'sawtooth', B, t + 0.22); break;
    }
  }

  // ---------- co-driver ----------
  _pickVoice() {
    if (typeof speechSynthesis === 'undefined') return;
    const pick = () => {
      const vs = speechSynthesis.getVoices() || []; if (!vs.length) return;
      const score = (v) => (/en-GB/i.test(v.lang) ? 4 : /^en/i.test(v.lang) ? 2 : 0) + (/male|daniel|george|arthur|ryan|oliver|brian/i.test(v.name) && !/female/i.test(v.name) ? 2 : 0) + (v.localService ? 0.5 : 0);
      this._voice = vs.slice().sort((a, b) => score(b) - score(a))[0];
    };
    pick(); try { speechSynthesis.addEventListener('voiceschanged', pick); } catch (_) {}
  }
  codriver(text, urgent = false) {
    if (!text) return;
    if (this.ctx && this.ready) {
      // intercom click + short static
      this._tone(2400, 0.2 * this.vol.codriver, 0.01, 'square', this.voiceBus);
      this._burst({ type: 'bandpass', f: 2000, Q: 1.5, dur: 0.04, gain: 0.12 * this.vol.codriver, bus: this.voiceBus });
    }
    if (typeof speechSynthesis === 'undefined' || typeof SpeechSynthesisUtterance === 'undefined') return;
    try {
      this._queued = (this._queued || 0);
      if (urgent || this._queued > 2) { speechSynthesis.cancel(); this._queued = 0; }
      if (!this._voice) this._pickVoice();
      const u = new SpeechSynthesisUtterance(text);
      if (this._voice) { u.voice = this._voice; u.lang = this._voice.lang; } else u.lang = 'en-GB';
      u.rate = urgent ? 1.35 : 1.25; u.pitch = 0.95; u.volume = clamp(this.vol.codriver * this.vol.master * 1.2, 0, 1);
      this._queued++;
      const done = () => { this._queued = Math.max(0, this._queued - 1); };
      u.onend = done; u.onerror = done;
      speechSynthesis.speak(u);
    } catch (e) { console.warn('[audio] speech failed', e); }
  }

  // ---------- control ----------
  setVolume(v = {}) {
    Object.assign(this.vol, v);
    if (!this.ctx) return;
    this._set(this.master.gain, this.vol.master, 0.05);
    this._set(this.engineBus.gain, this.vol.engine, 0.05);
    this._set(this.fxBus.gain, this.vol.fx, 0.05);
    this._set(this.voiceBus.gain, this.vol.codriver * 0.5, 0.05);
  }
  pause() {
    this.paused = true;
    if (this.ctx && this.ctx.state === 'running') this.ctx.suspend().catch(() => {});
    try { if (typeof speechSynthesis !== 'undefined') speechSynthesis.pause(); } catch (_) {}
  }
  resume() {
    this.paused = false;
    if (this.ctx && this.ctx.state !== 'running') this.ctx.resume().catch(() => {});
    try { if (typeof speechSynthesis !== 'undefined') speechSynthesis.resume(); } catch (_) {}
  }
  stopAll() {
    try { if (typeof speechSynthesis !== 'undefined') speechSynthesis.cancel(); } catch (_) {}
    this._queued = 0;
    if (!this.ctx) return;
    this._teardownCar();
    const w = this.world; if (w) for (const k of ['rumble', 'crunch', 'hiss', 'hum', 'slosh', 'squeal', 'wind']) this._set(w[k].gain, 0, 0.03);
  }
}

export default RallyAudio;
