const status = document.querySelector("#status");
const openBtn = document.querySelector("#open");

document.querySelector("#options").addEventListener("click", (event) => {
  event.preventDefault();
  chrome.runtime.openOptionsPage();
});

openBtn.addEventListener("click", async () => {
  openBtn.disabled = true;
  status.textContent = "Spicy Lyrics enjekte ediliyor…";
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
      func: () => {
        if (typeof window.__SL_open === "function") window.__SL_open();
        else window.dispatchEvent(new CustomEvent("slw-open"));
      },
    });

    await chrome.tabs.update(tab.id, { active: true });
    status.textContent = "Açıldı. Spotify sekmesine bak.";
  } catch (error) {
    status.textContent = "Açılamadı. Bu klasörü yükle: spicy-lyrics-src/web-extension";
  }
  openBtn.disabled = false;
});
