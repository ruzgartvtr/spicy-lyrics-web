async function seedLocalDefaults() {
  try {
    const response = await fetch(chrome.runtime.getURL("local-defaults.json"));
    if (!response.ok) return;
    const data = await response.json();
    const key = String(data?.publishableKey || "").trim();
    if (!key.startsWith("sl_pk_")) return;
    const stored = await chrome.storage.local.get("publishableKey");
    if (!stored.publishableKey) {
      await chrome.storage.local.set({ publishableKey: key });
    }
  } catch {
    // optional
  }
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

  if (message?.type !== "spicy-lyrics-proxy") return undefined;
  if (typeof message.url !== "string" || !message.url.startsWith("https://api.spicylyrics.org/")) {
    sendResponse({ status: 400, body: "" });
    return undefined;
  }
  if (message.url.includes("/query")) {
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
