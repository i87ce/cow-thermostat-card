/**
 * Auto-discovery of Ajax Systems door/window openings.
 *
 * Every Ajax door/window detector (door_protect, door_protect_plus, …)
 * exposes an entity ``binary_sensor.<device>_contact`` (and optionally
 * ``_extra_contact`` for the wired loop on the Plus model) with HA
 * device_class ``opening`` — ``on`` means the contact is open. By
 * filtering the entity registry on ``platform === 'ha_ajax'`` we pull
 * those out without the user having to wire them up by hand in card
 * config.
 *
 * The fork of the integration also publishes a per-device
 * ``sensor.<device>_ajax_room`` (state = the Ajax-side room name) whose
 * presence is *not* required by this module — when present we attach
 * the Ajax room name to the result for prettier copy in the UI.
 *
 * All callers should treat missing registries (``hass.entities`` etc.)
 * as "nothing to show": the HA frontend takes a few seconds after
 * bootstrap before they're populated, and a card render that races
 * with that should degrade gracefully rather than throw.
 */
import { svg, type SVGTemplateResult } from "lit";

import type {
  HomeAssistant,
  HassDeviceRegistryEntry,
  HassEntityRegistryEntry,
} from "../types/hass.js";

/**
 * Physical kind of an opening, inferred from the device name.
 *
 * Ajax's protocol exposes ``door_protect`` / ``door_protect_plus`` for
 * both doors and windows — the user is the only one who knows which is
 * which, via the name they typed in the Ajax app. We infer with a small
 * IT/EN keyword heuristic and default to ``door`` (the most common
 * placement and the safest "I don't know" icon).
 */
export type OpeningKind = "door" | "window" | "garage";

export interface AjaxOpening {
  /** Canonical entity_id of the binary_sensor (the door/window contact). */
  entityId: string;
  /** Friendly label combining the device name + entity translation. */
  label: string;
  /** Raw device name from the device registry (no entity-name suffix). */
  deviceName: string;
  /** Physical kind inferred from the device name (defaults to "door"). */
  kind: OpeningKind;
  /** ``true`` iff the door/window is currently open. */
  isOpen: boolean;
  /** Raw state for advanced consumers ("on" = open, "off" = closed,
   *  "unavailable" / "unknown" pass through unchanged). */
  rawState: string;
  /** HA area_id the device is registered to, if any. */
  areaId?: string;
  /** Human-readable area name resolved from the area registry. */
  areaName?: string;
  /** Ajax-side room name, when the ``ajax_room`` sensor is present. */
  ajaxRoomName?: string;
  /** ``true`` when this is the secondary wired contact (extra_contact). */
  isExtraContact: boolean;
}

const HA_AJAX_PLATFORM = "ha_ajax";
// HA suffixes entity_ids with ``_2``, ``_3`` … when two devices share a
// friendly name (very common with Ajax — e.g. two "Porta Ingresso"
// detectors on a double door). The naive ``endsWith('_contact')`` and
// ``endsWith('_extra_contact')`` therefore miss every secondary unit.
// We match on ``_contact`` / ``_extra_contact`` anywhere in the id and
// distinguish primary-vs-extra by presence of ``_extra_`` rather than
// the trailing token. ROOM_SENSOR_SUFFIX stays an endsWith because the
// integration emits exactly one room sensor per device and no `_2`
// variants exist.
const OPENING_TOKEN = "_contact";
const EXTRA_CONTACT_TOKEN = "_extra_contact";
const ROOM_SENSOR_SUFFIX = "_ajax_room";

export interface FindAjaxOpeningsOpts {
  /**
   * Include the secondary wired-loop contact (``_extra_contact``)
   * emitted by every door_protect_plus device. Almost no user actually
   * wires the 3.5 mm jack input, so by default the extra contact is
   * always-closed noise and we skip it to avoid "duplicate" pills
   * next to the primary contact. Set ``true`` to include them
   * (e.g. for an advanced/diagnostics view).
   */
  includeExtraContacts?: boolean;
}

