type PlayerListener = (event: { data?: any }) => void;

function parseClock(text: string | null | undefined): number | null {
  if (!text) return null;
  const parts = text.trim().split(":").map((part) => Number(part));
  if (parts.length < 2 || parts.length > 3 || parts.some((part) => !Number.isFinite(part))) return null;
  if (parts.length === 2) return (parts[0] * 60 + parts[1]) * 1000;
  return (parts[0] * 3600 + parts[1] * 60 + parts[2]) * 1000;
}

/** Player chrome only — never search results / playlist rows. */
function playerChrome(doc: Document): Element | null {
  return (
    doc.querySelector("[data-testid='now-playing-widget']") ||
    doc.querySelector("[data-testid='now-playing-bar']") ||
    doc.querySelector(".Root__now-playing-bar") ||
    doc.querySelector("footer[data-testid='now-playing-bar']") ||
    doc.querySelector("[data-testid='player-controls']")?.closest("footer, [data-testid='now-playing-bar'], .Root__now-playing-bar") ||
    null
  );
}

function readRepeat(doc: Document): number {
  const btn = doc.querySelector<HTMLElement>("[data-testid='control-button-repeat']");
  if (!btn) return 0;
  const pressed = btn.getAttribute("aria-checked") ?? btn.getAttribute("aria-pressed");
  const label = (btn.getAttribute("aria-label") || "").toLowerCase();
  if (
    pressed === "mixed" ||
    label.includes("one") ||
    label.includes("tek") ||
    /\btrack\b/.test(label) ||
    label.includes("şarkı")
  ) {
    return 2;
  }
  if (pressed === "true" || /disable|kapat/.test(label)) return 1;
  return 0;
}

function readShuffle(doc: Document): { shuffle: boolean; smartShuffle: boolean } {
  const btn = doc.querySelector<HTMLElement>("[data-testid='control-button-shuffle']");
  if (!btn) return { shuffle: false, smartShuffle: false };
  const pressed = btn.getAttribute("aria-checked") ?? btn.getAttribute("aria-pressed");
  const label = (btn.getAttribute("aria-label") || "").toLowerCase();
  // Active buttons are labeled "Disable…" / "…kapat"
  const active = pressed === "true" || /disable|kapat/.test(label);
  const smart = active && (label.includes("smart") || label.includes("akıllı"));
  return { shuffle: active && !smart, smartShuffle: smart };
}

function readTrack(doc: Document) {
  const chrome = playerChrome(doc);
  if (!chrome) return null;

  const trackLink =
    chrome.querySelector<HTMLAnchorElement>("a[data-testid='context-item-link'][href*='/track/']") ||
    chrome.querySelector<HTMLAnchorElement>("a[href*='/track/']");
  const href = trackLink?.getAttribute("href") || "";
  const trackId = href.match(/\/track\/([A-Za-z0-9]{22})/)?.[1] || "";
  if (!trackId) {
    if (chrome.querySelector("a[href*='/episode/']")) return { type: "episode" as const };
    return null;
  }

  const title = (
    chrome.querySelector("[data-testid='context-item-link'], [data-testid='context-item-info-title']")
    || trackLink
  )?.textContent?.trim() || "";
  const artist = chrome.querySelector(
    "[data-testid='context-item-info-artist'] a, [data-testid='context-item-info-artist'], a[href*='/artist/']",
  )?.textContent?.trim() || "";
  const artUrl = chrome.querySelector("img")?.getAttribute("src") || "";
  const bar = doc.querySelector("[data-testid='playback-progressbar']");
  const nowAttr = Number(bar?.getAttribute("aria-valuenow"));
  const maxAttr = Number(bar?.getAttribute("aria-valuemax"));
  const positionFromText = parseClock(doc.querySelector("[data-testid='playback-position']")?.textContent);
  const durationFromText = parseClock(doc.querySelector("[data-testid='playback-duration']")?.textContent);
  let positionMs = positionFromText ?? 0;
  let durationMs = durationFromText ?? 0;
  if (Number.isFinite(maxAttr) && maxAttr > 1000 && Number.isFinite(nowAttr)) {
    durationMs = maxAttr;
    positionMs = nowAttr;
  } else if (
    Number.isFinite(maxAttr) &&
    maxAttr > 0 &&
    maxAttr <= 100 &&
    Number.isFinite(nowAttr) &&
    durationMs > 0
  ) {
    positionMs = (nowAttr / maxAttr) * durationMs;
  }
  const label = (
    doc.querySelector("[data-testid='control-button-playpause']")?.getAttribute("aria-label") || ""
  ).toLowerCase();
  const playing = label.includes("pause") || label.includes("duraklat");
  const repeat = readRepeat(doc);
  const { shuffle, smartShuffle } = readShuffle(doc);
  return {
    type: "track" as const,
    trackId,
    title,
    artist,
    artUrl,
    positionMs,
    durationMs,
    playing,
    repeat,
    shuffle,
    smartShuffle,
  };
}

