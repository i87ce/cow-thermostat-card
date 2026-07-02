import type { HassClimateAttributes, HassEntity } from "../../types/hass.js";
import type { ThermostatView, ThermostatVariant } from "./thermostat.js";
import { deriveThermostatView, THERMOSTAT_SUB_LABEL } from "./thermostat.js";

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

/** Map MQTT `hvac_action` (+ optional entity state) to panel variant colours. */
export function variantFromHvacAction(
  action: string | undefined,
  modeOrState: string,
): ThermostatVariant {
  if (action === "heating") return "heating";
  if (action === "cooling") return "cooling";
  if (action === "drying") return "cooling";
  if (action === "idle" || action === "fan") return "idle";
  if (action === "off" || modeOrState === "off") return "off";
  if (modeOrState === "heat") return "heating";
  if (modeOrState === "cool" || modeOrState === "dry") return "cooling";
  if (modeOrState === "fan_only") return "idle";
  return "idle";
}

/**
 * Split-climate hero: room setpoint + air on/off come from the room proxy,
 * but the big status colours follow `hvac_action` when aria is on, or the
 * global `casa_aria` mode when aria is off (so "Dry" on the system row does
 * not leave the room hero stuck on grey OFF).
 */
export function deriveSplitRoomDisplayView(
  room: HassEntity | undefined,
  system: HassEntity | undefined,
): ThermostatView {
  const roomView = deriveThermostatView(room);
  if (!isAirParticipationProxy(roomView)) return roomView;

  const systemView = deriveThermostatView(system);
  const airOn = room?.state === "heat";
  const roomAttrs = room?.attributes as HassClimateAttributes | undefined;
  const roomAction =
    typeof roomAttrs?.hvac_action === "string" ? roomAttrs.hvac_action : undefined;

  if (airOn) {
    return {
      ...roomView,
      variant: variantFromHvacAction(roomAction, room!.state),
    };
  }

  if (systemView.mode !== "off") {
    const sysAttrs = system?.attributes as HassClimateAttributes | undefined;
    const sysAction =
      typeof sysAttrs?.hvac_action === "string" ? sysAttrs.hvac_action : undefined;
    return {
      ...roomView,
      variant: variantFromHvacAction(sysAction, systemView.mode),
    };
  }

  return { ...roomView, variant: "off" };
}

export function splitRoomStatusLabel(
  display: ThermostatView,
  roomAction: string | undefined,
): string {
  if (roomAction === "drying") return "DRYING";
  if (display.variant === "heating") return "HEATING";
  if (display.variant === "cooling") return "COOLING";
  if (display.variant === "idle") return "IDLE";
  return "OFF";
}

export function splitRoomSubLabel(
  display: ThermostatView,
  airOn: boolean,
  systemMode: string,
  roomAction: string | undefined,
): string {
  if (roomAction === "drying") return "Sta deumidificando";
  if (airOn) return THERMOSTAT_SUB_LABEL[display.variant];
  if (systemMode === "off") return THERMOSTAT_SUB_LABEL.off;
  if (systemMode === "dry") return "Aria spenta · sistema dry";
  if (systemMode === "fan_only") return "Aria spenta · ventola";
  return `Aria spenta · ${climateModeChipLabel(systemMode).toLowerCase()}`;
}
