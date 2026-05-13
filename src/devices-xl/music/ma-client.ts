/**
 * Music Assistant + media_player HA service wrapper.
 *
 * All calls go through `hass.callService()` so they work both in HA and
 * in the local preview (where we mock callService). The class is
 * deliberately thin — it just hides the noisy parameter shapes (e.g.
 * MA needs a `config_entry_id` on every call) and normalizes responses
 * into the shared `MaItem` shape.
 *
 * Notes from probing the live HA on 2026-05-13:
 * - `music_assistant.search` requires `config_entry_id`, `name`,
 *   optional `media_type` (string or array), `artist`, `album`,
 *   `limit`, `library_only`. Returns `{response: {<type>s: [...] | items: [...]}}`.
 * - `music_assistant.get_library` requires `config_entry_id`,
 *   `media_type` (single). Returns `{response: {items: [...]}}`.
 * - `music_assistant.play_media` accepts `media_id` (a provider URI
 *   like `spotify--XXXX://track/abc` OR `library://playlist/3`), plus
 *   `media_type`, `enqueue`, `radio_mode`. Target media_player goes
 *   in the standard `target.entity_id`.
 * - Spotify items come back with `provider: undefined` but the URI
 *   carries the provider as `spotify--XXXX://...`.
 */
import type { HomeAssistant } from "../../types/hass.js";
import type { MaItem } from "./types.js";

export class MaClient {
  constructor(
    private readonly hass: HomeAssistant,
    private readonly configEntryId: string | undefined,
    private readonly mediaPlayerEntity: string,
  ) {}

  /** Whether the optional MA features (search/browse) are available. */
  get isMaAvailable(): boolean {
    return !!this.configEntryId;
  }

  /* ────────────────────── Browse / search ────────────────────── */

  async search(
    query: string,
    mediaTypes: Array<"track" | "album" | "playlist" | "artist" | "radio"> = [
      "track",
      "album",
      "playlist",
    ],
    limit = 15,
  ): Promise<MaItem[]> {
    if (!this.configEntryId) return [];
    const res = await this.hass.callService(
      "music_assistant",
      "search",
      {
        config_entry_id: this.configEntryId,
        name: query,
        media_type: mediaTypes,
        limit,
      },
      undefined,
      true,
      true,
    );
    return normalizeItems(res);
  }

  async getLibrary(
    mediaType: "track" | "album" | "playlist" | "artist" | "radio",
    opts: { favorite?: boolean; limit?: number; offset?: number } = {},
  ): Promise<MaItem[]> {
    if (!this.configEntryId) return [];
    const res = await this.hass.callService(
      "music_assistant",
      "get_library",
      {
        config_entry_id: this.configEntryId,
        media_type: mediaType,
        favorite: opts.favorite,
        limit: opts.limit ?? 25,
        offset: opts.offset,
      },
      undefined,
      true,
      true,
    );
    return normalizeItems(res);
  }

  async getQueue(): Promise<MaItem[]> {
    if (!this.configEntryId) return [];
    const res = await this.hass.callService(
      "music_assistant",
      "get_queue",
      {},
      { entity_id: this.mediaPlayerEntity },
      true,
      true,
    );
    return normalizeItems(res);
  }

  /* ────────────────────── Playback ────────────────────── */

  /** Play a Music Assistant URI on the configured speaker. */
  async play(item: MaItem | string, opts: { enqueue?: boolean } = {}): Promise<void> {
    const uri = typeof item === "string" ? item : item.uri;
    const mediaType = typeof item === "string" ? undefined : item.mediaType;
    await this.hass.callService(
      "music_assistant",
      "play_media",
      {
        media_id: uri,
        ...(mediaType ? { media_type: mediaType } : {}),
        ...(opts.enqueue ? { enqueue: "play_next" } : {}),
      },
      { entity_id: this.mediaPlayerEntity },
    );
  }

