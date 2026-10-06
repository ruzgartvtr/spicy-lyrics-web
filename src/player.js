export function parseClock(text) {
  if (!text) return null;
  const parts = String(text).trim().split(":").map((part) => Number(part));
  if (parts.length < 2 || parts.length > 3 || parts.some((part) => !Number.isFinite(part))) return null;
  if (parts.length === 2) return (parts[0] * 60 + parts[1]) * 1000;
  return (parts[0] * 3600 + parts[1] * 60 + parts[2]) * 1000;
}

function trackIdFrom(href) {
  return href?.match(/\/track\/([A-Za-z0-9]+)/)?.[1] || "";
}

export function readPlayer(doc) {
  const widget = doc.querySelector("[data-testid='now-playing-widget']");
  if (!widget) return null;

  const trackHref = widget.querySelector("a[href*='/track/']")?.getAttribute("href") || "";
  const trackId = trackIdFrom(trackHref);
  if (!trackId) {
    if (widget.querySelector("a[href*='/episode/']")) return { unsupported: "episode" };
    return null;
  }

  const titleEl = widget.querySelector(
    "[data-testid='context-item-link'], [data-testid='context-item-info-title']",
  ) || widget.querySelector("a[href*='/track/']");
  const artistEl = widget.querySelector(
    "[data-testid='context-item-info-artist'] a, [data-testid='context-item-info-artist'], a[href*='/artist/']",
  );
  const img = widget.querySelector("img");
  const bar = doc.querySelector("[data-testid='playback-progressbar']");
  const nowAttr = Number(bar?.getAttribute("aria-valuenow"));
  const maxAttr = Number(bar?.getAttribute("aria-valuemax"));
  const positionFromText = parseClock(doc.querySelector("[data-testid='playback-position']")?.textContent);
  const durationFromText = parseClock(doc.querySelector("[data-testid='playback-duration']")?.textContent);

  let positionMs = positionFromText ?? 0;
  let durationMs = durationFromText ?? 0;
  if (Number.isFinite(maxAttr) && maxAttr > 1000 && Number.isFinite(nowAttr)) {
    durationMs = maxAttr;
    positionMs = nowAttr;
  } else if (
    Number.isFinite(maxAttr) && maxAttr > 0 && maxAttr <= 100
    && Number.isFinite(nowAttr) && durationMs > 0
  ) {
    positionMs = (nowAttr / maxAttr) * durationMs;
  }

  const label = (doc.querySelector("[data-testid='control-button-playpause']")?.getAttribute("aria-label") || "")
    .toLowerCase();
  const playing = label.includes("pause") || label.includes("duraklat");

  return {
    trackId,
    title: titleEl?.textContent?.trim() || "",
    artist: artistEl?.textContent?.trim() || "",
    artUrl: img?.getAttribute("src") || "",
    positionMs,
    durationMs,
    playing,
  };
}

export function seekToRatio(doc, ratio) {
  const bar = doc.querySelector("[data-testid='playback-progressbar']");
  if (!bar || !Number.isFinite(ratio)) return false;
  const rect = bar.getBoundingClientRect();
  if (!rect.width) return false;
  const clamped = Math.min(1, Math.max(0, ratio));
  const clientX = rect.left + clamped * rect.width;
  const clientY = rect.top + rect.height / 2;
  const view = doc.defaultView;
  const pointer = {
    bubbles: true,
    cancelable: true,
    clientX,
    clientY,
    pointerId: 1,
    pointerType: "mouse",
  };
  const Pointer = view.PointerEvent || view.MouseEvent;
  bar.dispatchEvent(new Pointer("pointerdown", pointer));
  bar.dispatchEvent(new Pointer("pointerup", pointer));
  bar.dispatchEvent(new view.MouseEvent("click", { bubbles: true, cancelable: true, clientX, clientY }));
  return true;
}

export function playbackMs(anchor, now) {
  if (!anchor) return 0;
  if (!anchor.playing) return anchor.positionMs;
  return anchor.positionMs + Math.max(0, now - anchor.sampledAt);
}
