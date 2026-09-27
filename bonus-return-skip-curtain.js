/**
 * Before first paint on practice/online: hide the ancient map curtain when returning from bonus.
 */
(function bonusReturnSkipCurtain() {
  const RETURN_FROM_BONUS_KEY = "globble-return-from-bonus-v1";
  try {
    if (sessionStorage.getItem(RETURN_FROM_BONUS_KEY) !== "1") {
      return;
    }
    document.documentElement.classList.add("globble-skip-game-load-curtain");
    const style = document.createElement("style");
    style.textContent =
      "html.globble-skip-game-load-curtain .game-load-curtain{display:none!important}" +
      "html.globble-skip-game-load-curtain .play-stage.parchment-shell.is-game-loading>.play-layout," +
      "html.globble-skip-game-load-curtain .parchment-shell.is-game-loading:not(.is-game-loaded)>.play-layout{" +
      "opacity:1!important;visibility:visible!important}";
    document.head.appendChild(style);
  } catch {
    /* ignore */
  }
})();
