// Add the missing `areas` + `opening_*` Ajax-openings overrides to each
// per-room wall-display dashboard. Idempotent: a re-run with no changes
// reports "no-op" for every dashboard and saves nothing.
//
// Drives the dashboard config via HA's lovelace WebSocket API; touches
// only the keys it owns (areas, opening_default_kind, opening_doors,
// opening_windows, opening_garages) on the single cow-thermostat-card
// or the inner room of a cow-room-dashboard-card.
//
//   HA_HOST=... HA_TOKEN=... node scripts/ha-patch-walldisplay-openings.mjs           # dry-run
//   HA_HOST=... HA_TOKEN=... node scripts/ha-patch-walldisplay-openings.mjs --apply
import WebSocket from "ws";

const APPLY = process.argv.includes("--apply");
const HOST = process.env.HA_HOST;
const TOKEN = process.env.HA_TOKEN;
if (!HOST || !TOKEN) {
  console.error("Set HA_HOST and HA_TOKEN");
  process.exit(1);
}

// One entry per per-room dashboard. Each `apply` is invoked with the
// target card (or the inner `rooms[0]` config of an XL dashboard) and
// mutates it in place, returning true if it changed anything.
const PLAN = {
  "walldisplay-camera-1": {
    areas: ["Camera 1"],
    opening_default_kind: "window",
  },
  "walldisplay-camera-2": {
    areas: ["Camera 2"],
    opening_default_kind: "window",
  },
  "walldisplay-camera-padronale": {
    areas: ["Camera Padronale", "Cabina Armadio"],
    opening_default_kind: "window",
  },
  "walldisplay-bagno-ospiti": {
    areas: ["Bagno Ospiti"],
    opening_default_kind: "window",
  },
  "walldisplay-bagno-camera": {
    areas: ["Bagno Padronale"],
    opening_default_kind: "window",
  },
  "walldisplay-scala": {
    areas: ["Ingresso PT"],
    opening_default_kind: "window",
  },
  // XL dashboard — applied to rooms[0]. The "Porta Ingresso" device name
  // already matches the door keyword in inferOpeningKind, so we don't
  // need an explicit opening_doors override for it.
  "walldisplay-sala-cucina": {
    areas: ["Sala", "Cucina"],
    opening_default_kind: "window",
  },
};

const KEYS = [
  "areas",
  "opening_default_kind",
  "opening_doors",
  "opening_windows",
  "opening_garages",
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
  for (const k of KEYS) {
    if (!(k in want)) continue;
    const cur = JSON.stringify(target[k]);
    const next = JSON.stringify(want[k]);
    if (cur !== next) {
      target[k] = want[k];
      changed = true;
    }
  }
  return changed;
}

async function run() {
  let totalChanges = 0;
  for (const [urlPath, want] of Object.entries(PLAN)) {
    const cfg = await send("lovelace/config", { url_path: urlPath });
    const card = cfg.views?.[0]?.cards?.[0];
    if (!card) {
      console.log(`${urlPath}: ⚠️  no first card — skipped`);
      continue;
    }
    let target;
    if (card.type === "custom:cow-thermostat-card") {
      target = card;
    } else if (card.type === "custom:cow-room-dashboard-card") {
      target = card.rooms?.[0];
      if (!target) {
        console.log(`${urlPath}: ⚠️  XL card with no rooms — skipped`);
        continue;
      }
    } else {
      console.log(`${urlPath}: ⚠️  unsupported card type ${card.type}`);
      continue;
    }
    const before = Object.fromEntries(
      KEYS.filter((k) => target[k] !== undefined).map((k) => [k, target[k]]),
    );
    const changed = patchTarget(target, want);
    if (!changed) {
      console.log(`${urlPath}: no-op (${Object.keys(before).join(",") || "empty"})`);
      continue;
    }
    totalChanges++;
    console.log(`${urlPath}: changed`);
    for (const k of KEYS) {
      if (!(k in want)) continue;
      console.log(`    ${k}: ${JSON.stringify(before[k])} → ${JSON.stringify(want[k])}`);
    }
    if (APPLY) {
      await send("lovelace/config/save", { url_path: urlPath, config: cfg });
      console.log(`    ✓ saved`);
    }
  }
  console.log(
    `\nSummary: ${totalChanges} dashboard${totalChanges === 1 ? "" : "s"} would change.${
      APPLY ? "" : "  (dry-run — pass --apply to save)"
    }`,
  );
  process.exit(0);
}
setTimeout(() => process.exit(3), 30_000);
