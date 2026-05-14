import type { HassClimateAttributes, HassEntity } from "../../types/hass.js";

export type ThermostatVariant = "heating" | "cooling" | "off" | "idle";

export interface ThermostatView {
  variant: ThermostatVariant;
  current: number | null;
  target: number | null;
  unit: "°C" | "°F";
  mode: "heat" | "cool" | "off" | "auto" | "heat_cool";
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
