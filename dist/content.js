(() => {
  // src/lyrics.js
  var PROVIDERS = {
    spicy_lyrics: "Spicy Lyrics",
    apple_music: "Apple Music",
    spotify: "Spotify"
  };
  function secondsToMs(value) {
    return typeof value === "number" && Number.isFinite(value) ? value * 1e3 : 0;
  }
  function syllableFrom(raw) {
    const text = raw?.Text == null ? "" : String(raw.Text);
    if (!text.trim() && !text) return null;
    return {
      text,
      startMs: secondsToMs(raw.StartTime),
      endMs: secondsToMs(raw.EndTime),
      partOfWord: Boolean(raw.IsPartOfWord)
    };
  }
  function mapSyllables(list) {
    if (!Array.isArray(list)) return [];
    return list.map(syllableFrom).filter(Boolean);
  }
  function person(raw) {
    if (!raw?.username) return null;
    return {
      username: String(raw.username),
      url: typeof raw.url === "string" ? raw.url : ""
    };
  }
  function providerLabel(source) {
    return PROVIDERS[source] || "Lyrics provider";
  }
  function attributionFrom(body) {
    const source = typeof body.source === "string" ? body.source : "";
    const upload = body.UploadAttribution || {};
    return {
      source,
      provider: providerLabel(source),
      uploader: source === "spicy_lyrics" ? person(upload.Uploader) : null,
      maker: source === "spicy_lyrics" ? person(upload.Maker) : null
    };
  }
  function pushLine(lines, line) {
    if (!line.syllables.length) return;
    lines.push(line);
  }
  function normalizeLyrics(body) {
    if (!body || typeof body !== "object") return null;
    const type = body.Type === "Syllable" || body.Type === "Line" || body.Type === "Static" ? body.Type : "Static";
    const content = Array.isArray(body.Content) ? body.Content : [];
    const lines = [];
    if (type === "Syllable") {
      for (const item of content) {
        if (item?.Type && item.Type !== "Vocal") continue;
        const lead = item.Lead || item;
        const syllables = mapSyllables(lead.Syllables);
        if (!syllables.length) continue;
        pushLine(lines, {
          startMs: secondsToMs(lead.StartTime ?? syllables[0].startMs / 1e3),
          endMs: secondsToMs(lead.EndTime ?? syllables[syllables.length - 1].endMs / 1e3),
          opposite: Boolean(item.OppositeAligned || lead.OppositeAligned),
          syllables,
          background: (Array.isArray(item.Background) ? item.Background : []).map((bg) => ({
            syllables: mapSyllables(bg.Syllables)
          })).filter((bg) => bg.syllables.length)
        });
      }
    } else if (type === "Line") {
      for (const item of content) {
        if (item?.Type && item.Type !== "Vocal") continue;
        const text = item.Text ?? item.Lead?.Text;
        if (text == null || String(text).trim() === "") continue;
        const start = item.StartTime ?? item.Lead?.StartTime ?? 0;
        const end = item.EndTime ?? item.Lead?.EndTime ?? start;
        pushLine(lines, {
          startMs: secondsToMs(start),
          endMs: secondsToMs(end),
          opposite: Boolean(item.OppositeAligned),
          syllables: [{
            text: String(text),
            startMs: secondsToMs(start),
            endMs: secondsToMs(end),
            partOfWord: false
          }],
          background: []
        });
      }
    } else {
      const staticLines = Array.isArray(body.Lines) ? body.Lines : content;
      for (const item of staticLines) {
        const text = typeof item === "string" ? item : item?.Text;
        if (text == null || String(text).trim() === "") continue;
        pushLine(lines, {
          startMs: 0,
          endMs: 0,
          opposite: false,
          static: true,
          syllables: [{ text: String(text), startMs: 0, endMs: 0, partOfWord: false }],
          background: []
        });
      }
    }
    if (type !== "Static" && lines.length && lines[0].startMs > 2500) {
      lines.unshift({
        startMs: 0,
        endMs: lines[0].startMs,
        opposite: false,
        intro: true,
        syllables: [
          { text: "\u2022", startMs: 0, endMs: lines[0].startMs / 3, partOfWord: false },
          { text: "\u2022", startMs: lines[0].startMs / 3, endMs: lines[0].startMs / 3 * 2, partOfWord: false },
          { text: "\u2022", startMs: lines[0].startMs / 3 * 2, endMs: lines[0].startMs, partOfWord: false }
        ],
        background: []
      });
    }
    return {
      type: lines.some((line) => line.static) ? "Static" : type,
      lines,
      songWriters: Array.isArray(body.SongWriters) ? body.SongWriters.map(String) : [],
      attribution: attributionFrom(body)
    };
  }
  function activeLineIndex(lines, timeMs) {
    let index = -1;
    for (let i = 0; i < lines.length; i += 1) {
      if (lines[i].static) return -1;
      if (timeMs + 0.5 >= lines[i].startMs) index = i;
      else break;
    }
    return index;
  }
  function syllableFill(syllable, timeMs) {
    const span = syllable.endMs - syllable.startMs;
    if (span <= 0) return timeMs >= syllable.startMs ? 1 : 0;
    return Math.min(1, Math.max(0, (timeMs - syllable.startMs) / span));
  }

  // src/player.js
  function parseClock(text) {
    if (!text) return null;
    const parts = String(text).trim().split(":").map((part) => Number(part));
    if (parts.length < 2 || parts.length > 3 || parts.some((part) => !Number.isFinite(part))) return null;
    if (parts.length === 2) return (parts[0] * 60 + parts[1]) * 1e3;
    return (parts[0] * 3600 + parts[1] * 60 + parts[2]) * 1e3;
  }
  function trackIdFrom(href) {
    return href?.match(/\/track\/([A-Za-z0-9]+)/)?.[1] || "";
  }
  function readPlayer(doc) {
    const widget = doc.querySelector("[data-testid='now-playing-widget']");
    if (!widget) return null;
    const trackHref = widget.querySelector("a[href*='/track/']")?.getAttribute("href") || "";
    const trackId2 = trackIdFrom(trackHref);
    if (!trackId2) {
      if (widget.querySelector("a[href*='/episode/']")) return { unsupported: "episode" };
      return null;
    }
    const titleEl2 = widget.querySelector(
      "[data-testid='context-item-link'], [data-testid='context-item-info-title']"
    ) || widget.querySelector("a[href*='/track/']");
    const artistEl2 = widget.querySelector(
      "[data-testid='context-item-info-artist'] a, [data-testid='context-item-info-artist'], a[href*='/artist/']"
    );
    const img = widget.querySelector("img");
    const bar = doc.querySelector("[data-testid='playback-progressbar']");
    const nowAttr = Number(bar?.getAttribute("aria-valuenow"));
    const maxAttr = Number(bar?.getAttribute("aria-valuemax"));
    const positionFromText = parseClock(doc.querySelector("[data-testid='playback-position']")?.textContent);
    const durationFromText = parseClock(doc.querySelector("[data-testid='playback-duration']")?.textContent);
    let positionMs = positionFromText ?? 0;
    let durationMs = durationFromText ?? 0;
    if (Number.isFinite(maxAttr) && maxAttr > 1e3 && Number.isFinite(nowAttr)) {
      durationMs = maxAttr;
      positionMs = nowAttr;
    } else if (Number.isFinite(maxAttr) && maxAttr > 0 && maxAttr <= 100 && Number.isFinite(nowAttr) && durationMs > 0) {
      positionMs = nowAttr / maxAttr * durationMs;
    }
    const label = (doc.querySelector("[data-testid='control-button-playpause']")?.getAttribute("aria-label") || "").toLowerCase();
    const playing = label.includes("pause") || label.includes("duraklat");
    return {
      trackId: trackId2,
      title: titleEl2?.textContent?.trim() || "",
      artist: artistEl2?.textContent?.trim() || "",
      artUrl: img?.getAttribute("src") || "",
      positionMs,
      durationMs,
      playing
    };
  }
  function seekToRatio(doc, ratio) {
    const bar = doc.querySelector("[data-testid='playback-progressbar']");
    if (!bar || !Number.isFinite(ratio)) return false;
    const rect = bar.getBoundingClientRect();
    if (!rect.width) return false;
    const clamped = Math.min(1, Math.max(0, ratio));
    const clientX = rect.left + clamped * rect.width;
    const clientY = rect.top + rect.height / 2;
    const view2 = doc.defaultView;
    const pointer = {
      bubbles: true,
      cancelable: true,
      clientX,
      clientY,
      pointerId: 1,
      pointerType: "mouse"
    };
    const Pointer = view2.PointerEvent || view2.MouseEvent;
    bar.dispatchEvent(new Pointer("pointerdown", pointer));
    bar.dispatchEvent(new Pointer("pointerup", pointer));
    bar.dispatchEvent(new view2.MouseEvent("click", { bubbles: true, cancelable: true, clientX, clientY }));
    return true;
  }
  function playbackMs(anchor2, now) {
    if (!anchor2) return 0;
    if (!anchor2.playing) return anchor2.positionMs;
    return anchor2.positionMs + Math.max(0, now - anchor2.sampledAt);
  }

  // src/view.js
  function el(doc, tag, className) {
    const node = doc.createElement(tag);
    if (className) node.className = className;
    return node;
  }
  function paintSyllable(node, syllable, timeMs) {
    const amount = syllableFill(syllable, timeMs);
    const fill = node.querySelector(".slw-fill");
    fill.style.width = `${amount * 100}%`;
    node.dataset.fill = amount.toFixed(3);
  }
  function buildSyllable(doc, syllable, index, siblings) {
    const node = el(doc, "span", "slw-syl");
    if (!syllable.partOfWord && index < siblings.length - 1) node.classList.add("slw-gap");
    const base = el(doc, "span", "slw-base");
    base.textContent = syllable.text;
    const fill = el(doc, "span", "slw-fill");
    const fillText = el(doc, "span", "slw-fill-text");
    fillText.textContent = syllable.text;
    fill.append(fillText);
    node.append(base, fill);
    return node;
  }
  function buildLine(doc, line, onSeek) {
    const row = el(doc, "div", "slw-line");
    if (line.opposite) row.classList.add("slw-opposite");
    if (line.intro) row.classList.add("slw-intro");
    row.dir = "auto";
    const lead = el(doc, "div", "slw-lead");
    const nodes = line.syllables.map((syllable, index) => {
      const node = buildSyllable(doc, syllable, index, line.syllables);
      lead.append(node);
      return node;
    });
    row.append(lead);
    const backgroundNodes = [];
    for (const bg of line.background) {
      const bgRow = el(doc, "div", "slw-bgline");
      const syllables = bg.syllables.map((syllable, index) => {
        const node = buildSyllable(doc, syllable, index, bg.syllables);
        bgRow.append(node);
        return node;
      });
      backgroundNodes.push(syllables);
      row.append(bgRow);
    }
    if (!line.static && !line.intro) {
      row.tabIndex = 0;
      row.setAttribute("role", "button");
      const seek = () => onSeek?.(line.startMs);
      row.addEventListener("click", seek);
      row.addEventListener("keydown", (event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          seek();
        }
      });
    }
    return { row, nodes, backgroundNodes };
  }
  function mountLyrics(scroll2, model, onSeek) {
    const doc = scroll2.ownerDocument;
    scroll2.replaceChildren();
    const built = model.lines.map((line) => buildLine(doc, line, onSeek));
    for (const line of built) scroll2.append(line.row);
    let lastActive = -2;
    return {
      paint(timeMs) {
        const active = model.type === "Static" ? -1 : activeLineIndex(model.lines, timeMs);
        built.forEach((line, index) => {
          line.row.classList.toggle("is-active", index === active);
          line.row.classList.toggle("is-sung", active >= 0 && index < active);
          line.row.classList.toggle("is-future", active >= 0 && index > active);
          const lineTime = model.type === "Static" ? Number.POSITIVE_INFINITY : timeMs;
          line.nodes.forEach((node, syllableIndex) => {
            paintSyllable(node, model.lines[index].syllables[syllableIndex], lineTime);
          });
          line.backgroundNodes.forEach((nodes, bgIndex) => {
            nodes.forEach((node, syllableIndex) => {
              paintSyllable(node, model.lines[index].background[bgIndex].syllables[syllableIndex], lineTime);
            });
          });
        });
        if (active !== lastActive && active >= 0) {
          lastActive = active;
          built[active].row.scrollIntoView({ block: "center", inline: "nearest" });
        }
      }
    };
  }
  function renderCredit(footer, attribution, songWriters) {
    const doc = footer.ownerDocument;
    footer.replaceChildren();
    const line = el(doc, "p", "slw-credit-line");
    line.append("Lyrics from ");
    const provider = el(doc, "strong");
    provider.textContent = attribution?.provider || "Lyrics provider";
    line.append(provider);
    if (attribution?.uploader) {
      line.append(" \xB7 uploaded by ");
      line.append(creditLink(doc, attribution.uploader));
    }
    if (attribution?.maker) {
      line.append(" \xB7 made by ");
      line.append(creditLink(doc, attribution.maker));
    }
    footer.append(line);
    if (songWriters?.length) {
      const writers = el(doc, "p", "slw-writers");
      writers.textContent = songWriters.join(", ");
      footer.append(writers);
    }
  }
  function creditLink(doc, person2) {
    if (!person2.url) {
      const span = el(doc, "span");
      span.textContent = person2.username;
      return span;
    }
    const link = el(doc, "a");
    link.href = person2.url;
    link.target = "_blank";
    link.rel = "noreferrer noopener";
    link.textContent = person2.username;
    return link;
  }
  function showMessage(scroll2, text) {
    const doc = scroll2.ownerDocument;
    scroll2.replaceChildren();
    const message = el(doc, "p", "slw-message");
    message.textContent = text;
    scroll2.append(message);
  }

  // src/content.js
  var MESSAGES = {
    "missing-key": "Add a Spicy Lyrics publishable key in the extension options. The key's allowlist has to include this extension.",
    "secret-key": "That is a secret key. Create a publishable key (sl_pk_) for this extension instead.",
    rejected: "The lyrics API rejected the key. Allowlist this extension origin, then try again.",
    "not-found": "No lyrics for this track.",
    "rate-limit": "The lyrics API is rate limiting this key. Wait a moment and play the track again.",
    network: "Could not reach the lyrics API.",
    empty: "The lyrics API returned nothing usable for this track.",
    status: "The lyrics API returned an unexpected response.",
    "bad-track": "This player item does not have a Spotify track id.",
    episode: "Lyrics are not available for podcasts."
  };
  var root = document.createElement("div");
  root.id = "slw-root";
  root.hidden = true;
  root.setAttribute("role", "dialog");
  root.setAttribute("aria-label", "Spicy Lyrics");
  root.innerHTML = `
  <div class="slw-backdrop"></div>
  <div class="slw-layout">
    <img class="slw-art" alt="">
    <div class="slw-stage">
      <header class="slw-head">
        <div>
          <p class="slw-title"></p>
          <p class="slw-artist"></p>
        </div>
        <div class="slw-tools">
          <button type="button" class="slw-offset" data-delta="-100">\u2212100ms</button>
          <button type="button" class="slw-offset" data-delta="100">+100ms</button>
          <button type="button" class="slw-close" aria-label="Close lyrics">Close</button>
        </div>
      </header>
      <div class="slw-scroll"></div>
      <footer class="slw-credit"></footer>
    </div>
  </div>
`;
  document.documentElement.append(root);
  var scroll = root.querySelector(".slw-scroll");
  var titleEl = root.querySelector(".slw-title");
  var artistEl = root.querySelector(".slw-artist");
  var artEl = root.querySelector(".slw-art");
  var creditEl = root.querySelector(".slw-credit");
  var open = sessionStorage.getItem("slw-open") === "1";
  var offsetMs = 0;
  var anchor = null;
  var trackId = "";
  var view = null;
  var requestToken = 0;
  chrome.storage.local.get("offsetMs", (stored) => {
    offsetMs = Number(stored.offsetMs) || 0;
  });
  function getToggle() {
    return document.getElementById("slw-toggle");
  }
  function setOpen(next) {
    open = next;
    root.hidden = !open;
    getToggle()?.setAttribute("aria-pressed", open ? "true" : "false");
    sessionStorage.setItem("slw-open", open ? "1" : "0");
    if (open) syncPlayer();
  }
  window.addEventListener("slw-toggle", () => setOpen(!open));
  root.querySelector(".slw-close").addEventListener("click", () => setOpen(false));
  root.addEventListener("click", (event) => {
    const button = event.target.closest(".slw-offset");
    if (!button) return;
    offsetMs = Math.max(-5e3, Math.min(5e3, offsetMs + Number(button.dataset.delta)));
    chrome.storage.local.set({ offsetMs });
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && open) setOpen(false);
  });
  chrome.runtime.onMessage.addListener((message) => {
    if (message?.type === "toggle") setOpen(!open);
  });
  function placeToggle() {
    getToggle()?.setAttribute("aria-pressed", open ? "true" : "false");
  }
  function currentTime() {
    return playbackMs(anchor, performance.now()) + offsetMs;
  }
  function seekTo(ms) {
    if (!anchor?.durationMs) return;
    seekToRatio(document, ms / anchor.durationMs);
  }
  async function loadTrack(id) {
    const token = ++requestToken;
    view = null;
    showMessage(scroll, "Loading lyrics\u2026");
    creditEl.replaceChildren();
    const result = await chrome.runtime.sendMessage({ type: "lyrics", trackId: id });
    if (token !== requestToken || id !== trackId) return;
    if (!result?.ok) {
      showMessage(scroll, MESSAGES[result?.error] || MESSAGES.status);
      return;
    }
    const model = normalizeLyrics(result.body);
    if (!model?.lines.length) {
      showMessage(scroll, MESSAGES["not-found"]);
      return;
    }
    view = mountLyrics(scroll, model, seekTo);
    renderCredit(creditEl, model.attribution, model.songWriters);
    view.paint(currentTime());
  }
  function syncPlayer() {
    placeToggle();
    if (!open) return;
    const snap = readPlayer(document);
    if (!snap) return;
    if (snap.unsupported) {
      if (trackId !== snap.unsupported) {
        trackId = snap.unsupported;
        view = null;
        showMessage(scroll, MESSAGES[snap.unsupported] || MESSAGES.status);
        creditEl.replaceChildren();
      }
      return;
    }
    anchor = { ...snap, sampledAt: performance.now() };
    titleEl.textContent = snap.title;
    artistEl.textContent = snap.artist;
    if (snap.artUrl && artEl.getAttribute("src") !== snap.artUrl) artEl.src = snap.artUrl;
    root.style.setProperty("--slw-art", snap.artUrl ? `url("${snap.artUrl}")` : "none");
    if (snap.trackId !== trackId) {
      trackId = snap.trackId;
      loadTrack(trackId);
    }
  }
  function frame() {
    if (open && view) view.paint(currentTime());
    requestAnimationFrame(frame);
  }
  placeToggle();
  setOpen(open);
  setInterval(syncPlayer, 200);
  requestAnimationFrame(frame);
  var placingToggle = false;
  new MutationObserver(() => {
    if (placingToggle || toggle.isConnected) return;
    placingToggle = true;
    requestAnimationFrame(() => {
      placingToggle = false;
      placeToggle();
    });
  }).observe(document.documentElement, { childList: true, subtree: true });
})();
