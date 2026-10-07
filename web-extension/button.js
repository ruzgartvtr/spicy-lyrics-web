(() => {
  if (window.__slwButtonInstalled) return;
  window.__slwButtonInstalled = true;

  const STYLE_ID = "slw-button-style";
  if (!document.getElementById(STYLE_ID)) {
    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `
      #slw-open-button {
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
      #slw-open-button[aria-pressed="true"] {
        background: #fff !important;
      }
    `;
    (document.documentElement || document.head).appendChild(style);
  }

  function ensureButton() {
    let button = document.getElementById("slw-open-button");
    if (!button) {
      button = document.createElement("button");
      button.id = "slw-open-button";
      button.type = "button";
      button.textContent = "Sözler";
      button.setAttribute("aria-label", "Spicy Lyrics");
      button.setAttribute("aria-pressed", "false");
      button.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        window.dispatchEvent(new CustomEvent("slw-open"));
      });
    }
    const host = document.body || document.documentElement;
    if (button.parentElement !== host) host.appendChild(button);
  }

  ensureButton();
  new MutationObserver(ensureButton).observe(document.documentElement, { childList: true, subtree: true });
  setInterval(ensureButton, 1000);
})();
