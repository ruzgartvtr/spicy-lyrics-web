import { normalizeLyrics } from "../src/lyrics.js";
import { mountLyrics, renderCredit } from "../src/view.js";

const payload = {
  Type: "Syllable",
  source: "spicy_lyrics",
  SongWriters: ["Demo Writer"],
  UploadAttribution: {
    Uploader: { username: "uploader", url: "https://spicylyrics.org" },
    Maker: { username: "maker", url: "https://spicylyrics.org" },
  },
  Content: [
    {
      Type: "Vocal",
      Lead: {
        StartTime: 1,
        EndTime: 4.2,
        Syllables: [
          { Text: "Hel", StartTime: 1, EndTime: 1.35, IsPartOfWord: true },
          { Text: "lo", StartTime: 1.35, EndTime: 1.8, IsPartOfWord: false },
          { Text: "from", StartTime: 1.9, EndTime: 2.4, IsPartOfWord: false },
          { Text: "the", StartTime: 2.45, EndTime: 2.8, IsPartOfWord: false },
          { Text: "web", StartTime: 2.85, EndTime: 3.5, IsPartOfWord: false },
          { Text: "player", StartTime: 3.55, EndTime: 4.2, IsPartOfWord: false },
        ],
      },
      Background: [
        {
          Syllables: [
            { Text: "oh", StartTime: 2.2, EndTime: 3.2, IsPartOfWord: false },
          ],
        },
      ],
    },
    {
      Type: "Vocal",
      OppositeAligned: true,
      Lead: {
        StartTime: 5,
        EndTime: 8,
        Syllables: [
          { Text: "Word", StartTime: 5, EndTime: 5.6, IsPartOfWord: false },
          { Text: "by", StartTime: 5.7, EndTime: 6.2, IsPartOfWord: false },
          { Text: "word", StartTime: 6.3, EndTime: 8, IsPartOfWord: false },
        ],
      },
    },
  ],
};

const model = normalizeLyrics(payload);
const scroll = document.querySelector(".slw-scroll");
const view = mountLyrics(scroll, model, () => {});
renderCredit(document.querySelector(".slw-credit"), model.attribution, model.songWriters);
document.querySelector("#slw-root").style.setProperty("--slw-art", "none");

const frozen = new URLSearchParams(location.search).get("t");
if (frozen != null) {
  view.paint(Number(frozen));
} else {
  const started = performance.now();
  const tick = (now) => {
    view.paint((now - started) % 9000);
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}
