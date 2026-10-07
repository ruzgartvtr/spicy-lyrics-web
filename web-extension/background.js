chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type !== "spicy-lyrics-proxy") return undefined;
  if (typeof message.url !== "string" || !message.url.startsWith("https://api.spicylyrics.org/")) {
    sendResponse({ status: 400, body: "" });
    return undefined;
  }
  fetch(message.url, {
    method: message.method || "GET",
    headers: message.headers || {},
    body: message.body,
  }).then(async (response) => {
    try {
      sendResponse({ status: response.status, body: await response.text() });
    } catch {
      // The Spotify tab closed before the lyrics response arrived.
    }
  }).catch(() => {
    try {
      sendResponse({ status: 0, body: "" });
    } catch {
      // The Spotify tab closed before the lyrics response arrived.
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
