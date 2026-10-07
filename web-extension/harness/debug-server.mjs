import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const port = 8765;
const reportPath = "/tmp/slw-harness-report.json";
const chrome =
  process.env.CHROME ||
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const profile = "/tmp/slw-cdp-profile";

fs.mkdirSync(profile, { recursive: true });
fs.rmSync(reportPath, { force: true });

const mime = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json",
};

const server = http.createServer((req, res) => {
  if (req.method === "POST" && req.url === "/report") {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => {
      const body = Buffer.concat(chunks).toString("utf8");
      fs.writeFileSync(reportPath, body);
      res.writeHead(204);
      res.end();
      console.log("REPORT_RECEIVED");
      setTimeout(() => {
        child.kill("SIGTERM");
        server.close();
        process.exit(0);
      }, 200);
    });
    return;
  }

  let urlPath = req.url === "/" ? "/harness/index.html" : req.url.split("?")[0];
  const filePath = path.join(root, urlPath.replace(/^\//, ""));
  if (!filePath.startsWith(root) || !fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    res.writeHead(404);
    res.end("missing");
    return;
  }
  res.writeHead(200, { "content-type": mime[path.extname(filePath)] || "application/octet-stream" });
  fs.createReadStream(filePath).pipe(res);
});

await new Promise((resolve) => server.listen(port, "127.0.0.1", resolve));
console.log(`serving http://127.0.0.1:${port}/harness/`);

const child = spawn(
  chrome,
  [
    `--user-data-dir=${profile}`,
    "--disable-extensions",
    "--no-first-run",
    "--no-default-browser-check",
    "--disable-gpu",
    "--window-size=1280,800",
    `http://127.0.0.1:${port}/harness/`,
  ],
  { stdio: "ignore" },
);

const timeout = setTimeout(() => {
  console.error("TIMEOUT waiting for harness report");
  if (fs.existsSync(reportPath)) {
    console.log(fs.readFileSync(reportPath, "utf8"));
  }
  child.kill("SIGTERM");
  server.close();
  process.exit(1);
}, 25000);

child.on("exit", () => {
  clearTimeout(timeout);
});
