import { LitElement, html, css } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import type { HomeAssistant, HassEntity } from "../types/hass.js";
import {
  aggregateLightsView,
  brightnessFromPct,
  deriveLightsView,
  type LightsVariant,
  type LightsView,
} from "../state/lights-state.js";
import { accentForLights } from "../styles/tokens.js";
import { formatTime } from "../utils/format.js";

import "../components/split-panel.js";
import "../molecules/vertical-slider.js";
import "../molecules/power-toggle.js";
import "../molecules/entity-selector.js";
import "../visuals/bulb-visual.js";

/**
 * Lights panel — replica Figma "Split Panel — All States / Lights" with
 * multi-entity support. Master controls (bulb visual, slider, power
 * toggle) act on either:
 *  - all configured lights at once (activeIndex === -1, default), or
 *  - a single selected light (activeIndex === 0..N-1, picked via the
 *    chip row at the bottom of the right pane).
 *
 * Variants when "all":
 *   bright/dim/off/night based on AVERAGE brightness of ON lights
 * Variants when single: standard per-entity derivation.
 */
@customElement("cow-lights-panel")
export class CowLightsPanel extends LitElement {
  @property({ attribute: false }) hass?: HomeAssistant;
  @property({ type: Array }) entities: string[] = [];
  @property({ type: Array }) labels: string[] = [];
  @property({ type: String }) roomName = "";

  @state() private now = new Date();
  /** -1 = master/all; 0..N-1 = single entity */
  @state() private activeIndex = -1;

  private timer?: number;

  static override styles = css`
    :host {
      display: block;
      width: 24rem;
      height: 24rem;
    }

    .visual-wrap {
      position: absolute;
      left: 50%;
      top: 1.75rem;
      transform: translateX(-50%);
      width: 5.5rem;
      height: 5.5rem;
    }
    .status-label {
      position: absolute;
      left: 1.5rem;
      top: 8.75rem;
      font-weight: 500;
      font-size: var(--cow-font-status);
      color: var(--cow-surface-white);
      opacity: 0.7;
      letter-spacing: 0.15625rem;
      text-transform: uppercase;
      white-space: nowrap;
    }
    .display-value {
      position: absolute;
      left: 1.25rem;
      top: 9.875rem;
      font-weight: 300;
      font-size: var(--cow-font-display);
      line-height: 1;
      color: var(--cow-surface-white);
      white-space: nowrap;
    }
    .display-unit {
      position: absolute;
      left: 1.5rem;
      top: 14.5rem;
      font-weight: 400;
      font-size: var(--cow-font-caption);
      color: var(--cow-surface-white);
      opacity: 0.6;
    }
    .room {
      position: absolute;
      left: 0.75rem;
      top: 1.75rem;
      font-weight: 600;
      font-size: var(--cow-font-room);
      color: var(--cow-text-room-name);
    }
    .time {
      position: absolute;
      right: 1rem;
      top: 1.875rem;
      font-weight: 600;
      font-size: var(--cow-font-time);
      color: var(--cow-text-time);
    }
    .brightness-label {
      position: absolute;
      left: 0.75rem;
      top: 4.25rem;
      font-weight: 400;
      font-size: var(--cow-font-caption);
      color: var(--cow-text-secondary);
    }
    .scope-label {
      position: absolute;
      left: 0.75rem;
      top: 4.25rem;
      right: 0.75rem;
      text-align: right;
      font-weight: 600;
      font-size: 0.625rem;
      color: var(--cow-accent-active, var(--cow-text-secondary));
      text-transform: uppercase;
      letter-spacing: 0.0625rem;
    }
    .slider-wrap {
      position: absolute;
      left: 50%;
      top: 5.75rem;
      transform: translateX(-50%);
    }
    .power-wrap {
      position: absolute;
      left: 50%;
      top: 16.25rem;
      transform: translateX(-50%);
    }
    .selector-wrap {
      position: absolute;
      left: 0.75rem;
      right: 0.75rem;
      bottom: 0.75rem;
    }
    .left-content,
    .right-content {
      position: absolute;
      inset: 0;
    }
  `;

