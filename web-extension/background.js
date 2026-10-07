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

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === "slw-force-open" || message?.type === "slw-open") {
    const tabId = sender.tab?.id ?? message.tabId;
    if (tabId != null) {
      chrome.tabs
        .sendMessage(tabId, { type: "slw-force-open" })
        .catch(() => {
          chrome.scripting
            .executeScript({
              target: { tabId },
              world: "ISOLATED",
              func: () => {
                if (typeof window.__SL_open === "function") window.__SL_open();
                else window.dispatchEvent(new CustomEvent("slw-force-open"));
              },
            })
            .catch(() => {});
        });
    }
    sendResponse({ ok: true });
    return true;
  }

  if (message?.type === "set-publishable-key") {
    const key = String(message.key || "").trim();
    chrome.storage.local.set({ publishableKey: key }).then(() => sendResponse({ ok: true }));
    return true;
  }

  if (message?.type === "fetch-lyrics") {
    const trackId = String(message.trackId || "");
    if (!/^[A-Za-z0-9]{10,40}$/.test(trackId)) {
      sendResponse({ ok: false, status: 400, error: "bad-track", body: "" });
      return true;
    }
    readPublishableKey()
      .then(async (key) => {
        if (!key || key.startsWith("sl_sk_")) {
          sendResponse({ ok: false, status: 401, error: "web-key", body: "" });
          return;
        }
        try {
          const response = await fetch(`https://api.spicylyrics.org/v1/lyrics/${encodeURIComponent(trackId)}`, {
            headers: {
              Authorization: `Bearer ${key}`,
              Accept: "application/json",
            },
          });
          const body = await response.text();
          sendResponse({
            ok: response.ok,
            status: response.status,
            body,
          });
        } catch {
          sendResponse({ ok: false, status: 0, error: "network", body: "" });
        }
      })
      .catch(() => sendResponse({ ok: false, status: 0, error: "network", body: "" }));
    return true;
  }

  if (message?.type !== "spicy-lyrics-proxy") return undefined;
  if (typeof message.url !== "string" || !message.url.startsWith("https://api.spicylyrics.org/")) {
    sendResponse({ status: 400, body: "" });
    return undefined;
  }
  if (message.url.includes("/query") || !message.url.includes("/v1/lyrics/")) {
    sendResponse({ status: 418, body: "{\"error\":\"web-port-skips-query\"}" });
    return undefined;
  }

  fetch(message.url, {
    method: message.method || "GET",
    headers: message.headers || {},
    body: message.body,
  })
    .then(async (response) => {
      try {
        sendResponse({ status: response.status, body: await response.text() });
      } catch {
        // Tab closed.
      }
    })
    .catch(() => {
      try {
        sendResponse({ status: 0, body: "" });
      } catch {
        // Tab closed.
      }
    });
  return true;
});

chrome.tabs.onUpdated.addListener((tabId, info, tab) => {
  if (info.status !== "complete") return;
  if (!tab.url?.startsWith("https://open.spotify.com/")) return;
  chrome.scripting.executeScript({
    target: { tabId },
    files: ["button.js"],
  }).catch(() => {});
});
