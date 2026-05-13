// Verify each kiosk user's defaultPanel actually got saved.
const LAN_HOST = "172.16.0.200:8123";
const USERS = ["sala", "c1", "c2", "cp", "bo", "sc", "bp"];

async function loginAndCheck(username) {
  const base = `http://${LAN_HOST}`;
  const CLIENT_ID = `${base}/`;
  const r1 = await fetch(`${base}/auth/login_flow`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ client_id: CLIENT_ID, handler: ["homeassistant", null], redirect_uri: CLIENT_ID }),
  });
  const { flow_id } = await r1.json();
  const r2 = await fetch(`${base}/auth/login_flow/${flow_id}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ client_id: CLIENT_ID, username, password: username }),
  });
  const step = await r2.json();
  if (step.type !== "create_entry") throw new Error("login failed: " + JSON.stringify(step).slice(0, 100));
  const params = new URLSearchParams({ client_id: CLIENT_ID, code: step.result, grant_type: "authorization_code" });
  const r3 = await fetch(`${base}/auth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params.toString(),
  });
  const { access_token } = await r3.json();

  const WebSocket = (await import("ws")).default;
  return new Promise((resolve) => {
    const ws = new WebSocket(`ws://${LAN_HOST}/api/websocket`);
    let id = 1;
    const pending = new Map();
    const send = (type, payload = {}) =>
      new Promise((r, j) => {
        const mid = id++;
        pending.set(mid, { r, j });
        ws.send(JSON.stringify({ id: mid, type, ...payload }));
      });
    ws.on("message", async (data) => {
      const m = JSON.parse(data.toString());
      if (m.type === "auth_required") return ws.send(JSON.stringify({ type: "auth", access_token }));
      if (m.type === "auth_ok") {
        try {
          const r = await send("frontend/get_user_data", { key: "default_panel" });
          resolve({ username, defaultPanel: r?.value });
        } catch (e) {
          resolve({ username, error: e.message });
        }
        ws.close();
      }
      if (m.id != null && pending.has(m.id)) {
        const p = pending.get(m.id);
        pending.delete(m.id);
        if (m.success === false) p.j(new Error(JSON.stringify(m.error)));
        else p.r(m.result);
      }
    });
  });
}

const expected = {
  sala: "walldisplay-sala-cucina",
  c1: "walldisplay-camera-1",
  c2: "walldisplay-camera-2",
  cp: "walldisplay-camera-padronale",
  bo: "walldisplay-bagno-ospiti",
  sc: "walldisplay-scala",
  bp: "walldisplay-bagno-camera",
};

console.log("user".padEnd(6), "current defaultPanel".padEnd(35), "expected".padEnd(35), "match");
for (const u of USERS) {
  const { defaultPanel, error } = await loginAndCheck(u);
  const ok = defaultPanel === expected[u] ? "✓" : "✗";
  console.log(u.padEnd(6), (defaultPanel ?? error ?? "(null)").padEnd(35), expected[u].padEnd(35), ok);
}
