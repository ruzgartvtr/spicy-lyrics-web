const status = document.querySelector("#status");
const openBtn = document.querySelector("#open");
const saveBtn = document.querySelector("#save");
const keyInput = document.querySelector("#key");

document.querySelector("#options").addEventListener("click", (event) => {
  event.preventDefault();
  chrome.runtime.openOptionsPage();
});

chrome.storage.local.get("publishableKey", (stored) => {
  keyInput.value = stored.publishableKey || "";
  if (!stored.publishableKey) {
    status.textContent = "Önce sl_pk_ anahtarını kaydet.";
  }
});

saveBtn.addEventListener("click", async () => {
  const publishableKey = keyInput.value.trim();
  if (publishableKey.startsWith("sl_sk_")) {
    status.textContent = "Secret key değil — sl_pk_ kullan.";
    return;
  }
  if (publishableKey && !publishableKey.startsWith("sl_pk_")) {
    status.textContent = "Anahtar sl_pk_ ile başlamalı.";
    return;
  }
  await chrome.storage.local.set({ publishableKey });
  status.textContent = publishableKey ? "Anahtar kaydedildi." : "Anahtar silindi.";
});

openBtn.addEventListener("click", async () => {
  openBtn.disabled = true;
  const publishableKey = keyInput.value.trim();
  if (publishableKey.startsWith("sl_pk_")) {
    await chrome.storage.local.set({ publishableKey });
  }
  status.textContent = "Spicy Lyrics açılıyor…";
  try {
    const tabs = await chrome.tabs.query({
      active: true,
      currentWindow: true,
      url: ["https://open.spotify.com/*"],
    });
    let tab = tabs[0];
    if (!tab) {
      const any = await chrome.tabs.query({ url: ["https://open.spotify.com/*"] });
      tab = any[0];
    }
    if (!tab?.id) {
      status.textContent = "Önce open.spotify.com sekmesini aç.";
      openBtn.disabled = false;
      return;
    }

    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ["button.js", "dist/spicy-lyrics.web.js"],
    });

    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      world: "ISOLATED",
      func: () => {
        if (typeof window.__SL_open === "function") window.__SL_open();
        else if (typeof window.__SL_toggle === "function") window.__SL_toggle();
        else window.dispatchEvent(new CustomEvent("slw-open"));
      },
    });

    await chrome.tabs.update(tab.id, { active: true });
    status.textContent = "Açıldı. Spotify sekmesine bak.";
  } catch (error) {
    status.textContent = `Açılamadı: ${error instanceof Error ? error.message : String(error)}`;
  }
  openBtn.disabled = false;
});