/**
 * Discover every Ajax opening exposed to the HA frontend.
 *
 * Filters disabled / hidden registry entries so the resulting list
 * mirrors what the user actually sees in the Devices & Services UI.
 * Sort order is stable (by area name → device name → primary-before-
 * extra-contact) so card renders don't reshuffle between updates.
 *
 * By default skips the door_protect_plus secondary contact (most
 * users don't wire the external 3.5 mm input — it just sits closed
 * forever and looks like a duplicate of the primary REED). Pass
 * ``{ includeExtraContacts: true }`` to surface them.
 */
export function findAjaxOpenings(
  hass: HomeAssistant | undefined,
  opts: FindAjaxOpeningsOpts = {},
): AjaxOpening[] {
  if (!hass || !hass.entities) return [];
  const includeExtra = opts.includeExtraContacts === true;
  const out: AjaxOpening[] = [];
  for (const reg of Object.values(hass.entities)) {
    if (reg.platform !== HA_AJAX_PLATFORM) continue;
    if (!reg.entity_id.startsWith("binary_sensor.")) continue;
    if (reg.disabled || reg.hidden) continue;

    // device_class is the authoritative signal for "is this an opening
    // sensor"; the entity_id token check below only distinguishes
    // primary vs secondary, it does not gate inclusion.
    const state = hass.states[reg.entity_id];
    if (!state) continue;
    if (state.attributes?.device_class !== "opening") continue;
    if (!reg.entity_id.includes(OPENING_TOKEN)) continue;

    const isExtra = reg.entity_id.includes(EXTRA_CONTACT_TOKEN);
    if (isExtra && !includeExtra) continue;

    const device = reg.device_id ? hass.devices?.[reg.device_id] : undefined;
    const areaId = reg.area_id ?? device?.area_id;
    const area = areaId ? hass.areas?.[areaId] : undefined;
    const deviceName = device?.name_by_user || device?.name || reg.entity_id;
    const friendly =
      (state.attributes?.friendly_name as string | undefined) ?? deviceName;

    out.push({
      entityId: reg.entity_id,
      label: friendly,
      deviceName,
      kind: inferOpeningKind(deviceName),
      isOpen: state.state === "on",
      rawState: state.state,
      areaId,
      areaName: area?.name,
      ajaxRoomName: lookupAjaxRoomName(hass, reg.device_id),
      isExtraContact: isExtra,
    });
  }
  out.sort((a, b) => {
    const byArea = (a.areaName ?? "").localeCompare(b.areaName ?? "");
    if (byArea !== 0) return byArea;
    const byDevice = a.deviceName.localeCompare(b.deviceName);
    if (byDevice !== 0) return byDevice;
    return Number(a.isExtraContact) - Number(b.isExtraContact);
  });
  return out;
}

/**
 * Subset of {@link findAjaxOpenings} restricted to one HA area —
 * with multi-area awareness for composite room names.
 *
 * The mobile dashboard's room names sometimes span two HA areas
 * (``"Sala & Cucina"``, ``"Sala / Cucina"``, ``"Sala e Cucina"``).
 * Single-token matching against the area registry would return
 * nothing for those rooms because no HA area is named with the
 * separator. We split on common conjunctions and aggregate openings
 * from every area that matches a token, deduped by entity_id.
 *
 * Accepts either an ``area_id`` (stable), a single area name, or a
 * multi-area string with ``&`` / ``+`` / ``,`` / ``/`` / `` e `` /
 * `` and `` separators. Name lookup is case- and accent-insensitive.
 */
export function findAjaxOpeningsInArea(
  hass: HomeAssistant | undefined,
  areaIdOrName: string | undefined,
  opts: FindAjaxOpeningsOpts = {},
): AjaxOpening[] {
  if (!areaIdOrName) return [];
  const all = findAjaxOpenings(hass, opts);
  if (all.length === 0) return [];
  const targets = resolveAreaIds(hass, areaIdOrName);
  if (targets.size === 0) return [];
  // Dedupe by entityId — a single entity is never assigned to two
  // areas in practice, but stay defensive against future overlap.
  const seen = new Set<string>();
  const out: AjaxOpening[] = [];
  for (const o of all) {
    if (!o.areaId || !targets.has(o.areaId)) continue;
    if (seen.has(o.entityId)) continue;
    seen.add(o.entityId);
    out.push(o);
  }
  return out;
}

/**
 * Resolve the HA area of a ``climate.*`` entity and return any Ajax
 * openings in the same area.
 *
 * Used by the thermostat card to surface a "window is open while the
 * room is being heated" warning. Returns an empty array when the climate
 * has no area assigned — silently, because the climate UI is still
 * useful without the side-warning.
 */
