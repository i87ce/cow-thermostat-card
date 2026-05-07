import { LitElement, html, css } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import type { HomeAssistant, HassEntity } from "../types/hass.js";
import {
  brightnessFromPct,
  deriveLightsView,
  type LightsVariant,
} from "../state/lights-state.js";
/* `accentForLights` is referenced indirectly in willUpdate */
import { accentForLights } from "../styles/tokens.js";
import { formatTime } from "../utils/format.js";

import "../components/split-panel.js";
import "../molecules/vertical-slider.js";
import "../molecules/power-toggle.js";
import "../visuals/bulb-visual.js";

/**
 * Lights panel — replica Figma "Split Panel — All States / Lights":
 *   On — Bright (50:23)
 *   On — Dim    (50:25)
 *   Off         (50:27)
 *   Night (5%)  (50:29)
 *
 * Left:  bulb-visual + brightness % + status label
 * Right: vertical slider + power toggle
 */
@customElement("cow-lights-panel")
export class CowLightsPanel extends LitElement {
  @property({ attribute: false }) hass?: HomeAssistant;
  @property({ type: String }) entity = "";
  @property({ type: String }) roomName = "";

  @state() private now = new Date();
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
      top: 4.5rem;
      font-weight: 400;
      font-size: var(--cow-font-caption);
      color: var(--cow-text-secondary);
    }
    .slider-wrap {
      position: absolute;
      left: 50%;
      top: 6rem;
      transform: translateX(-50%);
    }
    .power-wrap {
      position: absolute;
      left: 50%;
      top: 17rem;
      transform: translateX(-50%);
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
    const light = this.getEntity(this.entity);
    const view = deriveLightsView(light);
    const a = accentForLights(view.variant);
    this.style.setProperty("--cow-accent", a.primary);
    this.style.setProperty("--cow-accent-light", a.light);
    this.style.setProperty("--cow-accent-active", a.active);
  }

  private getEntity(id?: string): HassEntity | undefined {
    if (!id || !this.hass) return undefined;
    return this.hass.states[id];
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
    if (pct === 0) {
      await this.hass.callService(
        "light",
        "turn_off",
        {},
        { entity_id: this.entity },
      );
    } else {
      await this.hass.callService(
        "light",
        "turn_on",
        { brightness: brightnessFromPct(pct) },
        { entity_id: this.entity },
      );
    }
  }

  private async togglePower(on: boolean): Promise<void> {
    if (!this.hass) return;
    await this.hass.callService(
      "light",
      on ? "turn_on" : "turn_off",
      {},
      { entity_id: this.entity },
    );
  }

  override render() {
    const light = this.getEntity(this.entity);
    const view = deriveLightsView(light);
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
          <div class="slider-wrap">
            <cow-vertical-slider
              .value=${view.brightnessPct}
              @cow-slider-change=${(e: CustomEvent<{ value: number }>) =>
                this.setBrightness(e.detail.value)}
            ></cow-vertical-slider>
          </div>
          <div class="power-wrap">
            <cow-power-toggle
              ?on=${view.variant !== "off"}
              @cow-power-change=${(e: CustomEvent<{ on: boolean }>) =>
                this.togglePower(e.detail.on)}
            ></cow-power-toggle>
          </div>
        </div>
      </cow-split-panel>
    `;
  }
}
