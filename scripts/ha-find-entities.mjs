// Quick HA entity finder — grep through the full state list for entities
// matching the supplied substrings (e.g. "camera_1", "padronale").
// Usage: node scripts/ha-find-entities.mjs camera_1 led_camera comodino
import WebSocket from "ws";
const HOST = process.env.HA_HOST;
const TOKEN = process.env.HA_TOKEN;
const NEEDLES = process.argv.slice(2).map((s) => s.toLowerCase());

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
    return run().catch((e) => { console.error(e); process.exit(1); });
  if (m.id != null && pending.has(m.id)) {
    const p = pending.get(m.id);
    pending.delete(m.id);
    if (m.success === false) p.rej(new Error(JSON.stringify(m.error)));
    else p.res(m.result);
  }
});
ws.on("error", (e) => { console.error("WS", e.message); process.exit(1); });

async function run() {
  const states = await send("get_states");
  const matches = states.filter((s) => {
    const id = s.entity_id.toLowerCase();
    const nm = (s.attributes?.friendly_name || "").toLowerCase();
    return NEEDLES.length === 0
      ? id.startsWith("light.") || id.startsWith("cover.")
      : NEEDLES.some((n) => id.includes(n) || nm.includes(n));
  });
  matches.sort((a, b) => a.entity_id.localeCompare(b.entity_id));
  for (const s of matches) {
    if (!s.entity_id.startsWith("light.") && !s.entity_id.startsWith("cover.")) continue;
    console.log(`${s.entity_id.padEnd(50)} state=${s.state.padEnd(12)} name="${s.attributes?.friendly_name || ""}"`);
  }
  console.log(`\n${matches.filter(s => s.entity_id.startsWith("light.") || s.entity_id.startsWith("cover.")).length} match(es)`);
  ws.close();
}
