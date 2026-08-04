// Remove legacy music keys from the XL sala-cucina dashboard config.
// Usage:
//   node scripts/ha-patch-xl-remove-music.mjs           (dry-run)
//   APPLY=1 node scripts/ha-patch-xl-remove-music.mjs   (saves)
import WebSocket from "ws";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HOST = process.env.HA_HOST;
const TOKEN = process.env.HA_TOKEN;
const APPLY = process.env.APPLY === "1";
const SLUG = "walldisplay-sala-cucina";

const MUSIC_KEYS = ["media_player", "music_assistant_id"];

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
    return run().catch((e) => {
      console.error(e);
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
  console.error("WS", e.message);
  process.exit(1);
});

async function run() {
  console.log(APPLY ? "── APPLY ──" : "── DRY-RUN ── (set APPLY=1 to save)");
  const cfg = await send("lovelace/config", { url_path: SLUG });

  mkdirSync(BACKUP_DIR, { recursive: true });
  const ts = new Date().toISOString().replace(/[:.]/g, "-");
  const backup = join(BACKUP_DIR, `${SLUG}-remove-music-${ts}.json`);
  writeFileSync(backup, JSON.stringify(cfg, null, 2));
  console.log(`backup → ${backup}`);

  let patched = false;
  const newViews = (cfg.views || []).map((v) => ({
    ...v,
    cards: (v.cards || []).map((c) => {
      if (c.type !== "custom:cow-room-dashboard-card" || patched) return c;
      patched = true;
      const next = { ...c };
      for (const k of MUSIC_KEYS) {
        if (k in next) {
          console.log(`removing key: ${k} = ${JSON.stringify(next[k])}`);
          delete next[k];
        }
      }
      return next;
    }),
  }));
  if (!patched) {
    console.error("cow-room-dashboard-card not found in", SLUG);
    process.exit(1);
  }
  if (APPLY) {
    await send("lovelace/config/save", {
      url_path: SLUG,
      config: { ...cfg, views: newViews },
    });
    console.log("saved.");
  } else {
    console.log("dry-run complete — no changes written.");
  }
  ws.close();
  process.exit(0);
}
