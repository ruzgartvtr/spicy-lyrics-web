import { installWebSpicetify } from "./install.ts";
import "./overlay.css";

declare global {
  interface Window {
    __SL_WEB_BOOTED__?: boolean;
    __SL_open?: () => void;
  }
}

async function boot() {
  if (window.__SL_WEB_BOOTED__) {
    window.__SL_open?.();
    return;
  }

  try {
    installWebSpicetify();

    const chromeApi = (globalThis as any).chrome;
    if (chromeApi?.storage?.local) {
      const stored = await chromeApi.storage.local.get("publishableKey");
      (globalThis as any).__SL_WEB_KEY__ = String(stored.publishableKey || "");
      chromeApi.storage.onChanged.addListener(
        (changes: Record<string, { newValue?: string }>, area: string) => {
          if (area === "local" && changes.publishableKey) {
            (globalThis as any).__SL_WEB_KEY__ = String(changes.publishableKey.newValue || "");
          }
        },
      );
    }

    await import("../app.tsx");
    window.__SL_WEB_BOOTED__ = true;
    window.__SL_open?.();
  } catch (error) {
    console.error("Spicy Lyrics Web failed to boot", error);
    const box = document.createElement("div");
    box.id = "slw-boot-error";
    box.style.cssText =
      "position:fixed;right:24px;bottom:160px;z-index:2147483647;max-width:360px;padding:12px 14px;border-radius:12px;background:#300;color:#fff;font:13px/1.4 Helvetica,sans-serif";
    box.textContent = `Spicy Lyrics açılamadı: ${error instanceof Error ? error.message : String(error)}`;
    document.documentElement.append(box);
  }
}

void boot();
