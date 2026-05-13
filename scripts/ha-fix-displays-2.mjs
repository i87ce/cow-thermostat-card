// Phase 2 of the display cleanup:
//   (a) delete the 2 orphan dashboards (walldisplay-camera, -studio-chiara)
//   (b) rename Bagno Padronale entities to the `display_bagno_padronale_*`
//       convention (uniform with the other 6 displays)
//   (c) retitle dashboard walldisplay-bagno-camera → "Bagno Padronale"
import WebSocket from "ws";

const HOST = process.env.HA_HOST;
const TOKEN = process.env.HA_TOKEN;
const APPLY = process.env.APPLY === "1";

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

function dryLog(action, detail) {
  console.log(`${APPLY ? "→ " : "[dry] "}${action}: ${detail}`);
}

async function main() {
  console.log(APPLY ? "── APPLY ──" : "── DRY-RUN ── (set APPLY=1)");
  const ws = await wsConnect(TOKEN);

  /* ─── (a) delete orphan dashboards ─── */
  console.log("\n[a] Delete orphan dashboards");
  const dashboards = await ws.send("lovelace/dashboards/list");
  for (const slug of ["walldisplay-camera", "walldisplay-studio-chiara"]) {
    const d = dashboards.find((x) => x.url_path === slug);
    if (!d) {
      console.log(`  · ${slug} not found, skipping`);
      continue;
    }
    dryLog("delete", `${slug}  (id=${d.id.slice(0,8)}…)`);
    if (APPLY) {
      await ws.send("lovelace/dashboards/delete", { dashboard_id: d.id });
    }
  }

  /* ─── (b) rename Bagno Padronale device + entities ─── */
  console.log("\n[b] Rename Bagno Padronale device + entities");
  const devices = await ws.send("config/device_registry/list");
  const bpDev = devices.find(
    (d) =>
      d.manufacturer === "Shelly" &&
      /Wall Display/i.test(d.model || "") &&
      (d.name === "Bagno Padronale" || d.name_by_user === "Bagno Padronale"),
  );
  if (!bpDev) {
    console.log("  · Bagno Padronale device not found, skipping");
  } else {
    console.log(`  · device id=${bpDev.id.slice(0,8)}…  current name="${bpDev.name_by_user ?? bpDev.name}"`);
    dryLog("device rename", `→ "Display Bagno Padronale"`);
    if (APPLY) {
      await ws.send("config/device_registry/update", {
        device_id: bpDev.id,
        name_by_user: "Display Bagno Padronale",
      });
    }
    // Entities
    const entities = await ws.send("config/entity_registry/list");
    const bpEntities = entities.filter(
      (e) =>
        e.device_id === bpDev.id &&
        /^[a-z_]+\.bagno_padronale(?:_|$)/.test(e.entity_id),
    );
    for (const e of bpEntities) {
      const newId = e.entity_id.replace(/\.bagno_padronale/, ".display_bagno_padronale");
      dryLog("entity rename", `${e.entity_id} → ${newId}`);
      if (APPLY) {
        await ws.send("config/entity_registry/update", {
          entity_id: e.entity_id,
          new_entity_id: newId,
        });
      }
    }
  }

  /* ─── (c) retitle dashboard ─── */
  console.log('\n[c] Retitle walldisplay-bagno-camera → "Bagno Padronale"');
  const bc = dashboards.find((d) => d.url_path === "walldisplay-bagno-camera");
  if (!bc) {
    console.log("  · walldisplay-bagno-camera not found, skipping");
  } else {
    dryLog("retitle", `${bc.url_path}  "${bc.title}" → "Bagno Padronale"`);
    if (APPLY) {
      await ws.send("lovelace/dashboards/update", {
        dashboard_id: bc.id,
        require_admin: bc.require_admin,
        show_in_sidebar: false,
        icon: bc.icon,
        title: "Bagno Padronale",
      });
    }
  }

  ws.close();
  console.log("\nDone.");
}

main().catch((e) => { console.error(e); process.exit(1); });
