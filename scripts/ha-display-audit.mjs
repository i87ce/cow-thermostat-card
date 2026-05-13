// Inventory of Shelly Wall Display assets:
//  - HA users (one per display, typically)
//  - Lovelace dashboards (storage + YAML modes)
//  - media_player entities + MA mirrors
//  - Per-user default dashboard / sidebar config
//
// Used to figure out which displays are missing assets and which are
// configured to see dashboards they shouldn't.
import WebSocket from "ws";
const HOST = process.env.HA_HOST;
const TOKEN = process.env.HA_TOKEN;
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
  if (m.type === "auth_required") return ws.send(JSON.stringify({ type: "auth", access_token: TOKEN }));
  if (m.type === "auth_ok") return run().catch((e) => { console.error(e); process.exit(1); });
  if (m.id != null && pending.has(m.id)) {
    const p = pending.get(m.id);
    pending.delete(m.id);
    if (m.success === false) p.rej(new Error(JSON.stringify(m.error)));
    else p.res(m.result);
  }
});

async function run() {
  // 1) Users (HA persons + system users)
  console.log("=== HA Users ===");
  const users = await send("config/auth/list");
  for (const u of users) {
    if (u.system_generated) continue;
    const dashboardId = u.local_only ? "local-only" : "";
    console.log(`  - ${u.name}  (id=${u.id.slice(0,8)}…  admin=${u.is_admin}  groups=${(u.group_ids||[]).join(',')})  ${dashboardId}`);
  }

  // 2) Lovelace dashboards
  console.log("\n=== Lovelace dashboards ===");
  const dashboards = await send("lovelace/dashboards/list");
  for (const d of dashboards) {
    console.log(`  - url_path="${d.url_path}"  title="${d.title}"  mode=${d.mode}  require_admin=${d.require_admin}  show_in_sidebar=${d.show_in_sidebar}`);
  }

  // 3) media_player entities mapped to Wall Display devices + MA mirrors
  console.log("\n=== Display media_player entities ===");
  const states = await send("get_states");
  const displays = states.filter((s) =>
    /display/i.test(s.attributes?.friendly_name || "") &&
    s.entity_id.startsWith("media_player."),
  );
  for (const d of displays) {
    const a = d.attributes;
    const tag = a.supported_features === 152117 ? "[Shelly stock]" : a.supported_features === 7796279 ? "[MA-virtual]" : `[features=${a.supported_features}]`;
    console.log(`  - ${d.entity_id}  ${tag}  state=${d.state}  friendly="${a.friendly_name}"`);
  }

  // 4) MA devices (subset of devices for the MA config entry)
  console.log("\n=== MA devices ===");
  const devices = await send("config/device_registry/list");
  const maDevices = devices.filter((dev) => dev.config_entries?.includes("01KR70XN8WQ46Y3B20BQKHG27P"));
  for (const dev of maDevices) {
    console.log(`  - ${dev.name_by_user ?? dev.name}  (model=${dev.model}, manufacturer=${dev.manufacturer})`);
  }

  // 5) For each non-admin user, default dashboard is stored as a
  //    per-user setting that only the user itself can read (via the
  //    frontend), so we can't read others' from here. Just list users
  //    that exist + which ones look like a display.
  console.log("\n=== Likely display users (non-admin, non-system) ===");
  for (const u of users) {
    if (u.system_generated || u.is_admin) continue;
    console.log(`  - ${u.name}  (id=${u.id.slice(0,8)}…)`);
  }

  ws.close();
}
