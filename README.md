# Spicy Lyrics Web

Word-synced lyrics on [Spotify Web](https://open.spotify.com), using the public [Spicy Lyrics API](https://developers.spicylyrics.org/docs).

This is a browser extension. It is not the official [Spicy Lyrics](https://github.com/Spikerko/spicy-lyrics) Spicetify extension, and it does not modify the desktop client. The desktop extension's internal API (`POST /query` on `api.spicylyrics.org`) answers browsers with HTTP 418 and tells clients to use the developer API instead. This project does that.

## Ne işe yarar

Spotify Web'de çalan parçanın sözlerini, kelime kelime boyayarak, çalma çubuğunun üstünde açar. Sözler Spicy Lyrics'in herkese açık API'sinden gelir: önce topluluk senkronu, yoksa Apple Music veya Spotify.

## Kurulum

1. [developers.spicylyrics.org](https://developers.spicylyrics.org/docs) üzerinden bir uygulama oluştur.
2. Client access'i aç ve en az şu origin'i allowlist'e ekle:

   `chrome-extension://jfhplaabgooiknhchiegghccnboahmfp`

3. Sana verilen publishable key'i (`sl_pk_...`) kopyala. Secret key (`sl_sk_...`) bu uzantıya yazılmaz.
4. Chrome'da `chrome://extensions` aç, Geliştirici modunu aç, **Paketlenmemiş öğe yükle** de ve bu klasörü seç.
5. Uzantı seçeneklerine `sl_pk_` anahtarını yapıştır.
6. [open.spotify.com](https://open.spotify.com) üzerinde bir şarkı çal. Çalan parça kutusundaki **Lyrics** düğmesi, veya Alt+Shift+L, paneli açar.

Satırın başı tıklanınca parça o süreye sarılır. **−100ms / +100ms** bütün şarkılarda zaman kaymasını düzeltir.

Sözler ekrandayken kaynak satırı da ekrandadır. Topluluk senkronunda yükleyen ve yapan kişi de linklenir. Bu, API şartının parçası.

## Demo

Söz çizimini Spotify hesabı olmadan görmek için:

```bash
npm install
npm test
python3 -m http.server 8765
```

Sonra `http://127.0.0.1:8765/demo/index.html` adresini aç. `?t=2500` zamanı milisaniye olarak dondurur.

## Layout

- `src/content.js` Spotify Web sayfasına paneli ekler ve çalan parçayı okur.
- `src/background.js` `GET /v1/lyrics/:trackId` çağrısını yapar. Anahtar `chrome.storage.local` içindedir.
- `src/view.js` hece hece boyamayı çizer.
- `src/player.js` now-playing çubuğundan parça kimliğini, süreyi ve çalma durumunu okur.

Spotify hesabının token'ı istenmez ve saklanmaz.
