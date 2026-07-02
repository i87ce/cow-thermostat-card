// One-shot diagnostics for the "Camera 1" Shelly Wall Display autologin issue.
// - Enumerates Shelly Wall Display devices from the device registry + their
//   MAC (connections) and resolved host/IP from the Shelly config entry.
// - Confirms whether the `c1` kiosk user exists and whether a homeassistant
//   auth-provider credential is still bound to it.
// - Pulls recent system_log entries mentioning auth / login / c1.
import WebSocket from "ws";

const HOST = process.env.HA_HOST;
const TOKEN = process.env.HA_TOKEN;
if (!HOST || !TOKEN) { console.error("Set HA_HOST and HA_TOKEN"); process.exit(2); }

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
  if (m.type === "auth_invalid") { console.error("auth_invalid"); process.exit(1); }
  if (m.type === "auth_ok") return run().catch((e) => { console.error(e); process.exit(1); });
  if (m.id != null && pending.has(m.id)) {
    const p = pending.get(m.id);
    pending.delete(m.id);
    if (m.success === false) p.rej(new Error(JSON.stringify(m.error)));
    else p.res(m.result);
  }
});
ws.on("error", (e) => { console.error("WS", e.message); process.exit(1); });

async function run() {
  // 1) Users
  const users = await send("config/auth/list");
  const c1 = users.find((u) => u.name === "c1");
  console.log("── Users ──");
  console.log(`  c1 user present: ${c1 ? "YES id=" + c1.id : "NO (missing!)"}`);
  console.log(`  kiosk users: ${users.filter(u => ["sala","c1","c2","cp","bo","sc","bp"].includes(u.name)).map(u=>u.name).sort().join(", ")}`);

  // 2) Devices: find Shelly Wall Displays
  const devices = await send("config/device_registry/list");
  const entries = await send("config_entries/get");
  const entryById = new Map(entries.map((e) => [e.entry_id, e]));

  const wd = devices.filter((d) => {
    const hay = `${d.name || ""} ${d.name_by_user || ""} ${d.model || ""}`.toLowerCase();
    return hay.includes("wall display") || hay.includes("walldisplay") || hay.includes("sawd");
  });
  console.log(`\n── Shelly Wall Display devices (${wd.length}) ──`);
  for (const d of wd) {
    const macs = (d.connections || []).filter(([t]) => t === "mac").map(([, v]) => v);
    const hosts = (d.config_entries || [])
      .map((eid) => entryById.get(eid))
      .filter(Boolean)
      .map((e) => e.data?.host || e.data?.ip_address || e?.options?.host)
      .filter(Boolean);
    console.log(
      `  • ${(d.name_by_user || d.name || "?").padEnd(26)} ` +
      `mac=[${macs.join(",")}] host=[${hosts.join(",")}] ` +
      `disabled=${d.disabled_by || "no"}`,
    );
  }

  // 3) Shelly config entries (host/IP straight from the integration)
  const shelly = entries.filter((e) => (e.domain || "").toLowerCase() === "shelly");
  console.log(`\n── Shelly config entries (${shelly.length}) ──`);
  for (const e of shelly) {
    console.log(
      `  • ${(e.title || "?").padEnd(28)} host=${e.data?.host || "?"} ` +
      `state=${e.state} reason=${e.reason || ""}`,
    );
  }

  // 4) Logs
  console.log(`\n── system_log entries mentioning auth/login/c1 ──`);
  try {
    const logs = await send("system_log/list");
    const hits = (logs || []).filter((l) => {
      const s = `${l.name || ""} ${(l.message || []).join(" ")}`.toLowerCase();
      return s.includes("auth") || s.includes("login") || s.includes("token") || /\bc1\b/.test(s) || s.includes("unauthor");
    });
    if (hits.length === 0) console.log("  (no matching entries)");
    for (const l of hits.slice(0, 20)) {
      const when = l.timestamp ? new Date(l.timestamp * 1000).toISOString() : "?";
      console.log(`  [${l.level}] ${when} ${l.name}`);
      console.log(`      ${(l.message || []).join(" / ").slice(0, 300)}`);
    }
  } catch (e) {
    console.log("  system_log/list failed:", e.message);
  }

  ws.close();
}
