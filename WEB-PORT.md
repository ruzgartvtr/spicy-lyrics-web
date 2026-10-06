# Spotify Web port

This is the Spicy Lyrics source, changed so the same extension can run on [Spotify Web](https://open.spotify.com).

The desktop build still talks to Spicetify. The web build (`src/web/boot.ts`) installs the player, history, and storage objects that the existing code already calls, then loads `src/app.tsx`. Lyrics rendering, syllable animation, and the page layout are the original ones.

Spotify Web is not allowed to call the desktop `/query` endpoint (it answers `418` and points at the developer API). On the web build, `fetchLyrics` uses `GET /v1/lyrics/:id` and maps that response back into the shape the original renderer expects (`spl`, `aml`, `spt`, and `TTMLUploadMetadata`).

## Load it

1. Create an application at [developers.spicylyrics.org](https://developers.spicylyrics.org/docs).
2. Turn on client access and allowlist `chrome-extension://jfhplaabgooiknhchiegghccnboahmfp`.
3. Chrome → `chrome://extensions` → Developer mode → Load unpacked → select the `web-extension` folder.
4. Open the extension options and paste the publishable key (`sl_pk_...`). Do not paste a secret key.
5. Play a song on open.spotify.com and press the Spicy Lyrics button on the player bar.

Rebuild the content script after source changes:

```bash
npm install
npm install --no-save esbuild sass
node web-extension/build.mjs
node --experimental-strip-types --test web-extension/adapt.test.mjs
```
