// Find the Music Assistant addon panel via HA WS API
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
  const msg = JSON.parse(data.toString());
  if (msg.type === "auth_required") return ws.send(JSON.stringify({ type: "auth", access_token: TOKEN }));
  if (msg.type === "auth_invalid") { console.error("AUTH FAIL"); process.exit(1); }
  if (msg.type === "auth_ok") return run().catch((e) => { console.error("ERR", e); process.exit(1); });
  if (msg.id != null && pending.has(msg.id)) {
    const p = pending.get(msg.id);
    pending.delete(msg.id);
    if (msg.success === false) p.rej(new Error(JSON.stringify(msg.error)));
    else p.res(msg.result);
  }
});
ws.on("error", (e) => { console.error("WS ERR", e.message); process.exit(1); });

async function run() {
  // Get the sidebar panels - these tell us about installed addons with UIs
  try {
    const panels = await send("get_panels");
    console.log("=== HA sidebar panels ===");
    for (const [key, p] of Object.entries(panels)) {
      const title = p.title || key;
      const url = p.url_path || key;
      const config = p.config || {};
      if (config.ingress || title.toLowerCase().includes("music") || url.includes("music") || config._panel_custom?.name) {
        console.log(JSON.stringify({ key, title, url_path: p.url_path, config }, null, 2));
      } else {
        console.log(`  ${url}  ${title}`);
      }
    }
  } catch (e) {
    console.error("get_panels failed:", e.message);
  }
  ws.close();
}
