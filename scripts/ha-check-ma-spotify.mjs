// Quick check: did the Music Assistant Spotify OAuth complete?
// Looks for the Spotify provider being loaded and at least one
// Spotify entity / config exposed by MA.
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
  // States: look for any spotify-tagged entities
  const states = await send("get_states");
  const spotifyEntities = states.filter((s) => {
    const eid = s.entity_id.toLowerCase();
    const fn = (s.attributes?.friendly_name || "").toLowerCase();
    return eid.includes("spotify") || fn.includes("spotify");
  });
  console.log(`Spotify-tagged entities: ${spotifyEntities.length}`);
  for (const s of spotifyEntities) {
    console.log(`  ${s.entity_id}  (state=${s.state})  fn=${s.attributes?.friendly_name}`);
  }

  // MA exposes its players as media_player.* with a friendly_name often
  // prefixed by the player name. After Spotify is linked, MA may also
  // create a 'connect' / 'cast' synthetic player.
  console.log("\nAll media_player entities:");
  for (const s of states.filter((s) => s.entity_id.startsWith("media_player."))) {
    console.log(`  ${s.entity_id}  state=${s.state}  fn=${s.attributes?.friendly_name}`);
  }

  // Look at the music_assistant config entry — its 'state' should be loaded,
  // and after Spotify provider is added the subentry count typically grows.
  const ce = await send("config_entries/get", { domain: "music_assistant" });
  console.log("\nMA config entry:");
  console.log(JSON.stringify(ce, null, 2));

  // Try the new-style MA WS commands (might be named differently)
  for (const t of [
    "mass/server/info",
    "mass/providers",
    "music_assistant/server/info",
  ]) {
    try {
      const r = await send(t);
      console.log(`\n${t}:`, JSON.stringify(r).slice(0, 200));
    } catch (e) {
      // ignore
    }
  }
  ws.close();
}
