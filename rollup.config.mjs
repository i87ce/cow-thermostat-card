import { readFileSync, mkdirSync, copyFileSync, readdirSync } from "node:fs";
import resolve from "@rollup/plugin-node-resolve";
import esbuild from "rollup-plugin-esbuild";

const pkg = JSON.parse(
  readFileSync(new URL("./package.json", import.meta.url), "utf8"),
);

/**
 * Custom plugin: copy woff2 fonts from /assets to /dist so the @font-face
 * url("./inter-*.woff2") inside the bundle resolves correctly when HACS
 * serves the dist folder as /hacsfiles/cow-thermostat-card/.
 */
const copyAssets = () => ({
  name: "copy-assets",
  generateBundle() {
    mkdirSync("dist", { recursive: true });
    for (const file of readdirSync("assets")) {
      if (file.endsWith(".woff2")) {
        copyFileSync(`assets/${file}`, `dist/${file}`);
      }
    }
  },
});

export default {
  input: "src/cow-thermostat-card.ts",
  output: {
    file: "dist/cow-thermostat-card.js",
    format: "es",
    sourcemap: true,
    banner: `/*! cow-thermostat-card v${pkg.version} — MIT — https://github.com/alessiovigilante/cow-thermostat-card */`,
  },
  plugins: [
    resolve({ browser: true, preferBuiltins: false }),
    esbuild({
      target: "es2017",
      minify: true,
      tsconfig: "tsconfig.json",
      legalComments: "none",
    }),
    copyAssets(),
  ],
};
