/** Now-playing chrome only — never search results / playlist rows. */

export type TrackSnap =
  | {
      type: "track";
      trackId: string;
      title: string;
      artist: string;
      artUrl: string;
      positionMs: number;
      durationMs: number;
      playing: boolean;
      repeat: number;
      shuffle: boolean;
      smartShuffle: boolean;
    }
  | { type: "episode" };

function parseClock(text: string | null | undefined): number | null {
  if (!text) return null;
  const parts = text.trim().split(":").map((part) => Number(part));
  if (parts.length < 2 || parts.length > 3 || parts.some((part) => !Number.isFinite(part))) {
    return null;
  }
  if (parts.length === 2) return (parts[0] * 60 + parts[1]) * 1000;
  return (parts[0] * 3600 + parts[1] * 60 + parts[2]) * 1000;
}

export function playerChrome(doc: Document): Element | null {
  return (
    doc.querySelector("[data-testid='now-playing-widget']") ||
    doc.querySelector("[data-testid='now-playing-bar']") ||
    doc.querySelector(".Root__now-playing-bar") ||
    doc.querySelector("footer[data-testid='now-playing-bar']") ||
    doc
      .querySelector("[data-testid='player-controls']")
      ?.closest("footer, [data-testid='now-playing-bar'], .Root__now-playing-bar") ||
    null
  );
}

function readRepeat(doc: Document): number {
  const btn = doc.querySelector<HTMLElement>("[data-testid='control-button-repeat']");
  if (!btn) return 0;
  const pressed = btn.getAttribute("aria-checked") ?? btn.getAttribute("aria-pressed");
  const label = (btn.getAttribute("aria-label") || "").toLowerCase();
  if (
    pressed === "mixed" ||
    label.includes("one") ||
    label.includes("tek") ||
    /\btrack\b/.test(label) ||
    label.includes("şarkı")
  ) {
    return 2;
  }
  if (pressed === "true" || /disable|kapat/.test(label)) return 1;
  return 0;
}

function readShuffle(doc: Document): { shuffle: boolean; smartShuffle: boolean } {
  const btn = doc.querySelector<HTMLElement>("[data-testid='control-button-shuffle']");
  if (!btn) return { shuffle: false, smartShuffle: false };
  const pressed = btn.getAttribute("aria-checked") ?? btn.getAttribute("aria-pressed");
  const label = (btn.getAttribute("aria-label") || "").toLowerCase();
  const active = pressed === "true" || /disable|kapat/.test(label);
  const smart = active && (label.includes("smart") || label.includes("akıllı"));
  return { shuffle: active && !smart, smartShuffle: smart };
}

function trackIdFromHref(href: string | null | undefined): string {
  return href?.match(/\/track\/([A-Za-z0-9]{22})/)?.[1] || "";
}

function trackIdFromLocation(doc: Document): string {
  try {
    return trackIdFromHref(doc.defaultView?.location?.pathname || doc.URL || "");
  } catch {
    return "";
  }
}

export function readTrack(doc: Document): TrackSnap | null {
  const chrome = playerChrome(doc);

  const trackLink =
    chrome?.querySelector<HTMLAnchorElement>("a[data-testid='context-item-link'][href*='/track/']") ||
    chrome?.querySelector<HTMLAnchorElement>("a[href*='/track/']") ||
    null;
  let trackId = trackIdFromHref(trackLink?.getAttribute("href"));
  // Guest preview / sparse player chrome often omits the track anchor — use URL.
  if (!trackId) trackId = trackIdFromLocation(doc);
  if (!trackId) {
    if (chrome?.querySelector("a[href*='/episode/']")) return { type: "episode" };
    return null;
  }

  const title =
    (
      chrome?.querySelector(
        "[data-testid='context-item-link'], [data-testid='context-item-info-title']",
      ) ||
      trackLink ||
      doc.querySelector("h1")
    )?.textContent?.trim() || "";
  const artist =
    chrome
      ?.querySelector(
        "[data-testid='context-item-info-artist'] a, [data-testid='context-item-info-artist'], a[href*='/artist/']",
      )
      ?.textContent?.trim() ||
    doc.querySelector("a[data-testid='creator-link'], [data-testid='creator-link']")?.textContent?.trim() ||
    "";
  const artUrl =
    chrome?.querySelector("img")?.getAttribute("src") ||
    doc.querySelector("[data-testid='track-page'] img, img[data-testid='cover-art']")?.getAttribute("src") ||
    "";

  const bar = doc.querySelector("[data-testid='playback-progressbar']");
  const nowAttr = Number(bar?.getAttribute("aria-valuenow"));
  const maxAttr = Number(bar?.getAttribute("aria-valuemax"));
  const positionFromText = parseClock(
    doc.querySelector("[data-testid='playback-position']")?.textContent,
  );
  const durationFromText = parseClock(
    doc.querySelector("[data-testid='playback-duration']")?.textContent,
  );
  let positionMs = positionFromText ?? 0;
  let durationMs = durationFromText ?? 0;
  if (Number.isFinite(maxAttr) && maxAttr > 1000 && Number.isFinite(nowAttr)) {
    durationMs = maxAttr;
    positionMs = nowAttr;
  } else if (
    Number.isFinite(maxAttr) &&
    maxAttr > 0 &&
    maxAttr <= 100 &&
    Number.isFinite(nowAttr) &&
    durationMs > 0
  ) {
    positionMs = (nowAttr / maxAttr) * durationMs;
  }

  const label = (
    doc.querySelector("[data-testid='control-button-playpause']")?.getAttribute("aria-label") || ""
  ).toLowerCase();
  const playing = label.includes("pause") || label.includes("duraklat");
  const repeat = readRepeat(doc);
  const { shuffle, smartShuffle } = readShuffle(doc);

  return {
    type: "track",
    trackId,
    title,
    artist,
    artUrl,
    positionMs,
    durationMs,
    playing,
    repeat,
    shuffle,
    smartShuffle,
  };
}

export function clickControl(doc: Document, selector: string) {
  doc.querySelector<HTMLElement>(selector)?.click();
}

export function seekToRatio(doc: Document, ratio: number) {
  const bar = doc.querySelector<HTMLElement>("[data-testid='playback-progressbar']");
  if (!bar) return;
  const rect = bar.getBoundingClientRect();
  if (!rect.width) return;
  const clientX = rect.left + Math.min(1, Math.max(0, ratio)) * rect.width;
  const clientY = rect.top + rect.height / 2;
  const view = doc.defaultView;
  const Pointer = view?.PointerEvent || view?.MouseEvent;
  const pointer = {
    bubbles: true,
    cancelable: true,
    clientX,
    clientY,
    pointerId: 1,
    pointerType: "mouse",
  };
  if (Pointer) {
    bar.dispatchEvent(new Pointer("pointerdown", pointer));
    bar.dispatchEvent(new Pointer("pointerup", pointer));
  }
  bar.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, clientX, clientY }));
}
