import type { ThermostatView } from "./thermostat.js";

/**
 * Room proxy with only off/heat modes — heat means "aria stanza accesa"
 * (participates in the Mitsubishi + serrande loop). Global mode/fan
 * live on `system_climate` (climate.casa_aria).
 */
export function isAirParticipationProxy(view: ThermostatView): boolean {
  const modes = view.hvacModes;
  if (!modes.includes("heat") || !modes.includes("off")) return false;
  return !modes.some((m) => m === "cool" || m === "dry" || m === "fan_only");
}

export function usesSplitClimate(
  systemClimate: string | undefined,
  roomView: ThermostatView,
): boolean {
  return !!systemClimate && isAirParticipationProxy(roomView);
}

export const SYSTEM_MODE_CHIP_ORDER = [
  "cool",
  "heat",
  "dry",
  "fan_only",
  "off",
] as const;

export function climateModeChipLabel(mode: string): string {
  switch (mode) {
    case "cool":
      return "Cool";
    case "heat":
      return "Heat";
    case "dry":
      return "Dry";
    case "fan_only":
      return "Fan";
    case "off":
      return "Off";
    case "heat_cool":
      return "Auto";
    default:
      return mode.charAt(0).toUpperCase() + mode.slice(1);
  }
}
