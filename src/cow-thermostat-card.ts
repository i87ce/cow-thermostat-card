import { LitElement, html, css } from "lit";
import { customElement, property, state } from "lit/decorators.js";

import type {
  HomeAssistant,
  LovelaceCard,
  LovelaceCardConfig,
} from "./types/hass.js";
import { validateConfig, type CowConfig } from "./small/config.js";
import { tokens } from "./styles/tokens.js";
import { fontFaces, typography } from "./styles/typography.js";
import { animTokens } from "./small/styles/anim.js";
import { shellStyles } from "./small/styles/shell.js";

import "./small/swiper.js";
import "./small/panels/thermostat-panel.js";
import "./small/panels/lights-panel.js";
import "./small/panels/blinds-panel.js";

import { deriveThermostatView } from "./small/state/thermostat.js";
import { aggregateLightsView } from "./small/state/lights.js";
import { aggregateBlindsView } from "./small/state/blinds.js";

import "./cow-room-dashboard-card.js";
import "./cow-redirect-card.js";

type Kind = "thermostat" | "lights" | "blinds";

const VERSION = "1.0.0";

const ACCENT_DOT: Record<Kind, (cfg: CowConfig, hass?: HomeAssistant) => string> =
  {
    thermostat: (cfg, hass) => {
      if (!cfg.climate || !hass) return "#fa6b2e";
      const v = deriveThermostatView(hass.states[cfg.climate]).variant;
      return v === "heating"
        ? "#fa6b2e"
        : v === "cooling"
          ? "#2673eb"
          : v === "idle"
            ? "#26a673"
            : "#808088";
    },
    lights: (cfg, hass) => {
      if (!hass || cfg.lights.length === 0) return "#ffc72e";
      const v = aggregateLightsView(
        cfg.lights.map((d) => hass.states[d.entity]),
      ).variant;
      return v === "bright"
        ? "#ffc72e"
        : v === "dim"
          ? "#cc9933"
          : v === "night"
            ? "#5b6bc5"
            : "#808088";
    },
    blinds: (cfg, hass) => {
      if (!hass || cfg.covers.length === 0) return "#66bfff";
      const v = aggregateBlindsView(
        cfg.covers.map((d) => hass.states[d.entity]),
      ).variant;
      return v === "open"
        ? "#66bfff"
        : v === "half"
          ? "#4d8cd1"
          : v === "moving"
            ? "#e6a626"
            : "#3a3a4a";
    },
  };

/**
 * `cow-thermostat-card` v2 — pixel-exact 720x720 small room card.
 *
 *   - Authored at a 720x720 design grid (Figma 1:1) and scaled with
 *     CSS transform so it fits any container without bumping the
 *     document font-size (the v1 hack).
 *   - Three slide-able panels: Thermostat / Lights / Blinds.
 *   - Multi-entity support per kind via a Tutte/[device]+ chip-row.
 *   - Schema v2 (lights:[{entity,label}]) + back-compat with v1 YAML.
 *
 * The legacy v1 implementation lives in `src/_archive/v0.9.x/` for
 * reference; nothing imports it.
 */
@customElement("cow-thermostat-card")
export class CowThermostatCard extends LitElement implements LovelaceCard {
  @property({ attribute: false }) hass?: HomeAssistant;
  @state() private config?: CowConfig;
  @state() private index = 0;
  @state() private scale = 1;

  private resizeObs?: ResizeObserver;
  private stageEl?: HTMLElement;

  static override styles = [
    fontFaces,
    tokens,
    typography,
    animTokens,
    shellStyles,
    css`
      :host {
        --cow-font-family: "Inter", system-ui, -apple-system, sans-serif;
      }
    `,
  ];

  setConfig(input: LovelaceCardConfig): void {
    try {
      const cfg = validateConfig(input);
      this.config = cfg;
      this.index = this.indexForView();
    } catch (e) {
      this.config = undefined;
      throw e;
    }
  }

  /** HA needs this to size the card in masonry view. */
  getCardSize(): number {
    return 7;
  }

  override connectedCallback(): void {
    super.connectedCallback();
    queueMicrotask(() => this.applyPanelMode());
    this.resizeObs = new ResizeObserver(() => this.recomputeScale());
    this.resizeObs.observe(this);
    this.recomputeScale();
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback();
    this.resizeObs?.disconnect();
    this.resizeObs = undefined;
  }

