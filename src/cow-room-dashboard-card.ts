import { LitElement, html, css } from "lit";
import { customElement, property, state } from "lit/decorators.js";

import type {
  HomeAssistant,
  LovelaceCard,
  LovelaceCardConfig,
} from "./types/hass.js";
import {
  validateXLConfig,
  type CowRoomDashboardConfig,
  type CowSceneConfig,
} from "./config-xl.js";

import { tokens } from "./styles/tokens.js";
import { fontFaces, typography } from "./styles/typography.js";
import { globalShellXL } from "./styles/global-xl.js";

import "./devices-xl/header-row.js";
import "./devices-xl/hero-card.js";
import "./devices-xl/scene-shortcuts.js";
import "./devices-xl/drawer.js";
import "./devices-xl/music/music-pill.js";
import "./devices-xl/music/music-ribbon.js";
import "./devices-xl/music/music-cinema.js";
import "./devices-xl/music/music-drawer.js";

import { MaClient } from "./devices-xl/music/ma-client.js";
import type { NowPlaying, MusicMode, MaItem } from "./devices-xl/music/types.js";

/**
 * Cave of Wonders ROOM DASHBOARD card — for the Shelly Wall Display XL (10.1").
 *
 * Phase 1 (current): Idle state only — chip-row header, weather/clock hero
 * card, scene shortcuts row, drawer peek. Tapping a chip is a no-op for now.
 *
 * Phase 2 (planned): drawer slide-up with per-room Lights / Blinds / Climate
 * tabs + master action row.
 */
