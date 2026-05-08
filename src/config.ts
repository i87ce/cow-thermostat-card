/**
 * Card configuration schema and validation.
 * Throws a clear human-readable error from setConfig when invalid.
 */

export type InitialView = "thermostat" | "lights" | "blinds";

export interface CowConfig {
  type: "custom:cow-thermostat-card";
  /** Display name shown top-right of every panel */
  room: string;
  /** Optional climate entity. If absent, the Thermostat panel is skipped. */
  climate?: string;
  /** Optional light entity. If absent, the Lights panel is skipped. */
  light?: string;
  /** Optional cover entity. If absent, the Blinds panel is skipped. */
  cover?: string;
  /** Optional sensors */
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

  const climate = optionalString("climate", DOMAINS.climate);
  const light = optionalString("light", DOMAINS.light);
  const cover = optionalString("cover", DOMAINS.cover);

  if (!climate && !light && !cover) {
    throw new CowConfigError(
      "At least one of 'climate', 'light', or 'cover' must be configured",
    );
  }

  const initialView = ((): InitialView => {
    const v = cfg.initial_view;
    if (v == null) {
      if (climate) return "thermostat";
      if (light) return "lights";
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
    if (v === "lights" && !light) {
      throw new CowConfigError(
        "'initial_view' is 'lights' but no 'light' entity is configured",
      );
    }
    if (v === "blinds" && !cover) {
      throw new CowConfigError(
        "'initial_view' is 'blinds' but no 'cover' entity is configured",
      );
    }
    return v;
  })();

  return {
    type: "custom:cow-thermostat-card",
    room: typeof cfg.room === "string" && cfg.room.length > 0 ? cfg.room : "Room",
    climate,
    light,
    cover,
    outdoor_temp: optionalString("outdoor_temp", "sensor."),
    local_temp: optionalString("local_temp", "sensor."),
    local_humidity: optionalString("local_humidity", "sensor."),
    initial_view: initialView,
  };
}
