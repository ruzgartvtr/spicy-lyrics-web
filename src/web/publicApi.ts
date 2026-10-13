import { setStatusText } from "./overlayHost.ts";

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

async function fetchViaBackground(trackId: string): Promise<PublicLyricsResult> {
  const chromeApi = (globalThis as any).chrome;
  if (!chromeApi?.runtime?.id || !chromeApi?.runtime?.sendMessage) {
    return { kind: "error", code: "service-unavailable", status: 0 };
  }

  const response = await new Promise<{
    ok?: boolean;
    status?: number;
    body?: string;
    error?: string;
  } | undefined>((resolve) => {
    let settled = false;
    const finish = (value?: any) => {
      if (settled) return;
      settled = true;
      resolve(value);
    };
    try {
      chromeApi.runtime.sendMessage({ type: "fetch-lyrics", trackId }, (result: any) => {
        void chromeApi.runtime.lastError;
        finish(result);
      });
    } catch {
      finish(undefined);
    }
    setTimeout(() => finish(undefined), 15000);
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

  setStatusText(`Sözler: ${trackId}`);

  const pending = fetchViaBackground(trackId)
    .then((result) => {
      if (result.kind === "ok") setStatusText("");
      else setStatusText(`Sözler hatası: ${result.code}`);
      return result;
    })
    .finally(() => {
      inflight.delete(trackId);
    });

  inflight.set(trackId, pending);
  return pending;
}
