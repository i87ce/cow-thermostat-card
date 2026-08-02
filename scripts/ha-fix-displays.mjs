// One-shot fixer for the Shelly Wall Display kiosk setup.
//
// What it does (idempotent, prints DRY-RUN unless APPLY=1):
//  1. Hides every `walldisplay-*` dashboard from the sidebar so kiosk
//     users never see siblings' dashboards.
//  2. Creates the missing `bp` user (Bagno Padronale, password=bp) in
//     the system-users group, local-only — the same shape as the
//     existing kiosk users.
//  3. Logs in as each kiosk user with their plain password (auth code
//     flow) and writes `defaultPanel = walldisplay-<their-room>` to
//     that user's frontend.user_data so HA opens the right dashboard
//     on auto-discovery login. This is the only way to set per-user
//     defaults from outside — HA's admin token can only set its own.
//
// Run modes:
//   node ha-fix-displays.mjs            # dry-run, show what would change
//   APPLY=1 node ha-fix-displays.mjs    # actually mutate HA
//
// Mapping (user → dashboard) is hardcoded below; change if the names
// shift in the future.
import WebSocket from "ws";

const HOST = process.env.HA_HOST;
const TOKEN = process.env.HA_TOKEN;
const APPLY = process.env.APPLY === "1";
// HA's `local_only` users can't authenticate through the external
// (Nabu Casa) URL — login flow returns 403 "Login blocked". The LAN
// endpoint via Tailscale subnet route works because the user's IP
// reads as a local one to HA. Override with HA_LAN_HOST=<ip:port>.
const LAN_HOST = process.env.HA_LAN_HOST || "172.16.0.200:8123";
const LAN_PROTO = LAN_HOST.endsWith(":8123") ? "http" : "https";

const USER_MAP = {
  sala: { dashboard: "walldisplay-sala-cucina", password: "sala" },
  c1:   { dashboard: "walldisplay-camera-1", password: "c1" },
  c2:   { dashboard: "walldisplay-camera-2", password: "c2" },
  cp:   { dashboard: "walldisplay-camera-padronale", password: "cp" },
  bo:   { dashboard: "walldisplay-bagno-ospiti", password: "bo" },
  sc:   { dashboard: "walldisplay-scala", password: "sc" },
  bp:   { dashboard: "walldisplay-bagno-camera", password: "bp" }, // bagno padronale → "bagno camera"
  st:   { dashboard: "walldisplay-studio", password: "st" },
};

function dryLog(action, detail) {
  console.log(`${APPLY ? "→ " : "[dry] "}${action}: ${detail}`);
}

/* ────────────────────────── WS helper ─────────────────────────── */

function wsConnect(token, useLan = false) {
  const url = useLan
    ? `${LAN_PROTO === "http" ? "ws" : "wss"}://${LAN_HOST}/api/websocket`
    : `wss://${HOST}/api/websocket`;
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url);
    let id = 1;
    const pending = new Map();
    ws.on("error", reject);
    ws.on("message", (data) => {
      const m = JSON.parse(data.toString());
      if (m.type === "auth_required") return ws.send(JSON.stringify({ type: "auth", access_token: token }));
      if (m.type === "auth_invalid") return reject(new Error("auth_invalid"));
      if (m.type === "auth_ok") {
        const client = {
          send: (type, payload = {}) =>
            new Promise((res, rej) => {
              const mid = id++;
              pending.set(mid, { res, rej });
              ws.send(JSON.stringify({ id: mid, type, ...payload }));
            }),
          close: () => ws.close(),
        };
        return resolve(client);
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

/* ─────────────────────── REST auth-code flow ──────────────────── */
// Exchanges username+password for an access_token usable in WS auth.
// Uses the HA built-in authentication provider (the same one the
// frontend login form uses). No CSRF needed because we go through the
// /auth/login_flow JSON endpoints.
async function loginAsUser(username, password) {
  const base = `${LAN_PROTO}://${LAN_HOST}`;
  const CLIENT_ID = `${base}/`;

  const r1 = await fetch(`${base}/auth/login_flow`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: CLIENT_ID,
      handler: ["homeassistant", null],
      redirect_uri: CLIENT_ID,
    }),
  });
  if (!r1.ok) throw new Error(`login_flow start ${r1.status}: ${await r1.text()}`);
  const { flow_id } = await r1.json();

  const r2 = await fetch(`${base}/auth/login_flow/${flow_id}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ client_id: CLIENT_ID, username, password }),
  });
  if (!r2.ok) throw new Error(`login_flow step ${r2.status}: ${await r2.text()}`);
  const step = await r2.json();
  if (step.type !== "create_entry") {
    throw new Error(`unexpected flow result: ${JSON.stringify(step).slice(0, 200)}`);
  }
  const code = step.result;

  const params = new URLSearchParams({
    client_id: CLIENT_ID,
    code,
    grant_type: "authorization_code",
  });
  const r3 = await fetch(`${base}/auth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params.toString(),
  });
  if (!r3.ok) throw new Error(`token exchange ${r3.status}: ${await r3.text()}`);
  const { access_token } = await r3.json();
  return access_token;
}

