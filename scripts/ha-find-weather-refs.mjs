// One-off: list every lovelace dashboard and report where a given
// weather entity is referenced (any key, any depth).
//
// Usage: node scripts/ha-find-weather-refs.mjs weather.pirateweather
import WebSocket from "ws";

const HOST = process.env.HA_HOST;
const TOKEN = process.env.HA_TOKEN;
const NEEDLE = process.argv[2] ?? "weather.pirateweather";

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
  if (m.type === "auth_required")
    return ws.send(JSON.stringify({ type: "auth", access_token: TOKEN }));
  if (m.type === "auth_ok")
    return run().catch((e) => { console.error(e); process.exit(1); });
  if (m.id != null && pending.has(m.id)) {
    const p = pending.get(m.id);
    pending.delete(m.id);
    if (m.success === false) p.rej(new Error(JSON.stringify(m.error)));
    else p.res(m.result);
  }
});
ws.on("error", (e) => { console.error("WS", e.message); process.exit(1); });

function findRefs(node, path, out) {
  if (node == null) return;
  if (typeof node === "string") {
    if (node.includes(NEEDLE)) out.push(path);
    return;
  }
  if (Array.isArray(node)) {
    node.forEach((v, i) => findRefs(v, `${path}[${i}]`, out));
    return;
  }
  if (typeof node === "object") {
    for (const [k, v] of Object.entries(node)) findRefs(v, `${path}.${k}`, out);
  }
}

async function run() {
  const dashboards = await send("lovelace/dashboards/list");
  const slugs = [null, ...dashboards.map((d) => d.url_path)];
  for (const slug of slugs) {
    let cfg;
    try {
      cfg = await send("lovelace/config", slug ? { url_path: slug } : {});
    } catch {
      continue; // auto-generated (strategy) dashboards have no stored config
    }
    const refs = [];
    findRefs(cfg, "$", refs);
    if (refs.length > 0) {
      console.log(`\n── ${slug ?? "(default lovelace)"} ──`);
      for (const r of refs) console.log("  " + r);
    }
  }
  ws.close();
}
