// Probe P100 garage sensors — current state + recent history.
import WebSocket from "ws";

const HOST = process.env.HA_HOST;
const TOKEN = process.env.HA_TOKEN;
const ENTITIES = [
  "sensor.porta_garage_orientamento",
  "binary_sensor.porta_garage_status_contact",
  "sensor.porta_garage_status_device_posture",
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
ws.on("message", async (data) => {
  const m = JSON.parse(data.toString());
  if (m.type === "auth_required")
    return ws.send(JSON.stringify({ type: "auth", access_token: TOKEN }));
  if (m.type === "auth_ok") {
    try {
      await run();
    } catch (e) {
      console.error(e);
      process.exit(1);
    }
  }
  if (m.id != null && pending.has(m.id)) {
    const p = pending.get(m.id);
    pending.delete(m.id);
    if (m.success === false) p.rej(new Error(JSON.stringify(m.error)));
    else p.res(m.result);
  }
});

async function run() {
  const states = await send("get_states");
  console.log("=== Current ===");
  for (const eid of ENTITIES) {
    const s = states.find((x) => x.entity_id === eid);
    console.log(eid, s?.state ?? "MISSING");
  }

  const start = new Date(Date.now() - 14 * 24 * 3600 * 1000).toISOString();
  for (const eid of ENTITIES) {
    console.log(`\n=== History ${eid} (14d, last 40 changes) ===`);
    const hist = await send("call_service", {
      domain: "recorder",
      service: "get_statistics",
      service_data: { statistic_ids: [], start_time: start },
    }).catch(() => null);
    void hist;
    const rows = await send("call_service", {
      type: "execute",
      domain: "history",
      service: "get_significant_states",
      service_data: {
        entity_ids: [eid],
        start_time: start,
        minimal_response: true,
        no_attributes: true,
      },
    }).catch(async () => {
      // Fallback: history WS may not exist — use logbook-style probe via REST not available.
      return null;
    });
    if (!rows) {
      console.log("(history unavailable via WS)");
      continue;
    }
    const flat = [];
    for (const [entity, changes] of Object.entries(rows)) {
      for (const c of changes) flat.push({ entity, ...c });
    }
    flat.sort((a, b) => String(a.last_changed).localeCompare(String(b.last_changed)));
    for (const c of flat.slice(-40)) {
      console.log(
        String(c.last_changed).slice(0, 19),
        c.state,
      );
    }
  }
  ws.close();
  process.exit(0);
}
setTimeout(() => process.exit(2), 60_000);
