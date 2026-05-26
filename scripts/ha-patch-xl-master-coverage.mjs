// Bring the XL cow-room-dashboard-card "Luci ON/OFF" + "Tapparelle
// SU/GIÙ" master buttons (scene-shortcuts under the hero) to 100%
// coverage of the visible HA inventory.
//
// Three idempotent patches on `walldisplay-sala-cucina`:
//
//   1. Rename room "Lavanderia" → "Servizi" (mirrors how the mobile
//      dashboard categorizes those entities).
//   2. In the renamed room: append "Locale Tecnico" to `areas:` (so
//      Ajax openings discovery still works for the laundry/tech area)
//      and add `light.luce_locale_tecnico` to `light:`. Keeps the
//      existing `cover:` and `light_labels:` aligned.
//   3. In "Sala & Cucina": add `light.led_tv_soggiorno` to `light:`
//      with label "Strip TV" appended to `light_labels:` (creates
//      light_labels if missing, padding earlier entries with their
//      entity object_id so HA falls back to friendly_name).
//
// Dry-run by default; pass --apply to push to HA.
//
//   HA_HOST=... HA_TOKEN=... node scripts/ha-patch-xl-master-coverage.mjs
//   HA_HOST=... HA_TOKEN=... node scripts/ha-patch-xl-master-coverage.mjs --apply
import WebSocket from "ws";

const APPLY = process.argv.includes("--apply");
const HOST = process.env.HA_HOST;
const TOKEN = process.env.HA_TOKEN;
if (!HOST || !TOKEN) { console.error("Set HA_HOST and HA_TOKEN"); process.exit(1); }

const DASH = "walldisplay-sala-cucina";
const RENAME_FROM = "Lavanderia";
const RENAME_TO = "Servizi";
const SERVIZI_NEW_AREA = "Locale Tecnico";
const SERVIZI_NEW_LIGHT = "light.luce_locale_tecnico";

const SALA = "Sala & Cucina";
const SALA_NEW_LIGHT = "light.led_tv_soggiorno";
const SALA_NEW_LABEL = "Strip TV";

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
  if (m.type === "auth_required") return ws.send(JSON.stringify({ type: "auth", access_token: TOKEN }));
  if (m.type === "auth_invalid") { console.error("auth_invalid"); process.exit(1); }
  if (m.type === "auth_ok") return run().catch((e) => { console.error("ERR", e); process.exit(1); });
  if (m.id != null && pending.has(m.id)) {
    const p = pending.get(m.id);
    pending.delete(m.id);
    if (m.success === false) p.rej(new Error(JSON.stringify(m.error)));
    else p.res(m.result);
  }
});
ws.on("error", (e) => { console.error("WS", e.message); process.exit(1); });

function toArr(v) {
  if (v == null) return [];
  return Array.isArray(v) ? v.slice() : [v];
}

async function run() {
  const cfg = await send("lovelace/config", { url_path: DASH });
  let card = null;
  for (const v of cfg.views ?? []) {
    for (const c of v.cards ?? []) {
      if (c.type === "custom:cow-room-dashboard-card") { card = c; break; }
    }
    if (card) break;
  }
  if (!card) { console.error("cow-room-dashboard-card not found"); process.exit(2); }

  let mutations = 0;

  // ── 1+2. Lavanderia → Servizi + add Locale Tecnico + luce_locale_tecnico
  const lav = (card.rooms ?? []).find(
    (r) => r.name === RENAME_FROM || r.name === RENAME_TO,
  );
  console.log("=".repeat(72));
  console.log("Servizi (was Lavanderia)");
  console.log("=".repeat(72));
  if (!lav) {
    console.log(`! neither "${RENAME_FROM}" nor "${RENAME_TO}" room found — skipping`);
  } else {
    if (lav.name !== RENAME_TO) {
      console.log(`+ name: "${lav.name}" → "${RENAME_TO}"`);
      lav.name = RENAME_TO;
      mutations++;
    } else {
      console.log(`✓ name already "${RENAME_TO}"`);
    }

    const areas = toArr(lav.areas);
    if (!areas.includes(SERVIZI_NEW_AREA)) {
      console.log(`+ areas: ${JSON.stringify(areas)} → add "${SERVIZI_NEW_AREA}"`);
      areas.push(SERVIZI_NEW_AREA);
      lav.areas = areas;
      mutations++;
    } else {
      console.log(`✓ areas already include "${SERVIZI_NEW_AREA}"`);
    }

    const lights = toArr(lav.light);
    if (!lights.includes(SERVIZI_NEW_LIGHT)) {
      console.log(`+ light: ${JSON.stringify(lights)} → add ${SERVIZI_NEW_LIGHT}`);
      lights.push(SERVIZI_NEW_LIGHT);
      lav.light = lights;
      mutations++;
      // No light_labels handling for Servizi — current Lavanderia
      // doesn't expose them; HA falls back to friendly_name.
      if (Array.isArray(lav.light_labels)) {
        // If labels exist, pad to length to keep indices aligned. We
        // can't invent a label, so we push the entity's object_id.
        while (lav.light_labels.length < lights.length - 1) {
          lav.light_labels.push("");
        }
        lav.light_labels.push("Locale tecnico");
      }
    } else {
      console.log(`✓ light already includes ${SERVIZI_NEW_LIGHT}`);
    }

    console.log(`  → Servizi: light=${JSON.stringify(toArr(lav.light))} areas=${JSON.stringify(toArr(lav.areas))}`);
  }

  // ── 3. Sala & Cucina: add led_tv_soggiorno + "Strip TV" label
  const sala = (card.rooms ?? []).find((r) => r.name === SALA);
  console.log("\n" + "=".repeat(72));
  console.log(SALA);
  console.log("=".repeat(72));
  if (!sala) {
    console.log(`! "${SALA}" room not found — skipping`);
  } else {
    const lights = toArr(sala.light);
    if (lights.includes(SALA_NEW_LIGHT)) {
      console.log(`✓ light already includes ${SALA_NEW_LIGHT}`);
    } else {
      console.log(`+ light: append ${SALA_NEW_LIGHT}`);
      lights.push(SALA_NEW_LIGHT);
      sala.light = lights;
      mutations++;

      // Keep light_labels aligned: create or pad as needed, then push
      // the friendly label so it shows on the tile.
      if (!Array.isArray(sala.light_labels)) sala.light_labels = [];
      while (sala.light_labels.length < lights.length - 1) {
        sala.light_labels.push("");
      }
      sala.light_labels.push(SALA_NEW_LABEL);
      console.log(`+ light_labels: append "${SALA_NEW_LABEL}"`);
    }
    console.log(`  → ${SALA}: light=${JSON.stringify(toArr(sala.light))}`);
    if (sala.light_labels) console.log(`    light_labels=${JSON.stringify(sala.light_labels)}`);
  }

  console.log(`\nMutations queued: ${mutations}`);
  if (mutations === 0) {
    console.log("✓ already up to date — nothing to do.");
    ws.close();
    process.exit(0);
  }

  if (!APPLY) {
    console.log("Dry-run — pass --apply to push to HA.");
    process.exit(0);
  }

  await send("lovelace/config/save", { url_path: DASH, config: cfg });
  console.log("✓ Saved updated dashboard config");
  process.exit(0);
}

setTimeout(() => { console.error("timeout"); process.exit(3); }, 25_000);
