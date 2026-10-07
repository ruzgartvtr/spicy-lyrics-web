import * as esbuild from "esbuild";
import { mkdirSync } from "node:fs";

mkdirSync("dist", { recursive: true });

await esbuild.build({
  entryPoints: ["src/content.js"],
  outfile: "dist/content.js",
  bundle: true,
  format: "iife",
  platform: "browser",
  target: "chrome120",
  legalComments: "none",
});

await esbuild.build({
  entryPoints: ["src/background.js"],
  outfile: "dist/background.js",
  bundle: true,
  format: "iife",
  platform: "browser",
  target: "chrome120",
  legalComments: "none",
});

console.log("built dist/content.js and dist/background.js");
