const lyricsCache = new Map();
const lyricsInflight = new Map();
const CACHE_TTL_MS = 30 * 60 * 1000;

async function seedLocalDefaults() {
  try {
    const response = await fetch(chrome.runtime.getURL("local-defaults.json"));
    if (!response.ok) return;
    const data = await response.json();
    const key = String(data?.publishableKey || "").trim();
    if (!key.startsWith("sl_pk_")) return;
    const stored = await chrome.storage.local.get("publishableKey");
    if (!String(stored.publishableKey || "").trim()) {
      await chrome.storage.local.set({ publishableKey: key });
    }
  } catch {
    // optional
  }
}

async function readPublishableKey() {
  await seedLocalDefaults();
  const stored = await chrome.storage.local.get("publishableKey");
  return String(stored.publishableKey || "").trim();
}

chrome.runtime.onInstalled.addListener(() => {
  void seedLocalDefaults();
});
void seedLocalDefaults();

function safeReply(sendResponse, value) {
  try {
    sendResponse(value);
  } catch {
    // Port already closed.
  }
}

async function fetchLyricsNetwork(trackId, key) {
  const response = await fetch(
    `https://api.spicylyrics.org/v1/lyrics/${encodeURIComponent(trackId)}`,
    {
      headers: {
        Authorization: `Bearer ${key}`,
        Accept: "application/json",
      },
    },
  );
  const body = await response.text();
  return { ok: response.ok, status: response.status, body };
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type !== "fetch-lyrics") return false;

  const trackId = String(message.trackId || "");
  if (!/^[A-Za-z0-9]{22}$/.test(trackId)) {
    safeReply(sendResponse, { ok: false, status: 400, error: "bad-track", body: "" });
    return true;
  }

  const cached = lyricsCache.get(trackId);
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) {
    safeReply(sendResponse, { ...cached.value, cached: true });
    return true;
  }

  const existing = lyricsInflight.get(trackId);
  if (existing) {
    existing
      .then((value) => safeReply(sendResponse, value))
      .catch(() => safeReply(sendResponse, { ok: false, status: 0, error: "network", body: "" }));
    return true;
  }

  const pending = readPublishableKey()
    .then(async (key) => {
      if (!key || key.startsWith("sl_sk_")) {
        return { ok: false, status: 401, error: "web-key", body: "" };
      }
      try {
        const value = await fetchLyricsNetwork(trackId, key);
        if (value.ok || value.status === 404) {
          lyricsCache.set(trackId, { at: Date.now(), value });
        }
        return value;
      } catch {
        return { ok: false, status: 0, error: "network", body: "" };
      }
    })
    .finally(() => {
      lyricsInflight.delete(trackId);
    });

  lyricsInflight.set(trackId, pending);
  pending.then((value) => safeReply(sendResponse, value));
  return true;
});
