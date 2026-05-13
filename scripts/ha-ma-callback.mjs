// Try to forward the Spotify OAuth callback that landed on MA's
// internal URL (172.16.0.200:8095) by having HA itself fetch it.
// We use the `shell_command` service if available, or the system_log
// integration as a poor-man's HTTP-from-HA mechanism. As fallback we
// just print clear LAN instructions.
import WebSocket from "ws";

const HOST = process.env.HA_HOST;
const TOKEN = process.env.HA_TOKEN;
const CALLBACK_URL = process.argv[2];
if (!CALLBACK_URL) {
  console.error("Usage: node ha-ma-callback.mjs '<full callback URL from Spotify>'");
  process.exit(2);
}

const ws = new WebSocket(`wss://${HOST}/api/websocket`);
let id = 1;
const pending = new Map();
function send(type, payload = {}) {
  return new Promise((res, rej) => {
    const mid = id++;
    pending.set(mid, { res, rej });
    ws.send(JSON.stringify({ id: mid, type, ...payload }));
  });
}
ws.on("message", (data) => {
  const msg = JSON.parse(data.toString());
  if (msg.type === "auth_required") return ws.send(JSON.stringify({ type: "auth", access_token: TOKEN }));
  if (msg.type === "auth_invalid") { console.error("AUTH FAIL"); process.exit(1); }
  if (msg.type === "auth_ok") return run().catch((e) => { console.error("ERR", e); process.exit(1); });
  if (msg.id != null && pending.has(msg.id)) {
    const p = pending.get(msg.id);
    pending.delete(msg.id);
    if (msg.success === false) p.rej(new Error(JSON.stringify(msg.error)));
    else p.res(msg.result);
  }
});
ws.on("error", (e) => { console.error("WS ERR", e.message); process.exit(1); });

async function run() {
  // 1) See what music_assistant WS commands are available
  console.log("Probing Music Assistant WebSocket commands...");
  for (const t of [
    "music_assistant/config/providers",
    "music_assistant/providers",
    "music_assistant/auth/callback",
    "music_assistant/oauth/callback",
  ]) {
    try {
      const r = await send(t);
      console.log(`  ${t}: OK`, JSON.stringify(r).slice(0, 200));
    } catch (e) {
      console.log(`  ${t}: ${e.message.slice(0, 80)}`);
    }
  }

  // 2) Try forwarding via a shell_command service (won't work unless
  //    user has defined one in configuration.yaml — we know they
  //    haven't, but worth a try).
  // 3) Print the LAN instructions
  console.log("\n--- Manual completion required ---");
  console.log("Open this URL from a device that's on your home WiFi");
  console.log("(phone, laptop). Your browser will reach MA on 172.16.0.200:8095");
  console.log("directly, complete the OAuth, and store the Spotify token in MA:\n");
  console.log(`  ${CALLBACK_URL}\n`);
  ws.close();
}
