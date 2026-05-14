/**
 * Card configuration schema and validation.
 * Throws a clear human-readable error from setConfig when invalid.
 */

export type InitialView = "thermostat" | "lights" | "blinds";

/**
 * Raw input as written by users in YAML. `light` and `cover` accept either
 * a single entity_id (string) or an array of entity_ids.
 */
export interface CowConfigInput {
  type: "custom:cow-thermostat-card";
  room: string;
  climate?: string;
  light?: string | string[];
  cover?: string | string[];
  light_labels?: string[];
  cover_labels?: string[];
  outdoor_temp?: string;
  local_temp?: string;
  local_humidity?: string;
  initial_view?: InitialView;
}

/**
 * Validated, normalized config. Internally `lights` and `covers` are always
 * arrays (possibly empty). `lightLabels`/`coverLabels` arrays are aligned
 * 1:1 with `lights`/`covers` (auto-derived if not provided).
 */
export interface CowConfig {
  type: "custom:cow-thermostat-card";
  /** Display name shown top-right of every panel */
  room: string;
  /** Optional climate entity. If absent, the Thermostat panel is skipped. */
  climate?: string;
  /** Light entities. Empty array = no Lights panel. */
  lights: string[];
  /** Friendly labels aligned with `lights` (length === lights.length). */
  lightLabels: string[];
  /** Cover entities. Empty array = no Blinds panel. */
  covers: string[];
  /** Friendly labels aligned with `covers`. */
  coverLabels: string[];
  outdoor_temp?: string;
  local_temp?: string;
  local_humidity?: string;
  /**
   * Which view shows on first paint. Defaults to the first available panel
   * in the order: thermostat, lights, blinds.
   */
  initial_view?: InitialView;
}

const DOMAINS = {
  climate: "climate.",
  light: "light.",
  cover: "cover.",
};

export class CowConfigError extends Error {
  constructor(message: string) {
    super(`[cow-thermostat-card] ${message}`);
  }
}

/**
 * Derive a short, human-friendly label from an entity_id by stripping
 * common prefixes (`led_`, `luce_`, `light_`, `cover_`, `tapparella_`),
 * the room name (in any position), and underscore-separating the rest
 * back into Title Case.
 */
function deriveLabel(entityId: string, room: string): string {
  const obj = entityId.split(".")[1] ?? entityId;
  const roomSlug = room
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  let s = obj.toLowerCase();
  s = s
    .replace(/^(led|luce|light|cover|tapparella)_/, "")
    .replace(new RegExp(`^${roomSlug}_`), "")
    .replace(new RegExp(`_${roomSlug}$`), "")
    .replace(new RegExp(`_${roomSlug}_`), "_");
  if (s.length === 0) s = obj;
  return s
    .split("_")
    .map((p) => (p.length > 0 ? p[0].toUpperCase() + p.slice(1) : p))
    .join(" ");
}

function normalizeEntityArray(
  raw: unknown,
  key: string,
  prefix: string,
): string[] {
  if (raw == null) return [];
  const arr = Array.isArray(raw) ? raw : [raw];
  return arr.map((v, i) => {
    if (typeof v !== "string" || v.length === 0) {
      throw new CowConfigError(
        `'${key}'${arr.length > 1 ? `[${i}]` : ""} must be a non-empty string`,
      );
    }
    if (!v.startsWith(prefix)) {
      throw new CowConfigError(
        `'${key}'${arr.length > 1 ? `[${i}]` : ""} must be a ${prefix}* entity (got '${v}')`,
      );
    }
    return v;
  });
}

function normalizeLabels(
  raw: unknown,
  entities: string[],
  room: string,
  key: string,
): string[] {
  if (raw == null) return entities.map((e) => deriveLabel(e, room));
  if (!Array.isArray(raw)) {
    throw new CowConfigError(`'${key}' must be an array of strings`);
  }
  if (raw.length !== entities.length) {
    throw new CowConfigError(
      `'${key}' has ${raw.length} entries but expected ${entities.length} (one per entity)`,
    );
  }
  return raw.map((v, i) => {
    if (typeof v !== "string" || v.length === 0) {
      throw new CowConfigError(
        `'${key}[${i}]' must be a non-empty string`,
      );
    }
    return v;
  });
}

export function validateConfig(input: unknown): CowConfig {
  if (typeof input !== "object" || input === null) {
    throw new CowConfigError("Configuration must be an object");
  }
  const cfg = input as Record<string, unknown>;

  const optionalString = (key: string, prefix?: string): string | undefined => {
    const value = cfg[key];
    if (value == null) return undefined;
    if (typeof value !== "string" || value.length === 0) {
      throw new CowConfigError(`'${key}' must be a non-empty string`);
    }
    if (prefix && !value.startsWith(prefix)) {
      throw new CowConfigError(
        `'${key}' must be a ${prefix}* entity (got '${value}')`,
      );
    }
    return value;
  };

  const room =
    typeof cfg.room === "string" && cfg.room.length > 0 ? cfg.room : "Room";

  const climate = optionalString("climate", DOMAINS.climate);
  const lights = normalizeEntityArray(cfg.light, "light", DOMAINS.light);
  const covers = normalizeEntityArray(cfg.cover, "cover", DOMAINS.cover);
  const lightLabels = normalizeLabels(
    cfg.light_labels,
    lights,
    room,
    "light_labels",
  );
  const coverLabels = normalizeLabels(
    cfg.cover_labels,
    covers,
    room,
    "cover_labels",
  );

  if (!climate && lights.length === 0 && covers.length === 0) {
    throw new CowConfigError(
      "At least one of 'climate', 'light', or 'cover' must be configured",
    );
  }

  const initialView = ((): InitialView => {
    const v = cfg.initial_view;
    if (v == null) {
      if (climate) return "thermostat";
      if (lights.length > 0) return "lights";
      return "blinds";
    }
    if (v !== "thermostat" && v !== "lights" && v !== "blinds") {
      throw new CowConfigError(
        `'initial_view' must be one of thermostat | lights | blinds (got '${String(v)}')`,
      );
    }
    if (v === "thermostat" && !climate) {
      throw new CowConfigError(
        "'initial_view' is 'thermostat' but no 'climate' entity is configured",
      );
    }
    if (v === "lights" && lights.length === 0) {
      throw new CowConfigError(
        "'initial_view' is 'lights' but no 'light' entity is configured",
      );
    }
    if (v === "blinds" && covers.length === 0) {
      throw new CowConfigError(
        "'initial_view' is 'blinds' but no 'cover' entity is configured",
      );
    }
    return v;
  })();

  return {
    type: "custom:cow-thermostat-card",
    room,
    climate,
    lights,
    lightLabels,
    covers,
    coverLabels,
    outdoor_temp: optionalString("outdoor_temp", "sensor."),
    local_temp: optionalString("local_temp", "sensor."),
    local_humidity: optionalString("local_humidity", "sensor."),
    initial_view: initialView,
  };
}
