// Audit the cow-mobile-dashboard-card "Spegni/Accendi tutte luci" and
// "Apri/Chiudi tutte tapparelle" master buttons.
//
// Those buttons act on the union of every `entity` listed under
// `rooms[].lights[*]` and `rooms[].covers[*]` of the
// `dashboard-mobile` lovelace config. This script flags every
// `light.*` / `cover.*` entity in Home Assistant that the buttons
// WOULD NOT touch (or — vice versa — entities referenced in the
// dashboard that no longer exist in HA).
//
// Usage:
//   HA_HOST=... HA_TOKEN=... node scripts/ha-audit-mobile-master-buttons.mjs
//
// Output sections:
//   - Lights in HA missing from dashboard rooms (NOT covered by buttons)
//   - Covers in HA missing from dashboard rooms (NOT covered by buttons)
//   - Dashboard entities that don't exist in HA (stale config)
//   - Summary counts
//
// Filters out hidden / disabled / unavailable / scene / group entities so
// the "missing" list only contains things the user might actually want
// the master button to control.
import WebSocket from "ws";

const HOST = process.env.HA_HOST;
const TOKEN = process.env.HA_TOKEN;
if (!HOST || !TOKEN) {
  console.error("Set HA_HOST and HA_TOKEN");
  process.exit(1);
}

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
  if (m.type === "auth_invalid") {
    console.error("auth_invalid");
    process.exit(1);
  }
  if (m.type === "auth_ok") return run().catch((e) => { console.error("ERR", e); process.exit(1); });
  if (m.id != null && pending.has(m.id)) {
    const p = pending.get(m.id);
    pending.delete(m.id);
    if (m.success === false) p.rej(new Error(JSON.stringify(m.error)));
    else p.res(m.result);
  }
});
ws.on("error", (e) => { console.error("WS", e.message); process.exit(1); });

function pad(s, n) { return String(s).padEnd(n); }

