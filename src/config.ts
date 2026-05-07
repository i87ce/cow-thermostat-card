/**
 * Card configuration schema and validation.
 * Throws a clear human-readable error from setConfig when invalid.
 */

export type InitialView = "thermostat" | "lights" | "blinds";

export interface CowConfig {
  type: "custom:cow-thermostat-card";
  /** Display name shown top-right of every panel */
  room: string;
  /** Required HA entities */
  climate: string;
  light: string;
  cover: string;
  /** Optional sensors */
  outdoor_temp?: string;
  local_temp?: string;
  local_humidity?: string;
  /** Which view shows on first paint (default: thermostat) */
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

  const requireString = (key: string, prefix?: string): string => {
    const value = cfg[key];
    if (typeof value !== "string" || value.length === 0) {
      throw new CowConfigError(`Missing required '${key}' (string)`);
    }
    if (prefix && !value.startsWith(prefix)) {
      throw new CowConfigError(
        `'${key}' must be a ${prefix}* entity (got '${value}')`,
      );
    }
    return value;
  };

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

  const initialView = ((): InitialView => {
    const v = cfg.initial_view;
    if (v == null) return "thermostat";
    if (v !== "thermostat" && v !== "lights" && v !== "blinds") {
      throw new CowConfigError(
        `'initial_view' must be one of thermostat | lights | blinds (got '${String(v)}')`,
      );
    }
    return v;
  })();

  return {
    type: "custom:cow-thermostat-card",
    room: typeof cfg.room === "string" && cfg.room.length > 0 ? cfg.room : "Room",
    climate: requireString("climate", DOMAINS.climate),
    light: requireString("light", DOMAINS.light),
    cover: requireString("cover", DOMAINS.cover),
    outdoor_temp: optionalString("outdoor_temp", "sensor."),
    local_temp: optionalString("local_temp", "sensor."),
    local_humidity: optionalString("local_humidity", "sensor."),
    initial_view: initialView,
  };
}
