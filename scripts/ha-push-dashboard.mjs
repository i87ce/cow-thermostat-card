// Push a YAML dashboard file into a Home Assistant storage-mode
// dashboard via the WebSocket API. Reads the local YAML, fetches the
// remote config (for backup), then saves the new config.
//
// Env: HA_HOST, HA_TOKEN
// Argv:
//   --url-path=walldisplay-sala-cucina
//   --file=examples/dashboards/walldisplay-sala-cucina.yaml
//   --backup-dir=/tmp/ha-backups
import WebSocket from "ws";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import yaml from "js-yaml";

const HOST = process.env.HA_HOST;
const TOKEN = process.env.HA_TOKEN;
if (!HOST || !TOKEN) {
  console.error("Missing HA_HOST or HA_TOKEN env var");
  process.exit(2);
}

const argMap = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const [k, v] = a.replace(/^--/, "").split("=");
    return [k, v];
  }),
);
const URL_PATH = argMap["url-path"];
const FILE = argMap["file"];
const BACKUP_DIR = argMap["backup-dir"] || "/tmp/ha-backups";
if (!URL_PATH || !FILE) {
  console.error("Usage: --url-path=<path> --file=<yaml> [--backup-dir=...]");
  process.exit(2);
}

const yamlText = readFileSync(resolve(FILE), "utf8");
const localDoc = yaml.load(yamlText);

// The local YAML at examples/dashboards/*.yaml contains:
//   title: ...
//   views: [ ... ]
// HA storage-mode dashboards store the SAME object (title + views +
// view-level config). We push the whole object as-is.
const config = {
  title: localDoc.title,
  views: localDoc.views,
  // Storage mode wants `strategy` or `views`, never both. We use views.
};

const ws = new WebSocket(`wss://${HOST}/api/websocket`);
let id = 1;
const pending = new Map();
function send(type, payload = {}) {
  return new Promise((resolveFn, rejectFn) => {
    const mid = id++;
    pending.set(mid, { resolve: resolveFn, reject: rejectFn });
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
    console.error("AUTH FAIL", msg);
    process.exit(1);
  }
  if (msg.type === "auth_ok") {
    run().catch((e) => {
      console.error("ERROR", e);
      process.exit(1);
    });
    return;
  }
  if (msg.id != null && pending.has(msg.id)) {
    const p = pending.get(msg.id);
    pending.delete(msg.id);
    if (msg.success === false) p.reject(new Error(JSON.stringify(msg.error)));
    else p.resolve(msg.result);
  }
});

ws.on("error", (e) => {
  console.error("WS ERROR", e.message);
  process.exit(1);
});

async function run() {
  // 1. Backup current config
  console.log(`Reading current config for "${URL_PATH}"...`);
  let backup;
  try {
    backup = await send("lovelace/config", { url_path: URL_PATH });
  } catch (e) {
    if (String(e.message).includes("config_not_found")) {
      console.log("(no existing config — first push)");
      backup = null;
    } else {
      throw e;
    }
  }
  if (backup) {
    mkdirSync(BACKUP_DIR, { recursive: true });
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    const backupFile = `${BACKUP_DIR}/${URL_PATH}-${stamp}.json`;
    writeFileSync(backupFile, JSON.stringify(backup, null, 2));
    console.log(`Backup → ${backupFile}`);
  }

  // 2. Save new config
  console.log(`Saving new config (${config.views?.length ?? 0} views)...`);
  await send("lovelace/config/save", { url_path: URL_PATH, config });
  console.log("✔ saved.");

  // 3. Verify by re-reading
  const fresh = await send("lovelace/config", { url_path: URL_PATH });
  console.log(`Verify: ${fresh.views?.length ?? 0} views, title="${fresh.title}"`);

  ws.close();
  process.exit(0);
}
