import assert from "node:assert/strict";
import test from "node:test";
import { adaptPublicLyrics } from "../src/web/publicApi.ts";

test("public lyrics are mapped onto the desktop source shape", () => {
  const lyrics = adaptPublicLyrics({
    Type: "Syllable",
    source: "spicy_lyrics",
    Content: [],
    UploadAttribution: {
      Uploader: { username: "uploader", url: "https://spicylyrics.org/uid/1" },
      Maker: { username: "maker", url: "https://spicylyrics.org/uid/2" },
    },
  });
  assert.equal(lyrics.source, "spl");
  assert.equal(lyrics.TTMLUploadMetadata.Uploader.username, "uploader");
  assert.equal(lyrics.TTMLUploadMetadata.Maker.username, "maker");
  assert.equal(adaptPublicLyrics({ source: "apple_music" }).source, "aml");
  assert.equal(adaptPublicLyrics({ source: "spotify" }).source, "spt");
});
