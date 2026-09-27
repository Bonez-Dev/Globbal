/**
 * Shared game audio: mysterious old-port ambience plus a persistent mute control.
 * Playback is attempted as soon as the board appears, with a gesture fallback
 * for browsers that block automatic audio.
 */
(function globbleAmbientSound() {
  const MUTE_KEY = "globble-sound-muted-v1";
  const BONUS_SUPPRESS_KEY = "globble-bonus-active-v1";
  const AMBIENT_KILL_KEY = "globble-ambient-kill-v1";
  const AMBIENT_STOP_KEY = "globble-ambient-stop-v1";
  const AMBIENT_BC = "globble-ambient-v1";

  function readMuted() {
    try {
      return localStorage.getItem(MUTE_KEY) === "1";
    } catch {
      return false;
    }
  }

  function isBonusDocument() {
    if (window.GlobbleBonusAmbientGuard?.isBonusPage?.()) {
      return true;
    }
    return String(location.pathname || "").toLowerCase().includes("bonus");
  }

  if (isBonusDocument()) {
    return;
  }

  let muted = false;
  let context = null;
  let ambientBus = null;
  let activeNodes = [];
  let foghornTimer = null;
  let sailTimer = null;
  let seabirdTimer = null;
  let stoppedForSubmit = false;

  muted = readMuted();

  function isBonusAmbientSuppressed() {
    if (window.GlobbleBonusRound?.isMainAmbientSuppressed?.()) {
      return true;
    }
    try {
      if (localStorage.getItem(AMBIENT_KILL_KEY) === "1") {
        return true;
      }
      return sessionStorage.getItem(BONUS_SUPPRESS_KEY) === "1";
    } catch {
      return false;
    }
  }

  function isBoardVisible() {
    const board = document.getElementById("board");
    const shell = board?.closest(".parchment-shell");
    const waitingForReveal =
      shell?.classList.contains("is-game-loading") &&
      !shell.classList.contains("is-game-loaded");
    return Boolean(
      board &&
      board.querySelector(".cell") &&
      !document.hidden &&
      board.getClientRects().length &&
      !waitingForReveal
    );
  }

  function ensureContext() {
    if (context) {
      if (!muted && !isBonusAmbientSuppressed() && context.state === "suspended") {
        void context.resume().then(() => {
          if (!isBonusAmbientSuppressed()) {
            startAmbient();
          }
        }).catch(() => {});
      }
      return context;
    }
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) {
      return null;
    }
    try {
      context = new AudioContextClass();
      if (!muted && !isBonusAmbientSuppressed() && context.state === "suspended") {
        void context.resume().then(() => {
          if (!isBonusAmbientSuppressed()) {
            startAmbient();
          }
        }).catch(() => {});
      }
      return context;
    } catch {
      return null;
    }
  }

  function makeNoiseBuffer(seconds) {
    const frames = Math.floor(context.sampleRate * seconds);
    const buffer = context.createBuffer(1, frames, context.sampleRate);
    const samples = buffer.getChannelData(0);
    let previous = 0;
    for (let i = 0; i < frames; i += 1) {
      const white = Math.random() * 2 - 1;
      previous = previous * 0.985 + white * 0.015;
      samples[i] = previous * 3.2;
    }
    return buffer;
  }

  function addNoiseLayer({ cutoff, volume, breezeRate, breezeDepth }) {
    const source = context.createBufferSource();
    const filter = context.createBiquadFilter();
    const gain = context.createGain();
    const lfo = context.createOscillator();
    const lfoGain = context.createGain();
    source.buffer = makeNoiseBuffer(7);
    source.loop = true;
    filter.type = "lowpass";
    filter.frequency.value = cutoff;
    filter.Q.value = 0.55;
    gain.gain.value = volume;
    lfo.type = "sine";
    lfo.frequency.value = breezeRate;
    lfoGain.gain.value = breezeDepth;
    lfo.connect(lfoGain).connect(gain.gain);
    source.connect(filter).connect(gain).connect(ambientBus);
    source.start();
    lfo.start();
    activeNodes.push(source, filter, gain, lfo, lfoGain);
  }

  function makeWhiteNoiseBuffer(seconds) {
    const frames = Math.floor(context.sampleRate * seconds);
    const buffer = context.createBuffer(1, frames, context.sampleRate);
    const samples = buffer.getChannelData(0);
    for (let i = 0; i < frames; i += 1) {
      samples[i] = Math.random() * 2 - 1;
    }
    return buffer;
  }

  function playSailFlap() {
    // Disabled — random flap bursts read as annoying clacks.
  }

  function scheduleSailFlap() {
    // No-op.
  }

  function playFoghorn() {
    // Disabled — keep ambience to continuous soft wind only.
  }

  function playSeabird() {
    // Disabled — swept noise bursts also read as random clacks.
  }

  function scheduleFoghorn() {
    // No-op.
  }

  function scheduleSeabird() {
    // No-op.
  }

  function startAmbient() {
    if (muted || stoppedForSubmit || ambientBus || !isBoardVisible() || isBonusAmbientSuppressed()) {
      return;
    }
    const audio = ensureContext();
    if (!audio || audio.state !== "running") {
      return;
    }
    ambientBus = audio.createGain();
    ambientBus.gain.value = 0.32;
    ambientBus.connect(audio.destination);
    // Soft continuous wind only — no random one-shot SFX.
    addNoiseLayer({ cutoff: 1650, volume: 0.032, breezeRate: 0.047, breezeDepth: 0.012 });
  }

  function stopAmbient() {
    clearTimeout(foghornTimer);
    clearTimeout(sailTimer);
    clearTimeout(seabirdTimer);
    foghornTimer = null;
    sailTimer = null;
    seabirdTimer = null;
    activeNodes.forEach((node) => {
      try {
        node.stop?.();
        node.disconnect?.();
      } catch {
        /* already stopped */
      }
    });
    activeNodes = [];
    if (ambientBus) {
      ambientBus.disconnect();
      ambientBus = null;
    }
  }

  function shutdownForBonus() {
    stopAmbient();
    if (!context) {
      return;
    }
    try {
      if (context.state !== "closed") {
        void context.close();
      }
    } catch {
      /* ignore */
    }
    context = null;
  }

  function updateButton() {
    const button = document.getElementById("soundToggleBtn");
    if (!button) return;
    button.classList.toggle("is-muted", muted);
    button.setAttribute("aria-pressed", String(muted));
    button.setAttribute("aria-label", muted ? "Turn on all sound" : "Mute all sound");
    button.title = muted ? "Turn on all sound" : "Mute all sound";
  }

  function setMuted(nextMuted) {
    muted = Boolean(nextMuted);
    try {
      localStorage.setItem(MUTE_KEY, muted ? "1" : "0");
    } catch {
      /* ignore storage restrictions */
    }
    if (muted) {
      stopAmbient();
    } else {
      ensureContext();
      startAmbient();
    }
    updateButton();
    document.dispatchEvent(new CustomEvent("globble:soundchange", {
      detail: { muted }
    }));
  }

  function playShuffleRustle(options = {}) {
    // Soft shuffle SFX disabled for now — kept as a no-op API.
  }

  function primeFromGesture() {
    if (muted || isBonusAmbientSuppressed()) {
      return;
    }
    ensureContext();
    startAmbient();
  }

  function watchBoardReveal() {
    const board = document.getElementById("board");
    const shell = board?.closest(".parchment-shell");
    if (!board) {
      return;
    }

    const syncToBoard = () => {
      if (isBonusAmbientSuppressed()) {
        shutdownForBonus();
      } else if (isBoardVisible()) {
        startAmbient();
      } else {
        stopAmbient();
      }
    };
    const observer = new MutationObserver(syncToBoard);
    if (shell) {
      observer.observe(shell, { attributes: true, attributeFilter: ["class"] });
    }
    observer.observe(board, { childList: true });
    syncToBoard();
  }

  document.addEventListener("pointerdown", primeFromGesture, { capture: true, once: true });
  document.addEventListener("keydown", primeFromGesture, { capture: true, once: true });
  document.addEventListener("visibilitychange", () => {
    if (isBonusAmbientSuppressed()) {
      shutdownForBonus();
      return;
    }
    if (document.hidden) {
      shutdownForBonus();
    } else if (!muted) {
      startAmbient();
    }
  });
  window.addEventListener("pagehide", shutdownForBonus);
  window.addEventListener("pageshow", (event) => {
    if (isBonusAmbientSuppressed()) {
      shutdownForBonus();
      return;
    }
    if (event.persisted && !muted) {
      startAmbient();
    }
  });
  document.addEventListener("freeze", shutdownForBonus);

  try {
    const ambientChannel = new BroadcastChannel(AMBIENT_BC);
    ambientChannel.onmessage = (event) => {
      if (event.data?.type === "stop-for-bonus") {
        shutdownForBonus();
      }
    };
  } catch {
    /* BroadcastChannel unavailable */
  }

  window.addEventListener("storage", (event) => {
    if (event.key === AMBIENT_STOP_KEY) {
      shutdownForBonus();
      return;
    }
    if (event.key === BONUS_SUPPRESS_KEY && event.newValue === "1") {
      shutdownForBonus();
      return;
    }
    if (event.key === AMBIENT_KILL_KEY && event.newValue === "1") {
      shutdownForBonus();
    }
  });
  document.addEventListener("DOMContentLoaded", () => {
    if (isBonusAmbientSuppressed()) {
      shutdownForBonus();
    }
    updateButton();
    // Attempt immediate playback when the reveal curtain exposes the board.
    if (!isBonusAmbientSuppressed()) {
      ensureContext();
    }
    requestAnimationFrame(watchBoardReveal);
    document.getElementById("submitTurnBtn")?.addEventListener("click", () => {
      stoppedForSubmit = true;
      stopAmbient();
    }, { capture: true });
    document.getElementById("newGameBtn")?.addEventListener("click", () => {
      stoppedForSubmit = false;
      requestAnimationFrame(startAmbient);
    });
    document.getElementById("soundToggleBtn")?.addEventListener("click", () => {
      setMuted(!muted);
    });
  });

  window.GlobbleSound = {
    isMuted: () => muted,
    setMuted,
    startAmbient,
    stopAmbient,
    shutdownForBonus,
    playShuffleRustle
  };
})();
