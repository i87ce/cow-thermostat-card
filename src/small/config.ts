/**
 * Card configuration schema for `cow-thermostat-card` v2.
 *
 * Two YAML shapes are accepted:
 *
 *   1. Preferred (v2)
 *      lights:
 *        - { entity: light.cucina_soffitto, label: Soffitto }
 *        - { entity: light.cucina_tavolo,   label: Tavolo   }
 *      covers:
 *        - { entity: cover.cucina_finestra, label: Finestra }
 *
 *   2. Legacy (v1, still supported for back-compat with deployed YAML)
 *      light:        [light.cucina_soffitto, light.cucina_tavolo]
 *      light_labels: [Soffitto, Tavolo]
 *      cover:        [cover.cucina_finestra]
 *      cover_labels: [Finestra]
 *
 * Either shape normalizes to the same internal `CowConfig`.
 */

export type InitialView = "thermostat" | "lights" | "blinds";
export type OpeningKind = "door" | "window" | "garage";

export interface DeviceEntry {
  entity: string;
  label: string;
}

export interface CowConfig {
  type: "custom:cow-thermostat-card";
  room: string;
  climate?: string;
  lights: DeviceEntry[];
  covers: DeviceEntry[];
  outdoor_temp?: string;
  local_temp?: string;
  local_humidity?: string;
  initial_view: InitialView;
  /**
   * HA areas this card "owns" — drives Ajax openings discovery.
   * Strings are matched against the area registry by display name
   * (case-insensitive, accent-folded). Multi-area entries are
   * supported for composite spaces like a Sala-Cucina open plan.
   *
   * When omitted the card falls back to fuzzy-matching the ``room``
   * display name, which works for 1:1 rooms (``"Camera 1"`` →
   * area ``"Camera 1"``) but not for renamed composites.
   */
  areas: string[];
  /** Default opening kind when no per-device rule matches. */
  opening_default_kind?: OpeningKind;
  /** Device names (case-insensitive) that are doors. */
  opening_doors: string[];
  /** Device names that are windows. */
  opening_windows: string[];
  /** Device names that are garage doors. */
  opening_garages: string[];
}

export class CowConfigError extends Error {
  constructor(message: string) {
    super(`[cow-thermostat-card] ${message}`);
  }
}

const DOMAIN_LIGHT = "light.";
const DOMAIN_COVER = "cover.";
const DOMAIN_CLIMATE = "climate.";
const DOMAIN_SENSOR = "sensor.";

/**
 * Strip common entity-id noise (`led_`, `luce_`, room slug) and
 * Title-Case the rest, so `light.cucina_luce_tavolo` → "Tavolo".
 */
function autoLabel(entityId: string, room: string): string {
  const obj = entityId.split(".")[1] ?? entityId;
  const slug = room
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  let s = obj.toLowerCase();
  if (slug.length > 0) {
    s = s
      .replace(new RegExp(`^${slug}_`), "")
      .replace(new RegExp(`_${slug}$`), "")
      .replace(new RegExp(`_${slug}_`), "_");
  }
  s = s.replace(/^(led|luce|light|cover|tapparella|blind|tenda)_/, "");
  if (s.length === 0) s = obj;
  return s
    .split("_")
    .filter((p) => p.length > 0)
    .map((p) => p[0].toUpperCase() + p.slice(1))
    .join(" ");
}

function readDevices(
  raw: unknown,
  rawLegacy: unknown,
  rawLegacyLabels: unknown,
  domain: string,
  key: string,
  room: string,
): DeviceEntry[] {
  if (raw != null) {
    if (!Array.isArray(raw)) {
      throw new CowConfigError(`'${key}' must be a list`);
    }
    return raw.map((v, i) => normalizeEntry(v, domain, `${key}[${i}]`, room));
  }
  if (rawLegacy != null) {
    const legacyKey = key === "lights" ? "light" : "cover";
    const labelsKey = `${legacyKey}_labels`;
    const arr = Array.isArray(rawLegacy) ? rawLegacy : [rawLegacy];
    const labels = Array.isArray(rawLegacyLabels) ? rawLegacyLabels : null;
    if (labels && labels.length !== arr.length) {
      throw new CowConfigError(
        `'${labelsKey}' has ${labels.length} entries but '${legacyKey}' has ${arr.length}`,
      );
    }
    return arr.map((v, i) => {
      if (typeof v !== "string" || !v.startsWith(domain)) {
        throw new CowConfigError(
          `'${legacyKey}[${i}]' must be a ${domain}* entity`,
        );
      }
      const lbl =
        labels && typeof labels[i] === "string" && labels[i].length > 0
          ? (labels[i] as string)
          : autoLabel(v, room);
      return { entity: v, label: lbl };
    });
  }
  return [];
}

