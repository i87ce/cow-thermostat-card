#!/usr/bin/env node
/**
 * Force `in_mode: "detached"` on switch:0 of every Shelly Wall Display
 * so HA can drive the floor-heating valve relay (terminal O) without
 * the relay slaving itself to the SW input.
 *
 * Why: by factory default switch:0 ships with `in_mode: "follow"`,
 * which makes the relay output mirror the SW input. With nothing
 * wired on SW the relay sits at OFF and ignores any RPC / HA turn_on
 * — climate.pavimento_<room> looks like it's working but the valve
 * never opens. Setting in_mode=detached makes the relay take RPC /
 * Cloud / Switch.Set commands again, and frees SW for the manual
 * "boost" wiring (C5 in docs/06-house-hvac-architecture.md).
 *
 * Discovery + IPs come from the HA device registry — no hard-coded
 * ladder. Idempotent: safe to run on every deploy / display
 * replacement / firmware factory-reset.
 *
 * Usage:  node scripts/shelly-display-detach-switch.mjs
 * Env:    HA_HOST, HA_TOKEN
 */

import WebSocket from "ws";

const ws = new WebSocket("wss://" + process.env.HA_HOST + "/api/websocket");
let mid = 1;
const pending = new Map();

function send(type, payload = {}) {
  return new Promise((res, rej) => {
    const id = mid++;
    pending.set(id, { res, rej });
    ws.send(JSON.stringify({ id, type, ...payload }));
  });
}

ws.on("message", (data) => {
  const m = JSON.parse(data.toString());
  if (m.type === "auth_required") {
    ws.send(JSON.stringify({ type: "auth", access_token: process.env.HA_TOKEN }));
    return;
  }
  if (m.type === "auth_ok") {
    run().catch((e) => {
      console.error("FATAL:", e.message);
      process.exit(1);
    });
    return;
  }
  if (m.id != null && pending.has(m.id)) {
    const p = pending.get(m.id);
    pending.delete(m.id);
    if (m.success === false) p.rej(new Error(JSON.stringify(m.error)));
    else p.res(m.result);
  }
});

ws.on("error", (e) => {
  console.error("WS:", e.message);
  process.exit(1);
});

/** Extract host:port from a Shelly configuration_url. */
function urlToBase(u) {
  if (!u) return null;
  return u.replace(/\/$/, "");
}

async function run() {
  console.log("Discovering Shelly Wall Displays from HA device registry…");
  const [devices, entities] = await Promise.all([
    send("config/device_registry/list", {}),
    send("config/entity_registry/list", {}),
  ]);

  // Find every switch.display_<room> (the relay entity) and walk
  // to its parent device so we pull the IP from configuration_url.
  // We skip "_aioshelly_ble_integration" — that's the BLE coordinator
  // sub-device, not the main display.
  const targets = [];
  for (const e of entities) {
    if (!/^switch\.display_/.test(e.entity_id)) continue;
    if (/_aioshelly_ble_integration$/.test(e.entity_id)) continue;
    const dev = devices.find((d) => d.id === e.device_id);
    if (!dev) continue;
    const base = urlToBase(dev.configuration_url);
    if (!base) continue;
    targets.push({
      name: e.entity_id.replace(/^switch\./, ""),
      base,
      model: dev.model ?? "(unknown)",
    });
  }
  targets.sort((a, b) => a.name.localeCompare(b.name));

  console.log(`Found ${targets.length} display(s).\n`);

  // Shelly Gen2 `Switch.SetConfig` over HTTP wants `config` URL-encoded
  // as a JSON literal. `{ in_mode: "detached" }` → query string.
  const cfg = encodeURIComponent(JSON.stringify({ in_mode: "detached" }));
  const setUrl = (base) => `${base}/rpc/Switch.SetConfig?id=0&config=${cfg}`;
  const getUrl = (base) => `${base}/rpc/Switch.GetConfig?id=0`;

  let ok = 0;
  let already = 0;
  let offline = 0;
  for (const t of targets) {
    process.stdout.write(`  ${t.name.padEnd(28)} ${t.base.padEnd(22)} `);
    let before;
    try {
      const r = await fetch(getUrl(t.base), {
        signal: AbortSignal.timeout(4000),
      });
      before = await r.json();
    } catch (err) {
      console.log("OFFLINE");
      offline++;
      continue;
    }
    if (before?.in_mode === "detached") {
      console.log(`already detached`);
      already++;
      continue;
    }
    try {
      const r = await fetch(setUrl(t.base), {
        method: "POST",
        signal: AbortSignal.timeout(4000),
      });
      const body = await r.json();
      if (body?.restart_required != null) {
        console.log(
          `was=${before?.in_mode}  → detached  (restart_required=${body.restart_required})`,
        );
        ok++;
      } else {
        console.log(`ERR  ${JSON.stringify(body)}`);
      }
    } catch (err) {
      console.log(`ERR  ${err.message}`);
    }
  }

  console.log(
    `\nSummary: ${ok} updated, ${already} already correct, ${offline} offline.`,
  );
  process.exit(0);
}
