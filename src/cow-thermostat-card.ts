import { LitElement, html, css } from "lit";
import { customElement, property, state } from "lit/decorators.js";

import type {
  HomeAssistant,
  LovelaceCard,
  LovelaceCardConfig,
} from "./types/hass.js";
import {
  validateConfig,
  type CowConfig,
  type InitialView,
} from "./config.js";

import {
  tokens,
  accentForThermostat,
  accentForBlinds,
  accentForLights,
} from "./styles/tokens.js";
import { fontFaces, typography } from "./styles/typography.js";
import { globalShell } from "./styles/global.js";

import "./components/device-swiper.js";
import "./devices/thermostat-panel.js";
import "./devices/blinds-panel.js";
import "./devices/lights-panel.js";
import { deriveThermostatView } from "./state/thermostat-state.js";
import { deriveBlindsView } from "./state/blinds-state.js";
import { deriveLightsView } from "./state/lights-state.js";

const VERSION = "0.1.0";

const VIEW_INDEX: Record<InitialView, number> = {
  thermostat: 0,
  blinds: 1,
  lights: 2,
};

@customElement("cow-thermostat-card")
export class CowThermostatCard extends LitElement implements LovelaceCard {
  @property({ attribute: false }) hass?: HomeAssistant;
  @state() private config?: CowConfig;
  @state() private index = 0;

  static override styles = [
    fontFaces,
    tokens,
    typography,
    globalShell,
    css`
      .frame {
        width: 100%;
        height: 100%;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 0;
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
      this.config = validateConfig(input);
      this.index = VIEW_INDEX[this.config.initial_view ?? "thermostat"];
    } catch (e) {
      this.config = undefined;
      throw e;
    }
  }

  /** HA needs this to size the card in masonry view */
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  getCardSize(): number {
    return 8; // ≈ 384/50
  }

  private accents(): string[] {
    if (!this.config || !this.hass) {
      return [
        "var(--cow-heating-primary)",
        "var(--cow-blinds-sky)",
        "var(--cow-lights-bright)",
      ];
    }
    return [
      accentForThermostat(
        deriveThermostatView(this.hass.states[this.config.climate]).variant,
      ).primary,
      accentForBlinds(
        deriveBlindsView(this.hass.states[this.config.cover]).variant,
      ).primary,
      accentForLights(
        deriveLightsView(this.hass.states[this.config.light]).variant,
      ).primary,
    ];
  }

  override render() {
    if (!this.config) {
      return html`<div class="error">cow-thermostat-card: invalid config</div>`;
    }
    const cfg = this.config;
    return html`
      <div class="frame">
        <cow-device-swiper
          .index=${this.index}
          .accents=${this.accents()}
          @cow-index-change=${(e: CustomEvent<{ index: number }>) =>
            (this.index = e.detail.index)}
        >
          <cow-thermostat-panel
            slot="slide-0"
            .hass=${this.hass}
            entity=${cfg.climate}
            roomName=${cfg.room}
            outdoorEntity=${cfg.outdoor_temp ?? ""}
            localHumidityEntity=${cfg.local_humidity ?? ""}
          ></cow-thermostat-panel>
          <cow-blinds-panel
            slot="slide-1"
            .hass=${this.hass}
            entity=${cfg.cover}
            roomName=${cfg.room}
          ></cow-blinds-panel>
          <cow-lights-panel
            slot="slide-2"
            .hass=${this.hass}
            entity=${cfg.light}
            roomName=${cfg.room}
          ></cow-lights-panel>
        </cow-device-swiper>
      </div>
    `;
  }
}

/* Lovelace card picker registration */
window.customCards = window.customCards ?? [];
const alreadyRegistered = window.customCards.some(
  (c) => c.type === "cow-thermostat-card",
);
if (!alreadyRegistered) {
  window.customCards.push({
    type: "cow-thermostat-card",
    name: "Cave of Wonders Room Card",
    description:
      "Thermostat + Lights + Blinds for Home Assistant on Shelly Wall Display",
    preview: false,
  });
}

/* Console banner so installs can confirm the version loaded */
// eslint-disable-next-line no-console
console.info(
  `%c COW-THERMOSTAT-CARD %c v${VERSION} `,
  "color: white; background: #fa6b2e; font-weight: 700",
  "color: #fa6b2e; background: #f7f7fa; font-weight: 700",
);
