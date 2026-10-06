const PROVIDERS = {
  spicy_lyrics: "Spicy Lyrics",
  apple_music: "Apple Music",
  spotify: "Spotify",
};

function secondsToMs(value) {
  return typeof value === "number" && Number.isFinite(value) ? value * 1000 : 0;
}

function syllableFrom(raw) {
  const text = raw?.Text == null ? "" : String(raw.Text);
  if (!text.trim() && !text) return null;
  return {
    text,
    startMs: secondsToMs(raw.StartTime),
    endMs: secondsToMs(raw.EndTime),
    partOfWord: Boolean(raw.IsPartOfWord),
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
    url: typeof raw.url === "string" ? raw.url : "",
  };
}

export function providerLabel(source) {
  return PROVIDERS[source] || "Lyrics provider";
}

export function unwrapPayload(json) {
  if (!json || typeof json !== "object") return null;
  if (json.Body && typeof json.Body === "object" && (json.Body.Type || json.Body.Content || json.Body.Lines)) {
    return json.Body;
  }
  if (json.Type || json.Content || json.Lines) return json;
  return null;
}

function attributionFrom(body) {
  const source = typeof body.source === "string" ? body.source : "";
  const upload = body.UploadAttribution || {};
  return {
    source,
    provider: providerLabel(source),
    uploader: source === "spicy_lyrics" ? person(upload.Uploader) : null,
    maker: source === "spicy_lyrics" ? person(upload.Maker) : null,
  };
}

function pushLine(lines, line) {
  if (!line.syllables.length) return;
  lines.push(line);
}

export function normalizeLyrics(body) {
  if (!body || typeof body !== "object") return null;
  const type = body.Type === "Syllable" || body.Type === "Line" || body.Type === "Static"
    ? body.Type
    : "Static";
  const content = Array.isArray(body.Content) ? body.Content : [];
  const lines = [];

  if (type === "Syllable") {
    for (const item of content) {
      if (item?.Type && item.Type !== "Vocal") continue;
      const lead = item.Lead || item;
      const syllables = mapSyllables(lead.Syllables);
      if (!syllables.length) continue;
      pushLine(lines, {
        startMs: secondsToMs(lead.StartTime ?? syllables[0].startMs / 1000),
        endMs: secondsToMs(lead.EndTime ?? syllables[syllables.length - 1].endMs / 1000),
        opposite: Boolean(item.OppositeAligned || lead.OppositeAligned),
        syllables,
        background: (Array.isArray(item.Background) ? item.Background : [])
          .map((bg) => ({
            syllables: mapSyllables(bg.Syllables),
          }))
          .filter((bg) => bg.syllables.length),
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
          partOfWord: false,
        }],
        background: [],
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
        background: [],
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
        { text: "•", startMs: 0, endMs: lines[0].startMs / 3, partOfWord: false },
        { text: "•", startMs: lines[0].startMs / 3, endMs: (lines[0].startMs / 3) * 2, partOfWord: false },
        { text: "•", startMs: (lines[0].startMs / 3) * 2, endMs: lines[0].startMs, partOfWord: false },
      ],
      background: [],
    });
  }

  return {
    type: lines.some((line) => line.static) ? "Static" : type,
    lines,
    songWriters: Array.isArray(body.SongWriters) ? body.SongWriters.map(String) : [],
    attribution: attributionFrom(body),
  };
}

export function activeLineIndex(lines, timeMs) {
  let index = -1;
  for (let i = 0; i < lines.length; i += 1) {
    if (lines[i].static) return -1;
    if (timeMs + 0.5 >= lines[i].startMs) index = i;
    else break;
  }
  return index;
}

export function syllableFill(syllable, timeMs) {
  const span = syllable.endMs - syllable.startMs;
  if (span <= 0) return timeMs >= syllable.startMs ? 1 : 0;
  return Math.min(1, Math.max(0, (timeMs - syllable.startMs) / span));
}

export const TRACK_ID = /^[A-Za-z0-9]{10,40}$/;
