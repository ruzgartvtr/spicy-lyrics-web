import App from "../app.ts";
import Logger from "../Logger.ts";
import { SessionManager } from "./SessionManager.ts";

export const sessionManager = new SessionManager();

export async function initSession(): Promise<void> {
  // Desktop /query returns 418 in browsers; web uses the public lyrics API instead.
  if ((globalThis as any).__SL_WEB__) {
    return;
  }
  if (App.isDev()) {
    new Logger("SessionManager").info("Dev build — skipping session creation");
    return;
  }
  await sessionManager.ensureSession();
}

export type { SessionState } from "./types.ts";
