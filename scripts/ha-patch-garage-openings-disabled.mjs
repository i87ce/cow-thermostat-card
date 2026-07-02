// Disable Ajax opening badges tied to the Garage area on live dashboards.
// The garage door uses a tilt sensor, not a contact — open/closed state
// is unreliable until hardware is swapped.
//
// Patches:
//   - walldisplay-sala-cucina (XL): Garage room → openings_enabled: false
//     (handled by ha-patch-walldisplay-openings.mjs)
//   - dashboard-mobile: remove "Garage" from Servizi.areas (Garage is not
//     its own tile on mobile — it shares the Servizi bucket)
//
// Idempotent: re-run is a no-op when already patched.
//
//   HA_HOST=... HA_TOKEN=... node scripts/ha-patch-garage-openings-disabled.mjs
//   HA_HOST=... HA_TOKEN=... node scripts/ha-patch-garage-openings-disabled.mjs --apply
import WebSocket from "ws";

const APPLY = process.argv.includes("--apply");
const HOST = process.env.HA_HOST;
const TOKEN = process.env.HA_TOKEN;
if (!HOST || !TOKEN) {
  console.error("Set HA_HOST and HA_TOKEN");
  process.exit(1);
}

const MOBILE_DASHBOARD = "dashboard-mobile";
const MOBILE_ROOM = "Servizi";
const GARAGE_AREA = "Garage";

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
  const cfg = await send("lovelace/config", { url_path: MOBILE_DASHBOARD });
  let card = null;
  for (const view of cfg.views ?? []) {
    for (const c of view.cards ?? []) {
      if (c.type === "custom:cow-mobile-dashboard-card") {
        card = c;
        break;
      }
    }
    if (card) break;
  }
  if (!card) {
    console.error("cow-mobile-dashboard-card not found");
    process.exit(2);
  }

  const room = (card.rooms ?? []).find((r) => r.name === MOBILE_ROOM);
  if (!room) {
    console.error(`room "${MOBILE_ROOM}" not found`);
    process.exit(2);
  }

  const areas = Array.isArray(room.areas) ? [...room.areas] : [];
  const before = JSON.stringify(areas);
  const next = areas.filter(
    (a) => typeof a === "string" && a.toLowerCase() !== GARAGE_AREA.toLowerCase(),
  );

  if (JSON.stringify(next) === before) {
    console.log(
      `${MOBILE_DASHBOARD} / "${MOBILE_ROOM}": no-op (Garage not in areas)`,
    );
    process.exit(0);
  }

  console.log(
    `${MOBILE_DASHBOARD} / "${MOBILE_ROOM}": areas ${before} → ${JSON.stringify(next)}`,
  );
  room.areas = next;

  if (APPLY) {
    await send("lovelace/config/save", {
      url_path: MOBILE_DASHBOARD,
      config: cfg,
    });
    console.log("✓ saved");
  } else {
    console.log("(dry-run — pass --apply to save)");
  }
  process.exit(0);
}
setTimeout(() => process.exit(3), 30_000);
