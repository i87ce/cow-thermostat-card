// Inspect a Person entity end-to-end: linked user, device_trackers,
// and every reference to it across automations / scripts / scenes /
// dashboards / template entities.
//
// Usage:
//   HA_HOST=... HA_TOKEN=... node scripts/ha-check-person.mjs camera1
import WebSocket from "ws";

const HOST = process.env.HA_HOST;
const TOKEN = process.env.HA_TOKEN;
const NEEDLE = (process.argv[2] || "camera1").toLowerCase();
if (!HOST || !TOKEN) {
  console.error("Set HA_HOST and HA_TOKEN");
  process.exit(1);
}

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
  if (m.type === "auth_invalid") { console.error("auth_invalid"); process.exit(1); }
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

function walk(obj, hit, path = "") {
  if (obj == null) return;
  if (typeof obj === "string") {
    if (obj.toLowerCase().includes(hit)) console.log(`    @ ${path} = ${obj}`);
    return;
  }
  if (Array.isArray(obj)) {
    obj.forEach((v, i) => walk(v, hit, `${path}[${i}]`));
    return;
  }
  if (typeof obj === "object") {
    for (const [k, v] of Object.entries(obj)) walk(v, hit, path ? `${path}.${k}` : k);
  }
}

async function run() {
  /* 1) Person config */
  const persons = await send("person/list");
  const all = persons.storage || [];
  console.log(`Total persons (storage): ${all.length}`);
  const match = all.filter(
    (p) =>
      (p.name || "").toLowerCase().includes(NEEDLE) ||
      (p.id || "").toLowerCase().includes(NEEDLE)
  );
  if (match.length === 0) {
    console.log(`No Person matches "${NEEDLE}" — listing all:`);
    for (const p of all)
      console.log(`  · name="${p.name}" id=${p.id} user_id=${p.user_id || "<none>"}`);
    ws.close();
    return;
  }

  for (const p of match) {
    console.log(`\n── Person "${p.name}" (id=${p.id}) ──`);
    console.log(`  user_id       : ${p.user_id || "<none>"}`);
    console.log(`  device_trackers: ${(p.device_trackers || []).join(", ") || "<none>"}`);

    /* 2) entity_id (state) */
    const states = await send("get_states");
    const personEnt = states.find(
      (s) =>
        s.entity_id.startsWith("person.") &&
        ((s.attributes?.user_id || "") === p.user_id ||
          (s.attributes?.id || "") === p.id ||
          s.entity_id === `person.${(p.name || "").toLowerCase()}`)
    );
    if (personEnt) {
      console.log(`  entity_id     : ${personEnt.entity_id}`);
      console.log(`  state         : ${personEnt.state}`);
      console.log(`  last_changed  : ${personEnt.last_changed}`);
    } else {
      console.log("  entity_id     : <not found in states>");
    }

    /* 3) Cross-reference search */
    const needles = [
      personEnt?.entity_id?.toLowerCase(),
      p.id?.toLowerCase(),
      p.user_id?.toLowerCase(),
    ].filter(Boolean);

    console.log(`\n  Searching references for: ${needles.join(", ")}`);

    /* 3a) Automations */
    try {
      const autos = await send("config/automation/config");
      console.log(`\n  Automations (${autos?.length ?? 0}):`);
      for (const a of autos || []) {
        for (const n of needles) {
          const j = JSON.stringify(a).toLowerCase();
          if (j.includes(n)) {
            console.log(`    ✔ automation "${a.alias || a.id}" references ${n}`);
            walk(a, n, `automation[${a.alias || a.id}]`);
            break;
          }
        }
      }
    } catch (e) {
      console.log(`    (automation list error: ${e.message.slice(0,80)})`);
    }

    /* 3b) Scripts */
    try {
      const scripts = await send("config/script/config");
      console.log(`\n  Scripts (${scripts ? Object.keys(scripts).length : 0}):`);
      for (const [name, s] of Object.entries(scripts || {})) {
        for (const n of needles) {
          if (JSON.stringify(s).toLowerCase().includes(n)) {
            console.log(`    ✔ script "${name}" references ${n}`);
            walk(s, n, `script[${name}]`);
            break;
          }
        }
      }
    } catch (e) {
      console.log(`    (script list error: ${e.message.slice(0,80)})`);
    }

    /* 3c) Scenes */
    try {
      const scenes = await send("config/scene/config");
      console.log(`\n  Scenes (${scenes?.length ?? 0}):`);
      for (const s of scenes || []) {
        for (const n of needles) {
          if (JSON.stringify(s).toLowerCase().includes(n)) {
            console.log(`    ✔ scene "${s.name || s.id}" references ${n}`);
            walk(s, n, `scene[${s.name || s.id}]`);
            break;
          }
        }
      }
    } catch (e) {
      console.log(`    (scene list error: ${e.message.slice(0,80)})`);
    }

    /* 3d) Dashboards (lovelace) */
    try {
      const dashList = await send("lovelace/dashboards/list").catch(() => []);
      const urls = [null, ...(dashList || []).map((d) => d.url_path).filter(Boolean)];
      console.log(`\n  Dashboards (${urls.length}):`);
      for (const url_path of urls) {
        try {
          const cfg = await send("lovelace/config", { url_path });
          for (const n of needles) {
            if (JSON.stringify(cfg).toLowerCase().includes(n)) {
              console.log(`    ✔ dashboard "${url_path || "lovelace"}" references ${n}`);
              walk(cfg, n, `dashboard[${url_path || "lovelace"}]`);
              break;
            }
          }
        } catch (e) {
          // skip yaml-mode dashboards / no access
        }
      }
    } catch (e) {
      console.log(`    (dashboard list error: ${e.message.slice(0,80)})`);
    }

    /* 3e) Template entities / helpers referencing person.* */
    try {
      const tplEnts = states.filter((s) => {
        const j = JSON.stringify(s.attributes || {}).toLowerCase();
        return needles.some((n) => j.includes(n));
      });
      console.log(`\n  Other entities with attrs referencing the person: ${tplEnts.length}`);
      for (const e of tplEnts.slice(0, 20)) {
        console.log(`    · ${e.entity_id} (${e.state})`);
      }
    } catch {}
  }
  ws.close();
}
