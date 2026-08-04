#!/usr/bin/env node
/**
 * Lightweight perf budget reporter for cow-thermostat-card.
 * Run before and after optimization work; compares bundle size and
 * counts shouldUpdate guards in source.
 *
 * Usage:
 *   npm run build && node scripts/perf-budget.mjs
 *   node scripts/perf-budget.mjs --compare docs/perf-baseline-v1.10.json
 */
import { readFileSync, writeFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..");
const DIST = join(ROOT, "dist", "cow-thermostat-card.js");
const SRC = join(ROOT, "src");

function walkTs(dir, acc = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) walkTs(p, acc);
    else if (name.endsWith(".ts")) acc.push(p);
  }
  return acc;
}

function countPattern(files, pattern) {
  const re = new RegExp(pattern, "g");
  let n = 0;
  for (const f of files) {
    const txt = readFileSync(f, "utf8");
    n += (txt.match(re) ?? []).length;
  }
  return n;
}

function measure() {
  const files = walkTs(SRC);
  const bundleBytes = existsSync(DIST) ? statSync(DIST).size : 0;
  return {
    version: JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8")).version,
    measuredAt: new Date().toISOString(),
    bundleKb: Math.round((bundleBytes / 1024) * 10) / 10,
    shouldUpdateGuards: countPattern(files, "override shouldUpdate"),
    optimisticPending: countPattern(files, "pendingOn|pendingMove|pendingMode|pendingFan|pendingPct|optLight|optCover"),
    musicModules: files.filter((f) => f.includes("/music/")).length,
    notes:
      "Browser trace (6× CPU throttle, hass burst + drawer open) should be run on-device; this script captures build-level proxies.",
  };
}

const compareArg = process.argv.indexOf("--compare");
const m = measure();
console.log(JSON.stringify(m, null, 2));

if (compareArg >= 0) {
  const path = process.argv[compareArg + 1];
  if (path && existsSync(path)) {
    const prev = JSON.parse(readFileSync(path, "utf8"));
    console.error("\n── delta vs", path, "──");
    console.error(`bundle: ${prev.bundleKb} KB → ${m.bundleKb} KB (${m.bundleKb - prev.bundleKb >= 0 ? "+" : ""}${Math.round((m.bundleKb - prev.bundleKb) * 10) / 10})`);
    console.error(`shouldUpdate: ${prev.shouldUpdateGuards} → ${m.shouldUpdateGuards}`);
    console.error(`music modules: ${prev.musicModules} → ${m.musicModules}`);
  }
}

if (process.argv.includes("--save")) {
  const out = join(ROOT, "docs", `perf-baseline-v${m.version}.json`);
  writeFileSync(out, JSON.stringify(m, null, 2) + "\n");
  console.error("saved →", out);
}
