const origin = document.querySelector("#origin");
const keyInput = document.querySelector("#key");
const status = document.querySelector("#status");

origin.textContent = `chrome-extension://${chrome.runtime.id}`;

chrome.storage.local.get("publishableKey", (stored) => {
  keyInput.value = stored.publishableKey || "";
});

document.querySelector("#save").addEventListener("click", async () => {
  const publishableKey = keyInput.value.trim();
  if (publishableKey.startsWith("sl_sk_")) {
    status.textContent = "Secret keys stay on a server. Use a publishable key (sl_pk_).";
    return;
  }
  if (publishableKey && !publishableKey.startsWith("sl_pk_")) {
    status.textContent = "Publishable keys start with sl_pk_.";
    return;
  }
  await chrome.storage.local.set({ publishableKey });
  status.textContent = publishableKey ? "Saved. Reopen the lyrics page on Spotify." : "Key cleared.";
});
