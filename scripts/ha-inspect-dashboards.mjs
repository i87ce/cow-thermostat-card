// Pull the lovelace config for each storage-mode dashboard so we can
// see what's inside the "orphan" ones (walldisplay-camera, walldisplay-
// studio-chiara, walldisplay-bagno-camera) and decide rename vs delete.
import WebSocket from "ws";
const ws = new WebSocket(`wss://${process.env.HA_HOST}/api/websocket`);
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
  if (m.type === "auth_required") return ws.send(JSON.stringify({ type: "auth", access_token: process.env.HA_TOKEN }));
  if (m.type === "auth_ok") return run().catch((e) => { console.error(e); process.exit(1); });
  if (m.id != null && pending.has(m.id)) {
    const p = pending.get(m.id);
    pending.delete(m.id);
    if (m.success === false) p.rej(new Error(JSON.stringify(m.error)));
    else p.res(m.result);
  }
});

async function run() {
  const targets = [
    "walldisplay-camera",
    "walldisplay-studio-chiara",
    "walldisplay-bagno-camera",
    "walldisplay-scala",
  ];
  for (const url_path of targets) {
    console.log(`\n=== ${url_path} ===`);
    try {
      const cfg = await send("lovelace/config", { url_path });
      console.log("title:", cfg.title);
      console.log("views:", cfg.views?.length, "view(s)");
      for (const v of cfg.views || []) {
        console.log(`  view "${v.title}" (path=${v.path})  cards=${(v.cards||[]).length}`);
        for (const c of (v.cards || []).slice(0, 3)) {
          console.log(`    - card type=${c.type}  ${c.title ? `title="${c.title}"` : ""}`);
        }
      }
    } catch (e) {
      console.log("ERR:", e.message);
    }
  }
  ws.close();
}
