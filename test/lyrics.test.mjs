import assert from "node:assert/strict";
import test from "node:test";
import { Window } from "happy-dom";
import { fetchLyrics } from "../src/background.js";
import { activeLineIndex, normalizeLyrics, syllableFill } from "../src/lyrics.js";
import { parseClock, playbackMs, readPlayer, seekToRatio } from "../src/player.js";
import { mountLyrics } from "../src/view.js";

const syllableBody = {
  Type: "Syllable",
  source: "spicy_lyrics",
  SongWriters: ["A Writer"],
  UploadAttribution: {
    Uploader: { username: "uploader", url: "https://spicylyrics.org/uid/1" },
    Maker: { username: "maker", url: "https://spicylyrics.org/uid/2" },
  },
  Content: [
    {
      Type: "Vocal",
      Lead: {
        StartTime: 1,
        EndTime: 2,
        Syllables: [
          { Text: "Hel", StartTime: 1, EndTime: 1.4, IsPartOfWord: true },
          { Text: "lo", StartTime: 1.4, EndTime: 2, IsPartOfWord: false },
        ],
      },
    },
    {
      Type: "Vocal",
      OppositeAligned: true,
      Lead: {
        StartTime: 3,
        EndTime: 4,
        Syllables: [{ Text: "there", StartTime: 3, EndTime: 4 }],
      },
    },
  ],
};

test("normalize keeps word pieces, duet alignment, and community credit", () => {
  const model = normalizeLyrics(syllableBody);
  assert.equal(model.type, "Syllable");
  assert.equal(model.lines[0].syllables[0].partOfWord, true);
  assert.equal(model.lines[1].opposite, true);
  const late = normalizeLyrics({
    ...syllableBody,
    Content: [{
      ...syllableBody.Content[0],
      Lead: { ...syllableBody.Content[0].Lead, StartTime: 4, EndTime: 5 },
    }],
  });
  assert.equal(late.lines[0].intro, true);
  assert.equal(model.attribution.uploader.username, "uploader");
  assert.equal(model.attribution.maker.username, "maker");

  const apple = normalizeLyrics({ ...syllableBody, source: "apple_music", UploadAttribution: syllableBody.UploadAttribution });
  assert.equal(apple.attribution.provider, "Apple Music");
  assert.equal(apple.attribution.uploader, null);
  assert.equal(apple.attribution.maker, null);
});

test("karaoke fill follows syllable time", () => {
  assert.equal(syllableFill({ startMs: 1000, endMs: 1400 }, 1200), 0.5);
  assert.equal(syllableFill({ startMs: 1000, endMs: 1400 }, 900), 0);
  assert.equal(activeLineIndex([{ startMs: 0, endMs: 1000 }, { startMs: 1000, endMs: 2000 }], 1500), 1);
});

test("player reads the now-playing widget and seeks on the progress bar", () => {
  const window = new Window();
  const { document } = window;
  document.body.innerHTML = `
    <div data-testid="now-playing-widget">
      <a href="/track/11dFghVXANMlKmJXsNCbNl"><img src="https://i.scdn.co/image/art" alt=""></a>
      <a data-testid="context-item-link" href="/track/11dFghVXANMlKmJXsNCbNl">Song</a>
      <span data-testid="context-item-info-artist"><a href="/artist/1">Artist</a></span>
    </div>
    <div data-testid="playback-position">0:01</div>
    <div data-testid="playback-duration">3:00</div>
    <div data-testid="playback-progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="25"></div>
    <button data-testid="control-button-playpause" aria-label="Pause"></button>
  `;
  const player = readPlayer(document);
  assert.equal(player.trackId, "11dFghVXANMlKmJXsNCbNl");
  assert.equal(player.title, "Song");
  assert.equal(player.artist, "Artist");
  assert.equal(player.durationMs, 180000);
  assert.equal(player.positionMs, 45000);
  assert.equal(player.playing, true);
  assert.equal(parseClock("1:02:03"), 3723000);
  assert.equal(playbackMs({ positionMs: 1000, playing: true, sampledAt: 500 }, 800), 1300);

  const bar = document.querySelector("[data-testid='playback-progressbar']");
  bar.getBoundingClientRect = () => ({ left: 0, top: 0, width: 200, height: 8, right: 200, bottom: 8 });
  let clicked = 0;
  bar.addEventListener("click", (event) => {
    clicked = event.clientX;
  });
  assert.equal(seekToRatio(document, 0.25), true);
  assert.equal(clicked, 50);
});

test("rendered syllables expose the sung fraction", () => {
  const window = new Window();
  const scroll = window.document.createElement("div");
  window.document.body.append(scroll);
  const model = normalizeLyrics({
    Type: "Line",
    source: "spotify",
    Content: [
      { Type: "Vocal", Text: "one", StartTime: 0, EndTime: 2 },
      { Type: "Vocal", Text: "two", StartTime: 2, EndTime: 4 },
    ],
  });
  const view = mountLyrics(scroll, model, () => {});
  view.paint(1000);
  const fills = [...scroll.querySelectorAll(".slw-syl")].map((node) => node.dataset.fill);
  assert.deepEqual(fills, ["0.500", "0.000"]);
  assert.equal(scroll.querySelector(".slw-line.is-active .slw-base").textContent, "one");
});

test("lyrics fetch uses the public endpoint and refuses secret keys", async () => {
  let called = false;
  const secret = await fetchLyrics("11dFghVXANMlKmJXsNCbNl", {
    getKey: async () => "sl_sk_secret",
    fetchImpl: async () => {
      called = true;
    },
    getCache: async () => null,
    setCache: async () => {},
  });
  assert.equal(secret.error, "secret-key");
  assert.equal(called, false);

  const result = await fetchLyrics("11dFghVXANMlKmJXsNCbNl", {
    getKey: async () => "sl_pk_public",
    getCache: async () => null,
    setCache: async () => {},
    fetchImpl: async (url, init) => {
      assert.equal(url, "https://api.spicylyrics.org/v1/lyrics/11dFghVXANMlKmJXsNCbNl");
      assert.equal(init.headers.Authorization, "Bearer sl_pk_public");
      return {
        ok: true,
        status: 200,
        json: async () => ({ Body: syllableBody, Status: 200, Type: "object" }),
      };
    },
  });
  assert.equal(result.ok, true);
  assert.equal(result.body.Type, "Syllable");
});
