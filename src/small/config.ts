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

export type InitialView = "thermostat" | "lights" | "blinds" | "extras";
export type OpeningKind = "door" | "window" | "garage";

export interface DeviceEntry {
  entity: string;
  label: string;
}

export interface CowConfig {
  type: "custom:cow-thermostat-card";
  room: string;
  /** Global air entity (mode + fan), e.g. climate.casa_aria */
  system_climate?: string;
  climate?: string;
  lights: DeviceEntry[];
  covers: DeviceEntry[];
  /**
   * TVs shown as on/off tiles in the "Comandi" (extras) tab. The tab
   * appears in the swiper only when `tvs` or `door` is configured.
   */
  tvs: DeviceEntry[];
  /** Lock / cover / script / button / switch that opens the room door. */
  door?: string;
  /** Label on the door button, default "Apri porta". */
  door_label?: string;
  outdoor_temp?: string;
  local_temp?: string;
  local_humidity?: string;
  /**
   * ``input_number.*`` that holds the user-facing setpoint when the
   * physical unit only accepts coarse steps (Daikin Onecta = whole
   * degrees). The card displays/edits this helper (its own step/min/
   * max apply — e.g. 0.5°); an HA automation mirrors it onto the real
   * climate entity. Mode/fan chips still act on ``climate``.
   */
  target_entity?: string;
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
  /** Extra ``binary_sensor.*`` contacts (Zigbee/MQTT, …). */
  opening_entities: string[];
  /** Ajax device names to skip in auto-discovery. */
  opening_exclude_devices: string[];
  /**
   * When false, hide Ajax opening sensors on this card. Use while a
   * sensor is misconfigured (e.g. tilt instead of contact).
   */
  openings_enabled?: boolean;
  /**
   * When true, triple-tapping the left-pane current temperature opens
   * ``studio_door_entity``. Intended as a hidden affordance on a
   * single wall display (e.g. Ingresso PT) — leave false everywhere
   * else.
   */
  hidden_studio_door: boolean;
  /** Lock / cover / switch / script that opens the studio door. */
  studio_door_entity?: string;
  /** Lights turned on at 100% when the studio door unlock succeeds. */
  studio_door_lights: string[];
}

export class CowConfigError extends Error {
  constructor(message: string) {
    super(`[cow-thermostat-card] ${message}`);
  }
}

const DOMAIN_LIGHT = "light.";
const DOMAIN_COVER = "cover.";
const DOMAIN_MEDIA_PLAYER = "media_player.";
const DOMAIN_CLIMATE = "climate.";
const DOMAIN_SENSOR = "sensor.";
const DOMAIN_INPUT_NUMBER = "input_number.";

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

  const tvs = ((): DeviceEntry[] => {
    const raw = cfg.tvs;
    if (raw == null) return [];
    if (!Array.isArray(raw)) throw new CowConfigError("'tvs' must be a list");
    return raw.map((v, i) =>
      normalizeEntry(v, DOMAIN_MEDIA_PLAYER, `tvs[${i}]`, room),
    );
  })();

  const door = ((): string | undefined => {
    const v = cfg.door;
    if (v == null) return undefined;
    if (typeof v !== "string" || !v.includes(".")) {
      throw new CowConfigError(
        "'door' must be a valid entity_id (domain.object)",
      );
    }
    return v;
  })();

  const doorLabel =
    typeof cfg.door_label === "string" && cfg.door_label.length > 0
      ? cfg.door_label
      : undefined;

  const hasExtras = tvs.length > 0 || door != null;

  if (!climate && lights.length === 0 && covers.length === 0 && !hasExtras) {
    throw new CowConfigError(
      "At least one of 'climate', 'lights', 'covers', 'tvs' or 'door' must be configured",
    );
  }

  const initial = ((): InitialView => {
    const v = cfg.initial_view;
    if (v == null) {
      if (climate) return "thermostat";
      if (lights.length > 0) return "lights";
      if (covers.length > 0) return "blinds";
      return "extras";
    }
    if (
      v !== "thermostat" &&
      v !== "lights" &&
      v !== "blinds" &&
      v !== "extras"
    ) {
      throw new CowConfigError(
        `'initial_view' must be one of thermostat | lights | blinds | extras`,
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
    if (v === "extras" && !hasExtras) {
      throw new CowConfigError(
        "'initial_view: extras' but no tvs / door configured",
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

  const hiddenStudioDoor = cfg.hidden_studio_door === true;
  const studioDoorEntity = ((): string | undefined => {
    const v = cfg.studio_door_entity;
    if (v == null) return undefined;
    if (typeof v !== "string" || !v.includes(".")) {
      throw new CowConfigError(
        "'studio_door_entity' must be a valid entity_id (domain.object)",
      );
    }
    return v;
  })();
  if (hiddenStudioDoor && !studioDoorEntity) {
    throw new CowConfigError(
      "'hidden_studio_door: true' requires 'studio_door_entity'",
    );
  }

  const studioDoorLights = ((): string[] => {
    const raw = cfg.studio_door_lights;
    if (raw == null) return [];
    if (!Array.isArray(raw)) {
      throw new CowConfigError("'studio_door_lights' must be a list");
    }
    return raw.map((v, i) => {
      if (typeof v !== "string" || !v.startsWith(DOMAIN_LIGHT)) {
        throw new CowConfigError(
          `'studio_door_lights[${i}]' must be a ${DOMAIN_LIGHT}* entity`,
        );
      }
      return v;
    });
  })();

  return {
    type: "custom:cow-thermostat-card",
    room,
    climate,
    lights,
    covers,
    tvs,
    door,
    door_label: doorLabel,
    outdoor_temp: optionalEntity(cfg, "outdoor_temp", DOMAIN_SENSOR),
    local_temp: optionalEntity(cfg, "local_temp", DOMAIN_SENSOR),
    local_humidity: optionalEntity(cfg, "local_humidity", DOMAIN_SENSOR),
    target_entity: optionalEntity(cfg, "target_entity", DOMAIN_INPUT_NUMBER),
    initial_view: initial,
    areas: stringList(cfg.areas, "areas"),
    opening_default_kind: openingDefaults,
    opening_doors: stringList(cfg.opening_doors, "opening_doors"),
    opening_windows: stringList(cfg.opening_windows, "opening_windows"),
    opening_garages: stringList(cfg.opening_garages, "opening_garages"),
    opening_entities: stringList(cfg.opening_entities, "opening_entities"),
    opening_exclude_devices: stringList(
      cfg.opening_exclude_devices,
      "opening_exclude_devices",
    ),
    openings_enabled: cfg.openings_enabled === false ? false : undefined,
    hidden_studio_door: hiddenStudioDoor,
    studio_door_entity: studioDoorEntity,
    studio_door_lights: studioDoorLights,
    system_climate: optionalEntity(cfg, "system_climate", DOMAIN_CLIMATE),
  };
}