export function findAjaxOpeningsForClimate(
  hass: HomeAssistant | undefined,
  climateEntityId: string | undefined,
): AjaxOpening[] {
  if (!hass || !climateEntityId) return [];
  const reg = hass.entities?.[climateEntityId];
  const device = reg?.device_id ? hass.devices?.[reg.device_id] : undefined;
  const areaId = reg?.area_id ?? device?.area_id;
  if (!areaId) return [];
  return findAjaxOpenings(hass).filter((o) => o.areaId === areaId);
}

/** ``true`` iff at least one opening in the list is currently open. */
export function hasOpenContacts(openings: AjaxOpening[]): boolean {
  for (const o of openings) {
    if (o.isOpen) return true;
  }
  return false;
}

/** Count of currently-open contacts. */
export function countOpenContacts(openings: AjaxOpening[]): number {
  let n = 0;
  for (const o of openings) {
    if (o.isOpen) n++;
  }
  return n;
}

/**
 * One-liner description of open contacts, IT-locale wording.
 *
 * Examples:
 *   - 0 open  → ""             (caller decides whether to render at all)
 *   - 1 open  → "Sala 1 aperta"
 *   - 2 open  → "Sala 1, Porta Ingresso aperte"
 *   - 4+ open → "4 aperture"   (collapses to count to keep the strip short)
 */
export function describeOpenContacts(openings: AjaxOpening[]): string {
  const open = openings.filter((o) => o.isOpen);
  if (open.length === 0) return "";
  if (open.length >= 4) return `${open.length} aperture`;
  const names = open.map((o) => formatContactName(o));
  if (open.length === 1) return `${names[0]} aperta`;
  return `${names.join(", ")} aperte`;
}

/** Display name for one contact, disambiguating the secondary loop. */
function formatContactName(o: AjaxOpening): string {
  return o.isExtraContact ? `${o.deviceName} (extra)` : o.deviceName;
}

/* ────────────────────────────────────────────────────────────────────── */

/** Resolve a single area_id from either an id or a display name. */
function resolveAreaId(
  hass: HomeAssistant | undefined,
  areaIdOrName: string,
): string | undefined {
  if (!hass?.areas) return undefined;
  if (hass.areas[areaIdOrName]) return areaIdOrName;
  const n = normaliseName(areaIdOrName);
  for (const a of Object.values(hass.areas)) {
    if (normaliseName(a.name) === n) return a.area_id;
  }
  return undefined;
}

/**
 * Multi-area resolver: split the input on common conjunctions and
 * collect every matching area_id. Returns a Set so callers can do
 * O(1) membership tests against per-opening area_id.
 *
 * Examples (assuming HA has areas "Sala", "Cucina", "Camera 1"):
 *   ``"Sala"``              → { "sala_id" }
 *   ``"Sala & Cucina"``     → { "sala_id", "cucina_id" }
 *   ``"Sala / Cucina"``     → { "sala_id", "cucina_id" }
 *   ``"Sala e Cucina"``     → { "sala_id", "cucina_id" }
 *   ``"Bagno Ospiti"``      → { "bagno_ospiti_id" }  (no token split)
 *
 * The single-token form is tried first; only if it fails do we split
 * on separators, so a real area named ``"A & B"`` would still be
 * found as one match (defensive against weird namings).
 */
function resolveAreaIds(
  hass: HomeAssistant | undefined,
  areaIdOrName: string,
): Set<string> {
  const out = new Set<string>();
  if (!hass?.areas) return out;
  // Pass 1: full string match (handles area_id direct + exact name).
  const direct = resolveAreaId(hass, areaIdOrName);
  if (direct) out.add(direct);
  // Pass 2: split on conjunctions/punctuation and resolve each token.
  // We split aggressively — any of ``&``, ``+``, ``,``, ``/``, or
  // standalone words ``e`` / ``and`` / ``con`` — then trim. Common
  // result on the user's setup: ``Sala & Cucina`` → ["Sala","Cucina"].
  for (const token of areaIdOrName.split(/\s*(?:[&+,/]|\b(?:e|and|con)\b)\s*/i)) {
    const t = token.trim();
    if (!t || t === areaIdOrName) continue;
    const id = resolveAreaId(hass, t);
    if (id) out.add(id);
  }
  return out;
}

