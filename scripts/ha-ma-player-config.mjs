// Inspect & try to patch MA player configuration via the WS bridge
// the MA HA-integration exposes. Goal: change Display Sala's output
// protocol from "Native" to something the Shelly accepts (MP3/HTTP).
import WebSocket from "ws";
const HOST = process.env.HA_HOST;
const TOKEN = process.env.HA_TOKEN;
const CONFIG_ID = "01KR70XN8WQ46Y3B20BQKHG27P";
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
  const m = JSON.parse(data.toString());
  if (m.type === "auth_required") return ws.send(JSON.stringify({ type: "auth", access_token: TOKEN }));
  if (m.type === "auth_ok") return run().catch((e) => { console.error(e); process.exit(1); });
  if (m.id != null && pending.has(m.id)) {
    const p = pending.get(m.id);
    pending.delete(m.id);
    if (m.success === false) p.rej(new Error(JSON.stringify(m.error)));
    else p.res(m.result);
  }
});

async function run() {
  // Try every MA WS namespace I can think of.
  const probes = [
    "music_assistant/players/get_config",
    "music_assistant/players/configure",
    "music_assistant/config/players/get",
    "music_assistant/config/players/list",
    "music_assistant/config/players/save",
    "music_assistant/config/get_entries",
    "music_assistant/config/list",
    "config/music_assistant/players",
    // Sub-entries (HA generic config-flow sub-entries)
    "config_entries/subentries/list",
    "config_entries/subentries/get",
  ];
  for (const cmd of probes) {
    try {
      const r = await send(cmd, { config_entry_id: CONFIG_ID });
      console.log(`✓ ${cmd}`);
      console.log("   ", JSON.stringify(r).slice(0, 220));
    } catch (e) {
      console.log(`✗ ${cmd}  →  ${e.message.slice(0, 80)}`);
    }
  }

  // Try plain HTTP to MA via supervisor proxy
  // (won't work from this script, but useful to know the path)
  console.log("\nIf above all fail, the player config UI is at:");
  console.log("  Music Assistant panel → Players → Display Sala → ⚙ Settings");
  console.log("  → 'Output protocol' or 'Output codec'");

  ws.close();
}
