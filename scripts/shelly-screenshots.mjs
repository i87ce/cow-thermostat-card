// Wake every Shelly Wall Display kiosk with a synthetic Ui.Tap (so the
// screen turns on if it was sleeping), wait 5 s, then grab /screenshot
// and save to /tmp/display-screenshots/<slug>.png.
//
// Usage:  node scripts/shelly-screenshots.mjs                (default 6 small)
//         node scripts/shelly-screenshots.mjs <ip>=<slug> ...
import { request as httpRequest } from "node:http";
import { createWriteStream, mkdirSync, statSync } from "node:fs";
import { join } from "node:path";

const DEFAULT_TARGETS = [
  { ip: "172.16.2.10",  slug: "camera-1" },
  { ip: "172.16.2.11",  slug: "camera-2" },
  { ip: "172.16.2.12",  slug: "bagno-ospiti" },
  { ip: "172.16.2.13",  slug: "camera-padronale" },
  { ip: "172.16.2.15",  slug: "scala" },
  { ip: "172.16.2.100", slug: "bagno-camera" },
];

const argv = process.argv.slice(2);
const targets =
  argv.length > 0
    ? argv.map((s) => {
        const [ip, slug] = s.split("=");
        return { ip, slug: slug || ip };
      })
    : DEFAULT_TARGETS;

const OUT_DIR = process.env.OUT_DIR || "/tmp/display-screenshots";
const TAP_X = Number(process.env.TAP_X) || 360;
const TAP_Y = Number(process.env.TAP_Y) || 400;
const WAKE_MS = Number(process.env.WAKE_MS) || 5000;
const RPC_TIMEOUT = Number(process.env.RPC_TIMEOUT) || 15000;
const SCREENSHOT_TIMEOUT = Number(process.env.SCREENSHOT_TIMEOUT) || 30000;

mkdirSync(OUT_DIR, { recursive: true });

function rpc(host, method, params) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({ id: 1, src: "shot", method, params });
    const req = httpRequest(
      {
        hostname: host,
        port: 80,
        path: "/rpc",
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(body),
        },
        timeout: RPC_TIMEOUT,
      },
      (res) => {
        let d = "";
        res.on("data", (c) => (d += c));
        res.on("end", () => {
          try { resolve({ status: res.statusCode, body: JSON.parse(d) }); }
          catch { resolve({ status: res.statusCode, raw: d }); }
        });
      },
    );
    req.on("error", reject);
    req.on("timeout", () => req.destroy(new Error("rpc-timeout")));
    req.write(body);
    req.end();
  });
}

function downloadScreenshot(host, outPath) {
  return new Promise((resolve, reject) => {
    const req = httpRequest(
      {
        hostname: host,
        port: 80,
        path: "/screenshot",
        method: "GET",
        timeout: SCREENSHOT_TIMEOUT,
      },
      (res) => {
        if (res.statusCode !== 200) {
          res.resume();
          return reject(new Error(`HTTP ${res.statusCode}`));
        }
        const out = createWriteStream(outPath);
        res.pipe(out);
        out.on("finish", () => out.close(() => resolve()));
        out.on("error", reject);
      },
    );
    req.on("error", reject);
    req.on("timeout", () => req.destroy(new Error("screenshot-timeout")));
    req.end();
  });
}

async function captureOne({ ip, slug }) {
  const out = join(OUT_DIR, `${slug}.png`);
  try {
    await rpc(ip, "Ui.Tap", { x: TAP_X, y: TAP_Y });
  } catch (e) {
    return { ip, slug, ok: false, stage: "tap", err: e.message };
  }
  await new Promise((r) => setTimeout(r, WAKE_MS));
  try {
    await downloadScreenshot(ip, out);
  } catch (e) {
    return { ip, slug, ok: false, stage: "screenshot", err: e.message };
  }
  let size = 0;
  try { size = statSync(out).size; } catch { /* ignore */ }
  return { ip, slug, ok: true, file: out, size };
}

console.log(`Capturing ${targets.length} display(s) → ${OUT_DIR}\n`);
const results = await Promise.all(targets.map(captureOne));

console.log("\n=== Results ===");
for (const r of results) {
  if (r.ok) {
    console.log(`  ✓ ${r.slug.padEnd(20)} ${r.ip.padEnd(14)} ${(r.size / 1024).toFixed(1)} KB → ${r.file}`);
  } else {
    console.log(`  ✗ ${r.slug.padEnd(20)} ${r.ip.padEnd(14)} FAILED at ${r.stage}: ${r.err}`);
  }
}
const ok = results.filter((r) => r.ok).length;
console.log(`\n${ok}/${results.length} OK`);
process.exit(ok === results.length ? 0 : 1);