/** Lower-case, NFKD-strip-accents, collapse whitespace. */
function normaliseName(s: string): string {
  return s
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ");
}

/**
 * Look up the Ajax room sensor that the ha_ajax fork attaches to every
 * device. Returns ``undefined`` when the sensor is missing or in a
 * non-textual state (unknown / unavailable).
 */
function lookupAjaxRoomName(
  hass: HomeAssistant,
  deviceId: string | undefined,
): string | undefined {
  if (!deviceId || !hass.entities) return undefined;
  for (const reg of Object.values(hass.entities)) {
    if (reg.device_id !== deviceId) continue;
    if (!reg.entity_id.endsWith(ROOM_SENSOR_SUFFIX)) continue;
    const st = hass.states[reg.entity_id];
    if (!st) return undefined;
    if (st.state === "unknown" || st.state === "unavailable") return undefined;
    return st.state;
  }
  return undefined;
}

/** Type guard: ignores synthetic / pseudo devices (not Ajax). */
export function isAjaxDevice(d: HassDeviceRegistryEntry | undefined): boolean {
  if (!d?.identifiers) return false;
  return d.identifiers.some(([domain]) => domain === HA_AJAX_PLATFORM);
}

/** Internal alias for symmetry with isAjaxDevice; re-exported for tests. */
export function isAjaxRegistryEntry(
  e: HassEntityRegistryEntry | undefined,
): boolean {
  return e?.platform === HA_AJAX_PLATFORM;
}

/* ────────────────────────────────────────────────────────────────────── */
/*  Opening-kind inference + MDI icon rendering                            */
/* ────────────────────────────────────────────────────────────────────── */

/**
 * Guess whether a contact sensor sits on a door, window, or garage door
 * from the user-chosen device name.
 *
 * Ajax's device type (``door_protect`` / ``door_protect_plus``) is the
 * same hardware regardless of placement, so we lean on the name. Order
 * matters: garage wins over door so "Porta Garage" still gets the
 * garage glyph; window matches before door so "Finestra Cucina" is a
 * window.
 *
 * Default falls back to ``door`` which is wrong for most consumer
 * installs (windows are far more common). Pass an explicit
 * ``OpeningKindOverrides.default`` from the host card to flip it.
 */
export function inferOpeningKind(deviceName: string): OpeningKind {
  const n = deviceName.toLowerCase();
  if (/\b(garage|box|serranda|cancell)/.test(n)) return "garage";
  if (/\b(finestra|window|vetrata|lucernaio)/.test(n)) return "window";
  if (/\b(porta|portoncin|portone|door|gate|ingresso|balcon)/.test(n)) {
    return "door";
  }
  // Default: window — in real-world Italian residential installs the
  // overwhelming majority of Ajax DoorProtect contacts sit on a window
  // sash (one per room is the typical layout, vs. 2-3 doors per house).
  // Naming heuristics above catch the door/garage/balcony cases by
  // keyword; everything else (rooms named "Sala 1", "Cucina 2", "Camera
  // 3") falls through to here and is far more likely to be a window.
  // Cards can still flip this per-device via opening_doors / etc.
  return "window";
}

/**
 * Explicit per-device kind overrides from card config.
 *
 * The auto-inference is decent but always loses against deployments
 * where Ajax detectors are named after the room (``Sala 1``, ``Cucina 2``,
 * ``Bagno Ospiti``) rather than the fixture. This struct lets the host
 * card flip individual devices via a small YAML block:
 *
 * ```yaml
 * opening_defaults:
 *   kind: window      # everything not listed below
 * opening_doors:
 *   - Garage
 *   - Porta Ingresso  # matches both Sala's and Ingresso PT's "Porta Ingresso"
 * opening_windows: []
 * opening_garages: []
 * ```
 *
 * Matching is exact (case-insensitive) against ``AjaxOpening.deviceName``,
 * i.e. the user-facing name as set in the Ajax mobile app. Two devices
 * sharing a name (HA appends ``_2`` to the entity_id but the device
 * name stays the same) are both matched — that's the common case for
 * twin units on a double door.
 */
