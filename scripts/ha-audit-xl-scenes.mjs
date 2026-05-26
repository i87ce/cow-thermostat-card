// Audit the XL hero "scene shortcuts" master buttons.
//
// The cow-room-dashboard-card renders up to 4 buttons under the hero
// (cow-xl-scenes). Each button's `service:` field is dispatched by
// `onSceneTap` in cow-room-dashboard-card.ts:174 with this logic:
//
//   - split the service into `domain.method`
//   - if domain is "light" / "cover" / "climate", aggregate every
//     `rooms[].light|cover|climate` entity_id of the SAME domain from
//     the dashboard config and call the service against that explicit
//     target list (so "light.turn_on" doesn't hit `light.zw_nabu_router`
//     or any other light not listed in any room).
//   - if domain is "script" / "scene", call the service with no target.
//
// This script:
//   1. Loads the XL dashboard config.
//   2. Pulls the `scenes:` array from the cow-room-dashboard-card.
//   3. For each scene, replicates `aggregateTargetForDomain()` to
//      compute the actual targeted entity_ids.
//   4. For `script.*` scenes, also dumps the script sequence and
//      collects its targeted entities, recursively.
//   5. Compares the targeted set against the full visible HA inventory
//      of lights / covers — same "visible" filter used by the mobile
//      audit (no hidden / disabled / unavailable / unknown).
//
// Pure dry-run — never writes.
//
//   HA_HOST=... HA_TOKEN=... node scripts/ha-audit-xl-scenes.mjs
import WebSocket from "ws";

const HOST = process.env.HA_HOST;
const TOKEN = process.env.HA_TOKEN;
if (!HOST || !TOKEN) { console.error("Set HA_HOST and HA_TOKEN"); process.exit(1); }

const DASH = process.argv[2] ?? "walldisplay-sala-cucina";

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

// Walk a HA script sequence (recursive: choose/if/parallel/repeat all
// nest sub-actions) and collect every entity_id mentioned in any
// `target.entity_id` or `data.entity_id` of `service: light.*` or
// `service: cover.*` actions. Domain-only services like `light.turn_off`
// without targets (i.e. acting on "all") are flagged separately.
function walkSequence(seq, hits, flags) {
  if (!Array.isArray(seq)) return;
  for (const step of seq) {
    if (step == null || typeof step !== "object") continue;
    const svc = step.service || step.action;
    if (typeof svc === "string" && (svc.startsWith("light.") || svc.startsWith("cover."))) {
      const targets = collectTargets(step);
      if (targets.length === 0) {
        flags.push(`bare ${svc} (no target → entire domain)`);
      } else {
        for (const t of targets) {
          hits.add(t);
        }
      }
    }
    // recurse
    if (Array.isArray(step.sequence)) walkSequence(step.sequence, hits, flags);
    if (Array.isArray(step.actions)) walkSequence(step.actions, hits, flags);
    if (Array.isArray(step.then)) walkSequence(step.then, hits, flags);
    if (Array.isArray(step.else)) walkSequence(step.else, hits, flags);
    if (Array.isArray(step.choose)) {
      for (const ch of step.choose) {
        if (Array.isArray(ch?.sequence)) walkSequence(ch.sequence, hits, flags);
      }
    }
    if (Array.isArray(step.default)) walkSequence(step.default, hits, flags);
    if (step.parallel && Array.isArray(step.parallel)) walkSequence(step.parallel, hits, flags);
    if (step.repeat && Array.isArray(step.repeat.sequence)) walkSequence(step.repeat.sequence, hits, flags);
  }
}

function collectTargets(step) {
  const out = [];
  const sources = [step.target, step.data, step.service_data, step.entity_id ? { entity_id: step.entity_id } : null];
  for (const src of sources) {
    if (!src || typeof src !== "object") continue;
    const eid = src.entity_id;
    if (typeof eid === "string") out.push(eid);
    else if (Array.isArray(eid)) for (const e of eid) if (typeof e === "string") out.push(e);
  }
  return out;
}

function pad(s, n) { return String(s).padEnd(n); }

