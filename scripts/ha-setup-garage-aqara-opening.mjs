// Aqara P100 on sectional garage door — object mode + orientation/tilt.
// Il contatto Z2M in object mode non è affidabile (resta sempre on).
// Ajax "Garage" (tilt) resta escluso; dashboards leggono orientamento.
//
//   HA_HOST=... HA_TOKEN=... node scripts/ha-setup-garage-aqara-opening.mjs --apply
import WebSocket from "ws";

const APPLY = process.argv.includes("--apply");
const HOST = process.env.HA_HOST;
const TOKEN = process.env.HA_TOKEN;
if (!HOST || !TOKEN) {
  console.error("Set HA_HOST and HA_TOKEN");
  process.exit(1);
}

const DEVICE_IEEE = "0x54ef4410016c90c2";
const DEVICE_NAME = "Porta Garage";
const ORIENT_ENTITY = "sensor.porta_garage_orientamento";
const LEGACY_ORIENT = `sensor.${DEVICE_IEEE}_orientation`;
const GARAGE_AREA = "Garage";
const AJAX_DEVICE_TO_EXCLUDE = "Garage";
const OPENING_ENTITY = ORIENT_ENTITY;

const GARAGE_OPENING = {
  openings_enabled: true,
  areas: [GARAGE_AREA],
  opening_default_kind: "window",
  opening_exclude_devices: [AJAX_DEVICE_TO_EXCLUDE],
  opening_entities: [OPENING_ENTITY],
  opening_garages: [DEVICE_NAME],
};

const SERVIZI_OPENING = {
  opening_exclude_devices: [AJAX_DEVICE_TO_EXCLUDE],
  opening_entities: [OPENING_ENTITY],
  opening_garages: [DEVICE_NAME],
};

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

function patchTarget(target, want) {
  let changed = false;
  for (const [k, v] of Object.entries(want)) {
    if (JSON.stringify(target[k]) !== JSON.stringify(v)) {
      target[k] = v;
      changed = true;
    }
  }
  return changed;
}

async function setSelect(entityId, option) {
  if (!APPLY) {
    console.log(`would set ${entityId} → ${option}`);
    return;
  }
  await send("call_service", {
    domain: "select",
    service: "select_option",
    service_data: { option },
    target: { entity_id: entityId },
  });
  console.log(`set ${entityId} → ${option}`);
}

async function setSwitch(entityId, on) {
  if (!APPLY) {
    console.log(`would turn ${on ? "on" : "off"} ${entityId}`);
    return;
  }
  await send("call_service", {
    domain: "switch",
    service: on ? "turn_on" : "turn_off",
    target: { entity_id: entityId },
  });
  console.log(`${on ? "on" : "off"} ${entityId}`);
}

async function run() {
  const [entities, devices, areas] = await Promise.all([
    send("config/entity_registry/list"),
    send("config/device_registry/list"),
    send("config/area_registry/list"),
  ]);
  const garageAreaId = areas.find(
    (a) => a.name?.toLowerCase() === GARAGE_AREA.toLowerCase(),
  )?.area_id;
  if (!garageAreaId) {
    console.error(`Area "${GARAGE_AREA}" not found`);
    process.exit(2);
  }

  const dev =
    devices.find((d) => d.name === DEVICE_IEEE) ??
    devices.find((d) => d.model === "Multi-state sensor P100");
  if (!dev) {
    console.error("Aqara P100 device not found");
    process.exit(2);
  }

  const orient =
    entities.find((e) => e.entity_id === ORIENT_ENTITY) ??
    entities.find((e) => e.entity_id === LEGACY_ORIENT) ??
    entities.find((e) => e.entity_id === "sensor.porta_garage_status_orientation") ??
    entities.find(
      (e) =>
        e.entity_id.startsWith("sensor.") &&
        e.entity_id.endsWith("_orientation") &&
        (e.device_id === dev.id || e.entity_id.includes("6c90c2")),
    );
  if (!orient) {
    console.error("Aqara orientation entity not found");
    process.exit(2);
  }

  console.log("=== Device registry ===");
  if ((dev.name_by_user ?? dev.name) !== DEVICE_NAME || dev.area_id !== garageAreaId) {
    console.log(`device → "${DEVICE_NAME}" @ ${GARAGE_AREA}`);
    if (APPLY) {
      await send("config/device_registry/update", {
        device_id: dev.id,
        name_by_user: DEVICE_NAME,
        area_id: garageAreaId,
      });
    }
  } else {
    console.log(`device already "${DEVICE_NAME}" in ${GARAGE_AREA}`);
  }

  if (orient.entity_id !== ORIENT_ENTITY || orient.name !== "Orientamento") {
    console.log(`entity ${orient.entity_id} → ${ORIENT_ENTITY} ("Orientamento")`);
    if (APPLY) {
      await send("config/entity_registry/update", {
        entity_id: orient.entity_id,
        new_entity_id: ORIENT_ENTITY,
        name: "Orientamento",
        area_id: garageAreaId,
      });
    }
  } else {
    console.log(`entity already ${ORIENT_ENTITY}`);
  }

  console.log("\n=== P100 object mode (porta sezionale) ===");
  await setSelect(`select.${DEVICE_IEEE}_device_mode`, "object");
  await setSwitch(`switch.${DEVICE_IEEE}_orientation_detection`, true);
  await setSwitch(`switch.${DEVICE_IEEE}_movement_detection`, true);

  console.log("\n=== walldisplay-sala-cucina (Garage) ===");
  const xlCfg = await send("lovelace/config", { url_path: "walldisplay-sala-cucina" });
  const garageRoom = xlCfg.views?.[0]?.cards?.[0]?.rooms?.find(
    (r) => r.name === "Garage",
  );
  if (!garageRoom) {
    console.error("Garage room not found on XL dashboard");
    process.exit(2);
  }
  if (patchTarget(garageRoom, GARAGE_OPENING) && APPLY) {
    await send("lovelace/config/save", {
      url_path: "walldisplay-sala-cucina",
      config: xlCfg,
    });
    console.log("✓ saved walldisplay-sala-cucina");
  } else {
    console.log("Garage room already configured");
  }

  console.log("\n=== dashboard-mobile (Servizi) ===");
  const mobCfg = await send("lovelace/config", { url_path: "dashboard-mobile" });
  let mobCard = null;
  for (const v of mobCfg.views ?? []) {
    for (const c of v.cards ?? []) {
      if (c.type === "custom:cow-mobile-dashboard-card") mobCard = c;
    }
  }
  const servizi = mobCard?.rooms?.find((r) => r.name === "Servizi");
  if (!servizi) {
    console.error("Servizi room not found");
    process.exit(2);
  }
  const serviziWant = {
    areas: ["Garage", "Lavanderia", "Locale Tecnico"],
    ...SERVIZI_OPENING,
  };
  if (patchTarget(servizi, serviziWant) && APPLY) {
    await send("lovelace/config/save", {
      url_path: "dashboard-mobile",
      config: mobCfg,
    });
    console.log("✓ saved dashboard-mobile");
  } else {
    console.log("Servizi already configured");
  }

  if (!APPLY) console.log("\n(dry-run — pass --apply to save)");
  process.exit(0);
}
setTimeout(() => process.exit(3), 60_000);
