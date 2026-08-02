// Swap every reference to one weather entity with another across the
// given lovelace dashboards. Timestamped backup per dashboard, dry-run
// by default.
//
// Usage:
//   node scripts/ha-swap-weather-entity.mjs <from> <to> <slug> [slug…]
//   APPLY=1 node scripts/ha-swap-weather-entity.mjs \
//     weather.pirateweather weather.openweathermap \
//     walldisplay-sala-cucina dashboard-mobile
import WebSocket from "ws";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HOST = process.env.HA_HOST;
const TOKEN = process.env.HA_TOKEN;
const APPLY = process.env.APPLY === "1";
const [FROM, TO, ...SLUGS] = process.argv.slice(2);

if (!FROM || !TO || SLUGS.length === 0) {
  console.error("Usage: ha-swap-weather-entity.mjs <from> <to> <slug> [slug…]");
  process.exit(2);
}

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

// Replace only exact string values — never substrings of longer ids.
function swap(node) {
  if (typeof node === "string") return node === FROM ? TO : node;
  if (Array.isArray(node)) return node.map(swap);
  if (node && typeof node === "object")
    return Object.fromEntries(Object.entries(node).map(([k, v]) => [k, swap(v)]));
  return node;
}

function countRefs(node) {
  if (typeof node === "string") return node === FROM ? 1 : 0;
  if (Array.isArray(node)) return node.reduce((n, v) => n + countRefs(v), 0);
  if (node && typeof node === "object")
    return Object.values(node).reduce((n, v) => n + countRefs(v), 0);
  return 0;
}

async function run() {
  console.log(APPLY ? "── APPLY ──" : "── DRY-RUN ── (set APPLY=1 to save)");
  console.log(`${FROM} → ${TO}\n`);
  mkdirSync(BACKUP_DIR, { recursive: true });

  for (const slug of SLUGS) {
    const cfg = await send("lovelace/config", { url_path: slug });
    const n = countRefs(cfg);
    console.log(`${slug}: ${n} reference(s)`);
    if (n === 0) continue;

    const ts = new Date().toISOString().replace(/[:.]/g, "-");
    const backup = join(BACKUP_DIR, `${slug}-${ts}.json`);
    writeFileSync(backup, JSON.stringify(cfg, null, 2));
    console.log(`  backup → ${backup}`);

    if (APPLY) {
      await send("lovelace/config/save", { url_path: slug, config: swap(cfg) });
      console.log("  ✓ saved");
    } else {
      console.log("  [dry] not saved");
    }
  }
  ws.close();
}
