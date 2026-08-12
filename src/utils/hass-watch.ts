import type { HomeAssistant } from "../types/hass.js";
import type { CowRoomConfig } from "../config-xl.js";
import type { DeviceEntry } from "../small/config.js";

/**
 * True when any watched entity's state object identity changed between
 * hass updates. O(n) on n = entityIds.length — cheap when n is small.
 */
export function hassEntitiesChanged(
  oldHass: HomeAssistant | undefined,
  newHass: HomeAssistant | undefined,
  entityIds: readonly string[],
): boolean {
  if (oldHass === newHass) return false;
  if (!oldHass || !newHass) return true;
  const oldStates = oldHass.states;
  const newStates = newHass.states;
  for (const id of entityIds) {
    if (oldStates[id] !== newStates[id]) return true;
  }
  return false;
}

/** Entity ids owned by one XL room drawer tab. */
export function xlRoomEntityIds(room: CowRoomConfig | undefined): string[] {
  if (!room) return [];
  const ids: string[] = [];
  if (room.climate) ids.push(room.climate);
  if (room.temperature) ids.push(room.temperature);
  if (room.humidity) ids.push(room.humidity);
  if (room.target_entity) ids.push(room.target_entity);
  const lights = Array.isArray(room.light)
    ? room.light
    : room.light
      ? [room.light]
      : [];
  ids.push(...lights);
  const covers = Array.isArray(room.cover)
    ? room.cover
    : room.cover
      ? [room.cover]
      : [];
  ids.push(...covers);
  if (room.opening_entities) ids.push(...room.opening_entities);
  return ids;
}

/** All entity ids referenced by the XL header chip row. */
export function xlHeaderEntityIds(
  rooms: CowRoomConfig[],
  weatherEntity?: string,
): string[] {
  const ids = new Set<string>();
  for (const room of rooms) {
    for (const id of xlRoomEntityIds(room)) ids.add(id);
    if (room.temperature) ids.add(room.temperature);
    if (room.humidity) ids.add(room.humidity);
    if (room.climate) ids.add(room.climate);
  }
  if (weatherEntity) ids.add(weatherEntity);
  return [...ids];
}

/** Hero widget entity ids. */
export function xlHeroEntityIds(
  weatherEntity?: string,
  sunEntity?: string,
  moonEntity?: string,
  pollen?: {
    overall?: string;
    allergens?: string[];
  },
): string[] {
  const ids: string[] = [];
  if (weatherEntity) ids.push(weatherEntity);
  if (sunEntity) ids.push(sunEntity);
  if (moonEntity) ids.push(moonEntity);
  if (pollen?.overall) ids.push(pollen.overall);
  if (pollen?.allergens) ids.push(...pollen.allergens);
  return ids;
}

/** Build entity id list for clima-bar: system + air zones. */
export function climaBarWatchIds(
  hass: HomeAssistant | undefined,
  systemClimate: string,
): string[] {
  if (!hass) return [systemClimate];
  const zones = Object.keys(hass.states).filter((id) => {
    if (!id.startsWith("climate.casa_")) return false;
    if (id === systemClimate) return false;
    const e = hass.states[id];
    const modes = e.attributes?.hvac_modes as string[] | undefined;
    return (
      !!modes &&
      modes.includes("off") &&
      modes.includes("auto") &&
      !modes.some((m) => ["heat", "cool", "dry", "fan_only"].includes(m)) &&
      e.attributes?.floor_only !== true
    );
  });
  return [systemClimate, ...zones];
}

/** Entity ids for a small lights panel. */
export function smallLightsWatchIds(devices: DeviceEntry[]): string[] {
  return devices.map((d) => d.entity);
}

/** Entity ids for a small blinds panel. */
export function smallBlindsWatchIds(devices: DeviceEntry[]): string[] {
  return devices.map((d) => d.entity);
}

/** Entity ids for a small thermostat panel. */
export function smallThermostatWatchIds(opts: {
  entity: string;
  systemClimate?: string;
  targetEntity?: string;
  outdoorEntity?: string;
  humidityEntity?: string;
  localTempEntity?: string;
  openingEntities?: string[];
}): string[] {
  const ids: string[] = [];
  if (opts.entity) ids.push(opts.entity);
  if (opts.systemClimate) ids.push(opts.systemClimate);
  if (opts.targetEntity) ids.push(opts.targetEntity);
  if (opts.outdoorEntity) ids.push(opts.outdoorEntity);
  if (opts.humidityEntity) ids.push(opts.humidityEntity);
  if (opts.localTempEntity) ids.push(opts.localTempEntity);
  if (opts.openingEntities) ids.push(...opts.openingEntities);
  return ids;
}

/** Entity ids for a small extras panel. */
export function smallExtrasWatchIds(
  tvs: DeviceEntry[],
  door?: string,
  switches: DeviceEntry[] = [],
): string[] {
  const ids = tvs.map((d) => d.entity);
  ids.push(...switches.map((d) => d.entity));
  if (door) ids.push(door);
  return ids;
}
