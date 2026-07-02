// Restore the missing `c1` kiosk user for the Camera 1 Shelly Wall Display.
//
// Root cause: the dedicated HA user `c1` (the account the Camera 1 display
// auto-logs into) was deleted, so the display's stored refresh token became
// invalid and it can no longer auto-login. All 6 sibling kiosk users
// (sala/c2/cp/bo/sc/bp) still exist; only c1 is gone.
//
// This recreates c1 to match the established convention used by the others:
//   • name        = "c1"
//   • group_ids   = ["system-users"]   (non-admin)
//   • local_only  = true
//   • credential  = homeassistant provider, username "c1" / password "c1"
//   • default_panel = "walldisplay-camera-1"  (set by logging in as c1)
//
// Idempotent + guarded:
//   - bails (without creating a duplicate) if a `c1` user already exists,
//     but still reconciles default_panel.
//   - refuses to run if the walldisplay-camera-1 dashboard is missing.
//
// Usage:
//   node scripts/ha-restore-camera-1-user.mjs            # dry-run
//   APPLY=1 node scripts/ha-restore-camera-1-user.mjs    # actually create
//
// Needs admin HA_HOST/HA_TOKEN (Nabu Casa) for user creation, and LAN
// reachability to LAN_HOST for setting default_panel via a c1 login.
import WebSocket from "ws";

const HOST = process.env.HA_HOST;
const TOKEN = process.env.HA_TOKEN;
const APPLY = process.env.APPLY === "1";
const LAN_HOST = process.env.HA_LAN_HOST || "172.16.0.200:8123";

const USERNAME = "c1";
const PASSWORD = "c1";
const GROUP = "system-users";
const DASHBOARD = "walldisplay-camera-1";

if (!HOST || !TOKEN) { console.error("Set HA_HOST and HA_TOKEN"); process.exit(2); }

function adminWS() {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`wss://${HOST}/api/websocket`);
    let id = 1;
    const pending = new Map();
    ws.on("error", reject);
    ws.on("message", (data) => {
      const m = JSON.parse(data.toString());
      if (m.type === "auth_required") return ws.send(JSON.stringify({ type: "auth", access_token: TOKEN }));
      if (m.type === "auth_invalid") return reject(new Error("auth_invalid"));
      if (m.type === "auth_ok")
        return resolve({
          send: (type, payload = {}) =>
            new Promise((res, rej) => {
              const mid = id++;
              pending.set(mid, { res, rej });
              ws.send(JSON.stringify({ id: mid, type, ...payload }));
            }),
          close: () => ws.close(),
        });
      if (m.id != null && pending.has(m.id)) {
        const p = pending.get(m.id);
        pending.delete(m.id);
        if (m.success === false) p.rej(new Error(JSON.stringify(m.error)));
        else p.res(m.result);
      }
    });
  });
}

// Log in over the LAN as username/password and set default_panel.
async function setDefaultPanel(username, password, value) {
  const base = `http://${LAN_HOST}`;
  const CID = `${base}/`;
  const r1 = await fetch(`${base}/auth/login_flow`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ client_id: CID, handler: ["homeassistant", null], redirect_uri: CID }),
  });
  const { flow_id } = await r1.json();
  const r2 = await fetch(`${base}/auth/login_flow/${flow_id}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ client_id: CID, username, password }),
  });
  const step = await r2.json();
  if (step.type !== "create_entry") throw new Error("c1 login failed: " + JSON.stringify(step).slice(0, 150));
  const params = new URLSearchParams({ client_id: CID, code: step.result, grant_type: "authorization_code" });
  const r3 = await fetch(`${base}/auth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params.toString(),
  });
  const { access_token } = await r3.json();

  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://${LAN_HOST}/api/websocket`);
    let id = 1;
    const pending = new Map();
    const send = (type, payload = {}) =>
      new Promise((res, rej) => {
        const mid = id++;
        pending.set(mid, { res, rej });
        ws.send(JSON.stringify({ id: mid, type, ...payload }));
      });
    ws.on("error", reject);
    ws.on("message", async (data) => {
      const m = JSON.parse(data.toString());
      if (m.type === "auth_required") return ws.send(JSON.stringify({ type: "auth", access_token }));
      if (m.type === "auth_ok") {
        try {
          await send("frontend/set_user_data", { key: "default_panel", value });
          const after = await send("frontend/get_user_data", { key: "default_panel" });
          ws.close();
          resolve(after?.value);
        } catch (e) {
          ws.close();
          reject(e);
        }
      }
      if (m.id != null && pending.has(m.id)) {
        const p = pending.get(m.id);
        pending.delete(m.id);
        if (m.success === false) p.rej(new Error(JSON.stringify(m.error)));
        else p.res(m.result);
      }
    });
  });
}

