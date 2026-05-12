/**
 * XL dashboard configuration schema.
 *
 * One card instance hosts N rooms (typically 7–9), with shared widgets
 * (weather, media player) in the header and scene shortcuts in the body.
 */

export interface CowRoomConfig {
  /** Display name shown on the chip and as the drawer title */
  name: string;
  /** Material Design Icon (mdi:...) or single emoji shown on the chip */
  icon?: string;
  /** Optional climate entity */
  climate?: string;
  /** Single light entity_id or list */
  light?: string | string[];
  /** Optional friendly labels per light entity (length must match) */
  light_labels?: string[];
  /** Single cover entity_id or list */
  cover?: string | string[];
  /** Optional friendly labels per cover entity */
  cover_labels?: string[];
}

export interface CowSceneConfig {
  /** Display label */
  name: string;
  /** Optional icon (single char, emoji or mdi:) */
  icon?: string;
  /** Accent color hex for the dot indicator */
  accent?: string;
  /** Service call to invoke when tapped, e.g. "script.tutto_off" */
  service?: string;
}

export interface CowRoomDashboardConfig {
  type: "custom:cow-room-dashboard-card";
  /** Rooms shown in the chip-row header. Min 1, max ~10 to fit visually. */
  rooms: CowRoomConfig[];
  /** Optional weather.* entity for the hero card. */
  weather_entity?: string;
  /** Optional media_player.* entity for the now-playing pill. */
  media_player?: string;
  /** Optional scene shortcuts row (max 4 fit nicely). */
  scenes?: CowSceneConfig[];
  /** BCP-47 locale for time/date formatting. Defaults to browser language. */
  locale?: string;
}

export class CowXLConfigError extends Error {
  constructor(message: string) {
    super(`[cow-room-dashboard-card] ${message}`);
  }
}

export function validateXLConfig(input: unknown): CowRoomDashboardConfig {
  if (typeof input !== "object" || input === null) {
    throw new CowXLConfigError("Configuration must be an object");
  }
  const cfg = input as Record<string, unknown>;
  if (!Array.isArray(cfg.rooms) || cfg.rooms.length === 0) {
    throw new CowXLConfigError(
      "'rooms' is required and must contain at least 1 room",
    );
  }
  const rooms: CowRoomConfig[] = cfg.rooms.map((r, i) => {
    if (typeof r !== "object" || r === null) {
      throw new CowXLConfigError(`rooms[${i}] must be an object`);
    }
    const room = r as Record<string, unknown>;
    if (typeof room.name !== "string" || room.name.length === 0) {
      throw new CowXLConfigError(`rooms[${i}].name is required`);
    }
    return {
      name: room.name,
      icon: typeof room.icon === "string" ? room.icon : undefined,
      climate: typeof room.climate === "string" ? room.climate : undefined,
      light: room.light as string | string[] | undefined,
      light_labels: Array.isArray(room.light_labels)
        ? (room.light_labels as string[])
        : undefined,
      cover: room.cover as string | string[] | undefined,
      cover_labels: Array.isArray(room.cover_labels)
        ? (room.cover_labels as string[])
        : undefined,
    };
  });

  const scenes: CowSceneConfig[] | undefined = Array.isArray(cfg.scenes)
    ? cfg.scenes.map((s, i) => {
        if (typeof s !== "object" || s === null) {
          throw new CowXLConfigError(`scenes[${i}] must be an object`);
        }
        const sc = s as Record<string, unknown>;
        if (typeof sc.name !== "string" || sc.name.length === 0) {
          throw new CowXLConfigError(`scenes[${i}].name is required`);
        }
        return {
          name: sc.name,
          icon: typeof sc.icon === "string" ? sc.icon : undefined,
          accent: typeof sc.accent === "string" ? sc.accent : undefined,
          service: typeof sc.service === "string" ? sc.service : undefined,
        };
      })
    : undefined;

  return {
    type: "custom:cow-room-dashboard-card",
    rooms,
    weather_entity:
      typeof cfg.weather_entity === "string" ? cfg.weather_entity : undefined,
    media_player:
      typeof cfg.media_player === "string" ? cfg.media_player : undefined,
    scenes,
    locale: typeof cfg.locale === "string" ? cfg.locale : undefined,
  };
}

/** Count active devices in a room (lights ON + covers not closed). */
export function countActiveDevices(
  room: CowRoomConfig,
  states: Record<string, { state: string }>,
): number {
  let n = 0;
  const lights = Array.isArray(room.light)
    ? room.light
    : room.light
      ? [room.light]
      : [];
  for (const l of lights) {
    if (states[l]?.state === "on") n++;
  }
  const covers = Array.isArray(room.cover)
    ? room.cover
    : room.cover
      ? [room.cover]
      : [];
  for (const c of covers) {
    const s = states[c]?.state;
    if (s && s !== "closed" && s !== "unavailable") n++;
  }
  if (room.climate && states[room.climate]?.state === "heat") n++;
  if (room.climate && states[room.climate]?.state === "cool") n++;
  return n;
}