async function run() {
  const [cfg, services, states, entities] = await Promise.all([
    send("lovelace/config", { url_path: DASH }),
    send("get_services"),
    send("get_states"),
    send("config/entity_registry/list"),
  ]);
  const entityById = new Map(entities.map((e) => [e.entity_id, e]));

  // Find the room-dashboard-card.
  let card = null;
  for (const v of cfg.views ?? []) {
    for (const c of v.cards ?? []) {
      if (c.type === "custom:cow-room-dashboard-card") { card = c; break; }
    }
    if (card) break;
  }
  if (!card) {
    console.error(`cow-room-dashboard-card not found in ${DASH}`);
    process.exit(2);
  }

  const scenes = card.scenes ?? [];
  if (scenes.length === 0) {
    console.log(`No scenes configured in ${DASH}. (Master buttons strip is empty.)`);
    process.exit(0);
  }

  // The lovelace card's `service:` field is a string like
  // "script.tutto_off". To inspect what the script does, hit HA's
  // service registry: `script.<name>` services have `fields` but the
  // actual sequence lives in the entity's `attributes` of `script.<name>`
  // OR in `script.get_config` (not exposed via WS). Easiest path: read
  // `script.<name>` from get_states → attributes contain `sequence` for
  // automations only, NOT scripts. So we fall back to dumping the
  // raw script config via "config/script/config" WS command.
  async function getScriptSequence(scriptDotName) {
    // accept `script.foo` and `foo`
    const objId = scriptDotName.startsWith("script.")
      ? scriptDotName.slice("script.".length)
      : scriptDotName;
    try {
      const r = await send("config/script/config", { object_id: objId });
      return r?.sequence ?? null;
    } catch (e) {
      return { __error: e.message };
    }
  }

  // Collect the full visible HA inventory (same filter as mobile audit).
  function relevant(s) {
    const reg = entityById.get(s.entity_id);
    if (reg?.hidden_by) return false;
    if (reg?.disabled_by) return false;
    if (s.state === "unavailable" || s.state === "unknown") return false;
    return true;
  }
  const haLights = new Set(states.filter((s) => s.entity_id.startsWith("light.") && relevant(s)).map((s) => s.entity_id));
  const haCovers = new Set(states.filter((s) => s.entity_id.startsWith("cover.") && relevant(s)).map((s) => s.entity_id));

  console.log("=".repeat(78));
  console.log(`XL scene-shortcuts audit — dashboard: ${DASH}`);
  console.log("=".repeat(78));
  console.log(`Scenes configured: ${scenes.length}`);
  console.log(`Visible lights in HA:  ${haLights.size}`);
  console.log(`Visible covers in HA:  ${haCovers.size}`);

  // Build the XL aggregation map exactly like
  // cow-room-dashboard-card.ts:aggregateTargetForDomain.
  function aggregateForDomain(domain) {
    const ids = [];
    for (const room of card.rooms ?? []) {
      if (domain === "light" && room.light) {
        ids.push(...(Array.isArray(room.light) ? room.light : [room.light]));
      } else if (domain === "cover" && room.cover) {
        ids.push(...(Array.isArray(room.cover) ? room.cover : [room.cover]));
      } else if (domain === "climate" && room.climate) {
        ids.push(room.climate);
      }
    }
    return ids;
  }

  for (const sc of scenes) {
    console.log("\n" + "─".repeat(78));
    console.log(`▶ "${sc.name}"  (service: ${sc.service ?? "<none>"})`);
    console.log("─".repeat(78));
    if (!sc.service) {
      console.log("  ! no service bound — button is a no-op.");
      continue;
    }
    const [domain, method] = sc.service.split(".");
    if (!domain || !method) {
      console.log(`  ! malformed service "${sc.service}" — skipping.`);
      continue;
    }

    if (domain === "light" || domain === "cover" || domain === "climate") {
      // Replicate the XL card's aggregation.
      const target = aggregateForDomain(domain);
      console.log(`  Aggregated from rooms[].${domain}: ${target.length} target(s)`);
      const haSet = domain === "light" ? haLights : domain === "cover" ? haCovers : null;
      if (!haSet) continue;
      const missing = [...haSet].filter((e) => !target.includes(e)).sort();
      const stale = target.filter((e) => !haSet.has(e) && !states.some((s) => s.entity_id === e)).sort();
      console.log(`  Visible ${domain}s NOT touched (${missing.length}):`);
      if (missing.length === 0) console.log("    ✓ none");
      else for (const e of missing) console.log(`      - ${pad(e, 50)}`);
      if (stale.length > 0) {
        console.log(`  Stale entries in config (entity not in HA, ${stale.length}):`);
        for (const e of stale) console.log(`      ! ${pad(e, 50)}`);
      }
      continue;
    }

    if (domain !== "script") {
      console.log(`  service domain "${domain}" not auto-introspected.`);
      continue;
    }

    const seq = await getScriptSequence(sc.service);
    if (seq && seq.__error) {
      console.log(`  ✗ couldn't fetch script config: ${seq.__error}`);
      continue;
    }
    if (!seq) {
      console.log(`  ✗ script ${sc.service} has no sequence (or not in YAML storage).`);
      continue;
    }
    const hits = new Set();
    const flags = [];
    walkSequence(seq, hits, flags);
    const lightHits = [...hits].filter((e) => e.startsWith("light.")).sort();
    const coverHits = [...hits].filter((e) => e.startsWith("cover.")).sort();
    const groupHits = [...hits].filter((e) => !e.startsWith("light.") && !e.startsWith("cover.")).sort();
    console.log(`  Script targets — lights: ${lightHits.length}  covers: ${coverHits.length}  groups/other: ${groupHits.length}`);
    if (flags.length > 0) for (const f of flags) console.log(`    ⚠ ${f}`);
    if (groupHits.length > 0) {
      console.log("    (non-light/cover targets — likely groups/scenes that fan out:)");
      for (const g of groupHits) console.log(`      - ${g}`);
    }
    if (lightHits.length > 0) {
      const missingL = [...haLights].filter((e) => !lightHits.includes(e)).sort();
      console.log(`  Visible lights NOT touched (${missingL.length}):`);
      for (const e of missingL) console.log(`    - ${pad(e, 50)}`);
    }
    if (coverHits.length > 0) {
      const missingC = [...haCovers].filter((e) => !coverHits.includes(e)).sort();
      console.log(`  Visible covers NOT touched (${missingC.length}):`);
      for (const e of missingC) console.log(`    - ${pad(e, 50)}`);
    }
  }

  ws.close();
  process.exit(0);
}

setTimeout(() => { console.error("timeout"); process.exit(3); }, 25_000);
