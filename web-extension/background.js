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
    sendResponse({ status: response.status, body: await response.text() });
  }).catch(() => {
    sendResponse({ status: 0, body: "" });
  });
  return true;
});
