// Hunt for any Shelly Wall Display device that's *not* one of the
// already-known ones — could be the Bagno Padronale display that
// was activated but didn't register a friendly entity yet.
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
  const devices = await send("config/device_registry/list");
  console.log("=== All Shelly Wall Display devices ===");
  const shellies = devices.filter((d) =>
    d.manufacturer === "Shelly" &&
    /Wall.*Display/i.test(d.model || ""),
  );
  for (const d of shellies) {
    const conn = (d.connections || []).map(c => c.join(":")).join(", ");
    console.log(`  - ${d.name_by_user ?? d.name}  model="${d.model}"  area_id=${d.area_id}  ${conn}`);
  }

  console.log("\n=== All entities of every Shelly Wall Display ===");
  const entities = await send("config/entity_registry/list");
  for (const dev of shellies) {
    console.log(`\n  ── ${dev.name_by_user ?? dev.name} (id=${dev.id.slice(0,8)}…) ──`);
    const ents = entities.filter((e) => e.device_id === dev.id);
    for (const e of ents) {
      console.log(`    ${e.entity_id}  domain=${e.entity_id.split(".")[0]}  disabled=${e.disabled_by ?? "no"}  name="${e.name ?? e.original_name ?? ""}"`);
    }
  }

  // Areas
  console.log("\n=== Areas ===");
  const areas = await send("config/area_registry/list");
  for (const a of areas) {
    console.log(`  - ${a.name}  (id=${a.area_id})`);
  }

  ws.close();
}