function normalizeEntry(
  v: unknown,
  domain: string,
  loc: string,
  room: string,
): DeviceEntry {
  if (typeof v === "string") {
    if (!v.startsWith(domain)) {
      throw new CowConfigError(`'${loc}' must be a ${domain}* entity`);
    }
    return { entity: v, label: autoLabel(v, room) };
  }
  if (typeof v === "object" && v !== null) {
    const o = v as Record<string, unknown>;
    const entity = o.entity;
    if (typeof entity !== "string" || !entity.startsWith(domain)) {
      throw new CowConfigError(`'${loc}.entity' must be a ${domain}* entity`);
    }
    const label =
      typeof o.label === "string" && o.label.length > 0
        ? o.label
        : autoLabel(entity, room);
    return { entity, label };
  }
  throw new CowConfigError(`'${loc}' must be a string or {entity,label}`);
}

function optionalEntity(
  cfg: Record<string, unknown>,
  key: string,
  domain: string,
): string | undefined {
  const v = cfg[key];
  if (v == null) return undefined;
  if (typeof v !== "string" || !v.startsWith(domain)) {
    throw new CowConfigError(`'${key}' must be a ${domain}* entity`);
  }
  return v;
}

export function validateConfig(input: unknown): CowConfig {
  if (typeof input !== "object" || input === null) {
    throw new CowConfigError("Configuration must be an object");
  }
  const cfg = input as Record<string, unknown>;

  const room =
    typeof cfg.room === "string" && cfg.room.length > 0 ? cfg.room : "Room";

  const climate = optionalEntity(cfg, "climate", DOMAIN_CLIMATE);
  const lights = readDevices(
    cfg.lights,
    cfg.light,
    cfg.light_labels,
    DOMAIN_LIGHT,
    "lights",
    room,
  );
  const covers = readDevices(
    cfg.covers,
    cfg.cover,
    cfg.cover_labels,
    DOMAIN_COVER,
    "covers",
    room,
  );

  if (!climate && lights.length === 0 && covers.length === 0) {
    throw new CowConfigError(
      "At least one of 'climate', 'lights' or 'covers' must be configured",
    );
  }

  const initial = ((): InitialView => {
    const v = cfg.initial_view;
    if (v == null) {
      if (climate) return "thermostat";
      if (lights.length > 0) return "lights";
      return "blinds";
    }
    if (v !== "thermostat" && v !== "lights" && v !== "blinds") {
      throw new CowConfigError(
        `'initial_view' must be one of thermostat | lights | blinds`,
      );
    }
    if (v === "thermostat" && !climate) {
      throw new CowConfigError(
        "'initial_view: thermostat' but no climate configured",
      );
    }
    if (v === "lights" && lights.length === 0) {
      throw new CowConfigError(
        "'initial_view: lights' but no lights configured",
      );
    }
    if (v === "blinds" && covers.length === 0) {
      throw new CowConfigError(
        "'initial_view: blinds' but no covers configured",
      );
    }
    return v;
  })();

  const stringList = (v: unknown, key: string): string[] => {
    if (v == null) return [];
    if (!Array.isArray(v)) throw new CowConfigError(`'${key}' must be a list`);
    return v
      .filter((x): x is string => typeof x === "string" && x.length > 0)
      .map((s) => s.trim());
  };

  const openingDefaults = ((): OpeningKind | undefined => {
    const v = (cfg.opening_defaults as Record<string, unknown> | undefined)?.kind;
    if (v == null) return undefined;
    if (v !== "door" && v !== "window" && v !== "garage") {
      throw new CowConfigError(
        "'opening_defaults.kind' must be 'door' | 'window' | 'garage'",
      );
    }
    return v;
  })();

  return {
    type: "custom:cow-thermostat-card",
    room,
    climate,
    lights,
    covers,
    outdoor_temp: optionalEntity(cfg, "outdoor_temp", DOMAIN_SENSOR),
    local_temp: optionalEntity(cfg, "local_temp", DOMAIN_SENSOR),
    local_humidity: optionalEntity(cfg, "local_humidity", DOMAIN_SENSOR),
    initial_view: initial,
    areas: stringList(cfg.areas, "areas"),
    opening_default_kind: openingDefaults,
    opening_doors: stringList(cfg.opening_doors, "opening_doors"),
    opening_windows: stringList(cfg.opening_windows, "opening_windows"),
    opening_garages: stringList(cfg.opening_garages, "opening_garages"),
  };
}
