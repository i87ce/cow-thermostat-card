// Enumerate all Shelly Wall Display entities + devices, grouped per device.
// Identifies the button.* used to soft-reboot each display.
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
  const wd = states.filter((s) =>
    s.entity_id.toLowerCase().includes("shellywalldisplay") ||
    (s.attributes?.friendly_name || "").toLowerCase().includes("shellywalldisplay") ||
    (s.attributes?.friendly_name || "").toLowerCase().includes("walldisplay"),
  );

  // Group by MAC (extracted from entity_id)
  const byMac = new Map();
  for (const s of wd) {
    const m = s.entity_id.match(/shellywalldisplay_([0-9a-f]+)/i);
    const mac = m ? m[1] : "_unknown";
    if (!byMac.has(mac)) byMac.set(mac, []);
    byMac.get(mac).push(s);
  }

  for (const [mac, items] of byMac) {
    console.log(`\n=== MAC ${mac} ===`);
    for (const s of items) {
      const tag = s.entity_id.split(".")[0];
      const last = s.entity_id.split("_").pop();
      console.log(`  [${tag.padEnd(8)}] ${s.entity_id.padEnd(60)} state=${String(s.state).slice(0, 12).padEnd(12)} (${s.attributes?.friendly_name || ""})`);
    }
  }
  console.log(`\n${wd.length} entities, ${byMac.size} devices`);
  ws.close();
}
