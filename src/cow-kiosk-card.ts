/**
 * cow-kiosk-card — dedicated single-room card for Shelly Wall Display
 * kiosks. Designed natively for 720x720 (Figma 480 × 1.5).
 *
 * Why a new card instead of patching `cow-thermostat-card`:
 *   - The legacy card was implemented against a 384 design grid
 *     (24rem @ 16px) and accumulated 11 size-fix iterations trying
 *     to stretch to 720, with side effects (clipped buttons, empty
 *     bottom-right, font/position mismatch).
 *   - The kiosk audience is a closed set of Shelly Wall Displays at
 *     a fixed pixel size, so it's safe to hardcode the design grid
 *     to that resolution. We don't need responsive scaling, only
 *     "fits the kiosk".
 *
 * Implementation contract
 *   - Card host: `position: fixed; inset: 0` so it paints over HA's
 *     `<hui-panel-view>` padding regardless of dashboard config.
 *   - Document-level `<html>` font-size is bumped to 30px on first
 *     mount (only when we're in a panel/kiosk URL), so 24rem of the
 *     legacy design grid resolves to 720px. CSS Container Queries
 *     are bypassed because the Shelly embedded browser doesn't
 *     handle them reliably.
 *   - The 24rem grid is split 12rem | 12rem (cow-split-panel default
 *     after v0.8.14). Each pane is 360×720 on the kiosk.
 *   - Labels on the cover button row are arrow-only (▲ ■ ▼) so they
 *     fit a 12rem half-card without intrinsic-width overflow.
 */
import { LitElement, html, css } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import type { HassEntity } from "./types/hass.js";
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

import { tokens, accentForBlinds, accentForLights, accentForThermostat } from "./styles/tokens.js";
import { fontFaces, typography } from "./styles/typography.js";
import { globalShell } from "./styles/global.js";

import "./components/device-swiper.js";
import "./components/split-panel.js";
import "./molecules/control-button.js";
import "./molecules/preset-chip.js";
import "./molecules/vertical-slider.js";
import "./molecules/power-toggle.js";
import "./molecules/entity-selector.js";
import "./visuals/blind-visual.js";
import "./visuals/bulb-visual.js";
import "./devices/thermostat-panel.js"; // reuse existing thermostat layout

import {
  deriveBlindsView,
  aggregateBlindsView,
  type BlindsView,
  type BlindsVariant,
} from "./state/blinds-state.js";
import {
  deriveLightsView,
  aggregateLightsView,
  type LightsView,
  type LightsVariant,
} from "./state/lights-state.js";
import { deriveThermostatView } from "./state/thermostat-state.js";

type DeviceKind = "thermostat" | "blinds" | "lights";

const VERSION = "0.9.0";

