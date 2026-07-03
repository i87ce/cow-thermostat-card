import type { HassEntity } from "../../types/hass.js";
import type { ThermostatView, ThermostatVariant } from "./thermostat.js";
import { deriveThermostatView } from "./thermostat.js";

/**
 * Cow Climate v4 — split model.
 *
 *   climate.casa_sistema   → global mode (off/heat/cool/dry/fan_only) + fan
 *   climate.casa_<room>    → include (off = Esclusa / auto = Inclusa) + setpoint
 *                            + attribute `air_state` = rich per-room status
 *
 * The card never infers heating/cooling: it reads `air_state` published by
 * the Pyscript orchestrator (single writer). See
 * docs/08-climate-system-redesign-analysis.md.
 */

export type AirState =
  | "excluded"
  | "idle"
  | "comfort"
  | "heating"
  | "heating_floor"
  | "cooling"
  | "drying"
  | "fan";

/** Room proxy v4 exposes exactly modes [off, auto] (include toggle). */
export function isAirParticipationProxy(view: ThermostatView): boolean {
  const modes = view.hvacModes;
  if (!modes.includes("off") || !modes.includes("auto")) return false;
  return !modes.some((m) => m === "heat" || m === "cool" || m === "dry" || m === "fan_only");
}

export function usesSplitClimate(
  systemClimate: string | undefined,
  roomView: ThermostatView,
): boolean {
  return !!systemClimate && isAirParticipationProxy(roomView);
}

/** Room air participation: proxy state `auto` = Inclusa, `off` = Esclusa. */
export function roomIncluded(room: HassEntity | undefined): boolean {
  return room?.state === "auto";
}

/**
 * Floor-only room (bagni, ingresso): no air vent, only hydronic floor.
 * The orchestrator flags these on the `floor_only` attribute. Their UI
 * shows just a "Riscaldamento pavimento" On/Off + setpoint — no global
 * mode/fan row — and the floor runs independently of the system mode.
 */
export function isFloorOnlyRoom(room: HassEntity | undefined): boolean {
  return room?.attributes?.floor_only === true;
}

/** Rich status published by the orchestrator on the `air_state` attribute. */
export function readAirState(room: HassEntity | undefined): AirState | undefined {
  const a = room?.attributes?.air_state;
  return typeof a === "string" ? (a as AirState) : undefined;
}

export const AIR_STATE_VARIANT: Record<AirState, ThermostatVariant> = {
  excluded: "off",
  idle: "off",
  comfort: "idle",
  heating: "heating",
  heating_floor: "heating",
  cooling: "cooling",
  drying: "cooling",
  fan: "idle",
};

/** Short uppercase label for the wall pill / caption. */
export const AIR_STATE_STATUS: Record<AirState, string> = {
  excluded: "ESCLUSA",
  idle: "IN ATTESA",
  comfort: "A COMFORT",
  heating: "RISCALDA",
  heating_floor: "PAVIMENTO",
  cooling: "RAFFREDDA",
  drying: "DEUMIDIFICA",
  fan: "VENTILA",
};

/** Italian sub-label under the status. */
export const AIR_STATE_SUB: Record<AirState, string> = {
  excluded: "Stanza esclusa",
  idle: "In attesa",
  comfort: "Temperatura raggiunta",
  heating: "Aria calda + pavimento",
  heating_floor: "Pavimento attivo",
  cooling: "Sta raffreddando",
  drying: "Sta deumidificando",
  fan: "Ventilazione",
};

/**
 * Hero view for a split room: numeric fields from the proxy, colour variant
 * from `air_state`. Falls back to plain thermostat view for non-split rooms.
 */
export function deriveSplitRoomDisplayView(
  room: HassEntity | undefined,
  _system?: HassEntity | undefined,
): ThermostatView {
  const roomView = deriveThermostatView(room);
  if (!isAirParticipationProxy(roomView)) return roomView;
  const air = readAirState(room);
  return {
    ...roomView,
    variant: air ? AIR_STATE_VARIANT[air] : "off",
  };
}

/** Status pill text for a split room (from air_state). */
export function splitRoomStatusLabel(room: HassEntity | undefined): string {
  const air = readAirState(room);
  if (air) return AIR_STATE_STATUS[air];
  return roomIncluded(room) ? "IN ATTESA" : "ESCLUSA";
}

/** Sub-label text for a split room (from air_state). */
export function splitRoomSubLabel(room: HassEntity | undefined): string {
  const air = readAirState(room);
  if (air) return AIR_STATE_SUB[air];
  return roomIncluded(room) ? "In attesa" : "Stanza esclusa";
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

/** Human label for the Italian system mode confirmation dialog. */
export function systemModeName(mode: string): string {
  switch (mode) {
    case "cool":
      return "Raffreddamento";
    case "heat":
      return "Riscaldamento";
    case "dry":
      return "Deumidificazione";
    case "fan_only":
      return "Ventilazione";
    case "off":
      return "Spento";
    default:
      return mode;
  }
}

/**
 * Whether changing the global system to `nextMode` needs a confirmation:
 * only when the motor is already running in a *different* active mode
 * (spec D3). If the system is off or already in that mode → no confirm.
 */
export function needsModeChangeConfirm(
  currentMode: string | undefined,
  nextMode: string,
): boolean {
  if (!currentMode) return false;
  if (currentMode === "off" || currentMode === "unavailable" || currentMode === "unknown") {
    return false;
  }
  return currentMode !== nextMode;
}
