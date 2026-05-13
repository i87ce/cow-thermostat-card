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
  /**
   * Optional group label used by the XL header to cluster chips into
   * visually contiguous "tiles" (e.g. "Camere", "Bagni"). Rooms sharing
   * the same group string are rendered side-by-side inside one tile;
   * rooms with no group fall back to a default "Altro" tile.
   */
  group?: string;
  /** Optional climate entity */
  climate?: string;
  /** Optional ambient temperature sensor (used as fallback when no climate
   * is configured, and as supplementary read-only display in any case). */
  temperature?: string;
  /** Optional ambient humidity sensor */
  humidity?: string;
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

/** A radio preset shown as a quick-tap chip in the music drawer. */
export interface CowRadioPreset {
  /** Display name, e.g. "Radio Deejay" */
  name: string;
  /** HTTP(S)/HLS stream URL the speaker can play directly */
  stream: string;
  /** Optional logo URL */
  image?: string;
  /** Optional accent color hex */
  color?: string;
}

/** Music block configuration (top-right hero player + drawer). */
export interface CowMusicConfig {
  /** Optional list of radio quick-presets */
  radios?: CowRadioPreset[];
}

export interface CowRoomDashboardConfig {
  type: "custom:cow-room-dashboard-card";
  /** Rooms shown in the chip-row header. Min 1, max ~10 to fit visually. */
  rooms: CowRoomConfig[];
  /** Optional weather.* entity for the hero card. */
  weather_entity?: string;
  /**
   * Optional sun.* entity (typically `sun.sun`) used by the hero card
   * to drive the live sky gradient + the position of the animated sun.
   * If omitted, the hero falls back to a static day palette.
   */
  sun_entity?: string;
  /**
   * Optional sensor.* entity (typically `sensor.moon`) used by the hero
   * card to render the right lunar phase at night. Requires the HA
   * `moon:` integration to be enabled. If omitted, no moon is drawn.
   */
  moon_entity?: string;
  /** Optional media_player.* entity for the now-playing pill. */
  media_player?: string;
  /**
   * Optional Music Assistant config entry id (a ULID-ish string like
   * "01KR70XN8WQ46Y3B20BQKHG27P"). Required only for Spotify/library
   * search & browse inside the music drawer; basic transport controls
   * on the configured `media_player` work without it.
   */
  music_assistant_id?: string;
  /** Optional music-block configuration (radio quick-presets, etc.) */
  music?: CowMusicConfig;
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
      group: typeof room.group === "string" ? room.group : undefined,
      climate: typeof room.climate === "string" ? room.climate : undefined,
      temperature:
        typeof room.temperature === "string" ? room.temperature : undefined,
      humidity:
        typeof room.humidity === "string" ? room.humidity : undefined,
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

  // Music block sub-config (radio quick-presets)
  let music: CowMusicConfig | undefined;
  if (typeof cfg.music === "object" && cfg.music !== null) {
    const m = cfg.music as Record<string, unknown>;
    const radios: CowRadioPreset[] | undefined = Array.isArray(m.radios)
      ? m.radios.map((r, i) => {
          if (typeof r !== "object" || r === null) {
            throw new CowXLConfigError(`music.radios[${i}] must be an object`);
          }
          const rr = r as Record<string, unknown>;
          if (typeof rr.name !== "string" || typeof rr.stream !== "string") {
            throw new CowXLConfigError(
              `music.radios[${i}] requires 'name' and 'stream' strings`,
            );
          }
          return {
            name: rr.name,
            stream: rr.stream,
            image: typeof rr.image === "string" ? rr.image : undefined,
            color: typeof rr.color === "string" ? rr.color : undefined,
          };
        })
      : undefined;
    music = { radios };
  }

  return {
    type: "custom:cow-room-dashboard-card",
    rooms,
    weather_entity:
      typeof cfg.weather_entity === "string" ? cfg.weather_entity : undefined,
    sun_entity:
      typeof cfg.sun_entity === "string" ? cfg.sun_entity : undefined,
    moon_entity:
      typeof cfg.moon_entity === "string" ? cfg.moon_entity : undefined,
    media_player:
      typeof cfg.media_player === "string" ? cfg.media_player : undefined,
    music_assistant_id:
      typeof cfg.music_assistant_id === "string"
        ? cfg.music_assistant_id
        : undefined,
    music,
    scenes,
    locale: typeof cfg.locale === "string" ? cfg.locale : undefined,
  };
}

/** Counts of active devices in a room, split by category. */
export interface RoomActivityCounts {
  /** Number of `light.*` entities currently `on`. */
  lights: number;
  /** Number of `cover.*` entities that are anything but `closed`/`unavailable`. */
  covers: number;
  /** 1 if the optional `climate.*` is in `heat` / `cool`, else 0. */
  climate: 0 | 1;
}

/**
 * Per-category active-device counts for a room. Used by the XL header
 * to render colored "what's happening here?" badges on each chip — one
 * tinted yellow for lights, one tinted blue for blinds.
 */
export function countActiveByCategory(
  room: CowRoomConfig,
  states: Record<string, { state: string }>,
): RoomActivityCounts {
  const lights = Array.isArray(room.light)
    ? room.light
    : room.light
      ? [room.light]
      : [];
  const covers = Array.isArray(room.cover)
    ? room.cover
    : room.cover
      ? [room.cover]
      : [];
  let lightsOn = 0;
  for (const l of lights) if (states[l]?.state === "on") lightsOn++;
  let coversOpen = 0;
  for (const c of covers) {
    const s = states[c]?.state;
    if (s && s !== "closed" && s !== "unavailable") coversOpen++;
  }
  const climateState = room.climate ? states[room.climate]?.state : undefined;
  const climateActive: 0 | 1 =
    climateState === "heat" || climateState === "cool" ? 1 : 0;
  return { lights: lightsOn, covers: coversOpen, climate: climateActive };
}

/**
 * Sum of all active devices in a room (lights ON + covers not closed
 * + climate heating/cooling). Kept for any external callers; the XL
 * header itself now uses `countActiveByCategory` so each device class
 * gets its own colored badge.
 */
export function countActiveDevices(
  room: CowRoomConfig,
  states: Record<string, { state: string }>,
): number {
  const c = countActiveByCategory(room, states);
  return c.lights + c.covers + c.climate;
}
