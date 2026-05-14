// Probe a list of Shelly devices via direct HTTP RPC and dump device info
// (name, model, fw, app/kiosk URL if available).
// Usage:  node scripts/shelly-probe.mjs 172.16.2.10 172.16.2.11 ...
import { request as httpRequest } from "node:http";

const IPS = process.argv.slice(2);
if (IPS.length === 0) {
  console.error("Usage: shelly-probe.mjs <ip> [<ip> ...]");
  process.exit(2);
}

function rpc(host, method, params = {}) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({ id: 1, src: "probe", method, params });
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
        timeout: 4000,
      },
      (res) => {
        let d = "";
        res.on("data", (c) => (d += c));
        res.on("end", () => {
          try {
            resolve(JSON.parse(d));
          } catch {
            resolve({ raw: d, status: res.statusCode });
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

async function probeOne(ip) {
  console.log(`\n=== ${ip} ===`);
  try {
    const info = await rpc(ip, "Shelly.GetDeviceInfo", {});
    const r = info?.result || info;
    console.log(`  name:      ${r.name ?? "(unset)"}`);
    console.log(`  app:       ${r.app ?? "?"}`);
    console.log(`  model:     ${r.model ?? "?"}`);
    console.log(`  id:        ${r.id ?? "?"}`);
    console.log(`  fw:        ${r.fw_id ?? "?"}`);
    if (r.ver) console.log(`  ver:       ${r.ver}`);
  } catch (e) {
    console.log(`  ERR GetDeviceInfo: ${e.message}`);
    return;
  }

  try {
    const m = await rpc(ip, "Shelly.ListMethods", {});
    const methods = m?.result?.methods || [];
    const interesting = methods.filter((x) =>
      /restart|reboot|launch|reload|kiosk|ws_?ui|wd_?ui|webview/i.test(x),
    );
    console.log(
      `  RPC methods total: ${methods.length}, soft-reload candidates: ${interesting.join(", ") || "(none)"}`,
    );
  } catch (e) {
    console.log(`  ERR ListMethods: ${e.message}`);
  }
}

for (const ip of IPS) {
  await probeOne(ip);
}
