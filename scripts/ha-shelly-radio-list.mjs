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
  for (const [mct, mci] of [
    ["radio", "radio"],
    ["audio", "audio"],
  ]) {
    console.log(`\n=== browse Shelly display_sala ${mct} ===`);
    try {
      const r = await send("media_player/browse_media", {
        entity_id: "media_player.display_sala",
        media_content_type: mct,
        media_content_id: mci,
      });
      console.log(JSON.stringify(r, null, 2));
    } catch (e) {
      console.log("ERR:", e.message);
    }
  }
  ws.close();
}
