// Set the Home Assistant external_url to the Nabu Casa URL so OAuth
// providers (Spotify via Music Assistant, Google, etc.) always
// redirect back through the Nabu Casa cloud URL instead of the
// internal IP.
import WebSocket from "ws";
const HOST = process.env.HA_HOST;
const TOKEN = process.env.HA_TOKEN;
const EXTERNAL = `https://${HOST}`;

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
  if (msg.type === "auth_ok") return run().catch(e => { console.error("ERR", e); process.exit(1); });
  if (msg.id != null && pending.has(msg.id)) {
    const p = pending.get(msg.id);
    pending.delete(msg.id);
    if (msg.success === false) p.rej(new Error(JSON.stringify(msg.error)));
    else p.res(msg.result);
  }
});
ws.on("error", e => { console.error("WS ERR", e.message); process.exit(1); });

async function run() {
  console.log("Reading core config...");
  const before = await send("get_config");
  console.log(`  external_url before: ${before.external_url}`);
  console.log(`  internal_url before: ${before.internal_url}`);

  console.log(`\nSetting external_url = ${EXTERNAL}`);
  await send("config/core/update", { external_url: EXTERNAL });

  const after = await send("get_config");
  console.log(`\n  external_url after:  ${after.external_url}`);
  console.log(`  internal_url after:  ${after.internal_url}`);
  ws.close();
  process.exit(0);
}