/* ─────────────────────────── main ─────────────────────────────── */

async function main() {
  console.log(APPLY ? "── APPLY mode ──" : "── DRY-RUN ── (re-run with APPLY=1 to write)");
  const admin = await wsConnect(TOKEN);

  // 1) hide every walldisplay-* dashboard from the sidebar
  console.log("\n[1/3] Sidebar visibility …");
  const dashboards = await admin.send("lovelace/dashboards/list");
  for (const d of dashboards) {
    if (!d.url_path.startsWith("walldisplay-")) continue;
    if (d.show_in_sidebar === false) {
      console.log(`  ✓ already hidden: ${d.url_path}`);
      continue;
    }
    dryLog("hide", `${d.url_path}  (was show_in_sidebar=${d.show_in_sidebar})`);
    if (APPLY) {
      await admin.send("lovelace/dashboards/update", {
        dashboard_id: d.id,
        require_admin: d.require_admin,
        show_in_sidebar: false,
        icon: d.icon,
        title: d.title,
      });
    }
  }

  // 2) create user "bp" if missing
  console.log("\n[2/3] Kiosk user bp …");
  const users = await admin.send("config/auth/list");
  const existing = users.find((u) => u.name === "bp");
  if (existing) {
    console.log(`  ✓ user bp already exists (id=${existing.id.slice(0, 8)}…)`);
  } else {
    dryLog("create user", "bp (system-users, local-only)");
    if (APPLY) {
      const create = await admin.send("config/auth/create", {
        name: "bp",
        group_ids: ["system-users"],
        local_only: true,
      });
      const userId = create?.user?.id;
      await admin.send("config/auth_provider/homeassistant/create", {
        user_id: userId,
        username: "bp",
        password: "bp",
      });
      console.log("  ✓ created user bp + credentials");
    }
  }

  // 3) per-user default panel — needs to log in as each user
  console.log("\n[3/3] Default dashboards per-user …");
  for (const [username, { dashboard, password }] of Object.entries(USER_MAP)) {
    process.stdout.write(`  ${username} → ${dashboard}  `);
    if (!APPLY) { console.log("[dry-run]"); continue; }
    try {
      const userToken = await loginAsUser(username, password);
      const userWs = await wsConnect(userToken, /* useLan */ true);
      // Note: HA's modern key is `default_panel` (snake_case).
      // The legacy `defaultPanel` (camelCase) is only read from
      // localStorage on the client — useless when set server-side.
      await userWs.send("frontend/set_user_data", {
        key: "default_panel",
        value: dashboard,
      });
      userWs.close();
      console.log("✓");
    } catch (e) {
      console.log("FAILED:", e.message.slice(0, 160));
    }
  }

  admin.close();
}

main().catch((e) => { console.error(e); process.exit(1); });
