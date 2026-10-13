/** Fixed overlay that hosts #SpicyLyricsPage instead of Spotify's main view. */

let wantOpen = false;
let root: HTMLDivElement | null = null;

export function ensureOverlayRoot(): HTMLDivElement {
  let el = document.getElementById("SpicyLyricsWebRoot") as HTMLDivElement | null;
  if (!el) {
    el = document.createElement("div");
    el.id = "SpicyLyricsWebRoot";
    el.className = "Root__main-view";
    el.innerHTML =
      `<div class="main-view-container"><div class="main-view-container__scroll-node-child"></div></div>`;
  }
  if (!el.isConnected || el.ownerDocument !== document) {
    document.documentElement.append(el);
  } else if (el.parentElement !== document.documentElement && el.parentElement !== document.body) {
    document.documentElement.append(el);
  }
  if (!document.getElementById("slw-status")) {
    const status = document.createElement("div");
    status.id = "slw-status";
    status.hidden = true;
    document.documentElement.append(status);
  }
  el.classList.toggle("is-open", wantOpen);
  root = el;
  return el;
}

export function setOverlayOpen(open: boolean) {
  wantOpen = open;
  ensureOverlayRoot().classList.toggle("is-open", open);
  for (const id of ["slw-open-button", "slw-toggle"]) {
    const btn = document.getElementById(id);
    btn?.setAttribute("aria-pressed", open ? "true" : "false");
    if (btn && btn.textContent !== "Yükleniyor…") {
      btn.textContent = open ? "Kapat" : "Sözler";
    }
  }
}

export function isOverlayOpen() {
  return wantOpen;
}

export function ensureOpenButton(onToggle: () => void) {
  let button = document.getElementById("slw-open-button") as HTMLButtonElement | null;
  if (!button) {
    button = document.createElement("button");
    button.id = "slw-open-button";
    button.type = "button";
    button.textContent = "Sözler";
    button.setAttribute("aria-pressed", "false");
  }
  const host = document.body || document.documentElement;
  if (button.parentElement !== host) host.appendChild(button);

  if (!(button as any).__slwBound) {
    (button as any).__slwBound = true;
    document.addEventListener(
      "click",
      (event) => {
        const target = event.target as Element | null;
        if (!target?.closest?.("#slw-open-button, #slw-toggle")) return;
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();
        onToggle();
      },
      true,
    );
  }
}

export function watchOverlayRoot() {
  ensureOverlayRoot();
  new MutationObserver(() => {
    if (!document.getElementById("SpicyLyricsWebRoot")?.isConnected) ensureOverlayRoot();
  }).observe(document.documentElement, { childList: true, subtree: true });
  setInterval(() => {
    if (!document.getElementById("SpicyLyricsWebRoot")?.isConnected) ensureOverlayRoot();
  }, 2000);
}

export function setStatusText(text: string) {
  const status = document.getElementById("slw-status");
  if (!status) return;
  status.textContent = text;
  status.hidden = !text;
}

export function getOverlayMount(): HTMLElement | null {
  return ensureOverlayRoot().querySelector(".main-view-container");
}
