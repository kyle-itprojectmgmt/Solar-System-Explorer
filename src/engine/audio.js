// ---------------------------------------------------------------------------
// Audio engine — Web Audio API generative soundscapes.
// Modes: silent | voyager | ambient | psychedelic | electronic | spotify | youtube
// All procedural modes are built from oscillators / filtered noise /
// convolution reverb, with slow randomized modulation so nothing loops.
// 2-second crossfade between modes; state persisted to localStorage.
// ---------------------------------------------------------------------------

export const AUDIO_MODES = [
  { id: 'silent', label: 'Silent', icon: '🔇' },
  { id: 'voyager', label: 'Voyager Radio', icon: '📡' },
  { id: 'ambient', label: 'Deep Space Ambient', icon: '🌌' },
  { id: 'psychedelic', label: 'Psychedelic Journey', icon: '🌀' },
  { id: 'electronic', label: 'Cosmic Electronic', icon: '🎛️' },
  { id: 'spotify', label: 'Spotify', icon: '🎧' },
  { id: 'youtube', label: 'YouTube', icon: '▶️' },
];

const FADE_S = 2;

export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.current = null; // { gain, stop }
    this.mode = localStorage.getItem('sse-audio-mode') || 'silent';
    this.volume = parseFloat(localStorage.getItem('sse-audio-volume') ?? '0.6');
    this.onEmbedRequest = null; // (mode) => void — UI shows spotify/youtube drawer
  }

  _ensureCtx() {
    if (!this.ctx) {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.volume;
      this.master.connect(this.ctx.destination);
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
  }

  setVolume(v) {
    this.volume = v;
    localStorage.setItem('sse-audio-volume', String(v));
    if (this.master) this.master.gain.setTargetAtTime(v, this.ctx.currentTime, 0.1);
  }

  setMode(mode) {
    this.mode = mode;
    localStorage.setItem('sse-audio-mode', mode);

    // Fade out whatever is playing.
    if (this.current) {
      const { gain, stop } = this.current;
      const t = this.ctx.currentTime;
      gain.gain.setTargetAtTime(0, t, FADE_S / 4);
      setTimeout(stop, FADE_S * 1000);
      this.current = null;
    }

    if (mode === 'silent') return;
    if (mode === 'spotify' || mode === 'youtube') {
      this.onEmbedRequest?.(mode);
      return;
    }

    this._ensureCtx();
    const gain = this.ctx.createGain();
    gain.gain.value = 0;
    gain.connect(this.master);
    gain.gain.setTargetAtTime(1, this.ctx.currentTime, FADE_S / 4);

    const builders = {
      voyager: buildVoyagerRadio,
      ambient: buildDeepSpaceAmbient,
      psychedelic: buildPsychedelicJourney,
      electronic: buildCosmicElectronic,
    };
    const stop = builders[mode]?.(this.ctx, gain) || (() => {});
    this.current = { gain, stop };
  }
}

// -- Shared helpers -----------------------------------------------------------

function noiseBuffer(ctx, seconds = 4) {
  const buf = ctx.createBuffer(1, ctx.sampleRate * seconds, ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  return buf;
}

/** Long exponential-decay impulse response for cavernous reverb. */
function reverbNode(ctx, seconds = 7, decay = 3.5) {
  const rate = ctx.sampleRate;
  const buf = ctx.createBuffer(2, rate * seconds, rate);
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    for (let i = 0; i < d.length; i++) {
      d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / d.length, decay);
    }
  }
  const conv = ctx.createConvolver();
  conv.buffer = buf;
  return conv;
}

function lfo(ctx, freq, depth, target) {
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.frequency.value = freq;
  g.gain.value = depth;
  osc.connect(g).connect(target);
  osc.start();
  return osc;
}

// -- Mode 2: Voyager Radio ------------------------------------------------------
// Crackling, tonal, alien electromagnetic interference — an homage to the
// Voyager plasma wave recordings.

