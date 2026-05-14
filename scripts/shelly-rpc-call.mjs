// Generic Shelly RPC caller — sends an arbitrary RPC method to a single
// device and prints the JSON response.
//
// Usage:
//   node scripts/shelly-rpc-call.mjs <ip> <Method> '[<json-params>]'
//
// Examples:
//   node scripts/shelly-rpc-call.mjs 172.16.2.10 Shelly.GetStatus
//   node scripts/shelly-rpc-call.mjs 172.16.2.10 Ui.Tap '{"x":210,"y":495}'
//   node scripts/shelly-rpc-call.mjs 172.16.2.10 Shelly.Reboot
import { request as httpRequest } from "node:http";

const [, , IP, METHOD, PARAMS_JSON] = process.argv;
if (!IP || !METHOD) {
  console.error("Usage: shelly-rpc-call.mjs <ip> <Method> '[<json-params>]'");
  process.exit(2);
}
const params = PARAMS_JSON ? JSON.parse(PARAMS_JSON) : {};
const TIMEOUT = Number(process.env.TIMEOUT_MS) || 10000;

const body = JSON.stringify({ id: 1, src: "rpc", method: METHOD, params });
const req = httpRequest(
  {
    hostname: IP, port: 80, path: "/rpc", method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Content-Length": Buffer.byteLength(body),
    },
    timeout: TIMEOUT,
  },
  (res) => {
    let d = "";
    res.on("data", (c) => (d += c));
    res.on("end", () => {
      console.log(`HTTP ${res.statusCode}`);
      try { console.log(JSON.stringify(JSON.parse(d), null, 2)); }
      catch { console.log(d); }
    });
  },
);
req.on("error", (e) => { console.error("ERR:", e.message); process.exit(1); });
req.on("timeout", () => { req.destroy(new Error("timeout")); console.error("TIMEOUT"); process.exit(1); });
req.write(body);
req.end();
