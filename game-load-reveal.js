/**
 * Full-screen ancient map curtain while gameplay DOM is built underneath.
 */
(function gameLoadReveal() {
  const shell = document.querySelector(".play-stage.parchment-shell");
  const curtain = document.getElementById("gameLoadCurtain");
  if (!shell || !curtain) {
    return;
  }

  let settled = false;

  function finalizeCurtainRemoval() {
    if (!curtain.isConnected) {
      return;
    }
    curtain.remove();
    shell.classList.remove("is-game-loaded", "is-game-loading");
  }

  function reveal() {
    if (settled) {
      return;
    }
    settled = true;
    shell.classList.add("is-game-loaded");
    const fallback = window.setTimeout(finalizeCurtainRemoval, 320);
    curtain.addEventListener(
      "transitionend",
      (event) => {
        if (event.target !== curtain || event.propertyName !== "opacity") {
          return;
        }
        window.clearTimeout(fallback);
        finalizeCurtainRemoval();
      },
      { once: true }
    );
  }

  function skipImmediate() {
    if (settled) {
      return;
    }
    settled = true;
    finalizeCurtainRemoval();
  }

  function notifyReady() {
    requestAnimationFrame(() => {
      requestAnimationFrame(reveal);
    });
  }

  const returningFromBonus = (() => {
    try {
      return sessionStorage.getItem("globble-return-from-bonus-v1") === "1";
    } catch {
      return false;
    }
  })();

  if (returningFromBonus || document.documentElement.classList.contains("globble-skip-game-load-curtain")) {
    shell.classList.remove("is-game-loading");
    settled = true;
    finalizeCurtainRemoval();
    window.GlobbleGameLoadReveal = { notifyReady() {}, skipImmediate() {} };
  } else {
    shell.classList.add("is-game-loading");
    window.GlobbleGameLoadReveal = { notifyReady, skipImmediate };
  }
})();
