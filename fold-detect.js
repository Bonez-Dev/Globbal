/**
 * Wide touch layouts (Galaxy Fold inner screen, etc.). Samsung often reports
 * pointer:fine so CSS media queries alone miss — we set classes and ensure mobile CSS loads.
 */
(function globbleFoldDetect() {
  const MOBILE_CSS = "./styles-mobile.css?v=fold-layout6";
  const MIN_WIDE = 641;
  const MAX_WIDE = 1920;
  const SIDEBAR_MIN_WIDTH = 840;

  function isTouchDevice() {
    if ((navigator.maxTouchPoints || 0) > 0) {
      return true;
    }
    try {
      return (
        window.matchMedia("(pointer: coarse)").matches ||
        window.matchMedia("(hover: none)").matches ||
        window.matchMedia("(any-pointer: coarse)").matches
      );
    } catch {
      return false;
    }
  }

  function ensureMobileStylesheet() {
    if (document.querySelector('link[data-globble-mobile-wide="1"]')) {
      return;
    }
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = MOBILE_CSS;
    link.setAttribute("data-globble-mobile-wide", "1");
    document.head.appendChild(link);
  }

  function updateFoldClasses() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    const root = document.documentElement;
    const wideTouch = isTouchDevice() && w >= MIN_WIDE && w <= MAX_WIDE;
    const sidebar = wideTouch && w >= SIDEBAR_MIN_WIDTH && w > h;

    root.classList.toggle("globble-wide-touch", wideTouch);
    root.classList.toggle("globble-fold-sidebar", sidebar);
    root.classList.toggle("globble-fold-stack", wideTouch && !sidebar);

    if (wideTouch) {
      ensureMobileStylesheet();
    }
  }

  updateFoldClasses();
  window.addEventListener("resize", updateFoldClasses);
  window.addEventListener("orientationchange", () => {
    window.setTimeout(updateFoldClasses, 120);
  });
})();
