/* Drag the generated link from bookmarklet.html into Chrome bookmarks.
   This does not use an extension content script. */
(function () {
  if (!location.hostname.includes("spotify.com")) {
    alert("Bu bookmarklet open.spotify.com üzerinde çalışır.");
    return;
  }
  if (document.getElementById("slw-toggle")) {
    document.getElementById("slw-toggle").click();
    return;
  }
  const style = document.createElement("style");
  style.textContent = `#slw-toggle{position:fixed!important;right:24px!important;bottom:96px!important;z-index:2147483647!important;border:0!important;border-radius:999px!important;padding:12px 18px!important;background:#1ed760!important;color:#000!important;font:700 14px/1 Helvetica,Arial,sans-serif!important;cursor:pointer!important;box-shadow:0 8px 24px rgba(0,0,0,.45)!important}`;
  document.documentElement.appendChild(style);
  const button = document.createElement("button");
  button.id = "slw-toggle";
  button.textContent = "Sözler";
  button.onclick = function () {
    const href = document.querySelector("[data-testid='now-playing-widget'] a[href*='/track/']")?.getAttribute("href") || "";
    const id = href.match(/\/track\/([A-Za-z0-9]+)/)?.[1];
    if (!id) {
      alert("Çalan bir şarkı bulunamadı.");
      return;
    }
    let key = localStorage.getItem("slw_pk") || "";
    if (!key) {
      key = prompt("Spicy Lyrics publishable key (sl_pk_...)") || "";
      if (!key.startsWith("sl_pk_")) {
        alert("sl_pk_ ile başlayan anahtar gerekli.");
        return;
      }
      localStorage.setItem("slw_pk", key);
    }
    let panel = document.getElementById("slw-root");
    if (!panel) {
      panel = document.createElement("div");
      panel.id = "slw-root";
      panel.style.cssText = "position:fixed;inset:0 0 88px 0;z-index:2147483646;background:#000;color:#fff;padding:40px;overflow:auto;font:700 28px/1.35 Helvetica,Arial,sans-serif";
      document.documentElement.appendChild(panel);
    }
    panel.hidden = !panel.hidden;
    if (panel.hidden) return;
    panel.textContent = "Yükleniyor…";
    fetch("https://api.spicylyrics.org/v1/lyrics/" + id, {
      headers: { Authorization: "Bearer " + key, Accept: "application/json" },
    })
      .then((r) => r.json().then((j) => ({ ok: r.ok, status: r.status, j })))
      .then(({ ok, status, j }) => {
        if (!ok) {
          panel.textContent = "API hatası: " + status + (j?.message ? " — " + j.message : "");
          return;
        }
        const body = j.Body || j;
        const lines = [];
        if (body.Type === "Syllable") {
          for (const item of body.Content || []) {
            const syllables = item.Lead?.Syllables || [];
            lines.push(syllables.map((s) => s.Text).join(""));
          }
        } else if (body.Type === "Line") {
          for (const item of body.Content || []) lines.push(item.Text || "");
        } else {
          for (const item of body.Lines || []) lines.push(typeof item === "string" ? item : item.Text || "");
        }
        panel.innerHTML = "";
        const close = document.createElement("button");
        close.textContent = "Kapat";
        close.style.cssText = "position:sticky;top:0;margin-bottom:24px;padding:8px 12px;border:0;border-radius:999px;background:#fff;color:#000;font:700 12px Helvetica;cursor:pointer";
        close.onclick = () => { panel.hidden = true; };
        panel.appendChild(close);
        for (const line of lines.filter(Boolean)) {
          const p = document.createElement("p");
          p.textContent = line;
          panel.appendChild(p);
        }
        const credit = document.createElement("p");
        credit.style.cssText = "margin-top:32px;font:13px/1.4 Helvetica;color:#aaa";
        credit.textContent = "Lyrics from " + (body.source || "provider");
        panel.appendChild(credit);
      })
      .catch(() => {
        panel.textContent = "İstek başarısız. Anahtarın allowlist'inde null veya bu sayfanın origin'i olmalı; bookmarklet için dashboard'da 'No origin header' veya null origin gerekebilir.";
      });
  };
  document.documentElement.appendChild(button);
})();
