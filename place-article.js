(function placeArticlePage() {
  function safeReturnHref(raw) {
    const value = String(raw || "").trim();
    if (!value || !value.endsWith(".html") || value.includes("://") || value.includes("..")) {
      return null;
    }
    return `./${value.replace(/^\.\//, "")}`;
  }

  function candidateFromParams(word, wikiUrl) {
    if (!wikiUrl) {
      return null;
    }
    const candidates = window.GlobblePlaceInfo?.getWikipediaCandidates?.(word) || [];
    const match = candidates.find((entry) => entry && entry.url === wikiUrl);
    if (match) {
      return match;
    }
    return { url: wikiUrl, label: "" };
  }

  async function boot() {
    const params = new URLSearchParams(window.location.search);
    const word = params.get("word") || "";
    const wikiUrl = params.get("wiki") || "";
    const returnHref =
      safeReturnHref(params.get("return")) ||
      safeReturnHref(document.referrer ? new URL(document.referrer, window.location.href).pathname.split("/").pop() : "") ||
      "./practice.html";

    const backEl = document.getElementById("placeArticleBack");
    if (backEl instanceof HTMLAnchorElement) {
      backEl.href = returnHref;
    }

    const rootEl = document.getElementById("placeArticleRoot");
    if (!rootEl || !word.trim()) {
      if (rootEl) {
        rootEl.querySelector(".wiki-reveal-loading")?.remove();
        const fallback = rootEl.querySelector(".wiki-reveal-fallback");
        if (fallback) {
          fallback.hidden = false;
          fallback.replaceChildren();
          const message = document.createElement("p");
          message.className = "wiki-reveal-fallback-text";
          message.textContent = "No place was specified for this article.";
          fallback.appendChild(message);
        }
      }
      return;
    }

    await window.GlobblePlaceInfo?.load?.();
    const candidate = candidateFromParams(word, wikiUrl);
    await window.GlobbleWordWikipediaReveal?.mountStandalone?.(rootEl, word, { candidate });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => void boot());
  } else {
    void boot();
  }
})();