  /**
   * Play a raw HTTP/HLS URL (radio preset) directly on the speaker —
   * bypasses Music Assistant since MA doesn't need to resolve a URL.
   */
  async playUrl(url: string): Promise<void> {
    await this.hass.callService(
      "media_player",
      "play_media",
      { media_content_id: url, media_content_type: "music" },
      { entity_id: this.mediaPlayerEntity },
    );
  }

  /* ────────────────────── Transport ────────────────────── */

  async toggle(): Promise<void> {
    await this.hass.callService("media_player", "media_play_pause", {}, {
      entity_id: this.mediaPlayerEntity,
    });
  }
  async pause(): Promise<void> {
    await this.hass.callService("media_player", "media_pause", {}, {
      entity_id: this.mediaPlayerEntity,
    });
  }
  async play_(): Promise<void> {
    await this.hass.callService("media_player", "media_play", {}, {
      entity_id: this.mediaPlayerEntity,
    });
  }
  async next(): Promise<void> {
    await this.hass.callService("media_player", "media_next_track", {}, {
      entity_id: this.mediaPlayerEntity,
    });
  }
  async previous(): Promise<void> {
    await this.hass.callService(
      "media_player",
      "media_previous_track",
      {},
      { entity_id: this.mediaPlayerEntity },
    );
  }
  async setVolume(level01: number): Promise<void> {
    await this.hass.callService(
      "media_player",
      "volume_set",
      { volume_level: Math.max(0, Math.min(1, level01)) },
      { entity_id: this.mediaPlayerEntity },
    );
  }
}

/* ──────────────────────────────────────────────────────────────────
 * Normalization
 * ────────────────────────────────────────────────────────────────── */

interface RawMaItem {
  uri?: string;
  media_id?: string;
  item_id?: string;
  media_type?: string;
  mediaType?: string;
  name?: string;
  title?: string;
  artist?: string;
  artists?: Array<{ name: string }>;
  album?: { name?: string } | string;
  image?: string;
  image_url?: string;
  imageUrl?: string;
}

function normalizeItems(svcResponse: unknown): MaItem[] {
  if (!svcResponse || typeof svcResponse !== "object") return [];
  const r = svcResponse as { response?: unknown };
  const inner = (r.response ?? svcResponse) as Record<string, unknown>;
  // The MA search response is `{tracks: [...], albums: [...], playlists: [...]}`
  // when called with multiple media_types; for single it's `{items: [...]}`.
  // Library response is always `{items: [...]}`.
  const pools: unknown[] = [];
  for (const key of ["items", "tracks", "albums", "playlists", "artists", "radios"]) {
    if (Array.isArray(inner[key])) pools.push(...(inner[key] as unknown[]));
  }
  if (pools.length === 0 && Array.isArray(inner)) pools.push(...(inner as unknown[]));
  return pools
    .map((it) => normalizeItem(it as RawMaItem))
    .filter((it): it is MaItem => it !== null);
}

function normalizeItem(raw: RawMaItem): MaItem | null {
  const uri = raw.uri || raw.media_id || raw.item_id || "";
  if (!uri) return null;
  const name = raw.name || raw.title || "(senza titolo)";
  const artist =
    raw.artist ||
    raw.artists?.map((a) => a.name).join(", ") ||
    undefined;
  const album =
    typeof raw.album === "string"
      ? raw.album
      : raw.album?.name || undefined;
  // Best-effort media_type — fall back to deriving from URI scheme.
  const mediaType =
    raw.media_type ||
    raw.mediaType ||
    deriveMediaType(uri);
  return {
    uri,
    mediaType,
    name,
    artist,
    image: raw.image || raw.image_url || raw.imageUrl,
    subtitle: album || artist,
  };
}

function deriveMediaType(uri: string): string {
  // Format: <provider>://<media_type>/<id>
  const m = uri.match(/^[a-z0-9-]+:\/\/([a-z]+)\//i);
  return m ? m[1] : "track";
}
