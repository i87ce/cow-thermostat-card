import { readFileSync } from "node:fs";
import resolve from "@rollup/plugin-node-resolve";
import esbuild from "rollup-plugin-esbuild";

const pkg = JSON.parse(
  readFileSync(new URL("./package.json", import.meta.url), "utf8"),
);

export default {
  input: "src/cow-thermostat-card.ts",
  output: {
    file: "dist/cow-thermostat-card.js",
    format: "es",
    sourcemap: false,
    banner: `/*! cow-thermostat-card v${pkg.version} — MIT — https://github.com/i87ce/cow-thermostat-card */`,
  },
  plugins: [
    resolve({ browser: true, preferBuiltins: false }),
    esbuild({
      target: "es2017",
      minify: true,
      tsconfig: "tsconfig.json",
      legalComments: "none",
    }),
  ],
};
