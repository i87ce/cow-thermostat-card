import { LitElement, html, css, nothing } from "lit";
import { customElement, property } from "lit/decorators.js";
import type { HomeAssistant } from "../types/hass.js";
import type { CowRoomConfig } from "../config-xl.js";
import { countActiveDevices } from "../config-xl.js";

import "../molecules/info-badge.js";

/**
 * XL header row: STANZE label + room chips (left, scrollable if too many),
 * weather pill + now-playing pill (right).
 *
 * Emits `cow-room-tap` { index } when a chip is tapped.
 */
@customElement("cow-xl-header")
export class CowXLHeader extends LitElement {
  @property({ attribute: false }) hass?: HomeAssistant;
  @property({ type: Array }) rooms: CowRoomConfig[] = [];
  @property({ type: Number }) activeIndex = -1;
  @property({ type: String }) weatherEntity?: string;
  @property({ type: String }) mediaPlayer?: string;

  static override styles = css`
    :host {
      display: block;
      position: relative;
      width: 100%;
    }
    .label {
      position: absolute;
      left: 1.75rem;
      top: 1.5rem;
      font-weight: 600;
      font-size: 0.75rem;
      letter-spacing: 0.125rem;
      color: var(--cow-text-secondary);
    }
    .pills {
      position: absolute;
      right: 1.75rem;
      top: 1rem;
      display: flex;
      gap: 0.75rem;
    }
    .pill {
      display: inline-flex;
      align-items: center;
      gap: 0.5rem;
      height: 2.25rem;
      padding: 0 1rem;
      background: var(--cow-surface-white);
      border: 0.0625rem solid var(--cow-surface-border);
      border-radius: 1.125rem;
      font-size: 0.8125rem;
      font-weight: 500;
      color: var(--cow-text-primary);
      white-space: nowrap;
    }
    .pill button.play {
      width: 1.75rem;
      height: 1.75rem;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      background: var(--cow-surface-button-bg);
      border-radius: 50%;
      color: var(--cow-text-primary);
      font-size: 0.75rem;
    }
    .chips {
      position: absolute;
      left: 1.75rem;
      right: 1.75rem;
      top: 4.5rem;
      display: flex;
      gap: 0.375rem;
      overflow-x: auto;
      scrollbar-width: none;
    }
    .chips::-webkit-scrollbar { display: none; }
    .chip {
      flex: 1 1 0;
      min-width: 0;
      height: 4rem;
      padding: 0.75rem;
      background: var(--cow-surface-white);
      border: 0.0625rem solid var(--cow-surface-border);
      border-radius: 0.75rem;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      cursor: pointer;
      transition:
        background-color 160ms ease,
        color 160ms ease,
        border-color 160ms ease;
    }
    .chip[data-active] {
      background: var(--cow-text-primary);
      border-color: var(--cow-text-primary);
      color: var(--cow-surface-white);
    }
    .chip-row {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 0.25rem;
    }
    .chip-icon {
      font-size: 0.875rem;
      line-height: 1;
    }
    .chip-count {
      font-size: 0.6875rem;
      font-weight: 400;
      color: var(--cow-text-secondary);
    }
    .chip[data-active] .chip-count {
      color: var(--cow-surface-white);
      opacity: 0.6;
    }
    .chip-name {
      font-weight: 600;
      font-size: 0.75rem;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .divider {
      position: absolute;
      left: 0;
      right: 0;
      top: 9.5rem;
      height: 0.0625rem;
      background: var(--cow-surface-border);
    }
  `;

  private getMediaText(): string | null {
    if (!this.mediaPlayer || !this.hass) return null;
    const e = this.hass.states[this.mediaPlayer];
    if (!e) return null;
    const title = (e.attributes as Record<string, unknown>).media_title as
      | string
      | undefined;
    return title || (typeof e.state === "string" ? e.state : null);
  }

  private getWeatherText(): string | null {
    if (!this.weatherEntity || !this.hass) return null;
    const e = this.hass.states[this.weatherEntity];
    if (!e) return null;
    const t = (e.attributes as Record<string, unknown>).temperature as
      | number
      | undefined;
    const h = (e.attributes as Record<string, unknown>).humidity as
      | number
      | undefined;
    const parts: string[] = [];
    if (t != null) parts.push(`☀ ${Math.round(t)}°C`);
    if (h != null) parts.push(`💧 ${Math.round(h)}%`);
    return parts.join("   ");
  }

  private onChipTap(i: number) {
    this.dispatchEvent(
      new CustomEvent("cow-room-tap", {
        detail: { index: i },
        bubbles: true,
        composed: true,
      }),
    );
  }

  override render() {
    const states = this.hass?.states ?? {};
    const weather = this.getWeatherText();
    const media = this.getMediaText();
    return html`
      <div class="label">STANZE</div>
      <div class="pills">
        ${weather
          ? html`<div class="pill">${weather}</div>`
          : nothing}
        ${media
          ? html`<div class="pill">
              <span>♪</span>
              <span>${media}</span>
              <button class="play" aria-label="Play/pause">II</button>
            </div>`
          : nothing}
      </div>
      <div class="chips">
        ${this.rooms.map(
          (r, i) => html`
            <button
              class="chip"
              ?data-active=${i === this.activeIndex}
              @click=${() => this.onChipTap(i)}
            >
              <div class="chip-row">
                <span class="chip-icon">${r.icon ?? "•"}</span>
                <span class="chip-count">${countActiveDevices(r, states)}</span>
              </div>
              <div class="chip-name">${r.name}</div>
            </button>
          `,
        )}
      </div>
      <div class="divider"></div>
    `;
  }
}
