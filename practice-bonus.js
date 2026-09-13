/**
 * Practice bonus session: save game, launch bonus page, restore after both players answer.
 */
(function practiceBonus() {
  const BONUS_SESSION_KEY = "globble-bonus-session-v1";

  function saveBonusSession(session) {
    try {
      sessionStorage.setItem(BONUS_SESSION_KEY, JSON.stringify(session));
    } catch {
      /* ignore */
    }
  }

  function loadBonusSession() {
    try {
      const raw = sessionStorage.getItem(BONUS_SESSION_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }

  function clearBonusSession() {
    try {
      sessionStorage.removeItem(BONUS_SESSION_KEY);
    } catch {
      /* ignore */
    }
  }

  async function launchPracticeBonus(submittingPlayer, gameSnapshot) {
    if (typeof navigator !== "undefined" && navigator.onLine === false) {
      throw new Error("Bonus round requires a network connection.");
    }
    const response = await fetch("./data/bonus-country-data.json");
    if (!response.ok) {
      throw new Error("Bonus country data is missing. Run npm run build:bonus-countries.");
    }
    const countryData = await response.json();
    const question = window.GlobbleBonusRound.generateBonusQuestion(countryData);
    saveBonusSession({
      mode: "practice",
      returnUrl: "./practice.html",
      submittingPlayer,
      activePlayerIndex: submittingPlayer,
      playerNames: gameSnapshot.players.map((p) => p.name),
      results: [null, null],
      question,
      gameSnapshot
    });
    location.href = "./bonus.html";
  }

  window.GlobblePracticeBonus = {
    saveBonusSession,
    loadBonusSession,
    clearBonusSession,
    launchPracticeBonus
  };
})();