  override connectedCallback(): void {
    super.connectedCallback();
    this.timer = window.setInterval(() => (this.now = new Date()), 30_000);
  }
  override disconnectedCallback(): void {
    super.disconnectedCallback();
    if (this.timer) window.clearInterval(this.timer);
  }

  override willUpdate(): void {
    if (!this.hass) return;
    const view = this.getActiveView();
    const a = accentForLights(view.variant);
    this.style.setProperty("--cow-accent", a.primary);
    this.style.setProperty("--cow-accent-light", a.light);
    this.style.setProperty("--cow-accent-active", a.active);
  }

  private getEntity(id?: string): HassEntity | undefined {
    if (!id || !this.hass) return undefined;
    return this.hass.states[id];
  }

  private getActiveView(): LightsView {
    if (this.entities.length === 0) {
      return { variant: "off", brightnessPct: 0, raw: "unavailable" };
    }
    if (this.activeIndex === -1) {
      return aggregateLightsView(this.entities.map((id) => this.getEntity(id)));
    }
    return deriveLightsView(this.getEntity(this.entities[this.activeIndex]));
  }

  private targetEntities(): string[] {
    if (this.activeIndex === -1) return this.entities;
    const e = this.entities[this.activeIndex];
    return e ? [e] : [];
  }

  private statusLabelFor(v: LightsVariant): string {
    switch (v) {
      case "bright":
        return "BRIGHT";
      case "dim":
        return "DIM";
      case "off":
        return "OFF";
      case "night":
        return "NIGHT";
    }
  }

  private async setBrightness(pct: number): Promise<void> {
    if (!this.hass) return;
    const targets = this.targetEntities();
    if (targets.length === 0) return;
    if (pct === 0) {
      await this.hass.callService(
        "light",
        "turn_off",
        {},
        { entity_id: targets },
      );
    } else {
      await this.hass.callService(
        "light",
        "turn_on",
        { brightness: brightnessFromPct(pct) },
        { entity_id: targets },
      );
    }
  }

  private async togglePower(on: boolean): Promise<void> {
    if (!this.hass) return;
    const targets = this.targetEntities();
    if (targets.length === 0) return;
    await this.hass.callService(
      "light",
      on ? "turn_on" : "turn_off",
      {},
      { entity_id: targets },
    );
  }

  private onSelect = (e: CustomEvent<{ index: number }>) => {
    this.activeIndex = e.detail.index;
  };

  override render() {
    const view = this.getActiveView();
    const scopeText =
      this.activeIndex === -1
        ? this.entities.length > 1
          ? "Tutte"
          : ""
        : this.labels[this.activeIndex] ?? "";
    return html`
      <cow-split-panel>
        <div slot="left" class="left-content">
          <div class="visual-wrap">
            <cow-bulb-visual
              .variant=${view.variant}
              .brightnessPct=${view.brightnessPct}
            ></cow-bulb-visual>
          </div>
          <div class="status-label">${this.statusLabelFor(view.variant)}</div>
          <div class="display-value">${view.brightnessPct}%</div>
          <div class="display-unit">Brightness</div>
        </div>

        <div slot="right" class="right-content">
          <div class="room">${this.roomName}</div>
          <div class="time">${formatTime(this.now, this.hass?.locale?.language)}</div>
          <div class="brightness-label">Brightness</div>
          ${scopeText
            ? html`<div class="scope-label">${scopeText}</div>`
            : ""}
          <div class="slider-wrap">
            <cow-vertical-slider
              .value=${view.brightnessPct}
              @cow-slider-change=${(ev: CustomEvent<{ value: number }>) =>
                this.setBrightness(ev.detail.value)}
            ></cow-vertical-slider>
          </div>
          <div class="power-wrap">
            <cow-power-toggle
              ?on=${view.variant !== "off"}
              @cow-power-change=${(ev: CustomEvent<{ on: boolean }>) =>
                this.togglePower(ev.detail.on)}
            ></cow-power-toggle>
          </div>
          <div class="selector-wrap">
            <cow-entity-selector
              .labels=${this.labels}
              .activeIndex=${this.activeIndex}
              @cow-select=${this.onSelect}
            ></cow-entity-selector>
          </div>
        </div>
      </cow-split-panel>
    `;
  }
}
