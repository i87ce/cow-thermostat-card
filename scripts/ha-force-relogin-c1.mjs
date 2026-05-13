// Revoke c1's refresh tokens, then restart the display app so the
// kiosk has to re-authenticate from scratch. HA's getDefaultPanelUrlPath
// reads userData.default_panel on first /lovelace load — should kick
// the redirect to walldisplay-camera-1.
import WebSocket from "ws";

const HOST = process.env.HA_HOST;
const TOKEN = process.env.HA_TOKEN;

function wsConnect(token) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`wss://${HOST}/api/websocket`);
    let id = 1;
    const pending = new Map();
    ws.on("error", reject);
    ws.on("message", (data) => {
      const m = JSON.parse(data.toString());
      if (m.type === "auth_required") return ws.send(JSON.stringify({ type: "auth", access_token: token }));
      if (m.type === "auth_invalid") return reject(new Error("auth_invalid"));
      if (m.type === "auth_ok") {
        return resolve({
          send: (type, payload = {}) =>
            new Promise((res, rej) => {
              const mid = id++;
              pending.set(mid, { res, rej });
              ws.send(JSON.stringify({ id: mid, type, ...payload }));
            }),
          close: () => ws.close(),
        });
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

const TARGET = process.argv[2] || "c1";

async function run() {
  const ws = await wsConnect(TOKEN);

  const users = await ws.send("config/auth/list");
  const u = users.find((x) => x.name === TARGET);
  if (!u) { console.error("user not found:", TARGET); process.exit(1); }
  console.log(`User ${TARGET} (id=${u.id.slice(0,8)}…)`);

  // List refresh tokens — only the current user can list its own, so this
  // returns empty for admin querying another user. Use the admin endpoint.
  try {
    const tokens = await ws.send("config/auth/list_users_refresh_tokens", { user_id: u.id });
    console.log("  refresh tokens:", tokens?.length ?? "?");
  } catch (e) {
    console.log("  list refresh tokens (admin): not exposed via WS, will try delete");
  }

  // Generic admin path: delete tokens via the auth/refresh_token_list admin call
  for (const cmd of [
    "auth/refresh_tokens", // legacy
    "config/auth/refresh_tokens",
    "auth/get_refresh_tokens",
  ]) {
    try {
      const r = await ws.send(cmd, { user_id: u.id });
      console.log(`  tried ${cmd}: ${JSON.stringify(r).slice(0, 200)}`);
    } catch (e) {
      // ignore
    }
  }

  // The official admin command is config/auth/delete (deletes user) or
  // none for individual token revocation. Instead deactivate+reactivate
  // the user — kills all sessions.
  console.log(`\nDeactivate+reactivate user ${TARGET} to kill all sessions…`);
  await ws.send("config/auth/update", { user_id: u.id, is_active: false });
  await new Promise((r) => setTimeout(r, 1000));
  await ws.send("config/auth/update", { user_id: u.id, is_active: true });
  console.log("  ✓ user toggled, sessions revoked");

  ws.close();
}

run().catch((e) => { console.error(e); process.exit(1); });
