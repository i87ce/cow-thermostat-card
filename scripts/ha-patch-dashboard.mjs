// Patch the cow-thermostat-card config in a single walldisplay dashboard.
// Reads the current config, mutates the first cow-thermostat-card found via
// the supplied JSON patch (merged into the card object), saves back with
// a timestamped backup.
//
// Usage:
//   node scripts/ha-patch-dashboard.mjs <slug> '<json-patch>'
//   APPLY=1 node scripts/ha-patch-dashboard.mjs walldisplay-camera-1 \
//     '{"lights":[{"entity":"light.led_camera_1","label":"LED"}],"initial_view":"lights"}'
import WebSocket from "ws";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HOST = process.env.HA_HOST;
const TOKEN = process.env.HA_TOKEN;
const APPLY = process.env.APPLY === "1";
const SLUG = process.argv[2];
const PATCH_JSON = process.argv[3];

if (!SLUG || !PATCH_JSON) {
  console.error("Usage: ha-patch-dashboard.mjs <slug> '<json-patch>'");
  process.exit(2);
}
const PATCH = JSON.parse(PATCH_JSON);

const HERE = dirname(fileURLToPath(import.meta.url));
const BACKUP_DIR = join(HERE, "..", "backups");

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
  if (m.type === "auth_ok")
    return run().catch((e) => { console.error(e); process.exit(1); });
  if (m.id != null && pending.has(m.id)) {
    const p = pending.get(m.id);
    pending.delete(m.id);
    if (m.success === false) p.rej(new Error(JSON.stringify(m.error)));
    else p.res(m.result);
  }
});
ws.on("error", (e) => { console.error("WS", e.message); process.exit(1); });

async function run() {
  console.log(APPLY ? "── APPLY ──" : "── DRY-RUN ── (set APPLY=1 to save)");
  console.log(`Slug: ${SLUG}`);
  const cfg = await send("lovelace/config", { url_path: SLUG });

  mkdirSync(BACKUP_DIR, { recursive: true });
  const ts = new Date().toISOString().replace(/[:.]/g, "-");
  const backup = join(BACKUP_DIR, `${SLUG}-${ts}.json`);
  writeFileSync(backup, JSON.stringify(cfg, null, 2));
  console.log(`backup → ${backup}`);

  let patched = false;
  const newViews = (cfg.views || []).map((v) => ({
    ...v,
    cards: (v.cards || []).map((c) => {
      if (c.type === "custom:cow-thermostat-card" && !patched) {
        patched = true;
        return { ...c, ...PATCH };
      }
      return c;
    }),
  }));
  if (!patched) {
    console.error("No cow-thermostat-card found in this dashboard");
    process.exit(1);
  }

  console.log("\nNew card config:");
  for (const v of newViews) {
    for (const c of v.cards || []) {
      if (c.type === "custom:cow-thermostat-card") {
        console.log(JSON.stringify(c, null, 2));
      }
    }
  }

  if (APPLY) {
    await send("lovelace/config/save", { url_path: SLUG, config: { ...cfg, views: newViews } });
    console.log("\n✓ saved");
  } else {
    console.log("\n[dry] not saved (set APPLY=1)");
  }
  ws.close();
}
