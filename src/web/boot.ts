import { installWebSpicetify } from "./install.ts";
import "./overlay.css";

declare global {
  interface Window {
    __SL_WEB_BOOTED__?: boolean;
    __SL_READY__?: boolean;
    __SL_open?: () => void;
    __SL_toggle?: () => void;
  }
}

function waitForReady(timeoutMs = 20000): Promise<boolean> {
  if (window.__SL_READY__) return Promise.resolve(true);
  return new Promise((resolve) => {
    const onReady = () => {
      cleanup();
      resolve(true);
    };
    const timer = window.setTimeout(() => {
      cleanup();
      resolve(false);
    }, timeoutMs);
    const cleanup = () => {
      window.clearTimeout(timer);
      window.removeEventListener("slweb:ready", onReady);
    };
    window.addEventListener("slweb:ready", onReady);
  });
}

function showBootError(message: string) {
  let box = document.getElementById("slw-boot-error");
  if (!box) {
    box = document.createElement("div");
    box.id = "slw-boot-error";
    box.style.cssText =
      "position:fixed;right:24px;bottom:160px;z-index:2147483647;max-width:360px;padding:12px 14px;border-radius:12px;background:#300;color:#fff;font:13px/1.4 Helvetica,sans-serif";
    document.documentElement.append(box);
  }
  box.textContent = message;
}

async function boot() {
  if (window.__SL_WEB_BOOTED__) return;

  try {
    // Install shim first so the button can toggle the overlay immediately.
    installWebSpicetify();
    window.__SL_WEB_BOOTED__ = true;
    document.documentElement.setAttribute(
      "data-slw-debug",
      JSON.stringify({ web: true, booted: true, stage: "booted", t: Date.now() }),
    );

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
    const ready = await waitForReady();
    if (!ready) {
      showBootError("Spicy Lyrics yavaş açılıyor — yeşil butona tekrar bas.");
    }
  } catch (error) {
    console.error("Spicy Lyrics Web failed to boot", error);
    showBootError(
      `Spicy Lyrics açılamadı: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

void boot();
