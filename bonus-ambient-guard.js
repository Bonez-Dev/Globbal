/**
 * Keeps main-game wind ambience off during bonus (all pages that load ambient-sound).
 */
(function globbleBonusAmbientGuard() {
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

  function isBonusPage() {
    const path = String(location.pathname || "").toLowerCase();
    return path.includes("bonus");
  }

  function notifyStopAmbient() {
    try {
      localStorage.setItem(AMBIENT_STOP_KEY, String(Date.now()));
    } catch {
      /* ignore */
    }
    try {
      const channel = new BroadcastChannel(AMBIENT_BC);
      channel.postMessage({ type: "stop-for-bonus" });
      channel.close();
    } catch {
      /* ignore */
    }
    window.GlobbleSound?.shutdownForBonus?.();
  }

  function suppressMainAmbient() {
    try {
      sessionStorage.setItem(BONUS_SUPPRESS_KEY, "1");
    } catch {
      /* ignore */
    }
    try {
      localStorage.setItem(AMBIENT_KILL_KEY, "1");
    } catch {
      /* ignore */
    }
    notifyStopAmbient();
  }

  function releaseMainAmbient() {
    try {
      sessionStorage.removeItem(BONUS_SUPPRESS_KEY);
    } catch {
      /* ignore */
    }
    try {
      localStorage.removeItem(AMBIENT_KILL_KEY);
    } catch {
      /* ignore */
    }
  }

  if (isBonusPage()) {
    suppressMainAmbient();
    window.GlobbleSound = {
      isMuted: () => readMuted(),
      setMuted: () => {},
      startAmbient: () => {},
      stopAmbient: () => {},
      shutdownForBonus: () => {},
      playShuffleRustle: () => {}
    };
    const silenceInterval = window.setInterval(notifyStopAmbient, 400);
    window.addEventListener(
      "pagehide",
      () => {
        window.clearInterval(silenceInterval);
      },
      { once: true }
    );
  }

  window.GlobbleBonusAmbientGuard = {
    isBonusPage,
    suppressMainAmbient,
    releaseMainAmbient,
    notifyStopAmbient
  };
})();
