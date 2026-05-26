// Derive the `areas: [...]` field for every room in dashboard-mobile by
// reading the HA area assigned to each entity the room references
// (climate, temp, humidity, lights, covers). Prints a JSON diff and,
// when invoked with --apply, pushes the updated config back to HA.
//
//   HA_HOST=... HA_TOKEN=... node scripts/ha-derive-mobile-areas.mjs
//   HA_HOST=... HA_TOKEN=... node scripts/ha-derive-mobile-areas.mjs --apply
import WebSocket from "ws";

const APPLY = process.argv.includes("--apply");
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

ws.on("message", async (data) => {
  const m = JSON.parse(data.toString());
  if (m.type === "auth_required")
    return ws.send(JSON.stringify({ type: "auth", access_token: TOKEN }));
  if (m.type === "auth_invalid") {
    console.error("auth_invalid");
    process.exit(1);
  }
  if (m.type === "auth_ok") {
    try {
      await run();
    } catch (e) {
      console.error("ERR", e);
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
ws.on("error", (e) => {
  console.error("WS", e.message);
  process.exit(1);
});

async function run() {
  // Bootstrap registries: entities, devices, areas.
  const [entities, devices, areas] = await Promise.all([
    send("config/entity_registry/list"),
    send("config/device_registry/list"),
    send("config/area_registry/list"),
  ]);
  const entityById = new Map(entities.map((e) => [e.entity_id, e]));
  const deviceById = new Map(devices.map((d) => [d.id, d]));
  const areaById = new Map(areas.map((a) => [a.area_id, a]));

  function areaForEntity(entityId) {
    const e = entityById.get(entityId);
    if (!e) return undefined;
    if (e.area_id) return e.area_id;
    if (e.device_id) return deviceById.get(e.device_id)?.area_id;
    return undefined;
  }
  function areaName(id) {
    return id ? areaById.get(id)?.name ?? id : undefined;
  }

  // Load the dashboard-mobile lovelace config.
  const cfg = await send("lovelace/config", { url_path: "dashboard-mobile" });
  // Find the cow-mobile-dashboard-card.
  let cardRef = null;
  let viewRef = null;
  for (const view of cfg.views ?? []) {
    for (const card of view.cards ?? []) {
      if (card.type === "custom:cow-mobile-dashboard-card") {
        cardRef = card;
        viewRef = view;
        break;
      }
    }
    if (cardRef) break;
  }
  if (!cardRef) {
    console.error("cow-mobile-dashboard-card not found in dashboard-mobile");
    process.exit(2);
  }

  // Pass 1: derive a raw area set for every room from its entities.
  const rawByRoom = new Map();
  for (const room of cardRef.rooms ?? []) {
    const candidateIds = new Set();
    const pushEnt = (eid) => {
      if (typeof eid !== "string") return;
      const aid = areaForEntity(eid);
      if (aid) candidateIds.add(aid);
    };
    pushEnt(room.climate);
    pushEnt(room.temp);
    pushEnt(room.humidity);
    for (const l of room.lights ?? []) pushEnt(typeof l === "string" ? l : l.entity);
    for (const c of room.covers ?? []) pushEnt(typeof c === "string" ? c : c.entity);
    rawByRoom.set(room.name, candidateIds);
  }

  // Pass 2: for every room that already has a manual `areas:` list, treat
  // those areas as "claimed" so other rooms don't steal them. This stops
  // the "Servizi" bucket from grabbing Sala/Ingresso PT just because a
  // stray light or cover entity in that room lives in those areas.
  // The mobile YAML uses display names, so we resolve them to IDs first.
  const nameToId = new Map(areas.map((a) => [a.name.toLowerCase(), a.area_id]));
  const claimedByOthers = new Map(); // roomName -> Set<area_id>
  for (const room of cardRef.rooms ?? []) {
    const claimed = new Set();
    for (const otherRoom of cardRef.rooms ?? []) {
      if (otherRoom.name === room.name) continue;
      const manual = Array.isArray(otherRoom.areas) ? otherRoom.areas : null;
      const source = manual ?? [...(rawByRoom.get(otherRoom.name) ?? [])]
        .map(areaName)
        .filter((n) => !!n);
      for (const a of source) {
        const aid = typeof a === "string" ? nameToId.get(a.toLowerCase()) : null;
        if (aid) claimed.add(aid);
      }
    }
    claimedByOthers.set(room.name, claimed);
  }

  const updates = [];
  for (const room of cardRef.rooms ?? []) {
    const raw = rawByRoom.get(room.name) ?? new Set();
    const claimed = claimedByOthers.get(room.name) ?? new Set();
    // A room keeps every area it owns directly, PLUS the areas it brings
    // in via its own entities that no other room has already claimed.
    const ownAreas = new Set();
    const currentManual = Array.isArray(room.areas)
      ? room.areas
          .map((n) => nameToId.get(n.toLowerCase()))
          .filter((x) => !!x)
      : [];
    for (const aid of currentManual) ownAreas.add(aid);
    for (const aid of raw) {
      if (!claimed.has(aid)) ownAreas.add(aid);
    }
    const derivedAreas = [...ownAreas]
      .map(areaName)
      .filter((n) => !!n)
      .sort();
    const current = Array.isArray(room.areas) ? room.areas.slice().sort() : [];
    const changed = JSON.stringify(derivedAreas) !== JSON.stringify(current);
    updates.push({
      name: room.name,
      currentAreas: current,
      derivedAreas,
      changed,
    });
  }

  // Pretty print summary.
  console.log("=== Proposed areas per room ===\n");
  for (const u of updates) {
    const flag = u.derivedAreas.length === 0 ? "  (no entities mapped to areas)" : "";
    console.log(`• ${u.name}`);
    if (u.currentAreas.length > 0)
      console.log(`    current: [${u.currentAreas.join(", ")}]`);
    console.log(`    derived: [${u.derivedAreas.join(", ")}]${flag}`);
    if (u.changed) console.log(`    ⟶ WILL CHANGE`);
  }
  const changes = updates.filter((u) => u.changed).length;
  console.log(`\nSummary: ${changes} room${changes === 1 ? "" : "s"} would change.`);

  if (!APPLY) {
    console.log("\nDry-run — pass --apply to push to HA.");
    process.exit(0);
  }

  // Mutate the config in-place: set room.areas to derivedAreas.
  for (const u of updates) {
    const room = cardRef.rooms.find((r) => r.name === u.name);
    if (room) {
      if (u.derivedAreas.length > 0) room.areas = u.derivedAreas;
      else delete room.areas;
    }
  }
  await send("lovelace/config/save", {
    url_path: "dashboard-mobile",
    config: cfg,
  });
  console.log("\n✓ Saved updated dashboard-mobile config");
  process.exit(0);
}

setTimeout(() => process.exit(3), 20_000);
