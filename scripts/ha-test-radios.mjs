// Quick test: verify Radio Browser is installed by searching for
// "rds" and listing the user's favorited radios.
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

async function run() {
  // 1) Search for "rds"
  console.log("=== Search 'rds' (radio) ===");
  const r1 = await send("call_service", {
    domain: "music_assistant",
    service: "search",
    service_data: { config_entry_id: CONFIG_ID, name: "rds", media_type: ["radio"], limit: 8 },
    return_response: true,
  });
  const items = r1?.response?.radio || r1?.response?.radios || r1?.response?.items || [];
  console.log(`Found ${items.length} radios`);
  for (const it of items.slice(0, 6)) {
    console.log(`  - ${it.name}  uri=${it.uri || it.item_id}`);
  }

  // 2) Favorited radios
  console.log("\n=== Favorited radios ===");
  const r2 = await send("call_service", {
    domain: "music_assistant",
    service: "get_library",
    service_data: { config_entry_id: CONFIG_ID, media_type: "radio", favorite: true, limit: 20 },
    return_response: true,
  });
  const favs = r2?.response?.items || [];
  console.log(`Found ${favs.length} favorite radios`);
  for (const it of favs.slice(0, 10)) {
    console.log(`  ♥ ${it.name}  uri=${it.uri || it.item_id}`);
  }
  if (favs.length === 0) {
    console.log("  (none yet — heart radios in MA UI's Search tab to seed)");
  }

  // 3) All radios in library
  console.log("\n=== All library radios ===");
  const r3 = await send("call_service", {
    domain: "music_assistant",
    service: "get_library",
    service_data: { config_entry_id: CONFIG_ID, media_type: "radio", limit: 20 },
    return_response: true,
  });
  console.log(`Found ${(r3?.response?.items || []).length} library radios`);

  ws.close();
}
