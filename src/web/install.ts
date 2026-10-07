type PlayerListener = (event: { data?: any }) => void;

function parseClock(text: string | null | undefined): number | null {
  if (!text) return null;
  const parts = text.trim().split(":").map((part) => Number(part));
  if (parts.length < 2 || parts.length > 3 || parts.some((part) => !Number.isFinite(part))) return null;
  if (parts.length === 2) return (parts[0] * 60 + parts[1]) * 1000;
  return (parts[0] * 3600 + parts[1] * 60 + parts[2]) * 1000;
}

function readTrack(doc: Document) {
  const widget = doc.querySelector("[data-testid='now-playing-widget']");
  const href = widget?.querySelector("a[href*='/track/']")?.getAttribute("href") || "";
  const trackId = href.match(/\/track\/([A-Za-z0-9]+)/)?.[1] || "";
  if (!trackId) {
    const episode = widget?.querySelector("a[href*='/episode/']");
    if (episode) return { type: "episode" as const };
    return null;
  }
  const title = (
    widget?.querySelector("[data-testid='context-item-link'], [data-testid='context-item-info-title']")
    || widget?.querySelector("a[href*='/track/']")
  )?.textContent?.trim() || "";
  const artist = widget?.querySelector(
    "[data-testid='context-item-info-artist'] a, [data-testid='context-item-info-artist'], a[href*='/artist/']",
  )?.textContent?.trim() || "";
  const artUrl = widget?.querySelector("img")?.getAttribute("src") || "";
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
  } else if (Number.isFinite(maxAttr) && maxAttr > 0 && maxAttr <= 100 && Number.isFinite(nowAttr) && durationMs > 0) {
    positionMs = (nowAttr / maxAttr) * durationMs;
  }
  const label = (doc.querySelector("[data-testid='control-button-playpause']")?.getAttribute("aria-label") || "").toLowerCase();
  const playing = label.includes("pause") || label.includes("duraklat");
  return { type: "track" as const, trackId, title, artist, artUrl, positionMs, durationMs, playing };
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

function installFetchProxy() {
  const chromeApi = (globalThis as any).chrome;
  if (!chromeApi?.runtime?.sendMessage) return;
  const nativeFetch = globalThis.fetch.bind(globalThis);
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    if (!url.startsWith("https://api.spicylyrics.org/")) return nativeFetch(input, init);
    const headers: Record<string, string> = {};
    new Headers(init?.headers).forEach((value, key) => {
      headers[key] = value;
    });
    let proxied: { body?: string; status?: number } | undefined;
    try {
      proxied = await chromeApi.runtime.sendMessage({
        type: "spicy-lyrics-proxy",
        url,
        method: init?.method || "GET",
        headers,
        body: typeof init?.body === "string" ? init.body : undefined,
      });
    } catch {
      return new Response("", { status: 0 });
    }
    return new Response(proxied?.body ?? "", { status: proxied?.status || 0 });
  }) as typeof fetch;
}

