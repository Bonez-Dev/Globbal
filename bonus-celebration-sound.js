const MUTE_KEY = "globble-sound-muted-v1";
const CELEBRATION_SEC = 3.6;
const FADE_SEC = 1.05;
const NOISE_SEED = 0x676c6f62;

let audioContext = null;
let cachedNoise = { sampleRate: 0, clap: null, cheer: null };

function isMuted() {
  if (window.GlobbleSound?.isMuted?.()) {
    return true;
  }
  try {
    return localStorage.getItem(MUTE_KEY) === "1";
  } catch {
    return false;
  }
}

function getContext() {
  if (isMuted()) {
    return null;
  }
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextClass) {
    return null;
  }
  if (audioContext?.state === "closed") {
    audioContext = null;
  }
  if (!audioContext) {
    try {
      audioContext = new AudioContextClass();
    } catch {
      return null;
    }
  }
  return audioContext;
}

export function getBonusCelebrationDurationMs() {
  return Math.ceil((CELEBRATION_SEC + 0.3) * 1000);
}

function mulberry32(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function makeSeededNoiseBuffer(ctx, seconds, seed) {
  const frames = Math.max(1, Math.floor(ctx.sampleRate * seconds));
  const buffer = ctx.createBuffer(1, frames, ctx.sampleRate);
  const samples = buffer.getChannelData(0);
  const rand = mulberry32(seed);
  for (let i = 0; i < frames; i += 1) {
    samples[i] = rand() * 2 - 1;
  }
  return buffer;
}

function getClapNoiseBuffer(ctx) {
  if (cachedNoise.sampleRate === ctx.sampleRate && cachedNoise.clap) {
    return cachedNoise.clap;
  }
  cachedNoise.sampleRate = ctx.sampleRate;
  cachedNoise.clap = makeSeededNoiseBuffer(ctx, 0.05, NOISE_SEED + 1);
  cachedNoise.cheer = makeSeededNoiseBuffer(ctx, CELEBRATION_SEC + 0.5, NOISE_SEED + 2);
  return cachedNoise.clap;
}

function getCheerNoiseBuffer(ctx) {
  getClapNoiseBuffer(ctx);
  return cachedNoise.cheer;
}

/** Fixed clap schedule — same timing and tone on every correct bonus answer. */
const CLAP_EVENTS = (() => {
  const events = [];
  let t = 0.2;
  let i = 0;
  while (t < CELEBRATION_SEC - 0.15) {
    events.push({
      at: t,
      freq: 1500 + ((i * 137) % 850),
      peak: 0.2 + ((i * 47) % 13) / 100
    });
    t += 0.072 + ((i * 53) % 7) / 100;
    i += 1;
  }
  return events;
})();

function applyCelebrationFade(gain, start, end, peak = 0.16) {
  const fadeStart = end - FADE_SEC;
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.linearRampToValueAtTime(peak, start + 0.4);
  gain.gain.setValueAtTime(peak * 0.94, fadeStart);
  gain.gain.exponentialRampToValueAtTime(0.0001, end);
}

function clapVolumeScale(at, fadeStart) {
  if (at < fadeStart) {
    return 1;
  }
  const fadeT = (at - fadeStart) / FADE_SEC;
  return Math.max(0.15, 1 - fadeT * 0.85);
}

function scheduleClap(ctx, when, freq, peak, volumeScale) {
  const dur = 0.05;
  const src = ctx.createBufferSource();
  src.buffer = getClapNoiseBuffer(ctx);
  const bp = ctx.createBiquadFilter();
  bp.type = "bandpass";
  bp.frequency.value = freq;
  bp.Q.value = 0.9;
  const gain = ctx.createGain();
  const scaledPeak = peak * volumeScale;
  gain.gain.setValueAtTime(0.0001, when);
  gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, scaledPeak), when + 0.004);
  gain.gain.exponentialRampToValueAtTime(0.0001, when + dur);
  src.connect(bp);
  bp.connect(gain);
  gain.connect(ctx.destination);
  src.start(when);
  src.stop(when + dur + 0.01);
}

function scheduleCheer(ctx, start, durationSec) {
  const end = start + durationSec;
  const fadeStart = end - FADE_SEC;
  const src = ctx.createBufferSource();
  src.buffer = getCheerNoiseBuffer(ctx);
  src.loop = true;
  const lp = ctx.createBiquadFilter();
  lp.type = "lowpass";
  lp.frequency.setValueAtTime(900, start);
  lp.frequency.linearRampToValueAtTime(2800, start + 0.5);
  lp.frequency.setValueAtTime(2400, fadeStart);
  lp.frequency.linearRampToValueAtTime(700, end);
  const gain = ctx.createGain();
  applyCelebrationFade(gain, start, end);
  src.connect(lp);
  lp.connect(gain);
  gain.connect(ctx.destination);
  src.start(start);
  src.stop(end + 0.05);

  const voices = [
    { f: 392, pan: -0.25 },
    { f: 494, pan: 0.2 },
    { f: 587, pan: 0.05 }
  ];
  voices.forEach(({ f, pan }, i) => {
    const osc = ctx.createOscillator();
    osc.type = "sawtooth";
    const vGain = ctx.createGain();
    const panner = ctx.createStereoPanner();
    panner.pan.value = pan;
    const vib = ctx.createOscillator();
    const vibGain = ctx.createGain();
    vib.frequency.value = 5 + i;
    vibGain.gain.value = 7;
    vib.connect(vibGain);
    vibGain.connect(osc.frequency);
    osc.frequency.setValueAtTime(f * 0.98, start);
    applyCelebrationFade(vGain, start, end, 0.045);
    osc.connect(vGain);
    vGain.connect(panner);
    panner.connect(ctx.destination);
    vib.start(start);
    osc.start(start);
    vib.stop(end + 0.02);
    osc.stop(end + 0.02);
  });
}

function scheduleCelebration(ctx) {
  const t0 = ctx.currentTime + 0.02;
  const fadeStart = CELEBRATION_SEC - FADE_SEC;

  scheduleCheer(ctx, t0 + 0.08, CELEBRATION_SEC);

  CLAP_EVENTS.forEach(({ at, freq, peak }) => {
    const volumeScale = clapVolumeScale(at, fadeStart);
    scheduleClap(ctx, t0 + at, freq, peak, volumeScale);
  });
}

/** Clapping and crowd cheer (Web Audio) — deterministic on every play. */
export function playBonusCelebration() {
  const ctx = getContext();
  if (!ctx) {
    return;
  }
  const run = () => {
    scheduleCelebration(ctx);
  };
  if (ctx.state === "suspended") {
    void ctx.resume().then(run).catch(() => {});
  } else {
    run();
  }
}

document.addEventListener(
  "pointerdown",
  () => {
    if (!isMuted()) {
      const ctx = getContext();
      if (ctx?.state === "suspended") {
        void ctx.resume().catch(() => {});
      }
    }
  },
  { capture: true, once: true }
);