  override updated(): void {
    if (!this.stageEl) {
      this.stageEl =
        (this.renderRoot as ShadowRoot).querySelector(".stage") ?? undefined;
    }
    this.recomputeScale();
    this.applyPanelMode();
  }

  private recomputeScale(): void {
    const w = this.clientWidth;
    const h = this.clientHeight;
    if (w <= 0 || h <= 0) return;
    const s = Math.min(w / 720, h / 720);
    if (Math.abs(s - this.scale) > 0.005) {
      this.scale = s;
      this.style.setProperty("--cow-scale", String(s));
    }
  }

  private applyPanelMode(): void {
    const panelTags = new Set([
      "hui-panel-view",
      "ha-panel-lovelace",
      "hui-root",
    ]);
    let node: Node | null = this.parentNode ?? null;
    let depth = 0;
    let found = false;
    while (node && depth++ < 50) {
      if (node instanceof HTMLElement) {
        if (panelTags.has(node.tagName.toLowerCase())) {
          found = true;
          break;
        }
      }
      const root = (node as Node & { getRootNode?: () => Node }).getRootNode?.();
      node =
        node.parentNode ?? (root instanceof ShadowRoot ? root.host : null);
    }
    const isKioskUrl =
      typeof window !== "undefined" &&
      /[?&]kiosk(=|&|$)/.test(window.location.search);
    this.toggleAttribute("panel", found || isKioskUrl);
  }

  private kinds(): Kind[] {
    const k: Kind[] = [];
    if (this.config?.climate) k.push("thermostat");
    if (this.config && this.config.lights.length > 0) k.push("lights");
    if (this.config && this.config.covers.length > 0) k.push("blinds");
    return k;
  }

  private indexForView(): number {
    if (!this.config) return 0;
    const k = this.kinds();
    const target = this.config.initial_view;
    const i = k.indexOf(target);
    return i >= 0 ? i : 0;
  }

  private accents(): string[] {
    if (!this.config) return [];
    const cfg = this.config;
    return this.kinds().map((kind) => ACCENT_DOT[kind](cfg, this.hass));
  }

  override render() {
    if (!this.config) {
      return html`<div class="error">cow-thermostat-card: configurazione non valida</div>`;
    }
    const cfg = this.config;
    const kinds = this.kinds();
    if (kinds.length === 0) {
      return html`<div class="error">
        cow-thermostat-card: configura almeno uno tra climate / lights / covers
      </div>`;
    }

    return html`
      <div class="scaler">
        <div class="stage">
          <cow-swiper
            .index=${this.index}
            .count=${kinds.length}
            .accents=${this.accents()}
            @cow-index-change=${(e: CustomEvent<{ index: number }>) =>
              (this.index = e.detail.index)}
          >
            ${kinds.map((kind, i) => {
              if (kind === "thermostat") {
                return html`
                  <cow-thermostat-panel
                    slot="slide-${i}"
                    .hass=${this.hass}
                    .entity=${cfg.climate ?? ""}
                    .roomName=${cfg.room}
                    .outdoorEntity=${cfg.outdoor_temp ?? ""}
                    .humidityEntity=${cfg.local_humidity ?? ""}
                  ></cow-thermostat-panel>
                `;
              }
              if (kind === "lights") {
                return html`
                  <cow-lights-panel
                    slot="slide-${i}"
                    .hass=${this.hass}
                    .devices=${cfg.lights}
                    .roomName=${cfg.room}
                  ></cow-lights-panel>
                `;
              }
              return html`
                <cow-blinds-panel
                  slot="slide-${i}"
                  .hass=${this.hass}
                  .devices=${cfg.covers}
                  .roomName=${cfg.room}
                ></cow-blinds-panel>
              `;
            })}
          </cow-swiper>
        </div>
      </div>
    `;
  }
}

window.customCards = window.customCards ?? [];
if (!window.customCards.some((c) => c.type === "cow-thermostat-card")) {
  window.customCards.push({
    type: "cow-thermostat-card",
    name: "Cave of Wonders Room Card",
    description:
      "Thermostat + Lights + Blinds 720x720 (pixel-perfect Figma)",
    preview: false,
  });
}

// eslint-disable-next-line no-console
console.info(
  `%c COW-THERMOSTAT-CARD %c v${VERSION} `,
  "color: white; background: #fa6b2e; font-weight: 700",
  "color: #fa6b2e; background: #f7f7fa; font-weight: 700",
);
