// Test MA search + library with the right config_entry_id.
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
  // 1) Search Spotify for an Italian song to confirm Spotify is connected
  console.log("Search 'Cesare Cremonini' (track)...");
  try {
    const r = await send("call_service", {
      domain: "music_assistant",
      service: "search",
      service_data: { config_entry_id: CONFIG_ID, name: "Cesare Cremonini", media_type: ["track"], limit: 5 },
      return_response: true,
    });
    const items = r.response?.tracks || r.response?.items || r.response;
    console.log("Found", (items?.length || 0), "items");
    if (items?.length) {
      for (const t of items.slice(0, 3)) {
        console.log(`  - ${t.name || t.title}  by ${t.artists?.map(a=>a.name).join(",") || t.artist}  (provider: ${t.provider || t.item_id?.split(":")[0]})`);
        console.log(`    uri: ${t.uri || t.media_id || t.item_id}`);
      }
    } else {
      console.log("RAW response:", JSON.stringify(r.response, null, 2).slice(0, 1500));
    }
  } catch (e) {
    console.log("FAIL:", e.message);
  }

  // 2) Library playlists
  console.log("\nLibrary playlists:");
  try {
    const r = await send("call_service", {
      domain: "music_assistant",
      service: "get_library",
      service_data: { config_entry_id: CONFIG_ID, media_type: "playlist", limit: 10 },
      return_response: true,
    });
    const items = r.response?.items || r.response;
    console.log("Found", (items?.length || 0), "playlists");
    if (items?.length) {
      for (const p of items.slice(0, 10)) {
        console.log(`  - ${p.name}  (${p.provider || p.uri || ''})`);
      }
    } else {
      console.log("RAW:", JSON.stringify(r.response, null, 2).slice(0, 1200));
    }
  } catch (e) {
    console.log("FAIL:", e.message);
  }

  // 3) Library radios
  console.log("\nLibrary radios:");
  try {
    const r = await send("call_service", {
      domain: "music_assistant",
      service: "get_library",
      service_data: { config_entry_id: CONFIG_ID, media_type: "radio", limit: 10 },
      return_response: true,
    });
    const items = r.response?.items || r.response;
    console.log("Found", (items?.length || 0), "radios");
    if (items?.length) {
      for (const p of items.slice(0, 10)) {
        console.log(`  - ${p.name}`);
      }
    }
  } catch (e) {
    console.log("FAIL:", e.message);
  }

  ws.close();
}