export function installWebSpicetify() {
  (globalThis as any).__SL_WEB__ = true;
  installFetchProxy();

  const root = document.createElement("div");
  root.id = "SpicyLyricsWebRoot";
  root.className = "Root__main-view";
  root.innerHTML = `<div class="main-view-container"><div class="main-view-container__scroll-node-child"></div></div>`;
  document.documentElement.append(root);

  const listeners = new Map<string, Set<PlayerListener>>();
  const historyListeners = new Set<(location: { pathname: string }) => void>();
  const history = {
    location: { pathname: "/" },
    push(next: { pathname: string }) {
      history.location = { pathname: next.pathname };
      root.classList.toggle("is-open", next.pathname === "/SpicyLyrics");
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
  };
  let durationMs = 0;
  const playerData: any = { item: null };

  const emit = (type: string, data?: any) => {
    for (const listener of listeners.get(type) || []) listener({ data });
  };

  const Spicetify = {
    LocalStorage: {
      get: (key: string) => localStorage.getItem(key),
      set: (key: string, value: string) => localStorage.setItem(key, value),
    },
    Config: { version: "2.46.0", current_theme: "" },
    Tippy: undefined,
    TippyProps: {},
    SVGIcons: {},
    Keyboard: {
      KEYS: { ESCAPE: "Escape", F11: "F11" },
      registerImportantShortcut(key: string, callback: () => void) {
        document.addEventListener("keydown", (event) => {
          if (event.key === key) callback();
        });
      },
    },
    Menu: {
      Item: class {
        onClick: () => void;
        constructor(_name: string, _enabled: boolean, onClick: () => void) {
          this.onClick = onClick;
        }
        register() {}
      },
    },
    CosmosAsync: {
      get: async () => null,
      post: async () => null,
      put: async () => null,
      del: async () => null,
    },
    GraphQL: {
      Request: async () => null,
      Definitions: new Proxy({}, { get: () => ({}) }),
    },
    colorExtractor: async () => ({}),
    Platform: {
      version: "1.2.70.0",
      PlatformData: { app_platform: "web" },
      History: history,
      AuthorizationAPI: {
        getState: () => ({ isAuthorized: true, token: { accessToken: "web", accessTokenExpirationTimestampMs: Date.now() + 3_600_000 } }),
      },
      LibraryAPI: {
        add: async () => {},
        remove: async () => {},
      },
      PlaybackAPI: {
        _isLocal: true,
        _events: { addListener() {} },
      },
      PlayerAPI: {
        _state: playerState,
        _contextPlayer: {
          getPositionState: async () => ({ position: playerState.positionAsOfTimestamp }),
          resume: async () => {},
        },
      },
      Session: {},
    },
    Player: {
      data: playerData,
      origin: {
        _state: playerState,
        seekTo(position: number) {
          if (durationMs > 0) seekToRatio(document, position / durationMs);
        },
      },
      isPlaying: () => !playerState.isPaused,
      getProgress: () => playerState.positionAsOfTimestamp,
      getRepeat: () => 0,
      getHeart: () => false,
      getVolume: () => 1,
      pause: () => clickControl(document, "[data-testid='control-button-playpause']"),
      play: () => clickControl(document, "[data-testid='control-button-playpause']"),
      togglePlay: () => clickControl(document, "[data-testid='control-button-playpause']"),
      next: () => clickControl(document, "[data-testid='control-button-skip-forward']"),
      back: () => clickControl(document, "[data-testid='control-button-skip-back']"),
      setShuffle() {},
      setRepeat() {},
      setVolume() {},
      setMute() {},
      addEventListener(type: string, listener: PlayerListener) {
        const bucket = listeners.get(type) || new Set<PlayerListener>();
        bucket.add(listener);
        listeners.set(type, bucket);
      },
      removeEventListener(type: string, listener: PlayerListener) {
        listeners.get(type)?.delete(listener);
      },
      dispatchEvent(type: string, data?: any) {
        emit(type, data);
      },
    },
  };

  (globalThis as any).Spicetify = Spicetify;

  let lastUri = "";
  let lastPlaying = false;
  const poll = () => {
    const snap = readTrack(document);
    if (!snap || snap.type !== "track") {
      if (playerData.item?.type === "track") {
        playerData.item = snap?.type === "episode" ? { type: "episode", uri: "", mediaType: "audio" } : null;
        lastUri = "";
      }
      return;
    }
    durationMs = snap.durationMs;
    playerState.positionAsOfTimestamp = snap.positionMs;
    playerState.timestamp = Date.now();
    playerState.isPaused = !snap.playing;
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
  setInterval(poll, 200);

  const openButton = document.createElement("button");
  openButton.id = "slw-open-button";
  openButton.type = "button";
  openButton.textContent = "Sözler";
  openButton.setAttribute("aria-pressed", "false");
  const toggleLyrics = () => {
    if (history.location.pathname === "/SpicyLyrics") history.goBack();
    else history.push({ pathname: "/SpicyLyrics" });
  };
  openButton.addEventListener("click", (event) => {
    event.stopPropagation();
    toggleLyrics();
  });
  const syncOpenButton = () => {
    const open = history.location.pathname === "/SpicyLyrics";
    openButton.setAttribute("aria-pressed", open ? "true" : "false");
  };
  const originalPush = history.push.bind(history);
  history.push = (next: { pathname: string }) => {
    originalPush(next);
    syncOpenButton();
  };
  openButton.style.cssText = "position:fixed;right:24px;bottom:96px;z-index:2147483646;border:0;border-radius:999px;padding:12px 16px;background:#1ed760;color:#000;font:700 14px/1 Helvetica,sans-serif;cursor:pointer;";
  const placeOpenButton = () => {
    if (!openButton.isConnected) document.documentElement.append(openButton);
  };
  placeOpenButton();
  let placing = false;
  new MutationObserver(() => {
    if (placing || openButton.isConnected) return;
    placing = true;
    requestAnimationFrame(() => {
      placing = false;
      placeOpenButton();
    });
  }).observe(document.documentElement, { childList: true, subtree: true });
}
