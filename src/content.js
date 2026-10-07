import { normalizeLyrics } from "./lyrics.js";
import { playbackMs, readPlayer, seekToRatio } from "./player.js";
import { mountLyrics, renderCredit, showMessage } from "./view.js";

const MESSAGES = {
  "missing-key": "Add a Spicy Lyrics publishable key in the extension options. The key's allowlist has to include this extension.",
  "secret-key": "That is a secret key. Create a publishable key (sl_pk_) for this extension instead.",
  rejected: "The lyrics API rejected the key. Allowlist this extension origin, then try again.",
  "not-found": "No lyrics for this track.",
  "rate-limit": "The lyrics API is rate limiting this key. Wait a moment and play the track again.",
  network: "Could not reach the lyrics API.",
  empty: "The lyrics API returned nothing usable for this track.",
  status: "The lyrics API returned an unexpected response.",
  "bad-track": "This player item does not have a Spotify track id.",
  episode: "Lyrics are not available for podcasts.",
};

const root = document.createElement("div");
root.id = "slw-root";
root.hidden = true;
root.setAttribute("role", "dialog");
root.setAttribute("aria-label", "Spicy Lyrics");
root.innerHTML = `
  <div class="slw-backdrop"></div>
  <div class="slw-layout">
    <img class="slw-art" alt="">
    <div class="slw-stage">
      <header class="slw-head">
        <div>
          <p class="slw-title"></p>
          <p class="slw-artist"></p>
        </div>
        <div class="slw-tools">
          <button type="button" class="slw-offset" data-delta="-100">−100ms</button>
          <button type="button" class="slw-offset" data-delta="100">+100ms</button>
          <button type="button" class="slw-close" aria-label="Close lyrics">Close</button>
        </div>
      </header>
      <div class="slw-scroll"></div>
      <footer class="slw-credit"></footer>
    </div>
  </div>
`;
document.documentElement.append(root);

const scroll = root.querySelector(".slw-scroll");
const titleEl = root.querySelector(".slw-title");
const artistEl = root.querySelector(".slw-artist");
const artEl = root.querySelector(".slw-art");
const creditEl = root.querySelector(".slw-credit");

let open = sessionStorage.getItem("slw-open") === "1";
let offsetMs = 0;
let anchor = null;
let trackId = "";
let view = null;
let requestToken = 0;

chrome.storage.local.get("offsetMs", (stored) => {
  offsetMs = Number(stored.offsetMs) || 0;
});

function getToggle() {
  return document.getElementById("slw-toggle");
}

function setOpen(next) {
  open = next;
  root.hidden = !open;
  getToggle()?.setAttribute("aria-pressed", open ? "true" : "false");
  sessionStorage.setItem("slw-open", open ? "1" : "0");
  if (open) syncPlayer();
}

window.addEventListener("slw-toggle", () => setOpen(!open));
root.querySelector(".slw-close").addEventListener("click", () => setOpen(false));
root.addEventListener("click", (event) => {
  const button = event.target.closest(".slw-offset");
  if (!button) return;
  offsetMs = Math.max(-5000, Math.min(5000, offsetMs + Number(button.dataset.delta)));
  chrome.storage.local.set({ offsetMs });
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && open) setOpen(false);
});

chrome.runtime.onMessage.addListener((message) => {
  if (message?.type === "toggle") setOpen(!open);
});

function placeToggle() {
  // button.js owns the visible control; this only keeps the pressed state in sync.
  getToggle()?.setAttribute("aria-pressed", open ? "true" : "false");
}

function currentTime() {
  return playbackMs(anchor, performance.now()) + offsetMs;
}

function seekTo(ms) {
  if (!anchor?.durationMs) return;
  seekToRatio(document, ms / anchor.durationMs);
}

async function loadTrack(id) {
  const token = ++requestToken;
  view = null;
  showMessage(scroll, "Loading lyrics…");
  creditEl.replaceChildren();
  const result = await chrome.runtime.sendMessage({ type: "lyrics", trackId: id });
  if (token !== requestToken || id !== trackId) return;
  if (!result?.ok) {
    showMessage(scroll, MESSAGES[result?.error] || MESSAGES.status);
    return;
  }
  const model = normalizeLyrics(result.body);
  if (!model?.lines.length) {
    showMessage(scroll, MESSAGES["not-found"]);
    return;
  }
  view = mountLyrics(scroll, model, seekTo);
  renderCredit(creditEl, model.attribution, model.songWriters);
  view.paint(currentTime());
}

function syncPlayer() {
  placeToggle();
  if (!open) return;
  const snap = readPlayer(document);
  if (!snap) return;
  if (snap.unsupported) {
    if (trackId !== snap.unsupported) {
      trackId = snap.unsupported;
      view = null;
      showMessage(scroll, MESSAGES[snap.unsupported] || MESSAGES.status);
      creditEl.replaceChildren();
    }
    return;
  }
  anchor = { ...snap, sampledAt: performance.now() };
  titleEl.textContent = snap.title;
  artistEl.textContent = snap.artist;
  if (snap.artUrl && artEl.getAttribute("src") !== snap.artUrl) artEl.src = snap.artUrl;
  root.style.setProperty("--slw-art", snap.artUrl ? `url("${snap.artUrl}")` : "none");
  if (snap.trackId !== trackId) {
    trackId = snap.trackId;
    loadTrack(trackId);
  }
}

function frame() {
  if (open && view) view.paint(currentTime());
  requestAnimationFrame(frame);
}

placeToggle();
setOpen(open);
setInterval(syncPlayer, 200);
requestAnimationFrame(frame);
let placingToggle = false;
new MutationObserver(() => {
  if (placingToggle || toggle.isConnected) return;
  placingToggle = true;
  requestAnimationFrame(() => {
    placingToggle = false;
    placeToggle();
  });
}).observe(document.documentElement, { childList: true, subtree: true });
