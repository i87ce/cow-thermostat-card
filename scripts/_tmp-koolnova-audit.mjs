// READ-ONLY audit of legacy koolnova modbus entities.
import WebSocket from "ws";

const HOST = process.env.HA_HOST;
const TOKEN = process.env.HA_TOKEN;
if (!HOST || !TOKEN) { console.error("Missing HA_HOST or HA_TOKEN"); process.exit(2); }

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
  if (msg.type === "auth_required") { ws.send(JSON.stringify({ type: "auth", access_token: TOKEN })); return; }
  if (msg.type === "auth_invalid") { console.error("AUTH FAIL"); process.exit(1); }
  if (msg.type === "auth_ok") { run().catch((e) => { console.error(e); process.exit(1); }); return; }
  if (msg.id != null && pending.has(msg.id)) {
    const p = pending.get(msg.id);
    pending.delete(msg.id);
    if (msg.success === false) p.rej(new Error(JSON.stringify(msg.error)));
    else p.res(msg.result);
  }
});

async function run() {
  const [entReg, confEntries, states, devices] = await Promise.all([
    send("config/entity_registry/list"),
    send("config_entries/get"),
    send("get_states"),
    send("config/device_registry/list"),
  ]);
  const ceById = new Map(confEntries.map((c) => [c.entry_id, c]));
  const devById = new Map(devices.map((d) => [d.id, d]));
  const stById = new Map(states.map((s) => [s.entity_id, s]));

  const koolEnts = entReg.filter((e) =>
    (e.entity_id || "").includes("koolnova") ||
    (e.original_name || "").toLowerCase().includes("koolnova") ||
    ((e.platform || "") === "modbus")
  );

  console.log("=== ENTITIES (koolnova / modbus platform) ===");
  for (const e of koolEnts.sort((a,b)=>a.entity_id.localeCompare(b.entity_id))) {
    const ce = e.config_entry_id ? ceById.get(e.config_entry_id) : null;
    const dev = e.device_id ? devById.get(e.device_id) : null;
    const st = stById.get(e.entity_id);
    console.log(`${e.entity_id}`);
    console.log(`   name=${e.name ?? e.original_name ?? ""} platform=${e.platform} disabled=${e.disabled_by ?? "-"} hidden=${e.hidden_by ?? "-"}`);
    console.log(`   integration=${ce ? ce.domain+"/"+(ce.title||"") : "(yaml/none)"} device=${dev? dev.name_by_user||dev.name : "-"}`);
    console.log(`   state=${st ? st.state : "(no state)"}`);
  }

  // Also list states that reference koolnova even if not in registry (yaml modbus entities are usually NOT in registry)
  console.log("\n=== STATES matching koolnova (incl. yaml-only, no registry entry) ===");
  for (const s of states.filter((s)=> s.entity_id.includes("koolnova")).sort((a,b)=>a.entity_id.localeCompare(b.entity_id))) {
    const inReg = koolEnts.some((e)=> e.entity_id === s.entity_id);
    console.log(`${s.entity_id}  state=${s.state}  ${inReg? "" : "[NOT in entity_registry -> likely YAML modbus]"}`);
  }

  // Legacy per-zone climates we intend to remove
  const LEGACY = [
    "climate.koolnova_sala",
    "climate.koolnova_cucina",
    "climate.koolnova_camera_1",
    "climate.koolnova_camera_2",
    "climate.koolnova_camera_3",
    "climate.koolnova_ingresso_pt",
    "sensor.koolnova_temperatura_esterna",
  ];
  console.log("\n=== search/related for each LEGACY entity (who references it) ===");
  for (const eid of LEGACY) {
    try {
      const rel = await send("search/related", { item_type: "entity", item_id: eid });
      console.log(`\n${eid}:`);
      console.log(JSON.stringify(rel, null, 2));
    } catch (e) {
      console.log(`\n${eid}: search/related error ${e.message}`);
    }
  }

  ws.close();
}
