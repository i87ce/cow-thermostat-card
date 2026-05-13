// Probe Music Assistant's WebSocket API: find what commands are
// available so we can locate the server config / public-URL setting.
import WebSocket from "ws";
const HOST = process.env.HA_HOST;
const TOKEN = process.env.HA_TOKEN;
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
  const tries = [
    // Standard MA proxy commands
    "mass/server/info",
    "mass/config",
    "mass/config/server",
    "mass/config/providers",
    "mass/providers",
    "mass/players",
    "mass/library/playlists",
    // Maybe nested under music_assistant namespace
    "music_assistant_server/info",
    "music_assistant/server/info",
    "music_assistant/config",
    // Config entries listing
    "config_entries/get",
  ];
  for (const t of tries) {
    try {
      const r = await send(t);
      const j = JSON.stringify(r);
      console.log(`  OK  ${t.padEnd(40)}  ${j.slice(0, 220)}`);
    } catch (e) {
      const m = e.message.slice(0, 80);
      console.log(`  --  ${t.padEnd(40)}  ${m}`);
    }
  }

  // Also list all config_entries to find the MA entry id
  try {
    const r = await send("config_entries/get", { domain: "music_assistant" });
    console.log("\nMusic Assistant config_entries:");
    console.log(JSON.stringify(r, null, 2));
  } catch (e) {
    console.log("config_entries/get failed:", e.message);
  }
  ws.close();
}
