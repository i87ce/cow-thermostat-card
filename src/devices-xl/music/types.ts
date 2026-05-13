/**
 * Music block — shared types.
 *
 * The card reads `media_player.<target>` from Home Assistant and, when
 * a `music_assistant_id` is configured, calls Music Assistant services
 * to search / browse / queue. URIs returned by MA look like
 * `spotify--XXXXXXXX://track/abc123` (instance-prefixed) and
 * `library://playlist/N` (MA local library) — we pass them through
 * verbatim to `music_assistant.play_media`.
 */

/** Coarse playback state we project from `media_player.state`. */
export type PlayerStatus = "idle" | "playing" | "paused" | "buffering" | "off";

/** Current "now playing" snapshot extracted from the media_player entity. */
export interface NowPlaying {
  status: PlayerStatus;
  title?: string;
  artist?: string;
  album?: string;
  /** Album-art URL, already resolved (entity_picture or absolute http) */
  artUrl?: string;
  /** Track duration in seconds */
  duration?: number;
  /** Current position in seconds */
  position?: number;
  /** 0..1 */
  volume?: number;
  muted?: boolean;
  /** When `media_position_updated_at` was — used to extrapolate "live"
   * position between hass updates. ISO string. */
  positionUpdatedAt?: string;
}

/** A track / album / playlist / radio item returned by MA search or library. */
export interface MaItem {
  /** Provider-prefixed URI: `spotify--XXXX://track/abc`, `library://playlist/3`, etc. */
  uri: string;
  /** "track" | "album" | "playlist" | "radio" | "artist" */
  mediaType: string;
  name: string;
  artist?: string;
  /** Display image URL when MA provides one */
  image?: string;
  /** Optional subtitle (album name, duration, description, …) */
  subtitle?: string;
}

/** Drawer tab keys. */
export type DrawerTab = "spotify" | "radio" | "queue";

/** Music block UI state machine. */
export type MusicMode =
  /** No music playing — small "resume last" pill in the header */
  | "idle"
  /** Playing/paused, ribbon visible below tiles, hero compressed */
  | "ribbon"
  /** Playing/paused, hero replaced with full-screen cinema mode */
  | "cinema";