function buildVoyagerRadio(ctx, out) {
  const nodes = [];
  const timers = [];

  // Hissing background static.
  const noise = ctx.createBufferSource();
  noise.buffer = noiseBuffer(ctx); noise.loop = true;
  const bp = ctx.createBiquadFilter();
  bp.type = 'bandpass'; bp.frequency.value = 1800; bp.Q.value = 0.6;
  const hissGain = ctx.createGain(); hissGain.gain.value = 0.05;
  noise.connect(bp).connect(hissGain).connect(out);
  noise.start();
  nodes.push(noise);
  lfo(ctx, 0.07, 700, bp.frequency);

  // Slow sweeping whistler tones.
  for (let i = 0; i < 3; i++) {
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = 300 + i * 260;
    const g = ctx.createGain(); g.gain.value = 0.028;
    osc.connect(g).connect(out);
    osc.start();
    nodes.push(osc);
    lfo(ctx, 0.02 + i * 0.013, 140 + i * 90, osc.frequency);
    lfo(ctx, 0.05 + i * 0.021, 0.02, g.gain);
  }

  // Random crackle bursts.
  const crackle = () => {
    const src = ctx.createBufferSource();
    src.buffer = noiseBuffer(ctx, 0.08);
    const g = ctx.createGain();
    g.gain.value = 0.11 * Math.random();
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass'; hp.frequency.value = 2500;
    src.connect(hp).connect(g).connect(out);
    src.start();
    timers.push(setTimeout(crackle, 120 + Math.random() * 1600));
  };
  crackle();

  return () => { nodes.forEach((n) => { try { n.stop(); } catch {} }); timers.forEach(clearTimeout); out.disconnect(); };
}

// -- Mode 3: Deep Space Ambient ---------------------------------------------------
// Layered harmonic drones, slow filter sweeps, cathedral reverb. Eno / Apollo.

function buildDeepSpaceAmbient(ctx, out) {
  const nodes = [];
  const verb = reverbNode(ctx, 8, 3.2);
  const dry = ctx.createGain(); dry.gain.value = 0.35;
  const wet = ctx.createGain(); wet.gain.value = 0.75;
  const bus = ctx.createGain();
  bus.connect(dry).connect(out);
  bus.connect(verb).connect(wet).connect(out);

  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass'; lp.frequency.value = 900; lp.Q.value = 0.4;
  lp.connect(bus);
  lfo(ctx, 0.008, 500, lp.frequency); // glacial filter sweep

  // Harmonically related drones: root, fifth, octave, tenth.
  const root = 55; // A1
  [1, 1.5, 2, 2.5, 3].forEach((ratio, i) => {
    const osc = ctx.createOscillator();
    osc.type = i % 2 ? 'sine' : 'triangle';
    osc.frequency.value = root * ratio;
    osc.detune.value = (Math.random() - 0.5) * 7;
    const g = ctx.createGain();
    g.gain.value = 0.05 / (1 + i * 0.5);
    osc.connect(g).connect(lp);
    osc.start();
    nodes.push(osc);
    // Slow independent swells so the texture never repeats.
    lfo(ctx, 0.005 + Math.random() * 0.02, g.gain.value * 0.8, g.gain);
  });

  return () => { nodes.forEach((n) => { try { n.stop(); } catch {} }); out.disconnect(); };
}

// -- Mode 4: Psychedelic Journey --------------------------------------------------
// Detuned micro-tonal pads, beating patterns, panning LFOs.
// Carbon Based Lifeforms / Stellardrone. The long-stare mode.

