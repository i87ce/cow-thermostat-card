// Soft-restart the HA kiosk app on Shelly Wall Display devices via direct
// RPC. Calls Sys.RestartApplication (restarts only the WallDisplay app,
// not the firmware — quick refresh, ~2-5s). Falls back to Shelly.Reboot
// if RestartApplication is missing.
//
// Usage:  node scripts/shelly-restart-app.mjs           (uses default targets)
//         node scripts/shelly-restart-app.mjs <ip> ...   (overrides)
import { request as httpRequest } from "node:http";

const DEFAULT_TARGETS = [
  { ip: "172.16.2.10",  slug: "walldisplay-camera-1" },
  { ip: "172.16.2.11",  slug: "walldisplay-camera-2" },
  { ip: "172.16.2.12",  slug: "walldisplay-bagno-ospiti" },
  { ip: "172.16.2.13",  slug: "walldisplay-camera-padronale" },
  { ip: "172.16.1.50",  slug: "walldisplay-sala-cucina-xl" },
  { ip: "172.16.2.15",  slug: "walldisplay-scala" },
  { ip: "172.16.2.100", slug: "walldisplay-bagno-camera" },
  { ip: "172.16.2.222", slug: "walldisplay-studio" },
];

const argv = process.argv.slice(2);
const targets =
  argv.length > 0 ? argv.map((ip) => ({ ip, slug: "(custom)" })) : DEFAULT_TARGETS;

const TIMEOUT_MS = Number(process.env.TIMEOUT_MS) || 5000;

function rpc(host, method, params = {}) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({ id: 1, src: "restart", method, params });
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
        timeout: TIMEOUT_MS,
      },
      (res) => {
        let d = "";
        res.on("data", (c) => (d += c));
        res.on("end", () => {
          try {
            resolve({ status: res.statusCode, body: JSON.parse(d) });
          } catch {
            resolve({ status: res.statusCode, raw: d });
          }
        });
      },
    );
    req.on("error", reject);
    req.on("timeout", () => req.destroy(new Error("timeout")));
    req.write(body);
    req.end();
  });
}

async function restartOne({ ip, slug }) {
  const tag = `${ip} (${slug})`;
  try {
    const r = await rpc(ip, "Sys.RestartApplication", {});
    if (r.body?.error) {
      const code = r.body.error.code;
      const msg = r.body.error.message || "";
      if (/method/i.test(msg) || code === -32601) {
        // Method not found — fallback to full reboot
        console.log(`  ${tag}: Sys.RestartApplication not supported, falling back to Shelly.Reboot`);
        const r2 = await rpc(ip, "Shelly.Reboot", {});
        if (r2.body?.error) {
          console.log(`  ${tag}: ✗ Shelly.Reboot failed: ${JSON.stringify(r2.body.error)}`);
          return { ip, slug, ok: false, method: "Shelly.Reboot", err: r2.body.error };
        }
        console.log(`  ${tag}: ✓ rebooted (hard, ~25s offline)`);
        return { ip, slug, ok: true, method: "Shelly.Reboot" };
      }
      console.log(`  ${tag}: ✗ ${JSON.stringify(r.body.error)}`);
      return { ip, slug, ok: false, method: "Sys.RestartApplication", err: r.body.error };
    }
    console.log(`  ${tag}: ✓ app restarted (soft, ~2-5s)`);
    return { ip, slug, ok: true, method: "Sys.RestartApplication" };
  } catch (e) {
    console.log(`  ${tag}: ✗ ${e.message}`);
    return { ip, slug, ok: false, err: e.message };
  }
}

console.log(`Restarting HA app on ${targets.length} Wall Display(s)...\n`);
const results = await Promise.all(targets.map(restartOne));

const ok = results.filter((r) => r.ok).length;
const fail = results.length - ok;
console.log(`\n=== Summary: ${ok}/${results.length} OK${fail > 0 ? `, ${fail} failed` : ""} ===`);
process.exit(fail > 0 ? 1 : 0);
