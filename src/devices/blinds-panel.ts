import { LitElement, html, css } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import type { HomeAssistant, HassEntity } from "../types/hass.js";
import {
  deriveBlindsView,
  type BlindsVariant,
} from "../state/blinds-state.js";
/* `accentForBlinds` is referenced indirectly in willUpdate */
import { accentForBlinds } from "../styles/tokens.js";
import { formatTime } from "../utils/format.js";

import "../components/split-panel.js";
import "../molecules/control-button.js";
import "../molecules/preset-chip.js";
import "../visuals/blind-visual.js";
import "../molecules/info-badge.js";

/**
 * Blinds panel — replica Figma "Split Panel — All States / Blinds":
 *   Fully Open (50:14)
 *   Half Open  (50:16)
 *   Closed     (50:18)
 *   Moving     (50:20)
 *
 * Left:  blind-visual centered, big position label, status label
 * Right: room name + time + Open/Stop/Close + 3 preset chips
 */
@customElement("cow-blinds-panel")
export class CowBlindsPanel extends LitElement {
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

    /* LEFT pane */
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
    .bottom-strip {
      position: absolute;
      left: 1.5rem;
      right: 1rem;
      top: 21.25rem;
      display: flex;
      justify-content: space-between;
    }

    /* RIGHT pane */
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
    .controls-label {
      position: absolute;
      left: 0.75rem;
      top: 4.5rem;
      font-weight: 400;
      font-size: var(--cow-font-caption);
      color: var(--cow-text-secondary);
    }
    .controls-row {
      position: absolute;
      left: 0.75rem;
      right: 0.75rem;
      top: 6rem;
      display: flex;
      gap: 0.375rem;
    }
    .presets-label {
      position: absolute;
      left: 0.75rem;
      top: 10.5rem;
      font-weight: 400;
      font-size: var(--cow-font-caption);
      color: var(--cow-text-secondary);
    }
    .presets-row {
      position: absolute;
      left: 0.75rem;
      right: 0.75rem;
      top: 12rem;
      display: flex;
      gap: 0.375rem;
      flex-wrap: wrap;
    }
    .position-readout {
      position: absolute;
      left: 0.75rem;
      right: 0.75rem;
      bottom: 1.5rem;
      font-weight: 600;
      font-size: var(--cow-font-time);
      color: var(--cow-text-secondary);
      text-align: center;
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
    const cover = this.getEntity(this.entity);
    const view = deriveBlindsView(cover);
    const a = accentForBlinds(view.variant);
    this.style.setProperty("--cow-accent", a.primary);
    this.style.setProperty("--cow-accent-light", a.light);
    this.style.setProperty("--cow-accent-active", a.active);
  }

  private getEntity(id?: string): HassEntity | undefined {
    if (!id || !this.hass) return undefined;
    return this.hass.states[id];
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
    await this.hass.callService(
      "cover",
      "open_cover",
      {},
      { entity_id: this.entity },
    );
  }
  private async closeCover(): Promise<void> {
    if (!this.hass) return;
    await this.hass.callService(
      "cover",
      "close_cover",
      {},
      { entity_id: this.entity },
    );
  }
  private async stopCover(): Promise<void> {
    if (!this.hass) return;
    await this.hass.callService(
      "cover",
      "stop_cover",
      {},
      { entity_id: this.entity },
    );
  }
  private async setPosition(pct: number): Promise<void> {
    if (!this.hass) return;
    await this.hass.callService(
      "cover",
      "set_cover_position",
      { position: pct },
      { entity_id: this.entity },
    );
  }

  override render() {
    const cover = this.getEntity(this.entity);
    const view = deriveBlindsView(cover);
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
          <div class="position-readout">Position: ${view.position}%</div>
        </div>
      </cow-split-panel>
    `;
  }
}
