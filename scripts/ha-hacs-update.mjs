// Find a HACS repository and trigger an update via the HACS WS API.
import WebSocket from "ws";
const HOST = process.env.HA_HOST;
const TOKEN = process.env.HA_TOKEN;
const REPO_NAME = process.argv[2] || "i87ce/cow-thermostat-card";

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
  // List all HACS repositories via the standard HACS WS API
  const repos = await send("hacs/repositories/list");
  const match = repos.find((r) => r.full_name === REPO_NAME);
  if (!match) {
    console.error(`Repo "${REPO_NAME}" not found in HACS. First few entries:`);
    console.log(repos.slice(0, 5).map(r => r.full_name).join("\n"));
    process.exit(1);
  }
  console.log(`Found: ${match.full_name}`);
  console.log(`  Installed version: ${match.installed_version ?? match.installed}`);
  console.log(`  Available version: ${match.available_version}`);
  console.log(`  ID: ${match.id}`);

  if (match.installed_version === match.available_version) {
    console.log("Already up to date.");
    ws.close();
    return;
  }

  // Trigger update — HACS WS command
  console.log("Triggering update via hacs/repository/download...");
  try {
    const r = await send("hacs/repository/download", {
      repository: match.id,
      version: match.available_version,
    });
    console.log("Update response:", JSON.stringify(r));
  } catch (e) {
    console.log("Trying alternative: hacs/repository (action=update)");
    const r2 = await send("hacs/repository", {
      action: "update",
      repository: match.id,
    });
    console.log("Update response:", JSON.stringify(r2));
  }

  // Re-list to confirm
  const repos2 = await send("hacs/repositories/list");
  const after = repos2.find((r) => r.id === match.id);
  console.log(`After update: installed_version=${after?.installed_version}`);

  ws.close();
}
