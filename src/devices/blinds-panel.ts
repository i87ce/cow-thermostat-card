import { LitElement, html, css } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import type { HomeAssistant, HassEntity } from "../types/hass.js";
import {
  aggregateBlindsView,
  deriveBlindsView,
  type BlindsVariant,
  type BlindsView,
} from "../state/blinds-state.js";
import { accentForBlinds } from "../styles/tokens.js";
import { formatTime } from "../utils/format.js";

import "../components/split-panel.js";
import "../molecules/control-button.js";
import "../molecules/preset-chip.js";
import "../molecules/entity-selector.js";
import "../visuals/blind-visual.js";

/**
 * Blinds panel — multi-entity. Master Open/Stop/Close buttons and preset
 * chips act on:
 *  - all configured covers (activeIndex === -1, default), or
 *  - a single selected cover (chip row at the bottom of the right pane).
 *
 * Variants when "all": average position across all covers; "moving" if
 * any one is moving.
 */
@customElement("cow-blinds-panel")
export class CowBlindsPanel extends LitElement {
  @property({ attribute: false }) hass?: HomeAssistant;
  @property({ type: Array }) entities: string[] = [];
  @property({ type: Array }) labels: string[] = [];
  @property({ type: String }) roomName = "";

  @state() private now = new Date();
  @state() private activeIndex = -1;
  private timer?: number;

  static override styles = css`
    :host {
      display: block;
      width: 100%;
      height: 100%;
      position: relative;
    }

    /* Redistributed for 24rem effective vertical space (vs 17rem before). */
    .visual-wrap {
      position: absolute;
      left: 50%;
      top: 2.5rem;
      transform: translateX(-50%);
      width: 8rem;
      height: 8rem;
    }
    .status-label {
      position: absolute;
      left: 1.5rem;
      top: 13rem;
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
      top: 14.5rem;
      font-weight: 300;
      font-size: var(--cow-font-display);
      line-height: 1;
      color: var(--cow-surface-white);
      white-space: nowrap;
    }
    .display-unit {
      position: absolute;
      left: 1.5rem;
      top: 21rem;
      font-weight: 400;
      font-size: var(--cow-font-caption);
      color: var(--cow-surface-white);
      opacity: 0.6;
    }

    /* Right column — redistributed for 24rem effective height. */
    .room {
      position: absolute;
      left: 1rem;
      top: 2rem;
      font-weight: 600;
      font-size: var(--cow-font-room);
      color: var(--cow-text-room-name);
    }
    .time {
      position: absolute;
      right: 1rem;
      top: 2rem;
      font-weight: 600;
      font-size: var(--cow-font-time);
      color: var(--cow-text-time);
    }
    .scope-label {
      position: absolute;
      left: 1rem;
      top: 5rem;
      right: 1rem;
      text-align: right;
      font-weight: 600;
      font-size: 0.625rem;
      color: var(--cow-accent-active, var(--cow-text-secondary));
      text-transform: uppercase;
      letter-spacing: 0.0625rem;
    }
    .controls-label {
      position: absolute;
      left: 1rem;
      top: 5rem;
      font-weight: 400;
      font-size: var(--cow-font-caption);
      color: var(--cow-text-secondary);
    }
    .controls-row {
      position: absolute;
      left: 1rem;
      right: 1rem;
      top: 7rem;
      display: flex;
      gap: 0.5rem;
    }
    .presets-label {
      position: absolute;
      left: 1rem;
      top: 13rem;
      font-weight: 400;
      font-size: var(--cow-font-caption);
      color: var(--cow-text-secondary);
    }
    .presets-row {
      position: absolute;
      left: 1rem;
      right: 1rem;
      top: 15rem;
      display: flex;
      gap: 0.5rem;
      flex-wrap: wrap;
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
    const a = accentForBlinds(view.variant);
    this.style.setProperty("--cow-accent", a.primary);
    this.style.setProperty("--cow-accent-light", a.light);
    this.style.setProperty("--cow-accent-active", a.active);
  }

  private getEntity(id?: string): HassEntity | undefined {
    if (!id || !this.hass) return undefined;
    return this.hass.states[id];
  }

  private getActiveView(): BlindsView {
    if (this.entities.length === 0) {
      return { variant: "closed", position: 0, raw: "unavailable" };
    }
    if (this.activeIndex === -1) {
      return aggregateBlindsView(this.entities.map((id) => this.getEntity(id)));
    }
    return deriveBlindsView(this.getEntity(this.entities[this.activeIndex]));
  }

  private targetEntities(): string[] {
    if (this.activeIndex === -1) return this.entities;
    const e = this.entities[this.activeIndex];
    return e ? [e] : [];
  }

  private statusLabelFor(v: BlindsVariant): string {
    switch (v) {
      case "open":
        return "OPEN";
      case "half":
        return "HALF";
      case "closed":
        return "CLOSED";
      case "moving":
        return "MOVING";
    }
  }

  private async openCover(): Promise<void> {
    if (!this.hass) return;
    const targets = this.targetEntities();
    if (targets.length === 0) return;
    await this.hass.callService(
      "cover",
      "open_cover",
      {},
      { entity_id: targets },
    );
  }
  private async closeCover(): Promise<void> {
    if (!this.hass) return;
    const targets = this.targetEntities();
    if (targets.length === 0) return;
    await this.hass.callService(
      "cover",
      "close_cover",
      {},
      { entity_id: targets },
    );
  }
  private async stopCover(): Promise<void> {
    if (!this.hass) return;
    const targets = this.targetEntities();
    if (targets.length === 0) return;
    await this.hass.callService(
      "cover",
      "stop_cover",
      {},
      { entity_id: targets },
    );
  }
  private async setPosition(pct: number): Promise<void> {
    if (!this.hass) return;
    const targets = this.targetEntities();
    if (targets.length === 0) return;
    await this.hass.callService(
      "cover",
      "set_cover_position",
      { position: pct },
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
            <cow-blind-visual
              .variant=${view.variant}
              .position=${view.position}
            ></cow-blind-visual>
          </div>
          <div class="status-label">${this.statusLabelFor(view.variant)}</div>
          <div class="display-value">${view.position}%</div>
          <div class="display-unit">Open</div>
        </div>

        <div slot="right" class="right-content">
          <div class="room">${this.roomName}</div>
          <div class="time">${formatTime(this.now, this.hass?.locale?.language)}</div>
          <div class="controls-label">Controls</div>
          ${scopeText
            ? html`<div class="scope-label">${scopeText}</div>`
            : ""}
          <div class="controls-row">
            <cow-control-button label="▲ Open" @click=${this.openCover}></cow-control-button>
            <cow-control-button
              label="■ Stop"
              variant="stop"
              @click=${this.stopCover}
            ></cow-control-button>
            <cow-control-button label="▼ Close" @click=${this.closeCover}></cow-control-button>
          </div>
          <div class="presets-label">Presets</div>
          <div class="presets-row">
            ${[25, 50, 75, 100].map(
              (p) => html`
                <cow-preset-chip
                  label="${p}%"
                  ?active=${Math.abs(view.position - p) <= 5}
                  @click=${() => this.setPosition(p)}
                ></cow-preset-chip>
              `,
            )}
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
