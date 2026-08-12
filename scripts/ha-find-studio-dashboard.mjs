// Trova la dashboard dello studio: elenca tutte le dashboard storage-mode
// e segnala quelle che citano "studio" o gli switch TV nel config.
import { readFileSync } from "fs";
import WebSocket from "ws";

// Carica HA_HOST/HA_TOKEN da .secret senza stamparli
for (const line of readFileSync(new URL("../.secret", import.meta.url), "utf8").split("\n")) {
  const m = line.match(/^\s*(?:export\s+)?(HA_HOST|HA_TOKEN)\s*=\s*"?([^"#]+)"?\s*$/);
  if (m) process.env[m[1]] = m[2].trim();
}

const ws = new WebSocket(`wss://${process.env.HA_HOST}/api/websocket`);
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
  if (m.type === "auth_required") return ws.send(JSON.stringify({ type: "auth", access_token: process.env.HA_TOKEN }));
  if (m.type === "auth_ok") return run().catch((e) => { console.error(e); process.exit(1); });
  if (m.id != null && pending.has(m.id)) {
    const p = pending.get(m.id);
    pending.delete(m.id);
    if (m.success === false) p.rej(new Error(JSON.stringify(m.error)));
    else p.res(m.result);
  }
});

async function run() {
  const dashboards = await send("lovelace/dashboards/list");
  console.log("Dashboards:", dashboards.map((d) => `${d.url_path} (${d.title}, mode=${d.mode})`).join("\n  "));
  for (const d of dashboards) {
    try {
      const cfg = await send("lovelace/config", { url_path: d.url_path });
      const txt = JSON.stringify(cfg);
      const hits = [];
      if (/studio/i.test(txt)) hits.push("studio");
      if (/tv_giochi/i.test(txt)) hits.push("tv_giochi");
      if (/filtro_stampante/i.test(txt)) hits.push("filtro_stampante");
      if (hits.length) console.log(`\n>>> ${d.url_path} "${d.title}" matches: ${hits.join(", ")}`);
    } catch (e) {
      console.log(`\n(${d.url_path}: no config — ${e.message})`);
    }
  }
  // anche la dashboard di default
  try {
    const cfg = await send("lovelace/config", { url_path: null });
    const txt = JSON.stringify(cfg);
    if (/studio|tv_giochi|filtro_stampante/i.test(txt)) console.log("\n>>> default dashboard matches too");
  } catch {}
  process.exit(0);
}