function formatTime(d: Date, locale?: string): string {
  return new Intl.DateTimeFormat(locale || undefined, {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(d);
}

@customElement("cow-kiosk-card")
export class CowKioskCard extends LitElement implements LovelaceCard {
  @property({ attribute: false }) hass?: HomeAssistant;
  @state() private config?: CowConfig;
  @state() private index = 0;
  @state() private activeBlindIndex = -1;
  @state() private activeLightIndex = -1;
  @state() private now = new Date();
  private timer?: number;

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
        align-items: stretch;
        padding: 0;
      }
      cow-device-swiper {
        flex: 1 1 auto;
        width: 100%;
        height: 100%;
      }

      /* ── Panel base (one per device kind) ───────────────── */
      .panel {
        width: 100%;
        height: 100%;
        position: relative;
      }

      /* LEFT pane — large visual + value */
      .visual-wrap {
        position: absolute;
        left: 50%;
        top: 2rem;
        transform: translateX(-50%);
        width: 7rem;
        height: 7rem;
      }
      .status-label {
        position: absolute;
        left: 1.5rem;
        top: 11rem;
        font-weight: 500;
        font-size: 0.875rem;
        color: var(--cow-surface-white);
        opacity: 0.7;
        letter-spacing: 0.15625rem;
        text-transform: uppercase;
        white-space: nowrap;
      }
      .display-value {
        position: absolute;
        left: 1.25rem;
        top: 12.5rem;
        font-weight: 300;
        font-size: 5rem;
        line-height: 1;
        color: var(--cow-surface-white);
        white-space: nowrap;
      }
      .display-unit {
        position: absolute;
        left: 1.5rem;
        top: 18.5rem;
        font-weight: 400;
        font-size: 0.875rem;
        color: var(--cow-surface-white);
        opacity: 0.6;
      }

      /* RIGHT pane — header + controls + presets + selector */
      .room {
        position: absolute;
        left: 0.875rem;
        top: 1.75rem;
        font-weight: 600;
        font-size: 0.85rem;
        color: var(--cow-text-room-name);
        white-space: nowrap;
        max-width: 7rem;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      .time {
        position: absolute;
        right: 0.875rem;
        top: 1.75rem;
        font-weight: 600;
        font-size: 0.8rem;
        color: var(--cow-text-time);
      }
      .scope-label {
        position: absolute;
        left: 1rem;
        right: 1rem;
        top: 4.5rem;
        text-align: right;
        font-weight: 600;
        font-size: 0.7rem;
        color: var(--cow-accent-active, var(--cow-text-secondary));
        text-transform: uppercase;
        letter-spacing: 0.0625rem;
      }
      .controls-label {
        position: absolute;
        left: 1rem;
        top: 4.5rem;
        font-weight: 400;
        font-size: 0.875rem;
        color: var(--cow-text-secondary);
      }
      .controls-row {
        position: absolute;
        left: 1rem;
        right: 1rem;
        top: 6.5rem;
        display: flex;
        gap: 0.5rem;
      }
      .controls-row cow-control-button {
        font-size: 1.25rem; /* big arrows */
      }
      .presets-label {
        position: absolute;
        left: 1rem;
        top: 12rem;
        font-weight: 400;
        font-size: 0.875rem;
        color: var(--cow-text-secondary);
      }
      .presets-row {
        position: absolute;
        left: 1rem;
        right: 1rem;
        top: 14rem;
        display: flex;
        gap: 0.5rem;
        flex-wrap: wrap;
      }
      .selector-wrap {
        position: absolute;
        left: 1rem;
        right: 1rem;
        bottom: 1rem;
      }

      /* LIGHTS panel right side — slider centered */
      .slider-wrap {
        position: absolute;
        left: 50%;
        top: 6rem;
        transform: translateX(-50%);
      }
      .power-wrap {
        position: absolute;
        left: 50%;
        top: 19rem;
        transform: translateX(-50%);
      }
      .brightness-label {
        position: absolute;
        left: 1rem;
        top: 4.5rem;
        font-weight: 400;
        font-size: 0.875rem;
        color: var(--cow-text-secondary);
      }

      .left-content,
      .right-content {
        position: absolute;
        inset: 0;
      }
      .error {
        padding: 1rem;
        color: var(--cow-stop, #e74c3c);
        background: var(--cow-surface-white);
        border-radius: 1rem;
      }
    `,
  ];

  setConfig(input: LovelaceCardConfig): void {
    try {
      // Accept the same schema as cow-thermostat-card so dashboards
      // can switch type without renaming any other field.
      const normalized = { ...input, type: "custom:cow-thermostat-card" } as LovelaceCardConfig;
      this.config = validateConfig(normalized);
      this.index = this.indexForView(this.config.initial_view);
    } catch (e) {
      this.config = undefined;
      throw e;
    }
  }

  override connectedCallback(): void {
    super.connectedCallback();
    this.timer = window.setInterval(() => (this.now = new Date()), 30_000);
    // 30px html font-size makes the legacy 24rem design grid resolve
    // to exactly 720px on the Shelly Wall Display kiosk screenshot.
    if (
      typeof document !== "undefined" &&
      document.documentElement &&
      !document.documentElement.dataset.cowKioskFs
    ) {
      document.documentElement.style.fontSize = "30px";
      document.documentElement.dataset.cowKioskFs = "1";
    }
    // Promote :host so we paint over HA's panel-view padding.
    this.setAttribute("panel", "");
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback();
    if (this.timer) window.clearInterval(this.timer);
  }

  override willUpdate(): void {
    if (!this.hass || !this.config) return;
    const kinds = this.activeKinds();
    const currentKind = kinds[this.index] ?? kinds[0];
    if (currentKind === "blinds") {
      const view = this.aggregateOrIndexBlinds();
      const a = accentForBlinds(view.variant);
      this.style.setProperty("--cow-accent", a.primary);
      this.style.setProperty("--cow-accent-light", a.light);
      this.style.setProperty("--cow-accent-active", a.active);
    } else if (currentKind === "lights") {
      const view = this.aggregateOrIndexLights();
      const a = accentForLights(view.variant);
      this.style.setProperty("--cow-accent", a.primary);
      this.style.setProperty("--cow-accent-light", a.light);
      this.style.setProperty("--cow-accent-active", a.active);
    } else if (currentKind === "thermostat" && this.config.climate) {
      const view = deriveThermostatView(this.getEntity(this.config.climate));
      const a = accentForThermostat(view.variant);
      this.style.setProperty("--cow-accent", a.primary);
      this.style.setProperty("--cow-accent-light", a.light);
      this.style.setProperty("--cow-accent-active", a.active);
    }
  }

  /* ─────────────────────── helpers ─────────────────────── */

  private activeKinds(): DeviceKind[] {
    const k: DeviceKind[] = [];
    if (this.config?.climate) k.push("thermostat");
    if (this.config && this.config.covers.length > 0) k.push("blinds");
    if (this.config && this.config.lights.length > 0) k.push("lights");
    return k;
  }

  private indexForView(view: InitialView | undefined): number {
    const kinds = this.activeKinds();
    if (kinds.length === 0) return 0;
    const target: DeviceKind =
      view === "thermostat"
        ? "thermostat"
        : view === "blinds"
          ? "blinds"
          : view === "lights"
            ? "lights"
            : kinds[0];
    const i = kinds.indexOf(target);
    return i >= 0 ? i : 0;
  }

  private getEntity(id?: string): HassEntity | undefined {
    if (!id || !this.hass) return undefined;
    return this.hass.states[id];
  }

  private aggregateOrIndexBlinds(): BlindsView {
    if (!this.config) return { variant: "closed", position: 0, raw: "unavailable" };
    if (this.activeBlindIndex === -1) {
      return aggregateBlindsView(
        this.config.covers.map((id) => this.getEntity(id)),
      );
    }
    return deriveBlindsView(
      this.getEntity(this.config.covers[this.activeBlindIndex]),
    );
  }

  private aggregateOrIndexLights(): LightsView {
    if (!this.config) return { variant: "off", brightnessPct: 0, raw: "unavailable" };
    if (this.activeLightIndex === -1) {
      return aggregateLightsView(
        this.config.lights.map((id) => this.getEntity(id)),
      );
    }
    return deriveLightsView(
      this.getEntity(this.config.lights[this.activeLightIndex]),
    );
  }

  /* ─────────────────────── actions ─────────────────────── */

  private targetBlinds(): string[] {
    if (!this.config) return [];
    if (this.activeBlindIndex === -1) return this.config.covers;
    const e = this.config.covers[this.activeBlindIndex];
    return e ? [e] : [];
  }

  private async openCover(): Promise<void> {
    if (!this.hass) return;
    for (const id of this.targetBlinds()) {
      await this.hass.callService("cover", "open_cover", {}, { entity_id: id });
    }
  }
  private async closeCover(): Promise<void> {
    if (!this.hass) return;
    for (const id of this.targetBlinds()) {
      await this.hass.callService("cover", "close_cover", {}, { entity_id: id });
    }
  }
  private async stopCover(): Promise<void> {
    if (!this.hass) return;
    for (const id of this.targetBlinds()) {
      await this.hass.callService("cover", "stop_cover", {}, { entity_id: id });
    }
  }
  private async setCoverPosition(pct: number): Promise<void> {
    if (!this.hass) return;
    for (const id of this.targetBlinds()) {
      await this.hass.callService(
        "cover",
        "set_cover_position",
        { position: pct },
        { entity_id: id },
      );
    }
  }

  private statusForBlinds(v: BlindsVariant): string {
    return v === "open" ? "OPEN" : v === "half" ? "HALF" : v === "closed" ? "CLOSED" : "MOVING";
  }
  private statusForLights(v: LightsVariant): string {
    return v === "bright" ? "BRIGHT" : v === "dim" ? "DIM" : v === "night" ? "NIGHT" : "OFF";
  }

  /* ─────────────────────── render ─────────────────────── */

  override render() {
    if (!this.config) {
      return html`<div class="error">cow-kiosk-card: invalid config</div>`;
    }
    const kinds = this.activeKinds();
    if (kinds.length === 0) {
      return html`<div class="error">
        cow-kiosk-card: configure at least one of climate / light / cover
      </div>`;
    }

    return html`
      <div class="frame">
        <cow-device-swiper
          .index=${this.index}
          .count=${kinds.length}
          @cow-index-change=${(e: CustomEvent<{ index: number }>) =>
            (this.index = e.detail.index)}
        >
          ${kinds.map((kind, i) => {
            if (kind === "blinds") return this.renderBlinds(i);
            if (kind === "lights") return this.renderLights(i);
            return this.renderThermostat(i);
          })}
        </cow-device-swiper>
      </div>
    `;
  }

  private renderBlinds(slideIndex: number) {
    const view = this.aggregateOrIndexBlinds();
    const labels = this.config!.coverLabels;
    const scopeText =
      this.activeBlindIndex === -1
        ? this.config!.covers.length > 1
          ? "Tutte"
          : ""
        : labels[this.activeBlindIndex] ?? "";
    return html`
      <cow-split-panel slot="slide-${slideIndex}">
        <div slot="left" class="left-content">
          <div class="visual-wrap">
            <cow-blind-visual
              .variant=${view.variant}
              .position=${view.position}
            ></cow-blind-visual>
          </div>
          <div class="status-label">${this.statusForBlinds(view.variant)}</div>
          <div class="display-value">${view.position}%</div>
          <div class="display-unit">Open</div>
        </div>
        <div slot="right" class="right-content">
          <div class="room">${this.config!.room}</div>
          <div class="time">${formatTime(this.now, this.hass?.locale?.language)}</div>
          <div class="controls-label">Controls</div>
          ${scopeText ? html`<div class="scope-label">${scopeText}</div>` : ""}
          <div class="controls-row">
            <cow-control-button label="▲" @click=${this.openCover}></cow-control-button>
            <cow-control-button
              label="■"
              variant="stop"
              @click=${this.stopCover}
            ></cow-control-button>
            <cow-control-button label="▼" @click=${this.closeCover}></cow-control-button>
          </div>
          <div class="presets-label">Presets</div>
          <div class="presets-row">
            ${[25, 50, 75, 100].map(
              (p) => html`
                <cow-preset-chip
                  label="${p}%"
                  ?active=${view.position === p}
                  @click=${() => this.setCoverPosition(p)}
                ></cow-preset-chip>
              `,
            )}
          </div>
          ${this.config!.covers.length > 1
            ? html`
                <div class="selector-wrap">
                  <cow-entity-selector
                    .labels=${labels}
                    .activeIndex=${this.activeBlindIndex}
                    @cow-entity-select=${(e: CustomEvent<{ index: number }>) =>
                      (this.activeBlindIndex = e.detail.index)}
                  ></cow-entity-selector>
                </div>
              `
            : ""}
        </div>
      </cow-split-panel>
    `;
  }

  private renderLights(slideIndex: number) {
    const view = this.aggregateOrIndexLights();
    const labels = this.config!.lightLabels;
    const scopeText =
      this.activeLightIndex === -1
        ? this.config!.lights.length > 1
          ? "Tutte"
          : ""
        : labels[this.activeLightIndex] ?? "";
    return html`
      <cow-split-panel slot="slide-${slideIndex}">
        <div slot="left" class="left-content">
          <div class="visual-wrap">
            <cow-bulb-visual
              .variant=${view.variant}
              .brightness=${view.brightnessPct}
            ></cow-bulb-visual>
          </div>
          <div class="status-label">${this.statusForLights(view.variant)}</div>
          <div class="display-value">${view.brightnessPct}%</div>
          <div class="display-unit">Brightness</div>
        </div>
        <div slot="right" class="right-content">
          <div class="room">${this.config!.room}</div>
          <div class="time">${formatTime(this.now, this.hass?.locale?.language)}</div>
          <div class="brightness-label">Brightness</div>
          ${scopeText ? html`<div class="scope-label">${scopeText}</div>` : ""}
          <div class="slider-wrap">
            <cow-vertical-slider
              .value=${view.brightnessPct}
              @cow-slider-change=${(e: CustomEvent<{ value: number }>) =>
                this.setLightBrightness(e.detail.value)}
            ></cow-vertical-slider>
          </div>
          <div class="power-wrap">
            <cow-power-toggle
              .on=${view.variant !== "off"}
              @cow-toggle=${(e: CustomEvent<{ on: boolean }>) =>
                this.toggleLight(e.detail.on)}
            ></cow-power-toggle>
          </div>
          ${this.config!.lights.length > 1
            ? html`
                <div class="selector-wrap">
                  <cow-entity-selector
                    .labels=${labels}
                    .activeIndex=${this.activeLightIndex}
                    @cow-entity-select=${(e: CustomEvent<{ index: number }>) =>
                      (this.activeLightIndex = e.detail.index)}
                  ></cow-entity-selector>
                </div>
              `
            : ""}
        </div>
      </cow-split-panel>
    `;
  }

  private renderThermostat(slideIndex: number) {
    // For now, the thermostat layout is rendered by the existing
    // cow-thermostat-panel — it already fits 30rem when html font
    // is 30px, and reimplementing all of the heating-curve UI here
    // would balloon this file. Future cleanup: inline it like
    // renderBlinds/renderLights above.
    return html`
      <cow-thermostat-panel
        slot="slide-${slideIndex}"
        .hass=${this.hass}
        .roomName=${this.config!.room}
        .entity=${this.config!.climate}
        .localTemp=${this.config!.local_temp}
        .localHumidity=${this.config!.local_humidity}
        .outdoorTemp=${this.config!.outdoor_temp}
      ></cow-thermostat-panel>
    `;
  }

  /* ─────────────────────── lights helpers ─────────────────────── */

  private targetLights(): string[] {
    if (!this.config) return [];
    if (this.activeLightIndex === -1) return this.config.lights;
    const e = this.config.lights[this.activeLightIndex];
    return e ? [e] : [];
  }

  private async toggleLight(on: boolean): Promise<void> {
    if (!this.hass) return;
    for (const id of this.targetLights()) {
      await this.hass.callService(
        "light",
        on ? "turn_on" : "turn_off",
        {},
        { entity_id: id },
      );
    }
  }
  private async setLightBrightness(pct: number): Promise<void> {
    if (!this.hass) return;
    for (const id of this.targetLights()) {
      await this.hass.callService(
        "light",
        "turn_on",
        { brightness_pct: pct },
        { entity_id: id },
      );
    }
  }

  getCardSize(): number {
    return 12;
  }
}

window.customCards = window.customCards ?? [];
if (!window.customCards.some((c) => c.type === "cow-kiosk-card")) {
  window.customCards.push({
    type: "cow-kiosk-card",
    name: "Cave of Wonders Kiosk (720x720)",
    description:
      "Single-room kiosk card sized natively for Shelly Wall Display (720x720). Same config schema as cow-thermostat-card.",
    preview: false,
  });
}

declare global {
  interface HTMLElementTagNameMap {
    "cow-kiosk-card": CowKioskCard;
  }
}

void VERSION;