async function run() {
  const [cfg, states, entities, devices, areas] = await Promise.all([
    send("lovelace/config", { url_path: "dashboard-mobile" }),
    send("get_states"),
    send("config/entity_registry/list"),
    send("config/device_registry/list"),
    send("config/area_registry/list"),
  ]);

  const entityById = new Map(entities.map((e) => [e.entity_id, e]));
  const deviceById = new Map(devices.map((d) => [d.id, d]));
  const areaById = new Map(areas.map((a) => [a.area_id, a]));
  function areaForEntity(eid) {
    const e = entityById.get(eid);
    if (!e) return undefined;
    if (e.area_id) return areaById.get(e.area_id)?.name;
    if (e.device_id) {
      const aid = deviceById.get(e.device_id)?.area_id;
      if (aid) return areaById.get(aid)?.name;
    }
    return undefined;
  }
  function friendly(eid) {
    return entityById.get(eid)?.name
      || entityById.get(eid)?.original_name
      || states.find((s) => s.entity_id === eid)?.attributes?.friendly_name
      || "";
  }

  // ── Find the card and collect every referenced light / cover ──────
  let card = null;
  for (const v of cfg.views ?? []) {
    for (const c of v.cards ?? []) {
      if (c.type === "custom:cow-mobile-dashboard-card") { card = c; break; }
    }
    if (card) break;
  }
  if (!card) {
    console.error("cow-mobile-dashboard-card not found in dashboard-mobile");
    process.exit(2);
  }

  const dashLightSet = new Set();
  const dashCoverSet = new Set();
  // Per-room reverse map so we can tell the user which room a covered
  // entity comes from.
  const lightToRooms = new Map();
  const coverToRooms = new Map();

  for (const room of card.rooms ?? []) {
    for (const l of room.lights ?? []) {
      const eid = typeof l === "string" ? l : l.entity;
      if (!eid) continue;
      dashLightSet.add(eid);
      if (!lightToRooms.has(eid)) lightToRooms.set(eid, []);
      lightToRooms.get(eid).push(room.name);
    }
    for (const c of room.covers ?? []) {
      const eid = typeof c === "string" ? c : c.entity;
      if (!eid) continue;
      dashCoverSet.add(eid);
      if (!coverToRooms.has(eid)) coverToRooms.set(eid, []);
      coverToRooms.get(eid).push(room.name);
    }
  }

  // ── Collect every relevant light / cover entity in HA ─────────────
  // We strip:
  //   - hidden / disabled entries in the entity registry
  //   - `light.*_group` and `light.tutte*` aggregators (turning them on
  //     in addition to children is harmless but visually confusing in
  //     this audit; if the user has them, they're a sign of a manual
  //     master that the buttons already replace)
  //   - `cover.*group*` aggregators
  //   - unavailable / unknown state (likely offline integrations the
  //     user has already given up on)
  function relevant(s) {
    const reg = entityById.get(s.entity_id);
    if (reg?.hidden_by) return false;
    if (reg?.disabled_by) return false;
    if (s.state === "unavailable" || s.state === "unknown") return false;
    return true;
  }

  const haLights = states
    .filter((s) => s.entity_id.startsWith("light.") && relevant(s))
    .sort((a, b) => a.entity_id.localeCompare(b.entity_id));
  const haCovers = states
    .filter((s) => s.entity_id.startsWith("cover.") && relevant(s))
    .sort((a, b) => a.entity_id.localeCompare(b.entity_id));

  // ── Diff ──────────────────────────────────────────────────────────
  const missingLights = haLights.filter((s) => !dashLightSet.has(s.entity_id));
  const missingCovers = haCovers.filter((s) => !dashCoverSet.has(s.entity_id));
  const staleLights = [...dashLightSet].filter(
    (eid) => !states.some((s) => s.entity_id === eid),
  );
  const staleCovers = [...dashCoverSet].filter(
    (eid) => !states.some((s) => s.entity_id === eid),
  );

  // ── Report ────────────────────────────────────────────────────────
  console.log("=".repeat(78));
  console.log("Mobile dashboard master-button coverage audit");
  console.log("=".repeat(78));
  console.log(
    `Dashboard rooms:       ${card.rooms?.length ?? 0}`,
  );
  console.log(
    `Dashboard lights ref'd: ${dashLightSet.size}  (master "Spegni/Accendi tutte")`,
  );
  console.log(
    `Dashboard covers ref'd: ${dashCoverSet.size}  (master "Apri/Chiudi tutte")`,
  );
  console.log(
    `HA lights (visible):    ${haLights.length}`,
  );
  console.log(
    `HA covers (visible):    ${haCovers.length}`,
  );

  console.log("\n" + "─".repeat(78));
  console.log(
    `LIGHTS in HA NOT covered by the master buttons (${missingLights.length}):`,
  );
  console.log("─".repeat(78));
  if (missingLights.length === 0) {
    console.log("  ✓ every visible light.* is referenced by some room.");
  } else {
    for (const s of missingLights) {
      const area = areaForEntity(s.entity_id) ?? "—";
      console.log(
        `  ${pad(s.entity_id, 50)} state=${pad(s.state, 12)} area=${pad(area, 22)} "${friendly(s.entity_id)}"`,
      );
    }
  }

  console.log("\n" + "─".repeat(78));
  console.log(
    `COVERS in HA NOT covered by the master buttons (${missingCovers.length}):`,
  );
  console.log("─".repeat(78));
  if (missingCovers.length === 0) {
    console.log("  ✓ every visible cover.* is referenced by some room.");
  } else {
    for (const s of missingCovers) {
      const area = areaForEntity(s.entity_id) ?? "—";
      console.log(
        `  ${pad(s.entity_id, 50)} state=${pad(s.state, 12)} area=${pad(area, 22)} "${friendly(s.entity_id)}"`,
      );
    }
  }

  if (staleLights.length > 0 || staleCovers.length > 0) {
    console.log("\n" + "─".repeat(78));
    console.log("STALE dashboard refs (entity not found in HA):");
    console.log("─".repeat(78));
    for (const eid of staleLights) {
      console.log(`  light:  ${eid}  (rooms: ${lightToRooms.get(eid)?.join(", ")})`);
    }
    for (const eid of staleCovers) {
      console.log(`  cover:  ${eid}  (rooms: ${coverToRooms.get(eid)?.join(", ")})`);
    }
  }

  ws.close();
}
