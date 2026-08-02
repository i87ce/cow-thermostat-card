// List ALL Home Assistant users (including system_generated/hidden ones)
// and flag the kiosk users referenced by ha-merge-lovelace.mjs.
//
// Usage:
//   HA_HOST=... HA_TOKEN=... node scripts/ha-list-users.mjs
import WebSocket from "ws";

const HOST = process.env.HA_HOST;
const TOKEN = process.env.HA_TOKEN;
if (!HOST || !TOKEN) {
  console.error("Set HA_HOST and HA_TOKEN");
  process.exit(1);
}

const KIOSK_IDS = new Set([
  "1f88e5d9479544708563c1cd4adb18dc", // sala
  "bd25e50163eb4cd89664ba9e89316d1d", // c1 (recreated 2026-05; old 66ba4172… was deleted)
  "92b02cbdbf2f448bb869b23b6b8720fe", // c2
  "c38e6d3f2289466b96b41f458bb466e6", // cp
  "b3368b8a3d6341b382416c1a9d86e329", // bo
  "a94ee22c1ea540aab28ef276a0318319", // sc
  "94f5bab2981a4dc9aa220a22ac101ac4", // bp
  "8901de7d3c15471ba380badf27be9b3c", // st (studio, created 2026-08)
]);

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
  if (m.type === "auth_invalid") { console.error("auth_invalid"); process.exit(1); }
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
  const users = await send("config/auth/list");
  users.sort((a, b) => (a.name || "").localeCompare(b.name || ""));

  const pad = (s, n) => String(s ?? "").padEnd(n).slice(0, n);
  console.log(
    pad("id", 34), pad("name", 22), pad("flags", 28), pad("groups", 30)
  );
  console.log("─".repeat(118));
  for (const u of users) {
    const flags = [
      u.is_owner && "OWNER",
      u.is_active === false && "INACTIVE",
      u.system_generated && "SYSTEM_GENERATED",
      u.local_only && "LOCAL_ONLY",
      KIOSK_IDS.has(u.id) && "★ KIOSK",
    ].filter(Boolean).join(" ");
    const groups = (u.group_ids || []).join(",");
    console.log(pad(u.id, 34), pad(u.name, 22), pad(flags, 28), pad(groups, 30));
  }

  console.log("\nKiosk users summary:");
  for (const kid of KIOSK_IDS) {
    const u = users.find((x) => x.id === kid);
    if (!u) {
      console.log(`  · ${kid}  → NOT FOUND in auth list (?)`);
      continue;
    }
    console.log(
      `  · ${kid}  name="${u.name}"  system_generated=${!!u.system_generated}  local_only=${!!u.local_only}  groups=[${(u.group_ids || []).join(",")}]`
    );
  }
  ws.close();
}
