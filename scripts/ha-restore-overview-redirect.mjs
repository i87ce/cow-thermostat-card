// Restore the Overview (lovelace) dashboard to a single view containing
// only cow-redirect-card. This is the original pre-merge design: each
// Shelly Wall Display kiosk hits /lovelace, the redirect-card reads the
// authenticated hass.user.name and rewrites window.location to the
// matching /walldisplay-<room>/0?kiosk URL.
//
// Backs up the current Overview to backups/lovelace-<ts>.json before
// saving anything. Set APPLY=1 to actually save.
import WebSocket from "ws";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HOST = process.env.HA_HOST;
const TOKEN = process.env.HA_TOKEN;
const APPLY = process.env.APPLY === "1";

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

  const cur = await send("lovelace/config", { url_path: null }).catch(() =>
    send("lovelace/config", { url_path: "lovelace" }),
  );
  console.log(`Current Overview: title="${cur.title}", views=${cur.views?.length ?? 0}`);

  mkdirSync(BACKUP_DIR, { recursive: true });
  const ts = new Date().toISOString().replace(/[:.]/g, "-");
  const backup = join(BACKUP_DIR, `lovelace-${ts}.json`);
  writeFileSync(backup, JSON.stringify(cur, null, 2));
  console.log(`backup → ${backup}`);

  const newCfg = {
    title: cur.title || "Overview",
    views: [
      {
        title: "Redirect",
        path: "redirect",
        cards: [{ type: "custom:cow-redirect-card" }],
      },
    ],
  };

  if (APPLY) {
    await send("lovelace/config/save", { url_path: null, config: newCfg });
    console.log("✓ Overview replaced with single cow-redirect-card view");
  } else {
    console.log("[dry] would save:", JSON.stringify(newCfg, null, 2));
  }
  ws.close();
}
