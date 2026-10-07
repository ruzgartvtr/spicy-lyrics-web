chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === "slw-open" || message?.type === "toggle") {
    const tabId = sender.tab?.id;
    if (tabId != null) {
      chrome.tabs.sendMessage(tabId, { type: "slw-open" }).catch(() => {});
      chrome.scripting
        .executeScript({
          target: { tabId },
          func: () => {
            try {
              if (typeof window.__SL_toggle === "function") {
                window.__SL_toggle();
                return;
              }
            } catch (_) {}
            window.dispatchEvent(new CustomEvent("slw-open"));
            const root = document.getElementById("SpicyLyricsWebRoot");
            if (root) root.classList.toggle("is-open");
          },
        })
        .catch(() => {});
    }
    sendResponse({ ok: true });
    return true;
  }

  if (message?.type !== "spicy-lyrics-proxy") return undefined;
  if (typeof message.url !== "string" || !message.url.startsWith("https://api.spicylyrics.org/")) {
    sendResponse({ status: 400, body: "" });
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
        // Tab closed before response.
      }
    })
    .catch(() => {
      try {
        sendResponse({ status: 0, body: "" });
      } catch {
        // Tab closed before response.
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
