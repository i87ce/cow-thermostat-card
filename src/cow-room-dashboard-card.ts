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
import "./devices-xl/clima-casa-bar.js";
import "./devices-xl/drawer.js";

/** Default scene shortcuts when none configured in YAML. */
const DEFAULT_SCENES: CowSceneConfig[] = [
  { name: "Tutto OFF", icon: "○", accent: "#8C8C99" },
  { name: "Apri tutto", icon: "△", accent: "#26A673" },
  { name: "Notte", icon: "☾", accent: "#1F1F2E" },
  { name: "Cinema", icon: "■", accent: "#FA6B2E" },
];

/**
 * Cave of Wonders ROOM DASHBOARD card — for the Shelly Wall Display XL (10.1").
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
      }
      .home-actions {
        position: absolute;
        left: 1.5rem;
        right: 1.5rem;
        top: 42.35rem;
        bottom: 2.6rem;
        display: flex;
        flex-direction: column;
        gap: 0.5rem;
        justify-content: flex-start;
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
    return 14;
  }

  private onRoomTap = (e: CustomEvent<{ index: number }>) => {
    const next = e.detail.index;
    if (this.drawerOpen && this.activeRoomIndex === next) {
      this.drawerOpen = false;
      this.activeRoomIndex = -1;
      return;
    }
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
    const target = this.aggregateTargetForDomain(domain);
    try {
      await this.hass.callService(domain, service, {}, target);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn("[cow-room-dashboard-card] scene call failed", err);
    }
  };

  private aggregateTargetForDomain(
    domain: string,
  ): { entity_id: string[] } | undefined {
    if (!this.config) return undefined;
    const ids: string[] = [];
    for (const room of this.config.rooms) {
      if (domain === "light" && room.light) {
        const arr = Array.isArray(room.light) ? room.light : [room.light];
        ids.push(...arr);
      } else if (domain === "cover" && room.cover) {
        const arr = Array.isArray(room.cover) ? room.cover : [room.cover];
        ids.push(...arr);
      } else if (domain === "climate" && room.climate) {
        ids.push(room.climate);
      }
    }
    if (ids.length === 0) return undefined;
    return { entity_id: ids };
  }

  override render() {
    if (!this.config) {
      return html`<div class="error">
        cow-room-dashboard-card: invalid config
      </div>`;
    }
    const cfg = this.config;
    const scenes = cfg.scenes ?? DEFAULT_SCENES;
    const activeRoom =
      this.activeRoomIndex >= 0 && this.activeRoomIndex < cfg.rooms.length
        ? cfg.rooms[this.activeRoomIndex]
        : undefined;
    const heroLocale = cfg.locale ?? this.hass?.locale?.language;

    return html`
      <div class="root">
        <cow-xl-header
          .hass=${this.hass}
          .rooms=${cfg.rooms}
          .activeIndex=${this.activeRoomIndex}
          .weatherEntity=${cfg.weather_entity}
          @cow-room-tap=${this.onRoomTap}
        ></cow-xl-header>

        <div class="hero-wrap">
          <cow-xl-hero
            .hass=${this.hass}
            .weatherEntity=${cfg.weather_entity}
            .sunEntity=${cfg.sun_entity ?? "sun.sun"}
            .moonEntity=${cfg.moon_entity ?? "sensor.moon"}
            .locale=${heroLocale}
            .pollenOverall=${cfg.pollen?.overall}
            .pollenAllergens=${cfg.pollen?.allergens ?? []}
            .pollenMinLevel=${cfg.pollen?.min_level ?? 1}
            .pollenPinned=${cfg.pollen?.pinned ?? []}
            .pollenMaxItems=${cfg.pollen?.max_items ?? 3}
            .aurora=${!!cfg.aurora}
            ?paused=${this.drawerOpen}
          ></cow-xl-hero>
        </div>

        <div class="home-actions">
          <cow-xl-scenes
            .scenes=${scenes}
            @cow-scene-tap=${this.onSceneTap}
          ></cow-xl-scenes>
          <cow-xl-clima-casa
            .hass=${this.hass}
            .systemClimate=${cfg.system_climate ?? "climate.casa_sistema"}
          ></cow-xl-clima-casa>
        </div>

        <div class="drawer-peek">
          <div class="handle"></div>
          <div class="hint">Tocca una stanza per aprire i controlli</div>
        </div>

        <cow-xl-drawer
          .hass=${this.hass}
          .room=${activeRoom}
          .systemClimate=${cfg.system_climate ?? "climate.casa_sistema"}
          ?open=${this.drawerOpen}
          @cow-drawer-close=${this.onDrawerClose}
        ></cow-xl-drawer>
      </div>
    `;
  }
}

window.customCards = window.customCards ?? [];
if (!window.customCards.some((c) => c.type === "cow-room-dashboard-card")) {
  window.customCards.push({
    type: "cow-room-dashboard-card",
    name: 'Cave of Wonders Room Dashboard (10.1")',
    description:
      "Multi-room dashboard with weather/scenes for landscape Wall Displays (Shelly XL or any 1280×800 tablet kiosk).",
    preview: false,
  });
}