function clickControl(doc: Document, selector: string) {
  doc.querySelector<HTMLElement>(selector)?.click();
}

function seekToRatio(doc: Document, ratio: number) {
  const bar = doc.querySelector<HTMLElement>("[data-testid='playback-progressbar']");
  if (!bar) return;
  const rect = bar.getBoundingClientRect();
  if (!rect.width) return;
  const clientX = rect.left + Math.min(1, Math.max(0, ratio)) * rect.width;
  const clientY = rect.top + rect.height / 2;
  const pointer = { bubbles: true, cancelable: true, clientX, clientY, pointerId: 1, pointerType: "mouse" };
  const view = doc.defaultView;
  const Pointer = view?.PointerEvent || view?.MouseEvent;
  if (Pointer) {
    bar.dispatchEvent(new Pointer("pointerdown", pointer));
    bar.dispatchEvent(new Pointer("pointerup", pointer));
  }
  bar.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, clientX, clientY }));
}

/** Never proxy through messaging — lyrics use dedicated fetch-lyrics. Stops port spam. */
function installFetchGuard() {
  const nativeFetch = globalThis.fetch.bind(globalThis);
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    if (!url.startsWith("https://api.spicylyrics.org/")) return nativeFetch(input, init);
    if (url.includes("/query")) {
      return new Response(JSON.stringify({ error: "web-port-skips-query" }), { status: 418 });
    }
    // Public lyrics must go through chrome.runtime fetch-lyrics (cached).
    if (url.includes("/v1/lyrics/")) {
      return new Response(JSON.stringify({ error: "use-fetch-lyrics-message" }), {
        status: 599,
        headers: { "content-type": "application/json" },
      });
    }
    return new Response("", { status: 204 });
  }) as typeof fetch;
}

function publishWebDebug(extra: Record<string, unknown> = {}) {
  try {
    const root = document.getElementById("SpicyLyricsWebRoot");
    const page = document.getElementById("SpicyLyricsPage");
    const payload = {
      web: true,
      booted: !!(globalThis as any).__SL_WEB_BOOTED__,
      ready: !!(globalThis as any).__SL_READY__,
      root: !!root,
      rootOpen: !!root?.classList.contains("is-open"),
      page: !!page,
      err: document.getElementById("slw-boot-error")?.textContent || null,
      ...extra,
      t: Date.now(),
    };
    document.documentElement.setAttribute("data-slw-debug", JSON.stringify(payload));
  } catch {
    // ignore
  }
}

