(() => {
  // src/lyrics.js
  function unwrapPayload(json) {
    if (!json || typeof json !== "object") return null;
    if (json.Body && typeof json.Body === "object" && (json.Body.Type || json.Body.Content || json.Body.Lines)) {
      return json.Body;
    }
    if (json.Type || json.Content || json.Lines) return json;
    return null;
  }
  var TRACK_ID = /^[A-Za-z0-9]{10,40}$/;

  // src/background.js
  var CACHE_TTL_MS = 3 * 24 * 60 * 60 * 1e3;
  async function readKey() {
    const stored = await chrome.storage.local.get("publishableKey");
    return String(stored.publishableKey || "").trim();
  }
  async function readCache(trackId) {
    const stored = await chrome.storage.local.get("lyricsCache");
    const entry = stored.lyricsCache?.[trackId];
    if (!entry || Date.now() - entry.savedAt > CACHE_TTL_MS) return null;
    return entry.body;
  }
  async function writeCache(trackId, body) {
    const stored = await chrome.storage.local.get("lyricsCache");
    const lyricsCache = stored.lyricsCache || {};
    lyricsCache[trackId] = { savedAt: Date.now(), body };
    const ids = Object.keys(lyricsCache);
    if (ids.length > 80) {
      ids.sort((a, b) => lyricsCache[a].savedAt - lyricsCache[b].savedAt);
      for (const id of ids.slice(0, ids.length - 80)) delete lyricsCache[id];
    }
    await chrome.storage.local.set({ lyricsCache });
  }
  async function fetchLyrics(trackId, deps = {}) {
    const fetchImpl = deps.fetchImpl || fetch;
    const getKey = deps.getKey || readKey;
    const getCache = deps.getCache || readCache;
    const setCache = deps.setCache || writeCache;
    if (!TRACK_ID.test(trackId)) return { ok: false, error: "bad-track" };
    const key = await getKey();
    if (!key) return { ok: false, error: "missing-key" };
    if (key.startsWith("sl_sk_")) return { ok: false, error: "secret-key" };
    const cached = await getCache(trackId);
    if (cached) return { ok: true, body: cached, cached: true };
    let response;
    try {
      response = await fetchImpl(`https://api.spicylyrics.org/v1/lyrics/${trackId}`, {
        headers: {
          Authorization: `Bearer ${key}`,
          Accept: "application/json"
        }
      });
    } catch {
      return { ok: false, error: "network" };
    }
    let json = null;
    try {
      json = await response.json();
    } catch {
      json = null;
    }
    if (response.status === 404) return { ok: false, error: "not-found" };
    if (response.status === 401 || response.status === 403) return { ok: false, error: "rejected" };
    if (response.status === 429) return { ok: false, error: "rate-limit" };
    if (!response.ok) return { ok: false, error: "status", status: response.status };
    const body = unwrapPayload(json);
    if (!body) return { ok: false, error: "empty" };
    await setCache(trackId, body);
    return { ok: true, body };
  }
  async function injectIntoTab(tabId) {
    try {
      await chrome.scripting.executeScript({
        target: { tabId },
        files: ["button.js"]
      });
    } catch (_) {
    }
  }
  if (globalThis.chrome?.runtime?.onMessage) {
    chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
      if (message?.type === "toggle") return void 0;
      if (message?.type !== "lyrics") return void 0;
      fetchLyrics(message.trackId).then(sendResponse).catch(() => {
        sendResponse({ ok: false, error: "network" });
      });
      return true;
    });
  }
  if (globalThis.chrome?.tabs?.onUpdated) {
    chrome.tabs.onUpdated.addListener((tabId, info, tab) => {
      if (info.status !== "complete") return;
      if (!tab.url?.startsWith("https://open.spotify.com/")) return;
      injectIntoTab(tabId);
    });
  }
})();
