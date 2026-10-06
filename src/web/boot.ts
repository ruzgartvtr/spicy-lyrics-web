import { installWebSpicetify } from "./install.ts";
import "./overlay.css";

installWebSpicetify();

const chromeApi = (globalThis as any).chrome;
if (chromeApi?.storage?.local) {
  const stored = await chromeApi.storage.local.get("publishableKey");
  (globalThis as any).__SL_WEB_KEY__ = String(stored.publishableKey || "");
  chromeApi.storage.onChanged.addListener((changes: Record<string, { newValue?: string }>, area: string) => {
    if (area === "local" && changes.publishableKey) {
      (globalThis as any).__SL_WEB_KEY__ = String(changes.publishableKey.newValue || "");
    }
  });
}

await import("../app.tsx");