@customElement("cow-room-dashboard-card")
export class CowRoomDashboardCard
  extends LitElement
  implements LovelaceCard
{
  @property({ attribute: false }) hass?: HomeAssistant;
  @state() private config?: CowRoomDashboardConfig;
  @state() private activeRoomIndex = -1;
  @state() private drawerOpen = false;

  /** Music block UI mode. The state machine derives from `media_player.state`
   * but the cinema-vs-ribbon split is user-controlled (defaults to ribbon). */
  @state() private cinemaOpen = false;
  @state() private musicDrawerOpen = false;
  /** Live "now playing" snapshot, computed every render from hass. */
  private nowPlaying: NowPlaying = { status: "idle" };

  static override styles = [
    fontFaces,
    tokens,
    typography,
    globalShellXL,
    css`
      .root {
        position: relative;
        width: 100%;
        aspect-ratio: 1280 / 800;
        background: var(--cow-surface-background);
        overflow: hidden;
      }
      cow-xl-header {
        position: absolute;
        left: 0;
        right: 0;
        top: 0;
      }
      .hero-wrap {
        position: absolute;
        left: 1.5rem;
        right: 1.5rem;
        top: 19.25rem;
        transition: top 280ms ease;
      }
      /* When the music ribbon is showing we push the hero down by
         5.75rem and tell the hero to render in compact mode (height
         17.5rem, smaller clock + celestial body). Scenes and drawer
         peek stay anchored where they are. */
      .hero-wrap[data-shrunk] {
        top: 25rem;
      }
      cow-xl-scenes {
        /* positioned by its own styles (top: 43rem) */
      }
      .drawer-peek {
        position: absolute;
        left: 0;
        right: 0;
        bottom: 0;
        height: 2.5rem;
        background: var(--cow-surface-white);
        border-top: 0.0625rem solid var(--cow-surface-border);
        border-top-left-radius: 1.5rem;
        border-top-right-radius: 1.5rem;
        display: flex;
        flex-direction: row;
        align-items: center;
        justify-content: center;
        gap: 0.875rem;
      }
      .handle {
        width: 2.5rem;
        height: 0.25rem;
        border-radius: 0.125rem;
        background: var(--cow-text-disabled);
        flex: 0 0 auto;
      }
      .hint {
        font-weight: 500;
        font-size: 0.75rem;
        color: var(--cow-text-secondary);
      }
      .error {
        padding: 1rem;
        font-family: var(--cow-font-family);
        font-size: 0.875rem;
        color: var(--cow-stop, #e74c3c);
        background: var(--cow-surface-white);
        border: 0.0625rem solid currentColor;
        border-radius: var(--cow-radius-default);
        white-space: pre-wrap;
      }
    `,
  ];

  setConfig(input: LovelaceCardConfig): void {
    try {
      this.config = validateXLConfig(input);
    } catch (e) {
      this.config = undefined;
      throw e;
    }
  }

  getCardSize(): number {
    return 14; // ≈ 800/50
  }

  private onRoomTap = (e: CustomEvent<{ index: number }>) => {
    const next = e.detail.index;
    // Tap on the same chip while the drawer is open → close it.
    if (this.drawerOpen && this.activeRoomIndex === next) {
      this.drawerOpen = false;
      this.activeRoomIndex = -1;
      return;
    }
    // Otherwise: switch room and open the drawer.
    this.activeRoomIndex = next;
    this.drawerOpen = true;
  };

  private onDrawerClose = () => {
    this.drawerOpen = false;
    this.activeRoomIndex = -1;
  };

  private onSceneTap = async (
    e: CustomEvent<{ service?: string; name: string }>,
  ) => {
    if (!this.hass || !e.detail.service) return;
    const [domain, service] = e.detail.service.split(".");
    if (!domain || !service) return;
    try {
      await this.hass.callService(domain, service);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn("[cow-room-dashboard-card] scene call failed", err);
    }
  };

  /* ───────────────── Music state machine + event handlers ───────────────── */

  /** Read the speaker entity and project a normalized NowPlaying snapshot. */
  private computeNowPlaying(): NowPlaying {
    if (!this.hass || !this.config?.media_player) {
      return { status: "idle" };
    }
    const e = this.hass.states[this.config.media_player];
    if (!e) return { status: "idle" };
    const a = e.attributes as Record<string, unknown>;
    const status: NowPlaying["status"] =
      e.state === "playing"
        ? "playing"
        : e.state === "paused"
          ? "paused"
          : e.state === "buffering"
            ? "buffering"
            : e.state === "off" || e.state === "unavailable"
              ? "off"
              : "idle";
    const num = (v: unknown) => (typeof v === "number" ? v : undefined);
    return {
      status,
      title: typeof a.media_title === "string" ? a.media_title : undefined,
      artist: typeof a.media_artist === "string" ? a.media_artist : undefined,
      album: typeof a.media_album_name === "string" ? a.media_album_name : undefined,
      artUrl:
        typeof a.entity_picture_local === "string"
          ? this.absoluteUrl(a.entity_picture_local)
          : typeof a.entity_picture === "string"
            ? this.absoluteUrl(a.entity_picture)
            : undefined,
      duration: num(a.media_duration),
      position: num(a.media_position),
      volume: num(a.volume_level),
      muted: a.is_volume_muted === true,
      positionUpdatedAt:
        typeof a.media_position_updated_at === "string"
          ? a.media_position_updated_at
          : undefined,
    };
  }

  /** Make HA-relative `entity_picture` URLs absolute so the kiosk Wall
   * Display can load them when served via Nabu Casa or local IP. */
  private absoluteUrl(url: string): string {
    if (/^https?:\/\//.test(url)) return url;
    return url.startsWith("/") ? url : `/${url}`;
  }

  /** Music UI mode derived from speaker state + cinema toggle. */
  private getMusicMode(np: NowPlaying): MusicMode {
    if (np.status === "playing" || np.status === "paused" || np.status === "buffering") {
      return this.cinemaOpen ? "cinema" : "ribbon";
    }
    return "idle";
  }

  private getMaClient(): MaClient | undefined {
    if (!this.hass || !this.config?.media_player) return undefined;
    return new MaClient(
      this.hass,
      this.config.music_assistant_id,
      this.config.media_player,
    );
  }

  /* Transport — small helpers that delegate to the client */
  private withClient(fn: (c: MaClient) => Promise<void>): void {
    const c = this.getMaClient();
    if (!c) return;
    fn(c).catch((err) => {
      // eslint-disable-next-line no-console
      console.warn("[cow-room-dashboard-card] music call failed", err);
    });
  }

  private onMusicToggle = () => this.withClient((c) => c.toggle());
  private onMusicPrev = () => this.withClient((c) => c.previous());
  private onMusicNext = () => this.withClient((c) => c.next());
  private onMusicVolume = (e: CustomEvent<number>) =>
    this.withClient((c) => c.setVolume(e.detail));
  private onMusicResume = () => this.withClient((c) => c.play_());
  private onMusicCinema = () => { this.cinemaOpen = true; };
  private onMusicCloseCinema = () => { this.cinemaOpen = false; };
  private onMusicBrowse = () => { this.musicDrawerOpen = true; };
  private onMusicCloseDrawer = () => { this.musicDrawerOpen = false; };

  private onMusicRadioPlay = (e: CustomEvent<{ url: string; name: string }>) => {
    this.withClient((c) => c.playUrl(e.detail.url));
    this.musicDrawerOpen = false;
  };

  private onMusicPlayItem = (e: CustomEvent<MaItem>) => {
    this.withClient((c) => c.play(e.detail));
    this.musicDrawerOpen = false;
  };

  override render() {
    if (!this.config) {
      return html`<div class="error">
        cow-room-dashboard-card: invalid config
      </div>`;
    }
    const cfg = this.config;
    const scenes: CowSceneConfig[] =
      cfg.scenes ??
      [
        { name: "Tutto OFF", icon: "○", accent: "#8C8C99" },
        { name: "Apri tutto", icon: "△", accent: "#26A673" },
        { name: "Notte", icon: "☾", accent: "#1F1F2E" },
        { name: "Cinema", icon: "■", accent: "#FA6B2E" },
      ];

    const activeRoom =
      this.activeRoomIndex >= 0 && this.activeRoomIndex < cfg.rooms.length
        ? cfg.rooms[this.activeRoomIndex]
        : undefined;

    // ── Music state ──────────────────────────────────────────────
    this.nowPlaying = this.computeNowPlaying();
    const musicMode = this.getMusicMode(this.nowPlaying);
    const showRibbon = musicMode === "ribbon";
    const showCinema = musicMode === "cinema";
    const showPill = musicMode === "idle" && !!cfg.media_player;
    const maClient = this.getMaClient();
    const deviceLabel = cfg.media_player
      ? this.hass?.states[cfg.media_player]?.attributes?.friendly_name ?? ""
      : "";
    const heroLocale = cfg.locale ?? this.hass?.locale?.language;

    return html`
      <div class="root">
        <cow-xl-header
          .hass=${this.hass}
          .rooms=${cfg.rooms}
          .activeIndex=${this.activeRoomIndex}
          .weatherEntity=${cfg.weather_entity}
          .musicPillSlot=${showPill ? this.renderMusicPill() : undefined}
          @cow-room-tap=${this.onRoomTap}
          @cow-music-resume=${this.onMusicResume}
        ></cow-xl-header>

        ${showRibbon
          ? html`<cow-xl-music-ribbon
              .nowPlaying=${this.nowPlaying}
              @cow-music-toggle=${this.onMusicToggle}
              @cow-music-prev=${this.onMusicPrev}
              @cow-music-next=${this.onMusicNext}
              @cow-music-volume=${this.onMusicVolume}
              @cow-music-cinema=${this.onMusicCinema}
              @cow-music-browse=${this.onMusicBrowse}
            ></cow-xl-music-ribbon>`
          : ""}

        ${showCinema
          ? html`<cow-xl-music-cinema
              .nowPlaying=${this.nowPlaying}
              .radios=${cfg.music?.radios ?? []}
              .clockText=${this.formatNowTime(heroLocale)}
              .dateText=${this.formatNowDate(heroLocale)}
              .deviceLabel=${deviceLabel}
              @cow-music-close=${this.onMusicCloseCinema}
              @cow-music-toggle=${this.onMusicToggle}
              @cow-music-prev=${this.onMusicPrev}
              @cow-music-next=${this.onMusicNext}
              @cow-music-volume=${this.onMusicVolume}
              @cow-music-browse=${this.onMusicBrowse}
              @cow-music-radio-play=${this.onMusicRadioPlay}
            ></cow-xl-music-cinema>`
          : html`<div class="hero-wrap" ?data-shrunk=${showRibbon}>
              <cow-xl-hero
                .hass=${this.hass}
                .weatherEntity=${cfg.weather_entity}
                .sunEntity=${cfg.sun_entity ?? "sun.sun"}
                .moonEntity=${cfg.moon_entity ?? "sensor.moon"}
                .locale=${heroLocale}
                ?compact=${showRibbon}
              ></cow-xl-hero>
            </div>`}

        <cow-xl-scenes
          .scenes=${scenes}
          @cow-scene-tap=${this.onSceneTap}
        ></cow-xl-scenes>

        <div class="drawer-peek">
          <div class="handle"></div>
          <div class="hint">Tocca una stanza per aprire i controlli</div>
        </div>

        <cow-xl-drawer
          .hass=${this.hass}
          .room=${activeRoom}
          ?open=${this.drawerOpen}
          @cow-drawer-close=${this.onDrawerClose}
        ></cow-xl-drawer>

        ${cfg.media_player
          ? html`<cow-xl-music-drawer
              ?open=${this.musicDrawerOpen}
              .ma=${maClient}
              .radios=${cfg.music?.radios ?? []}
              .deviceLabel=${deviceLabel}
              @cow-music-drawer-close=${this.onMusicCloseDrawer}
              @cow-music-play-item=${this.onMusicPlayItem}
              @cow-music-radio-play=${this.onMusicRadioPlay}
            ></cow-xl-music-drawer>`
          : ""}
      </div>
    `;
  }

  private renderMusicPill() {
    return html`<cow-xl-music-pill
      .nowPlaying=${this.nowPlaying}
    ></cow-xl-music-pill>`;
  }

  private formatNowTime(locale?: string): string {
    return new Intl.DateTimeFormat(locale || undefined, {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(new Date());
  }
  private formatNowDate(locale?: string): string {
    return new Intl.DateTimeFormat(locale || undefined, {
      weekday: "long",
      day: "numeric",
      month: "long",
    }).format(new Date());
  }
}

window.customCards = window.customCards ?? [];
if (!window.customCards.some((c) => c.type === "cow-room-dashboard-card")) {
  window.customCards.push({
    type: "cow-room-dashboard-card",
    name: "Cave of Wonders Room Dashboard (10.1\")",
    description:
      "Multi-room dashboard with weather/music/scenes for landscape Wall Displays (Shelly XL or any 1280×800 tablet kiosk).",
    preview: false,
  });
}
