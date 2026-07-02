// Add `system_climate: climate.casa_aria` to cow-mobile-dashboard-card and
// cow-room-dashboard-card (XL) if missing.
//
//   HA_HOST=... HA_TOKEN=... node scripts/ha-patch-system-climate.mjs
//   HA_HOST=... HA_TOKEN=... node scripts/ha-patch-system-climate.mjs --apply
import WebSocket from "ws";

const HOST = process.env.HA_HOST;
const TOKEN = process.env.HA_TOKEN;
const APPLY = process.argv.includes("--apply");
const SYSTEM = "climate.casa_aria";

if (!HOST || !TOKEN) {
  console.error("Missing HA_HOST or HA_TOKEN");
  process.exit(2);
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
  const msg = JSON.parse(data.toString());
  if (msg.type === "auth_required") {
    ws.send(JSON.stringify({ type: "auth", access_token: TOKEN }));
    return;
  }
  if (msg.type === "auth_invalid") {
    console.error("AUTH FAIL");
    process.exit(1);
  }
  if (msg.type === "auth_ok") {
    run().catch((e) => {
      console.error(e);
      process.exit(1);
    });
    return;
  }
  if (msg.id != null && pending.has(msg.id)) {
    const p = pending.get(msg.id);
    pending.delete(msg.id);
    if (msg.success === false) p.rej(new Error(JSON.stringify(msg.error)));
    else p.res(msg.result);
  }
});

async function patchDashboard(urlPath) {
  const cfg = await send("lovelace/config", { url_path: urlPath });
  let changed = false;
  for (const view of cfg.views ?? []) {
    for (const card of view.cards ?? []) {
      if (card.type === "custom:cow-mobile-dashboard-card") {
        if (card.system_climate !== SYSTEM) {
          console.log(`[${urlPath}] mobile: system_climate ${card.system_climate ?? "(missing)"} → ${SYSTEM}`);
          card.system_climate = SYSTEM;
          changed = true;
        }
      }
      if (card.type === "custom:cow-room-dashboard-card") {
        if (card.system_climate !== SYSTEM) {
          console.log(`[${urlPath}] XL: system_climate ${card.system_climate ?? "(missing)"} → ${SYSTEM}`);
          card.system_climate = SYSTEM;
          changed = true;
        }
      }
    }
  }
  if (!changed) {
    console.log(`[${urlPath}] already has system_climate`);
    return;
  }
  if (APPLY) {
    await send("lovelace/config/save", { url_path: urlPath, config: cfg });
    console.log(`[${urlPath}] ✓ saved`);
  } else {
    console.log(`[${urlPath}] dry-run — pass --apply to save`);
  }
}

async function run() {
  await patchDashboard("dashboard-mobile");
  await patchDashboard("walldisplay-sala-cucina");
  ws.close();
}