async function run() {
  console.log(APPLY ? "── APPLY ──" : "── DRY-RUN ── (set APPLY=1 to create the user)\n");
  const ws = await adminWS();

  // Guard: dashboard must exist (redirect target).
  try {
    const cfg = await ws.send("lovelace/config", { url_path: DASHBOARD });
    console.log(`✓ dashboard "${DASHBOARD}" exists (${cfg.views?.length ?? 0} views)`);
  } catch (e) {
    console.error(`✗ dashboard "${DASHBOARD}" not found — refusing to proceed.`);
    ws.close();
    process.exit(1);
  }

  // Find a reference sibling to copy group/flags from, and check c1.
  const users = await ws.send("config/auth/list");
  const ref = users.find((u) => u.name === "c2") || users.find((u) => ["sala", "bo", "cp", "sc", "bp"].includes(u.name));
  let c1 = users.find((u) => u.name === USERNAME);
  if (ref) {
    console.log(`  reference sibling "${ref.name}": local_only=${ref.local_only} groups=[${(ref.group_ids||[]).join(",")}]`);
  }

  if (c1) {
    console.log(`\n• User "${USERNAME}" already exists (id=${c1.id}). Will only reconcile default_panel.`);
  } else {
    console.log(`\n• User "${USERNAME}" is MISSING — will create it.`);
    if (!APPLY) {
      console.log(`  [dry] config/auth/create { name:"${USERNAME}", group_ids:["${GROUP}"], local_only:true }`);
      console.log(`  [dry] config/auth_provider/homeassistant/create { user_id:<new>, username:"${USERNAME}", password:"***" }`);
      console.log(`  [dry] login as ${USERNAME} → set default_panel="${DASHBOARD}"`);
      ws.close();
      return;
    }
    const created = await ws.send("config/auth/create", {
      name: USERNAME,
      group_ids: [GROUP],
      local_only: true,
    });
    c1 = created.user;
    console.log(`  ✓ created user id=${c1.id}`);
    await ws.send("config/auth_provider/homeassistant/create", {
      user_id: c1.id,
      username: USERNAME,
      password: PASSWORD,
    });
    console.log(`  ✓ created homeassistant credential (username "${USERNAME}")`);
  }

  ws.close();

  if (!APPLY) return;

  // Set default_panel by logging in as the (now existing) c1 user.
  try {
    const val = await setDefaultPanel(USERNAME, PASSWORD, DASHBOARD);
    console.log(`  ✓ default_panel set & verified: "${val}"`);
  } catch (e) {
    console.error(`  ⚠ could not set default_panel: ${e.message}`);
    console.error(`    (redirect-card still routes by username, so autologin will work; set it later if needed.)`);
  }

  // Final confirmation
  const ws2 = await adminWS();
  const after = await ws2.send("config/auth/list");
  const u = after.find((x) => x.name === USERNAME);
  console.log(
    `\n✓ DONE — user "${USERNAME}" present: ${!!u} ` +
    (u ? `(local_only=${u.local_only}, groups=[${(u.group_ids||[]).join(",")}])` : ""),
  );
  console.log(`\nNext step on the physical Camera 1 display (172.16.2.10):`);
  console.log(`  it is sitting on the HA login page → log in once as ${USERNAME}/${PASSWORD}.`);
  console.log(`  The refresh token then persists and autologin is restored.`);
  ws2.close();
}

run().catch((e) => { console.error(e); process.exit(1); });
