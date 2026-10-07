import * as esbuild from "esbuild";
import * as sass from "sass";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function injectCss(css) {
  return `const style = document.createElement("style");
style.textContent = ${JSON.stringify(css)};
document.documentElement.append(style);
`;
}

await esbuild.build({
  absWorkingDir: root,
  entryPoints: ["src/web/boot.ts"],
  outfile: "web-extension/dist/spicy-lyrics.web.js",
  bundle: true,
  format: "iife",
  platform: "browser",
  target: "chrome120",
  jsx: "automatic",
  legalComments: "none",
  define: {
    __SLdev__m: "false",
  },
  alias: {
    "franc-all": "./src/web/stubs/franc-all.js",
    kuroshiro: "./src/web/stubs/kuroshiro.js",
  },
  nodePaths: ["/tmp/slw-deps/node_modules"],
  plugins: [
    {
      name: "inject-css",
      setup(build) {
        build.onLoad({ filter: /\.scss$/ }, (args) => ({
          contents: injectCss(sass.compile(args.path).css),
          loader: "js",
        }));
        build.onLoad({ filter: /\.css$/ }, (args) => ({
          contents: injectCss(readFileSync(args.path, "utf8")),
          loader: "js",
        }));
      },
    },
  ],
});
