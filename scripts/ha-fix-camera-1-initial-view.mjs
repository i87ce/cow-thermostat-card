// One-shot HA-side drift fix: align walldisplay-camera-1's
// cow-thermostat-card to the same `initial_view: "lights"` default that
// the other 5 small wall-display dashboards already use.
//
// Idempotent: if the card is not currently on `initial_view: "blinds"`,
// the script bails without saving and prints what it found.
//
// Usage:  node scripts/ha-fix-camera-1-initial-view.mjs
import WebSocket from "ws";

const HOST = process.env.HA_HOST;
const TOKEN = process.env.HA_TOKEN;

const SLUG = "walldisplay-camera-1";
const EXPECTED_FROM = "blinds";
const TARGET = "lights";

if (!HOST || !TOKEN) {
  console.error("HA_HOST and HA_TOKEN must be set in the environment");
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
  const m = JSON.parse(data.toString());
  if (m.type === "auth_required")
    return ws.send(JSON.stringify({ type: "auth", access_token: TOKEN }));
  if (m.type === "auth_invalid") {
    console.error("✗ HA auth failed:", m.message);
    process.exit(1);
  }
  if (m.type === "auth_ok")
    return run().catch((e) => {
      console.error("✗", e.message);
      process.exit(1);
    });
  if (m.id != null && pending.has(m.id)) {
    const p = pending.get(m.id);
    pending.delete(m.id);
    if (m.success === false) p.rej(new Error(JSON.stringify(m.error)));
    else p.res(m.result);
  }
});

ws.on("error", (e) => {
  console.error("✗ WS:", e.message);
  process.exit(1);
});

function findThermostatCardPath(cfg) {
  const views = cfg.views || [];
  for (let v = 0; v < views.length; v++) {
    const cards = views[v].cards || [];
    for (let c = 0; c < cards.length; c++) {
      if (cards[c]?.type === "custom:cow-thermostat-card") {
        return { v, c };
      }
    }
  }
  return null;
}

async function run() {
  console.log(`── ${SLUG}: ${EXPECTED_FROM} → ${TARGET} (initial_view) ──`);

  const cfg = await send("lovelace/config", { url_path: SLUG });
  const path = findThermostatCardPath(cfg);
  if (!path) {
    throw new Error(`No custom:cow-thermostat-card found in ${SLUG}`);
  }
  const card = cfg.views[path.v].cards[path.c];

  if (card.initial_view === TARGET) {
    console.log(`✓ already aligned: initial_view="${TARGET}" — nothing to do`);
    ws.close();
    return;
  }
  if (card.initial_view !== EXPECTED_FROM) {
    console.error(
      `✗ unexpected initial_view="${card.initial_view ?? "(unset)"}", expected "${EXPECTED_FROM}". Refusing to overwrite.`,
    );
    console.error("Current card config:");
    console.error(JSON.stringify(card, null, 2));
    process.exit(1);
  }

  const newCard = { ...card, initial_view: TARGET };
  const newViews = cfg.views.map((v, vi) =>
    vi === path.v
      ? {
          ...v,
          cards: v.cards.map((c, ci) => (ci === path.c ? newCard : c)),
        }
      : v,
  );
  const newCfg = { ...cfg, views: newViews };

  await send("lovelace/config/save", { url_path: SLUG, config: newCfg });

  // Re-fetch and verify
  const after = await send("lovelace/config", { url_path: SLUG });
  const afterPath = findThermostatCardPath(after);
  const afterCard = afterPath ? after.views[afterPath.v].cards[afterPath.c] : null;
  if (!afterCard || afterCard.initial_view !== TARGET) {
    throw new Error(
      `save did not persist: re-fetched initial_view="${afterCard?.initial_view ?? "(missing card)"}"`,
    );
  }

  console.log(`✓ camera-1 initial_view: ${EXPECTED_FROM} → ${TARGET}`);
  ws.close();
}
