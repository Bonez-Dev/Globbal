/**
 * Temporary dev control: jump to bonus.html for layout testing.
 * Enable with ?bonusDev=1 once (sticky in sessionStorage) or on localhost.
 */
(function bonusDevButton() {
  const STORAGE_KEY = "globble-bonus-dev";

  function isBonusDevEnabled() {
    const host = location.hostname;
    if (host === "localhost" || host === "127.0.0.1") {
      return true;
    }
    try {
      const params = new URLSearchParams(location.search);
      if (params.get("bonusDev") === "1") {
        sessionStorage.setItem(STORAGE_KEY, "1");
        return true;
      }
      return sessionStorage.getItem(STORAGE_KEY) === "1";
    } catch {
      return false;
    }
  }

  function returnUrlForPage() {
    if (location.pathname.endsWith("game-online.html")) {
      return "./game-online.html";
    }
    return "./practice.html";
  }

  function minimalSnapshot(playerNames) {
    return {
      gameStarted: true,
      currentPlayer: 0,
      board: [],
      bag: [],
      players: playerNames.map((name, index) => ({
        name,
        score: 0,
        rack: []
      })),
      turnPlacedTiles: [],
      totalSubmitCount: 0
    };
  }

  function resolveSnapshot() {
    const capture = window.GlobblePracticeResume?._getSnapshot;
    if (typeof capture === "function") {
      const snap = capture();
      if (snap?.gameStarted) {
        return snap;
      }
    }
    return minimalSnapshot(["Player 1", "Player 2"]);
  }

  async function launchDevBonusRound() {
    if (!window.GlobbleBonusRound?.generateBonusQuestion) {
      throw new Error("Bonus helpers are not loaded.");
    }
    if (typeof navigator !== "undefined" && navigator.onLine === false) {
      throw new Error("Bonus round requires a network connection.");
    }
    const response = await fetch("./data/bonus-country-data.json");
    if (!response.ok) {
      throw new Error("Bonus country data is missing.");
    }
    const countryData = await response.json();
    const question = window.GlobbleBonusRound.generateBonusQuestion(countryData);
    const snapshot = resolveSnapshot();
    const submittingPlayer = Number.isInteger(snapshot.currentPlayer) ? snapshot.currentPlayer : 0;
    await window.GlobblePracticeBonus.launchPracticeBonus(submittingPlayer, snapshot, {
      returnUrl: returnUrlForPage(),
      devQuick: true
    });
  }

  function mount() {
    const btn = document.getElementById("bonusDevBtn");
    if (!btn || !isBonusDevEnabled()) {
      return;
    }
    btn.hidden = false;
    btn.addEventListener("click", () => {
      btn.disabled = true;
      void launchDevBonusRound().catch((err) => {
        console.error(err);
        btn.disabled = false;
        window.alert(err.message || "Could not open bonus round.");
      });
    });
  }

  window.GlobbleBonusDev = {
    isBonusDevEnabled,
    launchDevBonusRound
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", mount);
  } else {
    mount();
  }
})();
