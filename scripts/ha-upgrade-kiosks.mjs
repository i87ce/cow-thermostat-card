// Upgrade every walldisplay-* kiosk dashboard from cow-kiosk-card v1
// to cow-thermostat-card v1.0.0 with the new YAML schema:
//   type:  custom:cow-thermostat-card
//   room, climate?, outdoor_temp?, local_humidity?, local_temp?, initial_view
//   lights: [{ entity, label }]
//   covers: [{ entity, label }]
//
// Backs up each dashboard's pre-upgrade config to backups/walldisplay-<slug>-<ts>.json
// before saving anything. Pass APPLY=1 to actually save (default is dry-run).
import WebSocket from "ws";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HOST = process.env.HA_HOST;
const TOKEN = process.env.HA_TOKEN;
const APPLY = process.env.APPLY === "1";

const HERE = dirname(fileURLToPath(import.meta.url));
const BACKUP_DIR = join(HERE, "..", "backups");

const SLUGS = [
  "walldisplay-camera-1",
  "walldisplay-camera-2",
  "walldisplay-camera-padronale",
  "walldisplay-bagno-ospiti",
  "walldisplay-scala",
  "walldisplay-bagno-camera",
];

function autoLabel(entityId, room) {
  const obj = entityId.split(".")[1] ?? entityId;
  const slug = (room || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  let s = obj.toLowerCase();
  if (slug.length > 0) {
    s = s
      .replace(new RegExp(`^${slug}_`), "")
      .replace(new RegExp(`_${slug}$`), "")
      .replace(new RegExp(`_${slug}_`), "_");
  }
  s = s.replace(/^(led|luce|light|cover|tapparella|blind|tenda)_/, "");
  if (s.length === 0) s = obj;
  return s
    .split("_")
    .filter((p) => p.length > 0)
    .map((p) => p[0].toUpperCase() + p.slice(1))
    .join(" ");
}

function asArray(v) {
  if (v == null) return [];
  return Array.isArray(v) ? v : [v];
}

function devicesFromLegacy(rawEntities, rawLabels, room) {
  const arr = asArray(rawEntities);
  const labels = asArray(rawLabels);
  return arr.map((e, i) => ({
    entity: e,
    label:
      labels[i] && typeof labels[i] === "string" && labels[i].length > 0
        ? labels[i]
        : autoLabel(e, room),
  }));
}

function upgradeCard(old) {
  const room = old.room || "Room";
  const next = {
    type: "custom:cow-thermostat-card",
    room,
  };
  if (old.climate) next.climate = old.climate;
  const lights = devicesFromLegacy(old.light, old.light_labels, room);
  const covers = devicesFromLegacy(old.cover, old.cover_labels, room);
  if (lights.length > 0) next.lights = lights;
  if (covers.length > 0) next.covers = covers;
  if (old.outdoor_temp) next.outdoor_temp = old.outdoor_temp;
  if (old.local_temp) next.local_temp = old.local_temp;
  if (old.local_humidity) next.local_humidity = old.local_humidity;
  if (old.initial_view) next.initial_view = old.initial_view;
  return next;
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
  mkdirSync(BACKUP_DIR, { recursive: true });
  const ts = new Date().toISOString().replace(/[:.]/g, "-");

  for (const slug of SLUGS) {
    console.log(`\n=== ${slug} ===`);
    const cfg = await send("lovelace/config", { url_path: slug });
    const backupPath = join(BACKUP_DIR, `${slug}-${ts}.json`);
    writeFileSync(backupPath, JSON.stringify(cfg, null, 2));
    console.log(`  backup → ${backupPath}`);

    const newViews = (cfg.views || []).map((v) => ({
      ...v,
      cards: (v.cards || []).map((c) => {
        if (c.type === "custom:cow-kiosk-card") {
          const upgraded = upgradeCard(c);
          console.log(
            `  card upgraded: ${c.type} → ${upgraded.type}  ` +
              `(lights=${(upgraded.lights || []).length}, covers=${(upgraded.covers || []).length})`,
          );
          return upgraded;
        }
        console.log(`  card unchanged: ${c.type}`);
        return c;
      }),
    }));

    const newCfg = { ...cfg, views: newViews };
    if (APPLY) {
      await send("lovelace/config/save", { url_path: slug, config: newCfg });
      console.log(`  ✓ saved`);
    } else {
      console.log(`  [dry] would save:`);
      for (const v of newViews) {
        for (const c of v.cards || []) {
          if (c.type === "custom:cow-thermostat-card") {
            console.log(JSON.stringify(c, null, 2).split("\n").map((l) => "    " + l).join("\n"));
          }
        }
      }
    }
  }
  ws.close();
}
