(() => {
  if (window.__SLW_V7__) return;
  window.__SLW_V7__ = true;

  const SOURCE_LABEL = {
    spicy_lyrics: "Spicy Lyrics",
    apple_music: "Apple Music",
    spotify: "Spotify",
    unknown: "Unknown",
  };

  let open = false;
  let fullscreen = false;
  let track = null;
  let lines = [];
  let lyricsBody = null;
  let fetchTimer = null;
  let lastFetchedId = "";
  let lastActive = -1;
  let inflightId = "";

  function playerChrome() {
    return (
      document.querySelector("[data-testid='now-playing-widget']") ||
      document.querySelector("[data-testid='now-playing-bar']") ||
      document.querySelector(".Root__now-playing-bar") ||
      document.querySelector("footer[data-testid='now-playing-bar']") ||
      null
    );
  }

  function parseClock(text) {
    if (!text) return null;
    const parts = text.trim().split(":").map(Number);
    if (parts.some((n) => !Number.isFinite(n))) return null;
    if (parts.length === 2) return (parts[0] * 60 + parts[1]) * 1000;
    if (parts.length === 3) return (parts[0] * 3600 + parts[1] * 60 + parts[2]) * 1000;
    return null;
  }

  function readTrack() {
    const chromeEl = playerChrome();
    if (!chromeEl) return null;
    const link =
      chromeEl.querySelector("a[data-testid='context-item-link'][href*='/track/']") ||
      chromeEl.querySelector("a[href*='/track/']");
    const href = link?.getAttribute("href") || "";
    const trackId = href.match(/\/track\/([A-Za-z0-9]{22})/)?.[1] || "";
    if (!trackId) return null;

    const title =
      (
        chromeEl.querySelector("[data-testid='context-item-link'], [data-testid='context-item-info-title']") ||
        link
      )?.textContent?.trim() || "";
    const artist =
      chromeEl
        .querySelector(
          "[data-testid='context-item-info-artist'] a, [data-testid='context-item-info-artist'], a[href*='/artist/']",
        )
        ?.textContent?.trim() || "";
    const artUrl = chromeEl.querySelector("img")?.getAttribute("src") || "";

    const bar = document.querySelector("[data-testid='playback-progressbar']");
    const nowAttr = Number(bar?.getAttribute("aria-valuenow"));
    const maxAttr = Number(bar?.getAttribute("aria-valuemax"));
    let positionMs = parseClock(document.querySelector("[data-testid='playback-position']")?.textContent) ?? 0;
    let durationMs = parseClock(document.querySelector("[data-testid='playback-duration']")?.textContent) ?? 0;
    if (Number.isFinite(maxAttr) && maxAttr > 1000 && Number.isFinite(nowAttr)) {
      durationMs = maxAttr;
      positionMs = nowAttr;
    } else if (Number.isFinite(maxAttr) && maxAttr > 0 && maxAttr <= 100 && durationMs > 0 && Number.isFinite(nowAttr)) {
      positionMs = (nowAttr / maxAttr) * durationMs;
    }

    return { trackId, title, artist, artUrl, positionMs, durationMs };
  }

  function ensureUi() {
    let btn = document.getElementById("slw-open");
    if (!btn) {
      btn = document.createElement("button");
      btn.id = "slw-open";
      btn.type = "button";
      btn.textContent = "Sözler";
      btn.setAttribute("aria-pressed", "false");
      btn.addEventListener("click", () => {
        if (open) closeOverlay();
        else openOverlay();
      });
      (document.body || document.documentElement).appendChild(btn);
    }

    let root = document.getElementById("slw-root");
    if (!root) {
      root = document.createElement("div");
      root.id = "slw-root";
      root.innerHTML = `
        <div id="slw-top">
          <div id="slw-meta">
            <img id="slw-art" alt="" width="56" height="56" />
            <div id="slw-titles">
              <p id="slw-title">—</p>
              <p id="slw-artist">—</p>
            </div>
          </div>
          <div id="slw-actions">
            <button type="button" id="slw-fs">Tam ekran</button>
            <button type="button" id="slw-close">Kapat</button>
          </div>
        </div>
        <div id="slw-lyrics">
          <p id="slw-status"></p>
          <div id="slw-lines"></div>
          <p id="slw-attr" hidden></p>
        </div>
      `;
      document.documentElement.appendChild(root);
      root.querySelector("#slw-close").addEventListener("click", closeOverlay);
      root.querySelector("#slw-fs").addEventListener("click", () => {
        fullscreen = !fullscreen;
        root.classList.toggle("is-fullscreen", fullscreen);
        root.querySelector("#slw-fs").textContent = fullscreen ? "Küçült" : "Tam ekran";
      });
    }
    return { btn, root };
  }

  function setStatus(text) {
    const el = document.getElementById("slw-status");
    if (el) el.textContent = text || "";
  }

  function openOverlay() {
    const { btn, root } = ensureUi();
    open = true;
    root.classList.add("is-open");
    btn.setAttribute("aria-pressed", "true");
    btn.textContent = "Kapat";
    const snap = readTrack();
    if (snap) {
      track = snap;
      paintMeta(snap);
      scheduleFetch(snap.trackId);
    } else {
      setStatus("Çalan şarkı bulunamadı — bir şarkı çal.");
    }
  }

  function closeOverlay() {
    const { btn, root } = ensureUi();
    open = false;
    fullscreen = false;
    root.classList.remove("is-open", "is-fullscreen");
    btn.setAttribute("aria-pressed", "false");
    btn.textContent = "Sözler";
    const fs = root.querySelector("#slw-fs");
    if (fs) fs.textContent = "Tam ekran";
    if (fetchTimer) {
      clearTimeout(fetchTimer);
      fetchTimer = null;
    }
  }

  function paintMeta(snap) {
    const art = document.getElementById("slw-art");
    const title = document.getElementById("slw-title");
    const artist = document.getElementById("slw-artist");
    if (art) {
      art.src = snap.artUrl || "";
      art.hidden = !snap.artUrl;
    }
    if (title) title.textContent = snap.title || "—";
    if (artist) artist.textContent = snap.artist || "—";
  }

  function toMs(t) {
    if (!Number.isFinite(t)) return 0;
    // API docs use seconds (7.357). Guard if a source already sends ms.
    return t > 0 && t < 10000 ? t * 1000 : t;
  }

  function normalizeLines(body) {
    const type = body?.Type;
    const content = Array.isArray(body?.Content) ? body.Content : Array.isArray(body?.Lines) ? body.Lines : [];
    const out = [];

    for (const row of content) {
      if (!row || typeof row !== "object") continue;

      if (type === "Syllable" || Array.isArray(row?.Lead?.Syllables) || Array.isArray(row?.Syllables)) {
        const syllables = row.Lead?.Syllables || row.Syllables || [];
        const words = syllables
          .map((s) => ({
            text: String(s?.Text ?? s?.text ?? ""),
            start: toMs(Number(s?.StartTime ?? s?.start ?? 0)),
            end: toMs(Number(s?.EndTime ?? s?.end ?? 0)),
          }))
          .filter((w) => w.text);
        if (!words.length) continue;
        out.push({
          text: words.map((w) => w.text).join(""),
          start: words[0].start,
          end: words[words.length - 1].end,
          words,
        });
        continue;
      }

      const text = String(row.Text ?? row.text ?? "").trim();
      if (!text) continue;
      out.push({
        text,
        start: toMs(Number(row.StartTime ?? row.start ?? 0)),
        end: toMs(Number(row.EndTime ?? row.end ?? 0)),
        words: null,
      });
    }
    return out;
  }

  function attributionHtml(body) {
    const source = body?.source || "unknown";
    const label = SOURCE_LABEL[source] || source;
    const upload = body?.UploadAttribution;
    if (source === "spicy_lyrics" && upload) {
      const up = upload.Uploader;
      const mk = upload.Maker;
      const parts = [`Lyrics from ${label}`];
      if (up?.username) {
        parts.push(
          up.url
            ? `uploaded by <a href="${up.url}" target="_blank" rel="noreferrer">${up.username}</a>`
            : `uploaded by ${up.username}`,
        );
      }
      if (mk?.username) {
        parts.push(
          mk.url
            ? `made by <a href="${mk.url}" target="_blank" rel="noreferrer">${mk.username}</a>`
            : `made by ${mk.username}`,
        );
      }
      return parts.join(" · ");
    }
    return `Lyrics from ${label}`;
  }

  function renderLines() {
    const box = document.getElementById("slw-lines");
    const attr = document.getElementById("slw-attr");
    if (!box) return;
    box.innerHTML = "";
    lastActive = -1;

    if (!lines.length) {
      const empty = document.createElement("p");
      empty.id = "slw-empty";
      empty.textContent = "Bu şarkı için söz bulunamadı.";
      box.appendChild(empty);
      if (attr) attr.hidden = true;
      return;
    }

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const el = document.createElement("p");
      el.className = "slw-line";
      el.dataset.index = String(i);
      if (line.words?.length) {
        for (const w of line.words) {
          const span = document.createElement("span");
          span.className = "slw-word";
          span.textContent = w.text;
          el.appendChild(span);
        }
      } else {
        el.textContent = line.text;
      }
      box.appendChild(el);
    }

    if (attr && lyricsBody) {
      attr.innerHTML = attributionHtml(lyricsBody);
      attr.hidden = false;
    }
  }

  function highlight(positionMs) {
    if (!lines.length) return;
    let active = -1;
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const end = line.end > line.start ? line.end : lines[i + 1]?.start ?? line.start + 4000;
      if (positionMs >= line.start && positionMs < end) {
        active = i;
        break;
      }
      if (positionMs >= line.start) active = i;
    }

    const nodes = document.querySelectorAll("#slw-lines .slw-line");
    nodes.forEach((node, i) => {
      node.classList.toggle("is-active", i === active);
      node.classList.toggle("is-past", active >= 0 && i < active);
      const line = lines[i];
      if (!line?.words?.length) return;
      const spans = node.querySelectorAll(".slw-word");
      spans.forEach((span, wi) => {
        const w = line.words[wi];
        const on = w && positionMs >= w.start && positionMs < (w.end || w.start + 400);
        span.classList.toggle("is-active", !!on);
      });
    });

    if (active >= 0 && active !== lastActive) {
      lastActive = active;
      nodes[active]?.scrollIntoView({ block: "center", behavior: "smooth" });
    }
  }

  function scheduleFetch(trackId) {
    if (!open) return;
    if (fetchTimer) clearTimeout(fetchTimer);
    fetchTimer = setTimeout(() => {
      fetchTimer = null;
      void loadLyrics(trackId);
    }, 350);
  }

  function requestLyrics(trackId) {
    return new Promise((resolve) => {
      if (!chrome?.runtime?.id) {
        resolve(null);
        return;
      }
      try {
        chrome.runtime.sendMessage({ type: "fetch-lyrics", trackId }, (result) => {
          void chrome.runtime.lastError;
          resolve(result || null);
        });
      } catch {
        resolve(null);
      }
    });
  }

  async function loadLyrics(trackId) {
    if (!open || !trackId) return;
    if (trackId === lastFetchedId && lines.length) return;
    if (inflightId === trackId) return;
    inflightId = trackId;
    setStatus("Sözler isteniyor…");

    const result = await requestLyrics(trackId);
    inflightId = "";
    if (!open || track?.trackId !== trackId) return;

    if (!result) {
      setStatus("Eklenti bağlantısı yok — Reload + hard refresh.");
      return;
    }
    if (result.error === "web-key" || result.status === 401 || result.status === 403) {
      setStatus("Publishable key yok veya geçersiz (sl_pk_). Popup’tan kaydet.");
      lines = [];
      lyricsBody = null;
      renderLines();
      return;
    }
    if (result.status === 404 || !result.ok) {
      setStatus(result.status === 404 ? "Söz bulunamadı." : `Sözler hatası (${result.status || "network"}).`);
      lines = [];
      lyricsBody = null;
      lastFetchedId = trackId;
      renderLines();
      return;
    }

    let json;
    try {
      json = JSON.parse(result.body || "");
    } catch {
      setStatus("Sözler yanıtı okunamadı.");
      return;
    }
    const body = json?.Body?.Type || json?.Body?.Content || json?.Body?.Lines ? json.Body : json;
    lyricsBody = body;
    lines = normalizeLines(body);
    lastFetchedId = trackId;
    setStatus(lines.length ? "" : "Söz bulunamadı.");
    renderLines();
  }

  function tick() {
    ensureUi();
    const snap = readTrack();
    if (!snap) return;

    const changed = !track || track.trackId !== snap.trackId;
    track = snap;

    if (!open) return;
    if (changed) {
      paintMeta(snap);
      lines = [];
      lyricsBody = null;
      lastFetchedId = "";
      renderLines();
      scheduleFetch(snap.trackId);
    } else {
      paintMeta(snap);
      highlight(snap.positionMs);
    }
  }

  ensureUi();
  setInterval(tick, 400);

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type === "slw-force-open" || message?.type === "slw-open") {
      openOverlay();
      try {
        sendResponse({ ok: true });
      } catch {
        // ignore
      }
      return true;
    }
    return false;
  });

  window.__SL_open = openOverlay;
  window.__SL_close = closeOverlay;
})();
