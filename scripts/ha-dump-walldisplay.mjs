// Dump every walldisplay-* dashboard's full Lovelace config so we can
// confirm what cow-thermostat-card configuration each one uses today.
import WebSocket from "ws";
const HOST = process.env.HA_HOST;
const TOKEN = process.env.HA_TOKEN;

const SLUGS = [
  "walldisplay-sala-cucina",
  "walldisplay-camera-1",
  "walldisplay-camera-2",
  "walldisplay-camera-padronale",
  "walldisplay-bagno-ospiti",
  "walldisplay-scala",
  "walldisplay-bagno-camera",
];

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
  if (m.type === "auth_required")
    return ws.send(JSON.stringify({ type: "auth", access_token: TOKEN }));
  if (m.type === "auth_ok")
    return run().catch((e) => {
      console.error(e);
      process.exit(1);
    });
  if (m.id != null && pending.has(m.id)) {
    const p = pending.get(m.id);
    pending.delete(m.id);
    if (m.success === false) p.rej(new Error(JSON.stringify(m.error)));
    else p.res(m.result);
  }
});
ws.on("error", (e) => { console.error("WS", e.message); process.exit(1); });

async function run() {
  for (const slug of SLUGS) {
    console.log(`\n===== ${slug} =====`);
    try {
      const cfg = await send("lovelace/config", { url_path: slug });
      for (const v of cfg.views || []) {
        for (const c of v.cards || []) {
          console.log(JSON.stringify(c, null, 2));
        }
      }
    } catch (e) {
      console.log("ERR:", e.message);
    }
  }
  ws.close();
}
