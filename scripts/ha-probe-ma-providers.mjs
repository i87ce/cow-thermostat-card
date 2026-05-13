// Probe Music Assistant providers + players + flow_handlers to know
// what's installed and what's still missing (radio source, player
// provider for display_sala).
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
  if (m.type === "auth_invalid") { console.error("AUTH FAIL"); process.exit(1); }
  if (m.id != null && pending.has(m.id)) {
    const p = pending.get(m.id);
    pending.delete(m.id);
    if (m.success === false) p.rej(new Error(JSON.stringify(m.error)));
    else p.res(m.result);
  }
});
ws.on("error", (e) => { console.error("WS ERR", e.message); process.exit(1); });

async function run() {
  // 1) MA sub-entries / providers — config_entries/subentries?
  console.log("=== Config entry (full) ===");
  const entries = await send("config_entries/get", { domain: "music_assistant" });
  console.log(JSON.stringify(entries, null, 2));

  // 2) Devices registered for MA
  console.log("\n=== Devices for MA ===");
  try {
    const devices = await send("config/device_registry/list");
    const maDevices = devices.filter((d) => d.config_entries?.includes(CONFIG_ID));
    console.log(`Total MA devices: ${maDevices.length}`);
    for (const d of maDevices) {
      console.log(`  - ${d.name_by_user ?? d.name} (model=${d.model}, manufacturer=${d.manufacturer}, hw=${d.hw_version ?? "-"})`);
    }
  } catch (e) {
    console.log("device list failed:", e.message);
  }

  // 3) media_player entities (all)
  console.log("\n=== media_player.* entities ===");
  const states = await send("get_states");
  const mp = states.filter((s) => s.entity_id.startsWith("media_player."));
  for (const m of mp) {
    const a = m.attributes;
    console.log(`  - ${m.entity_id}   state=${m.state}   features=${a.supported_features ?? "?"}   class=${a.device_class ?? "-"}  friendly=${a.friendly_name}`);
  }

  // 4) Probe MA via its own WS commands — try /api/music_assistant/...
  // The MA integration exposes some HA WS commands prefixed with
  // "music_assistant/*". Try a few well-known ones.
  for (const cmd of [
    "music_assistant/players",
    "music_assistant/providers",
    "music_assistant/player_queues",
  ]) {
    try {
      const r = await send(cmd, { config_entry_id: CONFIG_ID });
      console.log(`\n=== ${cmd} ===`);
      console.log(JSON.stringify(r, null, 2).slice(0, 1800));
    } catch (e) {
      console.log(`\n${cmd}: ${e.message.slice(0, 160)}`);
    }
  }

  // 5) Try to look up MA's API path — usually /music-assistant/ panel
  // is registered. Check config/panel/list.
  try {
    const panels = await send("get_panels");
    const ma = Object.values(panels).find((p) => p.title?.toLowerCase?.().includes("music") || p.url_path?.includes("music"));
    console.log("\n=== MA panel ===");
    console.log(JSON.stringify(ma, null, 2));
  } catch (e) {
    console.log("panels:", e.message);
  }

  ws.close();
}
