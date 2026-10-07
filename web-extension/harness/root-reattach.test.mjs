import assert from "node:assert/strict";
import test from "node:test";
import { JSDOM } from "jsdom";

/**
 * Simulates Spotify wiping documentElement children after install.
 * Ensures a re-ensure path can put SpicyLyricsWebRoot back.
 */
test("detached SpicyLyricsWebRoot can be reattached", () => {
  const dom = new JSDOM("<!doctype html><html><body></body></html>");
  const { document } = dom.window;

  let root = document.createElement("div");
  root.id = "SpicyLyricsWebRoot";
  root.className = "Root__main-view";
  root.innerHTML = `<div class="main-view-container"></div>`;
  document.documentElement.append(root);

  // Spotify wipe
  document.documentElement.innerHTML = "<head></head><body></body>";
  assert.equal(document.getElementById("SpicyLyricsWebRoot"), null);
  assert.equal(root.isConnected, false);

  const ensureRoot = () => {
    let el = document.getElementById("SpicyLyricsWebRoot");
    if (!el) {
      el = root.isConnected ? root : document.createElement("div");
      el.id = "SpicyLyricsWebRoot";
      el.className = "Root__main-view";
      if (!el.querySelector(".main-view-container")) {
        el.innerHTML = `<div class="main-view-container"></div>`;
      }
    }
    if (!el.isConnected) document.documentElement.append(el);
    el.classList.add("is-open");
    return el;
  };

  const live = ensureRoot();
  assert.ok(live.isConnected);
  assert.equal(document.getElementById("SpicyLyricsWebRoot"), live);
  assert.ok(live.classList.contains("is-open"));
});
