// One-shot updater for the XL dashboard's scenes array.
// Reads `walldisplay-sala-cucina`, finds the cow-room-dashboard-card,
// replaces its `scenes` array with 4 new "all lights/blinds" buttons,
// backs up the previous config, and saves.
//
// Usage:
//   node scripts/ha-patch-xl-scenes.mjs           (dry-run)
//   APPLY=1 node scripts/ha-patch-xl-scenes.mjs   (saves)
import WebSocket from "ws";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HOST = process.env.HA_HOST;
const TOKEN = process.env.HA_TOKEN;
const APPLY = process.env.APPLY === "1";
const SLUG = "walldisplay-sala-cucina";

const HERE = dirname(fileURLToPath(import.meta.url));
const BACKUP_DIR = join(HERE, "..", "backups");

const NEW_SCENES = [
  { name: "Luci ON",        icon: "💡", accent: "#FFC72E", service: "light.turn_on"   },
  { name: "Luci OFF",       icon: "💤", accent: "#5C5C66", service: "light.turn_off"  },
  { name: "Tapparelle SU",  icon: "🔼", accent: "#66BFFF", service: "cover.open_cover"  },
  { name: "Tapparelle GIÙ", icon: "🔽", accent: "#3A3A4A", service: "cover.close_cover" },
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
      if (c.type === "custom:cow-room-dashboard-card" && !patched) {
        patched = true;
        const old = c.scenes ?? [];
        console.log(`\nold scenes (${old.length}):`);
        for (const s of old) console.log(`  - ${s.name} → ${s.service}`);
        console.log(`\nnew scenes (${NEW_SCENES.length}):`);
        for (const s of NEW_SCENES) console.log(`  - ${s.name} ${s.icon} → ${s.service}`);
        return { ...c, scenes: NEW_SCENES };
      }
      return c;
    }),
  }));
  if (!patched) {
    console.error("\nNo cow-room-dashboard-card found in this dashboard");
    process.exit(1);
  }

  if (APPLY) {
    await send("lovelace/config/save", { url_path: SLUG, config: { ...cfg, views: newViews } });
    console.log("\n✓ saved");
  } else {
    console.log("\n[dry] not saved");
  }
  ws.close();
}