function buildPsychedelicJourney(ctx, out) {
  const nodes = [];
  const verb = reverbNode(ctx, 9, 2.8);
  const wet = ctx.createGain(); wet.gain.value = 0.7;
  const bus = ctx.createGain(); bus.gain.value = 0.5;
  bus.connect(out);
  bus.connect(verb).connect(wet).connect(out);

  const base = 110;
  // Three pad clusters, each = 3 detuned oscillators through its own
  // slowly-wandering filter and stereo panner.
  [0, 3.86, 7.02].forEach((semis, ci) => {
    const freq = base * Math.pow(2, semis / 12);
    const pan = ctx.createStereoPanner();
    lfo(ctx, 0.013 + ci * 0.009, 0.8, pan.pan); // slow stereo drift
    const filt = ctx.createBiquadFilter();
    filt.type = 'lowpass'; filt.frequency.value = 700 + ci * 300; filt.Q.value = 2.2;
    lfo(ctx, 0.006 + ci * 0.004, 420, filt.frequency);
    filt.connect(pan).connect(bus);

    [-6, 0, 5].forEach((cents) => {
      const osc = ctx.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.value = freq;
      osc.detune.value = cents + (Math.random() - 0.5) * 3; // beating
      const g = ctx.createGain(); g.gain.value = 0.016;
      osc.connect(g).connect(filt);
      osc.start();
      nodes.push(osc);
      lfo(ctx, 0.004 + Math.random() * 0.01, 0.012, g.gain); // tonal swells
    });
  });

  // Sub drone anchor.
  const sub = ctx.createOscillator();
  sub.type = 'sine'; sub.frequency.value = base / 2;
  const subG = ctx.createGain(); subG.gain.value = 0.07;
  sub.connect(subG).connect(out);
  sub.start();
  nodes.push(sub);

  return () => { nodes.forEach((n) => { try { n.stop(); } catch {} }); out.disconnect(); };
}

// -- Mode 5: Cosmic Electronic ------------------------------------------------------
// Slow pulse, sub-bass drone, filtered arpeggio. Solar Fields / Schulze.

function buildCosmicElectronic(ctx, out) {
  const nodes = [];
  const timers = [];
  const verb = reverbNode(ctx, 5, 2.5);
  const wet = ctx.createGain(); wet.gain.value = 0.45;
  const bus = ctx.createGain(); bus.connect(out);
  bus.connect(verb).connect(wet).connect(out);

  // Sub-bass drone.
  const sub = ctx.createOscillator();
  sub.type = 'sine'; sub.frequency.value = 41.2; // E1
  const subG = ctx.createGain(); subG.gain.value = 0.11;
  sub.connect(subG).connect(out);
  sub.start(); nodes.push(sub);
  lfo(ctx, 0.05, 0.03, subG.gain);

  // Soft pulse (filtered noise thump) at ~54 bpm.
  const beat = () => {
    const src = ctx.createBufferSource();
    src.buffer = noiseBuffer(ctx, 0.3);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass'; lp.frequency.value = 160;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.4, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.32);
    src.connect(lp).connect(g).connect(bus);
    src.start();
    timers.push(setTimeout(beat, 1111));
  };
  beat();

  // Slow filtered arpeggio: E minor pentatonic, one note per ~0.55 s.
  const scale = [164.8, 196, 220, 246.9, 293.7, 329.6];
  const filt = ctx.createBiquadFilter();
  filt.type = 'lowpass'; filt.frequency.value = 1200; filt.Q.value = 6;
  lfo(ctx, 0.02, 700, filt.frequency);
  filt.connect(bus);
  let step = 0;
  const arp = () => {
    const osc = ctx.createOscillator();
    osc.type = 'square';
    osc.frequency.value = scale[(step * 2 + (step % 3)) % scale.length];
    step++;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.035, ctx.currentTime + 0.05);
    g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.5);
    osc.connect(g).connect(filt);
    osc.start(); osc.stop(ctx.currentTime + 0.55);
    timers.push(setTimeout(arp, 555));
  };
  arp();

  return () => { nodes.forEach((n) => { try { n.stop(); } catch {} }); timers.forEach(clearTimeout); out.disconnect(); };
}
