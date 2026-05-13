// Detailed probe of music_assistant.* service signatures + try a
// real search and library fetch to confirm Spotify is connected.
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
  // 1) Service signatures
  const services = await send("get_services");
  const ma = services.music_assistant;
  console.log("=== music_assistant services ===\n");
  for (const [name, def] of Object.entries(ma)) {
    console.log(`▸ music_assistant.${name}`);
    if (def.description) console.log("    " + def.description.slice(0, 200));
    if (def.fields) {
      for (const [fname, fdef] of Object.entries(def.fields)) {
        const req = fdef.required ? " *required" : "";
        const ex = fdef.example !== undefined ? `  ex=${JSON.stringify(fdef.example)}` : "";
        const desc = (fdef.description || "").slice(0, 90);
        console.log(`    - ${fname}${req}  ${desc}${ex}`);
      }
    }
    console.log();
  }

  // 2) Try search with Spotify-like params
  console.log("\n=== Trying music_assistant.search ===\n");
  try {
    const r = await send("call_service", {
      domain: "music_assistant",
      service: "search",
      service_data: { name: "Cesare Cremonini", media_type: ["artist", "track", "album"], limit: 5 },
      return_response: true,
    });
    console.log("search result:", JSON.stringify(r, null, 2).slice(0, 2400));
  } catch (e) {
    console.log("search failed:", e.message);
  }

  // 3) Try get_library for playlists (where Spotify ones should appear)
  console.log("\n=== Trying music_assistant.get_library (playlists) ===\n");
  try {
    const r = await send("call_service", {
      domain: "music_assistant",
      service: "get_library",
      service_data: { media_type: "playlist", limit: 10 },
      return_response: true,
    });
    console.log("get_library result:", JSON.stringify(r, null, 2).slice(0, 3000));
  } catch (e) {
    console.log("get_library failed:", e.message);
  }

  // 4) Check media_player.display_sala — when MA controls it, source_list
  // should include MA's universe; also config_entries may now have subentries.
  const ce = await send("config_entries/get", { domain: "music_assistant" });
  console.log("\n=== MA config_entries (after Spotify auth) ===");
  console.log(JSON.stringify(ce, null, 2).slice(0, 500));

  ws.close();
}