export function installWebSpicetify() {
  if ((globalThis as any).__SL_WEB__) return;
  (globalThis as any).__SL_WEB__ = true;
  installFetchGuard();
  publishWebDebug({ stage: "install-start" });

  let root: HTMLDivElement | null = null;
  let wantOpen = false;

  const ensureRoot = () => {
    let el = document.getElementById("SpicyLyricsWebRoot") as HTMLDivElement | null;
    if (!el) {
      el = document.createElement("div");
      el.id = "SpicyLyricsWebRoot";
      el.className = "Root__main-view";
      el.innerHTML = `<div class="main-view-container"><div class="main-view-container__scroll-node-child"></div></div>`;
    }
    if (!el.isConnected || el.ownerDocument !== document) {
      document.documentElement.append(el);
    } else if (el.parentElement !== document.documentElement && el.parentElement !== document.body) {
      document.documentElement.append(el);
    }
    if (!document.getElementById("slw-status")) {
      const status = document.createElement("div");
      status.id = "slw-status";
      status.hidden = true;
      document.documentElement.append(status);
    }
    el.classList.toggle("is-open", wantOpen);
    root = el;
    return el;
  };
  ensureRoot();
  new MutationObserver(() => {
    if (!document.getElementById("SpicyLyricsWebRoot")?.isConnected) ensureRoot();
  }).observe(document.documentElement, { childList: true, subtree: true });
  setInterval(() => {
    if (!document.getElementById("SpicyLyricsWebRoot")?.isConnected) ensureRoot();
  }, 2000);

  const listeners = new Map<string, Set<PlayerListener>>();
  const historyListeners = new Set<(location: { pathname: string }) => void>();
  const history = {
    location: { pathname: "/" },
    push(next: { pathname: string }) {
      history.location = { pathname: next.pathname };
      wantOpen = next.pathname === "/SpicyLyrics";
      ensureRoot().classList.toggle("is-open", wantOpen);
      for (const listener of historyListeners) listener(history.location);
    },
    listen(listener: (location: { pathname: string }) => void) {
      historyListeners.add(listener);
      return () => historyListeners.delete(listener);
    },
    goBack() {
      history.push({ pathname: "/" });
    },
  };

  const playerState = {
    positionAsOfTimestamp: 0,
    timestamp: Date.now(),
    isPaused: true,
    smartShuffle: false,
    shuffle: false,
    repeat: 0,
  };
  let durationMs = 0;
  const playerData: any = { item: null };

  const currentProgress = () =>
    playerState.positionAsOfTimestamp +
    (playerState.isPaused ? 0 : Math.max(0, Date.now() - playerState.timestamp));

  const emit = (type: string, data?: any) => {
    for (const listener of listeners.get(type) || []) listener({ data });
  };

  const playerOrigin = {
    get _state() {
      return playerState;
    },
    seekTo: (ms: number) => {
      if (durationMs > 0) seekToRatio(document, ms / durationMs);
    },
  };

  const Spicetify: any = {
    Platform: {
      History: history,
      version: "1.2.0",
      // Enough for requestPositionSync / volume listener guards on web.
      PlaybackAPI: {
        _isLocal: false,
        _events: { addListener: () => {}, removeListener: () => {} },
      },
      PlayerAPI: {
        get _state() {
          return playerState;
        },
        _contextPlayer: {
          getPositionState: async () => ({ position: currentProgress() }),
          resume: async () => ({}),
        },
      },
      CosmosAsync: {
        get: async () => ({}),
        post: async () => ({}),
        put: async () => ({}),
        del: async () => ({}),
      },
      AuthorizationAPI: {
        getState: async () => ({ isAuthorized: true, token: null }),
      },
    },
    CosmosAsync: {
      get: async () => ({}),
      post: async () => ({}),
      put: async () => ({}),
      del: async () => ({}),
    },
    Player: {
      data: playerData,
      origin: playerOrigin,
      get progress() {
        return currentProgress();
      },
      get duration() {
        return durationMs;
      },
      get track() {
        return playerData.item;
      },
      getProgress: () => currentProgress(),
      getProgressPercent: () => (durationMs > 0 ? currentProgress() / durationMs : 0),
      getRepeat: () => playerState.repeat,
      getShuffle: () => playerState.shuffle,
      isPlaying: () => !playerState.isPaused,
      play: () => clickControl(document, "[data-testid='control-button-playpause']"),
      pause: () => clickControl(document, "[data-testid='control-button-playpause']"),
      togglePlay: () => clickControl(document, "[data-testid='control-button-playpause']"),
      next: () => clickControl(document, "[data-testid='control-button-skip-forward']"),
      back: () => clickControl(document, "[data-testid='control-button-skip-back']"),
      seek: (ms: number) => {
        if (durationMs > 0) seekToRatio(document, ms / durationMs);
      },
      getHeart: () => false,
      addEventListener: (type: string, cb: PlayerListener) => {
        if (!listeners.has(type)) listeners.set(type, new Set());
        listeners.get(type)!.add(cb);
      },
      removeEventListener: (type: string, cb: PlayerListener) => {
        listeners.get(type)?.delete(cb);
      },
    },
    LocalStorage: {
      get: (key: string) => {
        try {
          return localStorage.getItem(`slw:${key}`);
        } catch {
          return null;
        }
      },
      set: (key: string, value: string) => {
        try {
          localStorage.setItem(`slw:${key}`, value);
        } catch {
          // ignore
        }
      },
    },
    Keyboard: {
      KEYS: { ESCAPE: "Escape", F11: "F11" },
      registerImportantShortcut: () => {},
    },
    Tippy: undefined,
    TippyProps: {},
    colorExtractor: async () => ({ VIBRANT_NON_ALARMING: "#999999" }),
  };

  (globalThis as any).Spicetify = Spicetify;

  let lastUri = "";
  let lastPlaying = false;
  let missingPolls = 0;
  const poll = () => {
    const snap = readTrack(document);
    if (!snap || snap.type !== "track") {
      // Keep last track through brief DOM churn (cinema/fullscreen transitions).
      missingPolls += 1;
      if (missingPolls >= 6 && playerData.item?.type === "track") {
        playerData.item = null;
        lastUri = "";
      }
      return;
    }
    missingPolls = 0;
    durationMs = snap.durationMs;
    playerState.positionAsOfTimestamp = snap.positionMs;
    playerState.timestamp = Date.now();
    playerState.isPaused = !snap.playing;
    playerState.repeat = snap.repeat;
    playerState.shuffle = snap.shuffle;
    playerState.smartShuffle = snap.smartShuffle;
    const uri = `spotify:track:${snap.trackId}`;
    const item = {
      type: "track",
      mediaType: "audio",
      uri,
      name: snap.title,
      duration: { milliseconds: snap.durationMs },
      artists: snap.artist ? [{ type: "artist", name: snap.artist, uri: "" }] : [],
      images: ["small", "standard", "large", "xlarge"].map((label) => ({ url: snap.artUrl, label })),
      metadata: { album_title: "" },
      provider: "",
    };
    playerData.item = item;
    // Only emit songchange when the now-playing track actually changes.
    if (uri !== lastUri) {
      lastUri = uri;
      emit("songchange", { item });
    }
    if (snap.playing !== lastPlaying) {
      lastPlaying = snap.playing;
      emit("onplaypause", { isPaused: !snap.playing });
    }
  };
  poll();
  setInterval(poll, 500);

  let openImpl = () => {
    ensureRoot();
    history.push({ pathname: "/SpicyLyrics" });
  };
  const closeLyrics = () => {
    ensureRoot();
    history.goBack();
    const status = document.getElementById("slw-status");
    if (status) status.hidden = true;
  };
  const openLyrics = () => {
    openImpl();
    publishWebDebug({ stage: "open", pathname: history.location.pathname, trackId: lastUri });
  };
  const toggleLyrics = () => {
    const now = Date.now();
    if (now - Number((window as any).__SL_TOGGLE_AT || 0) < 500) return;
    (window as any).__SL_TOGGLE_AT = now;
    if (history.location.pathname === "/SpicyLyrics" && root?.classList.contains("is-open")) {
      closeLyrics();
    } else {
      openLyrics();
    }
  };
  const syncOpenButton = () => {
    const open = history.location.pathname === "/SpicyLyrics";
    for (const id of ["slw-open-button", "slw-toggle"]) {
      const btn = document.getElementById(id);
      btn?.setAttribute("aria-pressed", open ? "true" : "false");
      if (btn && btn.textContent !== "Yükleniyor…") {
        btn.textContent = open ? "Kapat" : "Sözler";
      }
    }
  };
  const originalPush = history.push.bind(history);
  history.push = (next: { pathname: string }) => {
    originalPush(next);
    syncOpenButton();
  };
  (window as any).__SL_setOpenImpl = (fn: () => void) => {
    openImpl = fn;
  };
  (window as any).__SL_open = openLyrics;
  (window as any).__SL_close = closeLyrics;
  (window as any).__SL_toggle = toggleLyrics;
  window.addEventListener("slw-open", openLyrics);
  window.addEventListener("slw-force-open", openLyrics);
  window.addEventListener("slw-toggle", toggleLyrics);

  document.addEventListener(
    "click",
    (event) => {
      const target = event.target as Element | null;
      if (!target?.closest?.("#slw-open-button, #slw-toggle")) return;
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      toggleLyrics();
    },
    true,
  );

  const chromeApi = (globalThis as any).chrome;
  chromeApi?.runtime?.onMessage?.addListener(
    (message: { type?: string }, _sender: unknown, sendResponse: (v: unknown) => void) => {
      if (message?.type === "slw-force-open" || message?.type === "slw-open") {
        openLyrics();
        sendResponse?.({ ok: true });
        return true;
      }
      if (message?.type === "toggle") {
        toggleLyrics();
        sendResponse?.({ ok: true });
        return true;
      }
      return undefined;
    },
  );
}