export interface OpeningKindOverrides {
  /** Fallback kind when no per-device rule matches. Defaults to inference. */
  default?: OpeningKind;
  /** Device names (case-insensitive, exact) that are doors. */
  doors?: string[];
  /** Device names that are windows. */
  windows?: string[];
  /** Device names that are garage doors. */
  garages?: string[];
}

function lowerSet(arr: string[] | undefined): Set<string> {
  if (!arr || arr.length === 0) return new Set();
  return new Set(arr.map((s) => s.toLowerCase().trim()).filter(Boolean));
}

/**
 * Return a new AjaxOpening with ``kind`` overridden according to the
 * config. Per-device explicit lists win over the ``default``, which
 * wins over the automatic inference already on the input opening.
 *
 * Pure function, no mutation — safe to call inside render loops.
 */
export function applyKindOverrides(
  openings: AjaxOpening[],
  overrides: OpeningKindOverrides | undefined,
): AjaxOpening[] {
  if (!overrides) return openings;
  const doors = lowerSet(overrides.doors);
  const windows = lowerSet(overrides.windows);
  const garages = lowerSet(overrides.garages);
  const fallback = overrides.default;
  if (doors.size === 0 && windows.size === 0 && garages.size === 0 && !fallback) {
    return openings;
  }
  return openings.map((o) => {
    const k = o.deviceName.toLowerCase().trim();
    let kind: OpeningKind;
    if (garages.has(k)) kind = "garage";
    else if (doors.has(k)) kind = "door";
    else if (windows.has(k)) kind = "window";
    else if (fallback) kind = fallback;
    else kind = o.kind;
    return kind === o.kind ? o : { ...o, kind };
  });
}

/**
 * Material Design Icon SVG paths for the four (kind, state) pairs we
 * render. Keyed by ``"<kind>:<open|closed>"``. Sourced verbatim from
 * the MDI 24×24 viewBox so a Lit ``<svg viewBox="0 0 24 24">`` wrapper
 * is enough to scale them.
 *
 * Why hard-coded paths instead of pulling MDI at runtime: the cards are
 * a zero-dep bundle (see comment in ``types/hass.ts``). Adding the
 * 200 KB MDI package for four glyphs would dwarf the rest of the build.
 */
const MDI_OPENING_PATHS: Record<string, string> = {
  "door:closed":
    "M8 3c-1.11 0-2 .89-2 2v16h12V5c0-1.11-.89-2-2-2zm0 2h8v14H8zm5 6v2h2v-2z",
  "door:open":
    "M12 3c-1.11 0-2 .89-2 2H3v14H2v2h20v-2h-1V5c0-1.11-.89-2-2-2zm0 2h7v14h-7zm-7 6h2v2H5z",
  "window:closed":
    "M21 20V2H3v18H1v3h22v-3M19 4v7h-6V4M5 4h6v7H5m0 9v-7h6v7m2 0v-7h6v7Z",
  "window:open":
    "M21 20V2H3v18H1v3h22v-3M19 4v7h-2V4M5 4h2v7H5m0 9v-7h2v7m2 0V4h6v16m2 0v-7h2v7Z",
  "garage:closed":
    "M19 20h-2v-9H7v9H5V9l7-4l7 4zM8 12h8v2H8zm0 3h8v2H8zm8 3v2H8v-2z",
  "garage:open": "M19 20h-2v-9H7v9H5V9l7-4l7 4zM8 12h8v2H8z",
};

/**
 * Render an MDI door/window/garage glyph for a given opening state.
 *
 * Returns a Lit ``svg`` template you can interpolate directly into a
 * card's ``render()``. The ``size`` is applied to both width and height
 * (square 1:1, MDI's native aspect). The ``color`` is passed straight
 * to ``fill`` — pass an HA semantic token (``var(--cow-stop)``,
 * ``var(--cow-text-disabled)``, …) rather than a hex literal so themes
 * keep working.
 */
export function openingIconSvg(
  kind: OpeningKind,
  open: boolean,
  size = 24,
  color = "currentColor",
): SVGTemplateResult {
  const key = `${kind}:${open ? "open" : "closed"}`;
  const path = MDI_OPENING_PATHS[key] ?? MDI_OPENING_PATHS["door:closed"];
  return svg`
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="${size}"
      height="${size}"
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <path fill="${color}" d="${path}" />
    </svg>
  `;
}
