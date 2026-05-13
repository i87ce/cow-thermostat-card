// Probe Shelly Wall Display RPC methods via the HA WS bridge — Home
// Assistant has the Shelly device under its config_entry, and exposes
// a custom service `shelly.script_<name>` only for Scripts. There's no
// generic "rpc_call" service exposed. So we need to either:
//  - use a websocket → HA → execute_script with Python custom
//  - call the device directly via HTTP on 172.16.0.200/rpc/<method>
//
// This script tries the second approach via Tailscale; if HA_LAN_HOST
// is set it pings directly the device. Otherwise prints instructions.
import { request } from "node:https";
import { request as httpRequest } from "node:http";
import WebSocket from "ws";

const HOST = process.env.HA_HOST;
const TOKEN = process.env.HA_TOKEN;
// Tailscale-accessible Shelly LAN IP (the device itself). If you
// know the Shelly Wall Display IP and have routed it via tailscale,
// set SHELLY_HOST=172.16.0.200 (or whatever the device IP is).
const SHELLY_HOST = process.env.SHELLY_HOST || "172.16.0.200";

function rpc(method, params) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({ id: 1, src: "probe", method, params });
    const req = httpRequest(
      {
        hostname: SHELLY_HOST,
        port: 80,
        path: "/rpc",
        method: "POST",
        headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(body) },
        timeout: 4000,
      },
      (res) => {
        let d = "";
        res.on("data", (c) => (d += c));
        res.on("end", () => {
          try { resolve(JSON.parse(d)); } catch { resolve({ raw: d, status: res.statusCode }); }
        });
      },
    );
    req.on("error", reject);
    req.on("timeout", () => { req.destroy(new Error("timeout")); });
    req.write(body);
    req.end();
  });
}

async function main() {
  console.log(`Probing Shelly RPC at http://${SHELLY_HOST}/rpc ...`);
  try {
    const info = await rpc("Shelly.GetDeviceInfo", {});
    console.log("DeviceInfo:", JSON.stringify(info?.result, null, 2));
  } catch (e) {
    console.log("Cannot reach device directly:", e.message);
    console.log("Falling back to HA WS to drive the device through the Shelly integration...");
    return tryViaHA();
  }

  // List existing radio favorites
  console.log("\n=== Media.Radio.ListFavourites ===");
  const radios = await rpc("Media.Radio.ListFavourites", {});
  console.log(JSON.stringify(radios, null, 2));

  // Probe for AddFavourite / similar
  for (const m of [
    "Media.Radio.AddFavourite",
    "Media.Radio.Add",
    "Media.Radio.Set",
    "Media.Radio.CreateFavourite",
    "Media.Radio.Save",
  ]) {
    console.log(`\n--- probe ${m} ---`);
    try {
      const r = await rpc(m, { name: "TEST", url: "http://nope.invalid/stream.mp3" });
      console.log(JSON.stringify(r, null, 2));
    } catch (e) {
      console.log("err:", e.message);
    }
  }

  // Component listing — shows all RPC methods
  console.log("\n=== Shelly.GetComponents (dynamic_only=false, include methods) ===");
  const comps = await rpc("Shelly.GetComponents", { dynamic_only: false });
  console.log(JSON.stringify(comps?.result?.components?.filter?.(c => c?.key?.startsWith?.("media")) ?? comps, null, 2).slice(0, 2000));
}

async function tryViaHA() {
  // Last-ditch: try HA WS execute_script that calls the device.
  // Without a custom integration this fails too — but at least we
  // can verify connectivity by reading the device's host attribute.
  console.log("HA WS probe (not enough to add radio favourites)...");
}

main().catch((e) => console.error(e));
