import type { HassClimateAttributes, HassEntity } from "../../types/hass.js";

export type ThermostatVariant = "heating" | "cooling" | "off" | "idle";

/**
 * Colour palette + label table for the four thermostat variants.
 *
 * These are the single source of truth for everything thermostat-shaped
 * across the UI (small wall display panel and XL room dashboard Climate
 * tab). Importing here keeps the two surfaces visually identical when
 * the same climate enters the same variant — heating is always the
 * same orange, cooling always the same blue, idle always the same
 * green, off always the same grey.
 *
 * `surface` is the multi-stop gradient used to paint hero panels (left
 * pane of the small card, the XL drawer body). `primary` is the solo
 * accent colour used by chip-row active states, big numbers, etc.
 */
export interface ThermostatAccent {
  primary: string;
  light: string;
  active: string;
  surface: string;
  textOnAccent: string;
}

export const THERMOSTAT_ACCENT: Record<ThermostatVariant, ThermostatAccent> = {
  heating: {
    primary: "#fa6b2e",
    light: "#ff994d",
    active: "#f2612c",
    surface: "linear-gradient(180deg,#fa6b2e 0%,#ff994d 100%)",
    textOnAccent: "#fff",
  },
  cooling: {
    primary: "#2673eb",
    light: "#59a6ff",
    active: "#3380f2",
    surface: "linear-gradient(180deg,#2673eb 0%,#59a6ff 100%)",
    textOnAccent: "#fff",
  },
  off: {
    primary: "#80858c",
    light: "#a6abb2",
    active: "#8c9499",
    surface: "linear-gradient(180deg,#80858c 0%,#a6abb2 100%)",
    textOnAccent: "#fff",
  },
  idle: {
    primary: "#26a673",
    light: "#40c78c",
    active: "#33b27a",
    surface: "linear-gradient(180deg,#26a673 0%,#40c78c 100%)",
    textOnAccent: "#fff",
  },
};

/** Short uppercase label (HEATING / COOLING / OFF / IDLE). */
export const THERMOSTAT_STATUS_LABEL: Record<ThermostatVariant, string> = {
  heating: "HEATING",
  cooling: "COOLING",
  off: "OFF",
  idle: "IDLE",
};

/** Italian sub-label shown under the status, e.g. "Sta scaldando". */
export const THERMOSTAT_SUB_LABEL: Record<ThermostatVariant, string> = {
  heating: "Sta scaldando",
  cooling: "Sta raffreddando",
  off: "Sistema spento",
  idle: "Target raggiunto",
};

export interface ThermostatView {
  variant: ThermostatVariant;
  current: number | null;
  target: number | null;
  unit: "°C" | "°F";
  mode: "heat" | "cool" | "off" | "auto" | "heat_cool" | "fan_only";
  fan: string;
  fanModes: string[];
  hvacModes: Array<"off" | "heat" | "cool" | "heat_cool" | "auto" | "dry" | "fan_only">;
  minTemp: number;
  maxTemp: number;
  step: number;
  humidity: number | null;
}

const ROUND = (v: number, step: number) => Math.round(v / step) * step;

export function deriveThermostatView(
  climate: HassEntity | undefined,
): ThermostatView {
  if (!climate) {
    return {
      variant: "off",
      current: null,
      target: null,
      unit: "°C",
      mode: "off",
      fan: "auto",
      fanModes: ["auto"],
      hvacModes: ["off", "heat", "cool"],
      minTemp: 5,
      maxTemp: 35,
      step: 0.5,
      humidity: null,
    };
  }

  const attrs = climate.attributes as HassClimateAttributes;
  const state = climate.state;

  let variant: ThermostatVariant;
  if (state === "off") variant = "off";
  else if (attrs.hvac_action === "heating") variant = "heating";
  else if (attrs.hvac_action === "cooling") variant = "cooling";
  else variant = "idle";

  const mode = ((): ThermostatView["mode"] => {
    if (state === "off") return "off";
    if (state === "heat") return "heat";
    if (state === "cool") return "cool";
    if (state === "heat_cool") return "heat_cool";
    if (state === "fan_only") return "fan_only";
    return "auto";
  })();

  return {
    variant,
    current:
      typeof attrs.current_temperature === "number"
        ? attrs.current_temperature
        : null,
    target: typeof attrs.temperature === "number" ? attrs.temperature : null,
    unit: "°C",
    mode,
    fan: typeof attrs.fan_mode === "string" ? attrs.fan_mode : "auto",
    fanModes: Array.isArray(attrs.fan_modes) ? attrs.fan_modes : ["auto"],
    hvacModes: Array.isArray(attrs.hvac_modes)
      ? attrs.hvac_modes
      : ["off", "heat", "cool"],
    minTemp: typeof attrs.min_temp === "number" ? attrs.min_temp : 5,
    maxTemp: typeof attrs.max_temp === "number" ? attrs.max_temp : 35,
    step:
      typeof attrs.target_temp_step === "number" ? attrs.target_temp_step : 0.5,
    humidity:
      typeof attrs.current_humidity === "number"
        ? attrs.current_humidity
        : null,
  };
}

export function bumpTarget(
  view: ThermostatView,
  direction: 1 | -1,
): number | null {
  if (view.target == null) return null;
  const next = view.target + direction * view.step;
  const clamped = Math.min(view.maxTemp, Math.max(view.minTemp, next));
  return ROUND(clamped, view.step);
}
