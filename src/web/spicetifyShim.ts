import { clickControl, readTrack, seekToRatio } from "./trackScrape.ts";
import {
  ensureOpenButton,
  ensureOverlayRoot,
  getOverlayMount,
  isOverlayOpen,
  setOverlayOpen,
  setStatusText,
  watchOverlayRoot,
} from "./overlayHost.ts";

type PlayerListener = (event: { data?: any }) => void;

function emptyAsync() {
  return async () => ({});
}

/**
 * Clean Spicetify surface for the official Spicy Lyrics app on Spotify Web.
 * Only implements what boot + lyrics + NowBar/Fullscreen need.
 */
export function installWebSpicetify() {
  if ((globalThis as any).__SL_WEB__) return;
  (globalThis as any).__SL_WEB__ = true;

  installFetchGuard();
  watchOverlayRoot();
  ensureOverlayRoot();

  const listeners = new Map<string, Set<PlayerListener>>();
  const historyListeners = new Set<(location: { pathname: string }) => void>();

  const history = {
    location: { pathname: "/" },
    push(next: { pathname: string }) {
      history.location = { pathname: next.pathname };
      setOverlayOpen(next.pathname === "/SpicyLyrics");
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
  const playerData: { item: any } = { item: null };

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

  const cosmos = {
    get: emptyAsync(),
    post: emptyAsync(),
    put: emptyAsync(),
    del: emptyAsync(),
  };

  const Spicetify: any = {
    Platform: {
      History: history,
      version: "1.2.0",
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
      CosmosAsync: cosmos,
      AuthorizationAPI: {
        getState: async () => ({
          isAuthorized: true,
          token: {
            accessToken: "web",
            accessTokenExpirationTimestampMs: Date.now() + 3_600_000,
          },
        }),
      },
      LibraryAPI: {
        add: async () => {},
        remove: async () => {},
      },
      Session: {},
      PlatformData: { app_platform: "web" },
    },
    CosmosAsync: cosmos,
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
      getVolume: () => {
        const bar = document.querySelector("[data-testid='volume-bar']");
        const now = Number(bar?.getAttribute("aria-valuenow"));
        const max = Number(bar?.getAttribute("aria-valuemax") || 1);
        if (Number.isFinite(now) && Number.isFinite(max) && max > 0) {
          return Math.max(0, Math.min(1, now / (max > 1 ? max : 1)));
        }
        return 1;
      },
      setVolume: (_level?: number) => {},
      getMute: () => false,
      setMute: (_muted?: boolean) => {},
      toggleMute: () => {},
      setShuffle: (_value?: boolean) => {},
      setRepeat: (_value?: number) => {},
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
      dispatchEvent: (type: string, data?: any) => emit(type, data),
    },
    Config: { version: "2.46.0", current_theme: "" },
    SVGIcons: {},
    GraphQL: {
      Request: async () => null,
      Definitions: new Proxy({}, { get: () => ({}) }),
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
    Menu: {
      Item: class {
        register() {}
        deregister() {}
      },
    },
    Tippy: undefined,
    TippyProps: {},
    colorExtractor: async () => ({ VIBRANT_NON_ALARMING: "#999999" }),
  };

  (globalThis as any).Spicetify = Spicetify;

  let lastUri = "";
  let lastPlaying = false;
  let missingPolls = 0;
  let songChangeTimer: ReturnType<typeof setTimeout> | null = null;

  const poll = () => {
    const snap = readTrack(document);
    if (!snap || snap.type !== "track") {
      missingPolls += 1;
      if (missingPolls >= 6 && playerData.item?.type === "track") {
        playerData.item = null;
        lastUri = "";
        if (songChangeTimer) {
          clearTimeout(songChangeTimer);
          songChangeTimer = null;
        }
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
      images: ["small", "standard", "large", "xlarge"].map((label) => ({
        url: snap.artUrl,
        label,
      })),
      metadata: { album_title: "" },
      provider: "",
    };
    playerData.item = item;

    if (uri !== lastUri) {
      lastUri = uri;
      if (songChangeTimer) clearTimeout(songChangeTimer);
      songChangeTimer = setTimeout(() => {
        songChangeTimer = null;
        if (lastUri === uri && playerData.item?.uri === uri) {
          emit("songchange", { item: playerData.item });
        }
      }, 400);
    }

    if (snap.playing !== lastPlaying) {
      lastPlaying = snap.playing;
      emit("onplaypause", { isPaused: !snap.playing });
    }
  };
  poll();
  setInterval(poll, 500);

  let openImpl = () => {
    ensureOverlayRoot();
    history.push({ pathname: "/SpicyLyrics" });
  };

  const closeLyrics = () => {
    history.goBack();
    setStatusText("");
  };

  const openLyrics = () => {
    openImpl();
  };

  const toggleLyrics = () => {
    const now = Date.now();
    if (now - Number((window as any).__SL_TOGGLE_AT || 0) < 500) return;
    (window as any).__SL_TOGGLE_AT = now;
    if (isOverlayOpen()) closeLyrics();
    else openLyrics();
  };

  (window as any).__SL_setOpenImpl = (fn: () => void) => {
    openImpl = fn;
  };
  (window as any).__SL_open = openLyrics;
  (window as any).__SL_close = closeLyrics;
  (window as any).__SL_toggle = toggleLyrics;
  (window as any).__SL_getMount = getOverlayMount;

  ensureOpenButton(toggleLyrics);
  window.addEventListener("slw-force-open", openLyrics);
  window.addEventListener("slw-open", openLyrics);
  window.addEventListener("slw-toggle", toggleLyrics);

  const chromeApi = (globalThis as any).chrome;
  chromeApi?.runtime?.onMessage?.addListener(
    (message: { type?: string }, _sender: unknown, sendResponse: (v: unknown) => void) => {
      const reply = (value: unknown) => {
        try {
          sendResponse?.(value);
        } catch {
          // ignore closed port
        }
      };
      if (message?.type === "slw-force-open" || message?.type === "slw-open") {
        openLyrics();
        reply({ ok: true });
        return true;
      }
      if (message?.type === "toggle") {
        toggleLyrics();
        reply({ ok: true });
        return true;
      }
      return false;
    },
  );
}

/** Block page-context fetches to the API — lyrics go through background only. */
function installFetchGuard() {
  const nativeFetch = globalThis.fetch.bind(globalThis);
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    if (!url.startsWith("https://api.spicylyrics.org/")) return nativeFetch(input, init);
    if (url.includes("/query")) {
      return new Response(JSON.stringify({ error: "web-port-skips-query" }), { status: 418 });
    }
    if (url.includes("/v1/lyrics/")) {
      return new Response(JSON.stringify({ error: "use-fetch-lyrics-message" }), {
        status: 599,
        headers: { "content-type": "application/json" },
      });
    }
    return new Response("", { status: 204 });
  }) as typeof fetch;
}
