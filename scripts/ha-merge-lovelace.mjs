// Merge every walldisplay-<room> dashboard's views into the master
// "lovelace" (Overview) dashboard, tagging each view with the right
// per-user `visibility`. The Shelly Wall Display kiosk always opens
// /lovelace and ignores the per-user default_panel; this approach
// works around that by making /lovelace render the room-specific
// view for the logged-in user only.
import WebSocket from "ws";

const HOST = process.env.HA_HOST;
const TOKEN = process.env.HA_TOKEN;
const APPLY = process.env.APPLY === "1";

// User → (walldisplay url_path, user_id, displayed name)
const MAP = [
  ["sala", "walldisplay-sala-cucina",     "1f88e5d9479544708563c1cd4adb18dc", "Sala & Cucina"],
  ["c1",   "walldisplay-camera-1",         "66ba4172212449b4a90d577a91ec8187", "Camera 1"],
  ["c2",   "walldisplay-camera-2",         "92b02cbdbf2f448bb869b23b6b8720fe", "Camera 2"],
  ["cp",   "walldisplay-camera-padronale", "c38e6d3f2289466b96b41f458bb466e6", "Camera Padronale"],
  ["bo",   "walldisplay-bagno-ospiti",     "b3368b8a3d6341b382416c1a9d86e329", "Bagno Ospiti"],
  ["sc",   "walldisplay-scala",            "a94ee22c1ea540aab28ef276a0318319", "Ingresso PT"],
  ["bp",   "walldisplay-bagno-camera",     "94f5bab2981a4dc9aa220a22ac101ac4", "Bagno Padronale"],
];

function ws() {
  return new Promise((resolve, reject) => {
    const w = new WebSocket(`wss://${HOST}/api/websocket`);
    let id = 1;
    const pending = new Map();
    w.on("error", reject);
    w.on("message", (data) => {
      const m = JSON.parse(data.toString());
      if (m.type === "auth_required") return w.send(JSON.stringify({ type: "auth", access_token: TOKEN }));
      if (m.type === "auth_invalid") return reject(new Error("auth_invalid"));
      if (m.type === "auth_ok") {
        return resolve({
          send: (type, payload = {}) =>
            new Promise((res, rej) => {
              const mid = id++;
              pending.set(mid, { res, rej });
              w.send(JSON.stringify({ id: mid, type, ...payload }));
            }),
          close: () => w.close(),
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

async function run() {
  console.log(APPLY ? "── APPLY ──" : "── DRY-RUN ── (set APPLY=1)");
  const conn = await ws();

  /* 1) Pull each room's views (typically 1 view, 1 cow-thermostat-card) */
  const aggregated = [];
  for (const [user, slug, userId, label] of MAP) {
    try {
      const cfg = await conn.send("lovelace/config", { url_path: slug });
      console.log(`  · ${slug} → ${cfg.views?.length || 0} view(s)`);
      for (const v of (cfg.views || [])) {
        aggregated.push({
          // Sanitize: keep the room view's content but force a path + visibility
          ...v,
          title: label,
          path: user, // sidebar tab path becomes the username
          visibility: [{ user: userId }],
        });
      }
    } catch (e) {
      console.log(`  · ${slug} → ERROR: ${e.message.slice(0, 100)}`);
    }
  }
  console.log(`\nTotal aggregated views: ${aggregated.length}`);

  /* 2) Read current lovelace (Overview) dashboard config */
  const current = await conn.send("lovelace/config", { url_path: null }).catch(async () => {
    // some HA versions need explicit "lovelace" path
    return conn.send("lovelace/config", { url_path: "lovelace" });
  });
  console.log(`Current Overview has ${current.views?.length || 0} view(s) - will be replaced.`);

  /* 3) Save the new master dashboard */
  const newCfg = {
    title: current.title || "Overview",
    views: aggregated,
  };

  if (APPLY) {
    await conn.send("lovelace/config/save", {
      url_path: null,
      config: newCfg,
    });
    console.log("✓ Overview saved with per-user visibility views");
  } else {
    console.log("[dry] would save Overview with these views:");
    for (const v of aggregated) {
      console.log(`    - title="${v.title}" path=${v.path} visibility=user:${v.visibility[0].user.slice(0,8)}…  cards=${(v.cards||[]).length}`);
    }
  }

  conn.close();
}

run().catch((e) => { console.error(e); process.exit(1); });
