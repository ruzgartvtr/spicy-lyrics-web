(() => {
  if (window.__slwButtonInstalled) return;
  window.__slwButtonInstalled = true;

  const STYLE_ID = "slw-button-style";
  if (!document.getElementById(STYLE_ID)) {
    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `
      #slw-open-button, #slw-toggle {
        position: fixed !important;
        right: 24px !important;
        bottom: 96px !important;
        z-index: 2147483647 !important;
        margin: 0 !important;
        border: 0 !important;
        border-radius: 999px !important;
        padding: 12px 18px !important;
        background: #1ed760 !important;
        color: #000 !important;
        font: 700 14px/1 Helvetica, Arial, sans-serif !important;
        cursor: pointer !important;
        box-shadow: 0 8px 24px rgba(0,0,0,.45) !important;
        pointer-events: auto !important;
        display: block !important;
        opacity: 1 !important;
        visibility: visible !important;
      }
      #slw-open-button[aria-pressed="true"], #slw-toggle[aria-pressed="true"] {
        background: #fff !important;
      }
    `;
    (document.documentElement || document.head).appendChild(style);
  }

  function ensureFallbackRoot() {
    let root = document.getElementById("SpicyLyricsWebRoot");
    if (!root) {
      root = document.createElement("div");
      root.id = "SpicyLyricsWebRoot";
      root.className = "Root__main-view";
      root.innerHTML =
        '<div class="main-view-container"><div class="main-view-container__scroll-node-child" style="color:#fff;padding:24px;font:16px Helvetica,sans-serif">Spicy Lyrics yükleniyor…</div></div>';
      document.documentElement.appendChild(root);
    } else if (!root.isConnected) {
      document.documentElement.appendChild(root);
    }
    return root;
  }

  function openSpicyLyrics() {
    try {
      if (typeof window.__SL_toggle === "function") {
        window.__SL_toggle();
        return;
      }
    } catch (_) {}

    window.dispatchEvent(new CustomEvent("slw-open"));
    window.dispatchEvent(new CustomEvent("slw-toggle"));

    try {
      chrome.runtime.sendMessage({ type: "slw-open" });
    } catch (_) {}

    const root = ensureFallbackRoot();
    root.classList.toggle("is-open");
    const button = document.getElementById("slw-open-button") || document.getElementById("slw-toggle");
    if (button && typeof window.__SL_toggle !== "function") {
      button.textContent = "Yükleniyor…";
      window.setTimeout(() => {
        if (button.textContent === "Yükleniyor…") button.textContent = "Sözler";
      }, 2500);
    }
  }

  function ensureButton() {
    let button = document.getElementById("slw-open-button") || document.getElementById("slw-toggle");
    if (!button) {
      button = document.createElement("button");
      button.id = "slw-open-button";
      button.type = "button";
      button.textContent = "Sözler";
      button.setAttribute("aria-label", "Spicy Lyrics");
      button.setAttribute("aria-pressed", "false");
      button.addEventListener(
        "click",
        (event) => {
          event.preventDefault();
          event.stopPropagation();
          openSpicyLyrics();
        },
        true,
      );
    } else if (!button.dataset.slwBound) {
      button.dataset.slwBound = "1";
      button.addEventListener(
        "click",
        (event) => {
          event.preventDefault();
          event.stopPropagation();
          openSpicyLyrics();
        },
        true,
      );
    }
    const host = document.body || document.documentElement;
    if (button.parentElement !== host) host.appendChild(button);
  }

  ensureButton();
  new MutationObserver(ensureButton).observe(document.documentElement, {
    childList: true,
    subtree: true,
  });
  setInterval(ensureButton, 1000);
})();
