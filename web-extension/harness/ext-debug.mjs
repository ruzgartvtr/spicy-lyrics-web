/**
 * Load the unpacked extension in Chrome, open Spotify, click Sözler,
 * then Runtime.evaluate diagnostics. Uses CDP — not dump-dom.
 */
import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const extDir = path.resolve(__dirname, "..");
const chrome =
  process.env.CHROME ||
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const profile = "/tmp/slw-ext-debug-profile";
const port = 9333;

fs.rmSync(profile, { recursive: true, force: true });
fs.mkdirSync(profile, { recursive: true });

const child = spawn(
  chrome,
  [
    `--user-data-dir=${profile}`,
    `--disable-extensions-except=${extDir}`,
    `--load-extension=${extDir}`,
    `--remote-debugging-port=${port}`,
    "--no-first-run",
    "--no-default-browser-check",
    "--disable-gpu",
    "--window-size=1400,900",
    "https://open.spotify.com/",
  ],
  { stdio: "ignore" },
);

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function waitTabs(timeoutMs = 20000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const tabs = await (await fetch(`http://127.0.0.1:${port}/json`)).json();
      const page = tabs.find(
        (t) => t.type === "page" && t.url.startsWith("https://open.spotify.com"),
      );
      if (page?.webSocketDebuggerUrl) return page;
    } catch {
      // chrome still booting
    }
    await sleep(400);
  }
  throw new Error("Spotify tab not found");
}

async function cdp(wsUrl) {
  const ws = new WebSocket(wsUrl);
  await new Promise((resolve, reject) => {
    ws.addEventListener("open", resolve, { once: true });
    ws.addEventListener("error", reject, { once: true });
  });
  let id = 0;
  const pending = new Map();
  ws.addEventListener("message", (event) => {
    const msg = JSON.parse(String(event.data));
    if (msg.id && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id);
      pending.delete(msg.id);
      if (msg.error) reject(new Error(JSON.stringify(msg.error)));
      else resolve(msg.result);
    }
  });
  const send = (method, params = {}) =>
    new Promise((resolve, reject) => {
      const mid = ++id;
      pending.set(mid, { resolve, reject });
      ws.send(JSON.stringify({ id: mid, method, params }));
    });
  return { ws, send };
}

async function evaluate(send, expression) {
  const result = await send("Runtime.evaluate", {
    expression,
    awaitPromise: true,
    returnByValue: true,
  });
  if (result.exceptionDetails) {
    throw new Error(JSON.stringify(result.exceptionDetails));
  }
  return result.result?.value;
}

try {
  console.log("waiting for Spotify tab…");
  let page = await waitTabs(30000);
  console.log("tab", page.url);
  let { ws, send } = await cdp(page.webSocketDebuggerUrl);
  await send("Runtime.enable");
  await send("Page.enable");

  // Wait for Spotify SPA + our content script
  for (let i = 0; i < 40; i++) {
    const state = await evaluate(
      send,
      `({
        href: location.href,
        booted: !!window.__SL_WEB_BOOTED__,
        ready: !!window.__SL_READY__,
        hasToggle: typeof window.__SL_toggle,
        button: !!document.getElementById("slw-open-button") || !!document.getElementById("slw-toggle"),
        root: !!document.getElementById("SpicyLyricsWebRoot"),
        err: document.getElementById("slw-boot-error")?.textContent || null
      })`,
    );
    console.log("poll", i, state);
    if (state.booted || state.button || state.err) break;
    await sleep(1000);
  }

  // Click button in the page (isolated world may differ — try both)
  const clickResult = await evaluate(
    send,
    `(async () => {
      const btn = document.getElementById("slw-open-button") || document.getElementById("slw-toggle");
      const before = {
        button: !!btn,
        booted: !!window.__SL_WEB_BOOTED__,
        ready: !!window.__SL_READY__,
        hasToggle: typeof window.__SL_toggle,
        root: !!document.getElementById("SpicyLyricsWebRoot"),
        err: document.getElementById("slw-boot-error")?.textContent || null,
      };
      if (btn) btn.click();
      else if (typeof window.__SL_toggle === "function") window.__SL_toggle();
      await new Promise(r => setTimeout(r, 2000));
      if (typeof window.__SL_open === "function") window.__SL_open();
      await new Promise(r => setTimeout(r, 2500));
      const root = document.getElementById("SpicyLyricsWebRoot");
      const pageEl = document.getElementById("SpicyLyricsPage");
      return {
        before,
        after: {
          rootOpen: !!root?.classList.contains("is-open"),
          pageMounted: !!pageEl,
          pageParent: pageEl?.parentElement?.id || pageEl?.parentElement?.className || null,
          contentBox: !!document.querySelector("#SpicyLyricsPage .ContentBox"),
          pathname: window.Spicetify?.Platform?.History?.location?.pathname || null,
          pageHTML: pageEl ? pageEl.innerHTML.slice(0, 300) : null,
          err: document.getElementById("slw-boot-error")?.textContent || null,
        }
      };
    })()`,
  );

  fs.writeFileSync("/tmp/slw-ext-debug-report.json", JSON.stringify(clickResult, null, 2));
  console.log(JSON.stringify(clickResult, null, 2));

  // Content scripts live in an isolated world — page window may not see __SL_*.
  // Enumerate world via Page.createIsolatedWorld is limited; instead inject
  // extension script evaluation through chrome.debugger Target.
  ws.close();

  // Re-query and try Main world vs isolated by dispatching DOM event the content script listens for
  page = await waitTabs(5000);
  ({ ws, send } = await cdp(page.webSocketDebuggerUrl));
  await send("Runtime.enable");
  const eventResult = await evaluate(
    send,
    `(async () => {
      window.dispatchEvent(new CustomEvent("slw-open"));
      window.dispatchEvent(new CustomEvent("slw-toggle"));
      const btn = document.getElementById("slw-open-button") || document.getElementById("slw-toggle");
      if (btn) {
        btn.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, view: window }));
      }
      await new Promise(r => setTimeout(r, 3000));
      const root = document.getElementById("SpicyLyricsWebRoot");
      const pageEl = document.getElementById("SpicyLyricsPage");
      return {
        buttonText: btn?.textContent || null,
        rootExists: !!root,
        rootOpen: !!root?.classList.contains("is-open"),
        rootDisplay: root ? getComputedStyle(root).display : null,
        pageMounted: !!pageEl,
        // Content script globals are invisible here; DOM is shared.
        spicyOnDom: !!document.querySelector("#SpicyLyricsPage, #SpicyLyricsWebRoot"),
      };
    })()`,
  );
  fs.writeFileSync(
    "/tmp/slw-ext-debug-report.json",
    JSON.stringify({ clickResult, eventResult }, null, 2),
  );
  console.log("eventResult", JSON.stringify(eventResult, null, 2));
  ws.close();
} catch (error) {
  console.error("FAIL", error);
  process.exitCode = 1;
} finally {
  child.kill("SIGKILL");
  setTimeout(() => process.exit(process.exitCode || 0), 300);
}
