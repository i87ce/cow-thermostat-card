// Browse the Shelly Wall Display's internal media library
// (radio stations + audio files registered on the device itself).
// This is the *only* way the Shelly media_player accepts content.
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

async function browse(entity_id, mct, mci) {
  return send("media_player/browse_media", {
    entity_id,
    ...(mct !== undefined ? { media_content_type: mct } : {}),
    ...(mci !== undefined ? { media_content_id: mci } : {}),
  });
}

async function run() {
  for (const entity of [
    "media_player.display_sala",
    "media_player.display_camera_1",
    "media_player.display_ingresso_pt",
  ]) {
    console.log(`\n=== ${entity} ===`);
    try {
      const root = await browse(entity);
      console.log("Root:", root.title);
      for (const c of root.children || []) {
        console.log(`  [${c.media_content_type}] ${c.title}`);
        try {
          const child = await browse(entity, c.media_content_type, c.media_content_id);
          for (const item of (child.children || []).slice(0, 30)) {
            console.log(`    - id=${item.media_content_id}  ${item.title}`);
          }
          if ((child.children || []).length > 30) {
            console.log(`    ...and ${child.children.length - 30} more`);
          }
        } catch (e) {
          console.log(`    (failed: ${e.message.slice(0, 80)})`);
        }
      }
    } catch (e) {
      console.log("ERR:", e.message);
    }
  }
  ws.close();
}
