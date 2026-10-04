/**
 * Landing-page music: splash hero (epic shanty) or menu loop (tavern jig).
 * Shares mute state with gameplay via globble-sound-muted-v1.
 */
(function globbleLandingMusic() {
  if (document.documentElement.classList.contains("is-preview-embed")) {
    return;
  }
  if (document.body?.classList.contains("gameplay-body")) {
    return;
  }

  const MUTE_KEY = "globble-sound-muted-v1";
  const TRACKS = {
    loop: { src: "./assets/audio/rum-n-the-barrel.mp3", volume: 0.28, loop: true },
    hero: { src: "./assets/audio/epic-sea-shanty.mp3", volume: 0.32, loop: false }
  };
  const HERO_PLAY_MS = 58000;
  const FADE_MS = 4200;

  const mode = document.body?.dataset?.landingMusic;
  const track = mode && TRACKS[mode];
  if (!track) {
    return;
  }

  let muted = false;
  let audio = null;
  let playing = false;
  let fadeTimer = null;
  let stopTimer = null;
  let gestureBound = false;

  function readMuted() {
    try {
      return localStorage.getItem(MUTE_KEY) === "1";
    } catch {
      return false;
    }
  }

  function clearTimers() {
    if (fadeTimer) {
      clearTimeout(fadeTimer);
      fadeTimer = null;
    }
    if (stopTimer) {
      clearTimeout(stopTimer);
      stopTimer = null;
    }
  }

  function fadeOut(ms = FADE_MS) {
    if (!audio) {
      return;
    }
    clearTimers();
    const el = audio;
    const startVol = el.volume;
    const start = performance.now();
    const step = (now) => {
      const t = Math.min(1, (now - start) / ms);
      el.volume = Math.max(0, startVol * (1 - t));
      if (t < 1) {
        requestAnimationFrame(step);
      } else {
        el.pause();
        playing = false;
      }
    };
    requestAnimationFrame(step);
  }

  function stopPlayback() {
    clearTimers();
    playing = false;
    if (!audio) {
      return;
    }
    try {
      audio.pause();
      audio.currentTime = 0;
      audio.src = "";
      audio.load();
    } catch {
      /* ignore */
    }
    audio = null;
  }

  function scheduleHeroEnd() {
    if (mode !== "hero" || !audio) {
      return;
    }
    fadeTimer = window.setTimeout(() => fadeOut(FADE_MS), Math.max(0, HERO_PLAY_MS - FADE_MS));
    stopTimer = window.setTimeout(stopPlayback, HERO_PLAY_MS + 120);
  }

  function ensureAudio() {
    if (audio) {
      return audio;
    }
    audio = new Audio(track.src);
    audio.loop = track.loop;
    audio.volume = track.volume;
    audio.preload = "auto";
    audio.setAttribute("playsinline", "");
    audio.addEventListener("playing", () => {
      playing = true;
    });
    audio.addEventListener("pause", () => {
      if (audio?.paused) {
        playing = false;
      }
    });
    return audio;
  }

  async function startPlayback() {
    if (muted || playing) {
      return;
    }
    const el = ensureAudio();
    el.volume = track.volume;
    try {
      await el.play();
      playing = true;
      scheduleHeroEnd();
    } catch {
      playing = false;
    }
  }

  function bindGestureUnlock() {
    if (gestureBound) {
      return;
    }
    gestureBound = true;
    const onGesture = () => {
      if (!muted) {
        void startPlayback();
      }
    };
    document.addEventListener("pointerdown", onGesture, { capture: true });
    document.addEventListener("touchstart", onGesture, { capture: true, passive: true });
    document.addEventListener("keydown", onGesture, { capture: true });
  }

  function updateButton() {
    const button = document.getElementById("landingMusicToggle");
    if (!button) {
      return;
    }
    button.classList.toggle("is-muted", muted);
    button.setAttribute("aria-pressed", String(muted));
    button.setAttribute("aria-label", muted ? "Turn on music" : "Mute music");
    button.title = muted ? "Turn on music" : "Mute music";
  }

  function setMuted(nextMuted) {
    muted = Boolean(nextMuted);
    try {
      localStorage.setItem(MUTE_KEY, muted ? "1" : "0");
    } catch {
      /* ignore */
    }
    if (muted) {
      stopPlayback();
    } else {
      void startPlayback();
    }
    updateButton();
    document.dispatchEvent(
      new CustomEvent("globble:soundchange", { detail: { muted } })
    );
  }

  function injectToggle() {
    if (document.getElementById("landingMusicToggle") || document.getElementById("soundToggleBtn")) {
      return;
    }
    const button = document.createElement("button");
    button.type = "button";
    button.id = "landingMusicToggle";
    button.className = "landing-music-toggle score-sound-btn";
    button.setAttribute("aria-pressed", "false");
    button.innerHTML =
      '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">' +
      '<path class="sound-speaker" fill="currentColor" d="M4 9v6h4l5 4V5L8 9H4z" />' +
      '<path class="sound-wave" fill="currentColor" d="M16 8.2a5 5 0 0 1 0 7.6M18.7 5.5a8.8 8.8 0 0 1 0 13" />' +
      '<path class="sound-muted-slash" fill="currentColor" d="M16 9l5 6M21 9l-5 6" />' +
      "</svg>";
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      setMuted(!muted);
    });
    const anchor = document.getElementById("landingMusicToggleAnchor");
    if (anchor) {
      button.classList.add("landing-music-toggle--profile-tray");
      anchor.appendChild(button);
    } else {
      document.body.appendChild(button);
    }
  }

  function init() {
    muted = readMuted();
    injectToggle();
    updateButton();
    bindGestureUnlock();
  }

  muted = readMuted();

  window.addEventListener("splashBeforeNavigate", () => fadeOut(380));

  document.addEventListener("visibilitychange", () => {
    if (!audio) {
      return;
    }
    if (document.hidden) {
      audio.pause();
    } else if (!muted && playing) {
      void audio.play().catch(() => {});
    }
  });

  window.addEventListener("storage", (event) => {
    if (event.key === MUTE_KEY) {
      setMuted(event.newValue === "1");
    }
    if (event.key === "globble-stop-landing-mp3") {
      stopPlayback();
    }
  });

  window.addEventListener("pagehide", () => {
    stopPlayback();
  });

  window.addEventListener("pageshow", (event) => {
    if (event.persisted && !muted) {
      void startPlayback();
    }
  });

  document.addEventListener("globble:soundchange", (event) => {
    if (typeof event.detail?.muted === "boolean" && event.detail.muted !== muted) {
      muted = event.detail.muted;
      if (muted) {
        stopPlayback();
      } else {
        void startPlayback();
      }
      updateButton();
    }
  });

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }

  window.GlobbleLandingMusic = {
    isMuted: () => muted,
    setMuted,
    fadeOut,
    stopPlayback,
    startPlayback
  };
})();
