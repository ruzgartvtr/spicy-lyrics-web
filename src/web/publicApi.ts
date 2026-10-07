export type PublicLyricsResult =
  | { kind: "ok"; lyrics: any }
  | { kind: "error"; code: string; status: number };

const SOURCE_TO_DESKTOP: Record<string, string> = {
  spicy_lyrics: "spl",
  apple_music: "aml",
  spotify: "spt",
};

const inflight = new Map<string, Promise<PublicLyricsResult>>();

export function adaptPublicLyrics(body: any): any {
  const lyrics = { ...body };
  if (typeof lyrics.source === "string" && SOURCE_TO_DESKTOP[lyrics.source]) {
    lyrics.source = SOURCE_TO_DESKTOP[lyrics.source];
  }
  const upload = body?.UploadAttribution;
  if (upload && !lyrics.TTMLUploadMetadata) {
    lyrics.TTMLUploadMetadata = {
      Maker: upload.Maker,
      Uploader: upload.Uploader,
    };
  }
  return lyrics;
}

function reportFetch(extra: Record<string, unknown>) {
  try {
    const prev = document.documentElement.getAttribute("data-slw-debug");
    const base = prev ? JSON.parse(prev) : {};
    document.documentElement.setAttribute(
      "data-slw-debug",
      JSON.stringify({ ...base, ...extra, t: Date.now() }),
    );
    const status = document.getElementById("slw-status");
    if (status) {
      status.textContent = String(extra.statusText || "");
      status.hidden = !extra.statusText;
    }
  } catch {
    // ignore
  }
}

async function fetchViaBackground(trackId: string): Promise<PublicLyricsResult> {
  const chromeApi = (globalThis as any).chrome;
  if (!chromeApi?.runtime?.sendMessage) {
    return { kind: "error", code: "service-unavailable", status: 0 };
  }
  const response = await new Promise<{
    ok?: boolean;
    status?: number;
    body?: string;
    error?: string;
    cached?: boolean;
  } | undefined>((resolve) => {
    try {
      chromeApi.runtime.sendMessage({ type: "fetch-lyrics", trackId }, (result: any) => {
        void chromeApi.runtime.lastError;
        resolve(result);
      });
    } catch {
      resolve(undefined);
    }
  });

  if (!response) return { kind: "error", code: "service-unavailable", status: 0 };
  if (response.error === "web-key") return { kind: "error", code: "web-key", status: 401 };
  if (response.status === 404) return { kind: "error", code: "lyrics-not-found", status: 404 };
  if (response.status === 401 || response.status === 403) {
    return { kind: "error", code: "web-key", status: response.status || 401 };
  }
  if (response.status === 429) return { kind: "error", code: "rate-limited", status: 429 };
  if (!response.ok) return { kind: "error", code: "status-not-200", status: response.status || 0 };

  let json: any;
  try {
    json = JSON.parse(response.body || "");
  } catch {
    return { kind: "error", code: "unknown-error", status: 0 };
  }
  const body = json?.Body?.Type || json?.Body?.Content || json?.Body?.Lines ? json.Body : json;
  if (!body || typeof body !== "object") {
    return { kind: "error", code: "lyrics-not-found", status: 404 };
  }
  return { kind: "ok", lyrics: adaptPublicLyrics(body) };
}

export async function fetchPublicLyricsBody(trackId: string): Promise<PublicLyricsResult> {
  const existing = inflight.get(trackId);
  if (existing) return existing;

  reportFetch({ stage: "lyrics-fetch", trackId, statusText: `Sözler: ${trackId}` });

  const pending = fetchViaBackground(trackId)
    .then((result) => {
      reportFetch({
        stage: "lyrics-fetch-done",
        trackId,
        result: result.kind,
        code: result.kind === "error" ? result.code : "ok",
        statusText:
          result.kind === "ok"
            ? ""
            : `Sözler hatası: ${result.code}`,
      });
      return result;
    })
    .finally(() => {
      inflight.delete(trackId);
    });

  inflight.set(trackId, pending);
  return pending;
}
