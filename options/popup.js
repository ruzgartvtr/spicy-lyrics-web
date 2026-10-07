const status = document.querySelector("#status");
const openBtn = document.querySelector("#open");

document.querySelector("#options").addEventListener("click", (event) => {
  event.preventDefault();
  chrome.runtime.openOptionsPage();
});

openBtn.addEventListener("click", async () => {
  openBtn.disabled = true;
  status.textContent = "Spotify sekmesi aranıyor…";
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

    await chrome.scripting.insertCSS({
      target: { tabId: tab.id },
      files: ["src/panel.css"],
    }).catch(() => {});

    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ["button.js", "dist/content.js"],
    });

    await chrome.tabs.sendMessage(tab.id, { type: "toggle" }).catch(() => {});
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => {
        window.dispatchEvent(new CustomEvent("slw-toggle"));
        const button = document.getElementById("slw-toggle");
        if (button) button.click();
      },
    }).catch(() => {});

    status.textContent = "Tamam. Spotify sekmesine bak — sağ altta yeşil Sözler var.";
    if (tab.id) chrome.tabs.update(tab.id, { active: true });
  } catch (error) {
    status.textContent = "Enjekte edilemedi. Spotify sekmesini yenile, sonra tekrar dene.";
  }
  openBtn.disabled = false;
});
