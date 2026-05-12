// Force HACS to refresh a single repository (poll GitHub for new releases),
// then trigger download of the latest available version.
import WebSocket from "ws";
const HOST = process.env.HA_HOST;
const TOKEN = process.env.HA_TOKEN;
const REPO = process.argv[2] || "i87ce/cow-thermostat-card";

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
  const msg = JSON.parse(data.toString());
  if (msg.type === "auth_required") {
    ws.send(JSON.stringify({ type: "auth", access_token: TOKEN }));
    return;
  }
  if (msg.type === "auth_invalid") { console.error("AUTH FAIL"); process.exit(1); }
  if (msg.type === "auth_ok") {
    run().catch((e) => { console.error("ERR", e); process.exit(1); });
    return;
  }
  if (msg.id != null && pending.has(msg.id)) {
    const p = pending.get(msg.id);
    pending.delete(msg.id);
    if (msg.success === false) p.rej(new Error(JSON.stringify(msg.error)));
    else p.res(msg.result);
  }
});

ws.on("error", (e) => { console.error("WS ERROR", e.message); process.exit(1); });

async function run() {
  const before = (await send("hacs/repositories/list")).find(r => r.full_name === REPO);
  console.log(`Before: installed=${before.installed_version}, available=${before.available_version}, id=${before.id}`);

  // Try a known refresh command. HACS WS schema varies by version.
  for (const cmd of [
    { type: "hacs/repository/refresh", repository: String(before.id) },
    { type: "hacs/repository", action: "refresh", repository: String(before.id) },
    { type: "hacs/repository", action: "update", repository: String(before.id) },
  ]) {
    try {
      console.log(`Trying ${cmd.type}${cmd.action ? `(${cmd.action})` : ""}...`);
      const r = await send(cmd.type, Object.fromEntries(Object.entries(cmd).filter(([k]) => k !== "type")));
      console.log("OK", JSON.stringify(r ?? "<no result>"));
      break;
    } catch (e) {
      console.log(`  → fail: ${e.message}`);
    }
  }

  // Re-fetch state
  await new Promise(r => setTimeout(r, 2000));
  const after = (await send("hacs/repositories/list")).find(r => r.full_name === REPO);
  console.log(`After:  installed=${after.installed_version}, available=${after.available_version}`);

  if (after.installed_version !== after.available_version) {
    console.log("Downloading...");
    try {
      const r = await send("hacs/repository/download", {
        repository: String(after.id),
        version: after.available_version,
      });
      console.log("Download OK:", JSON.stringify(r));
    } catch (e) {
      console.log("Download failed:", e.message);
    }
    await new Promise(r => setTimeout(r, 2000));
    const fin = (await send("hacs/repositories/list")).find(r => r.full_name === REPO);
    console.log(`Final:  installed=${fin.installed_version}, available=${fin.available_version}`);
  }
  ws.close();
}
