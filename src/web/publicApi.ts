export type PublicLyricsResult =
  | { kind: "ok"; lyrics: any }
  | { kind: "error"; code: string; status: number };

const SOURCE_TO_DESKTOP: Record<string, string> = {
  spicy_lyrics: "spl",
  apple_music: "aml",
  spotify: "spt",
};

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

export async function fetchPublicLyricsBody(trackId: string): Promise<PublicLyricsResult> {
  const key = String((globalThis as any).__SL_WEB_KEY__ || "").trim();
  if (!key) return { kind: "error", code: "web-key", status: 401 };
  if (key.startsWith("sl_sk_")) return { kind: "error", code: "web-key", status: 401 };

  let response: Response;
  try {
    response = await fetch(`https://api.spicylyrics.org/v1/lyrics/${encodeURIComponent(trackId)}`, {
      headers: {
        Authorization: `Bearer ${key}`,
        Accept: "application/json",
      },
    });
  } catch {
    return { kind: "error", code: "service-unavailable", status: 0 };
  }

  if (response.status === 404) return { kind: "error", code: "lyrics-not-found", status: 404 };
  if (response.status === 401 || response.status === 403) return { kind: "error", code: "web-key", status: response.status };
  if (response.status === 429) return { kind: "error", code: "rate-limited", status: 429 };
  if (!response.ok) return { kind: "error", code: "status-not-200", status: response.status };

  let json: any;
  try {
    json = await response.json();
  } catch {
    return { kind: "error", code: "unknown-error", status: 0 };
  }

  const body = json?.Body?.Type || json?.Body?.Content || json?.Body?.Lines ? json.Body : json;
  if (!body || typeof body !== "object") return { kind: "error", code: "lyrics-not-found", status: 404 };
  return { kind: "ok", lyrics: adaptPublicLyrics(body) };
}
