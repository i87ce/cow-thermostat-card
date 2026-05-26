// One-shot script: bring the cow-mobile-dashboard-card "Spegni/Accendi
// tutte" + "Apri/Chiudi tutte" master buttons to 100% coverage.
//
// Two actions, both idempotent:
//   1. Add `light.led_tv_soggiorno` (label "Strip TV") to the "Sala &
//      Cucina" room in `dashboard-mobile`. That puts it under the
//      master buttons AND surfaces it in the Sala drawer Lights tab on
//      the XL.
//   2. Hide `light.zw_nabu_router` from the entity registry
//      (`hidden_by: user`). It's the status LED on the Nabu Casa Z-Wave
//      stick — not a real bulb, never intended for the master button.
//
// Dry-run by default; pass --apply to mutate HA.
//
//   HA_HOST=... HA_TOKEN=... node scripts/ha-fix-mobile-master-coverage.mjs
//   HA_HOST=... HA_TOKEN=... node scripts/ha-fix-mobile-master-coverage.mjs --apply
import WebSocket from "ws";

const APPLY = process.argv.includes("--apply");
const HOST = process.env.HA_HOST;
const TOKEN = process.env.HA_TOKEN;
if (!HOST || !TOKEN) { console.error("Set HA_HOST and HA_TOKEN"); process.exit(1); }

const ROOM_NAME = "Sala & Cucina";
const NEW_LIGHT = { entity: "light.led_tv_soggiorno", label: "Strip TV" };
const HIDE_LIGHT = "light.zw_nabu_router";

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
  if (m.type === "auth_invalid") { console.error("auth_invalid"); process.exit(1); }
  if (m.type === "auth_ok") return run().catch((e) => { console.error("ERR", e); process.exit(1); });
  if (m.id != null && pending.has(m.id)) {
    const p = pending.get(m.id);
    pending.delete(m.id);
    if (m.success === false) p.rej(new Error(JSON.stringify(m.error)));
    else p.res(m.result);
  }
});
ws.on("error", (e) => { console.error("WS", e.message); process.exit(1); });

async function run() {
  // ── 1. Patch dashboard-mobile ─────────────────────────────────────
  const cfg = await send("lovelace/config", { url_path: "dashboard-mobile" });
  let card = null;
  for (const v of cfg.views ?? []) {
    for (const c of v.cards ?? []) {
      if (c.type === "custom:cow-mobile-dashboard-card") { card = c; break; }
    }
    if (card) break;
  }
  if (!card) { console.error("cow-mobile-dashboard-card not found"); process.exit(2); }

  const room = (card.rooms ?? []).find((r) => r.name === ROOM_NAME);
  if (!room) { console.error(`room "${ROOM_NAME}" not found in mobile dashboard`); process.exit(2); }

  if (!Array.isArray(room.lights)) room.lights = [];
  const already = room.lights.some((l) => {
    const eid = typeof l === "string" ? l : l.entity;
    return eid === NEW_LIGHT.entity;
  });

  console.log("=".repeat(70));
  console.log("Mobile dashboard patch");
  console.log("=".repeat(70));
  if (already) {
    console.log(`✓ "${ROOM_NAME}" already contains ${NEW_LIGHT.entity} — no-op`);
  } else {
    console.log(`+ "${ROOM_NAME}".lights[] add: ${JSON.stringify(NEW_LIGHT)}`);
    room.lights.push(NEW_LIGHT);
  }
  console.log(`  new ${ROOM_NAME}.lights:`);
  for (const l of room.lights) {
    const eid = typeof l === "string" ? l : l.entity;
    const lbl = typeof l === "string" ? "" : ` (${l.label ?? ""})`;
    console.log(`    - ${eid}${lbl}`);
  }

  // ── 2. Hide light.zw_nabu_router ─────────────────────────────────
  const regList = await send("config/entity_registry/list");
  const reg = regList.find((e) => e.entity_id === HIDE_LIGHT);
  console.log("\n" + "=".repeat(70));
  console.log("Entity registry patch");
  console.log("=".repeat(70));
  if (!reg) {
    console.log(`! ${HIDE_LIGHT} not found in entity registry — skipping hide`);
  } else if (reg.hidden_by) {
    console.log(`✓ ${HIDE_LIGHT} already hidden (hidden_by="${reg.hidden_by}") — no-op`);
  } else {
    console.log(`+ ${HIDE_LIGHT}: hidden_by=null → "user"`);
  }

  if (!APPLY) {
    console.log("\nDry-run — pass --apply to push to HA.");
    process.exit(0);
  }

  // Apply mutations
  if (!already) {
    await send("lovelace/config/save", { url_path: "dashboard-mobile", config: cfg });
    console.log("\n✓ Saved updated dashboard-mobile config");
  }
  if (reg && !reg.hidden_by) {
    await send("config/entity_registry/update", {
      entity_id: HIDE_LIGHT,
      hidden_by: "user",
    });
    console.log(`✓ Hid ${HIDE_LIGHT} in the entity registry`);
  }
  process.exit(0);
}

setTimeout(() => { console.error("timeout"); process.exit(3); }, 25_000);
