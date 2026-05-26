// Quick dump of the XL cow-room-dashboard-card rooms[] config.
// Used to figure out where to slot missing lights/covers found by the
// scene-shortcuts audit.
import WebSocket from "ws";
const HOST = process.env.HA_HOST;
const TOKEN = process.env.HA_TOKEN;
const DASH = process.argv[2] ?? "walldisplay-sala-cucina";

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
  const cfg = await send("lovelace/config", { url_path: DASH });
  let card = null;
  for (const v of cfg.views ?? []) for (const c of v.cards ?? []) {
    if (c.type === "custom:cow-room-dashboard-card") { card = c; break; }
  }
  if (!card) { console.error("not found"); process.exit(1); }
  for (const r of card.rooms ?? []) {
    const lights = r.light ? (Array.isArray(r.light) ? r.light : [r.light]) : [];
    const covers = r.cover ? (Array.isArray(r.cover) ? r.cover : [r.cover]) : [];
    console.log(`▸ ${r.name} (group=${r.group ?? "—"}, areas=[${(r.areas ?? []).join(", ")}])`);
    if (r.climate) console.log(`   climate: ${r.climate}`);
    if (lights.length) console.log(`   lights:  ${lights.join(", ")}`);
    if (covers.length) console.log(`   covers:  ${covers.join(", ")}`);
  }
  ws.close();
  process.exit(0);
}
setTimeout(() => process.exit(3), 15_000);
