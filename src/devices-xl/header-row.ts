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
    .groups {
      position: absolute;
      left: 1.5rem;
      right: 1.5rem;
      top: 3.5rem;
      display: flex;
      flex-direction: column;
      gap: 0.625rem;
    }
    .groups-row {
      display: flex;
      gap: 0.625rem;
      align-items: stretch;
      min-width: 0;
    }
    .group {
      flex: var(--group-flex, 1) 1 0;
      min-width: 0;
      background: var(--cow-surface-background);
      border: 0.0625rem solid var(--cow-surface-border);
      border-radius: 1.125rem;
      padding: 0.375rem 0.5rem 0.5rem;
      display: flex;
      flex-direction: column;
      gap: 0.3125rem;
    }
    .group-label {
      font-size: 0.625rem;
      font-weight: 700;
      letter-spacing: 0.09375rem;
      text-transform: uppercase;
      color: var(--cow-text-secondary);
      padding: 0 0.25rem;
      line-height: 1;
    }
    .group-chips {
      display: flex;
      gap: 0.375rem;
      flex: 1 1 auto;
      min-width: 0;
    }
    .chip {
      flex: 1 1 0;
      min-width: 0;
      height: 5rem;
      padding: 0.75rem 0.875rem;
      background: var(--cow-surface-white);
      border: 0.0625rem solid var(--cow-surface-border);
      border-radius: 1rem;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      align-items: flex-start;
      cursor: pointer;
      transition:
        background-color 160ms ease,
        color 160ms ease,
        border-color 160ms ease,
        box-shadow 160ms ease;
      position: relative;
    }
    .chip:hover {
      box-shadow: 0 0.125rem 0.5rem rgba(31, 31, 46, 0.06);
    }
    .chip[data-active] {
      background: var(--cow-text-primary);
      border-color: var(--cow-text-primary);
      color: var(--cow-surface-white);
    }
    .chip-icon {
      font-size: 1.5rem;
      line-height: 1;
    }
    .chip-count {
      position: absolute;
      top: 0.5rem;
      right: 0.5rem;
      min-width: 1.0625rem;
      height: 1.0625rem;
      padding: 0 0.3125rem;
      border-radius: 0.53125rem;
      background: var(--cow-accent-active, #fa6b2e);
      color: var(--cow-surface-white);
      font-size: 0.625rem;
      font-weight: 700;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      line-height: 1;
    }
    .chip[data-zero] .chip-count {
      background: var(--cow-surface-button-bg);
      color: var(--cow-text-disabled);
    }
    .chip[data-active] .chip-count {
      background: var(--cow-surface-white);
      color: var(--cow-text-primary);
    }
    .chip-name {
      font-weight: 600;
      font-size: 0.9375rem;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      width: 100%;
      line-height: 1.1;
    }
    .divider {
      position: absolute;
      left: 0;
      right: 0;
      top: 17.5rem;
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

  /**
   * Bucket the room list into ordered groups by their `group` field while
   * preserving the original room indices (used for `activeIndex` and for
   * the `cow-room-tap` event payload). Rooms with no `group` fall into a
   * trailing "Altro" tile.
   */
  private buildGroups(): Array<{
    label: string;
    items: Array<{ room: CowRoomConfig; index: number }>;
  }> {
    const out: Array<{
      label: string;
      items: Array<{ room: CowRoomConfig; index: number }>;
    }> = [];
    const byLabel = new Map<string, number>();
    this.rooms.forEach((room, i) => {
      const label = (room.group && room.group.trim()) || "Altro";
      let pos = byLabel.get(label);
      if (pos === undefined) {
        pos = out.length;
        byLabel.set(label, pos);
        out.push({ label, items: [] });
      }
      out[pos].items.push({ room, index: i });
    });
    return out;
  }

  override render() {
    const states = this.hass?.states ?? {};
    const weather = this.getWeatherText();
    const media = this.getMediaText();
    const groups = this.buildGroups();
    // Split into 2 rows (first half + remainder). With 4 groups this is a
    // clean 2+2; with 3 it becomes 2+1; with 5 it becomes 3+2.
    const half = Math.ceil(groups.length / 2);
    const rows = groups.length > 1 ? [groups.slice(0, half), groups.slice(half)] : [groups];

    const renderGroup = (g: { label: string; items: Array<{ room: CowRoomConfig; index: number }> }) => html`
      <div
        class="group"
        style="--group-flex: ${g.items.length};"
      >
        <div class="group-label">${g.label}</div>
        <div class="group-chips">
          ${g.items.map(({ room, index }) => {
            const count = countActiveDevices(room, states);
            return html`
              <button
                class="chip"
                ?data-active=${index === this.activeIndex}
                ?data-zero=${count === 0}
                @click=${() => this.onChipTap(index)}
              >
                <span class="chip-count">${count}</span>
                <span class="chip-icon">${room.icon ?? "•"}</span>
                <div class="chip-name">${room.name}</div>
              </button>
            `;
          })}
        </div>
      </div>
    `;

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
      <div class="groups">
        ${rows.map(
          (row) => row.length
            ? html`<div class="groups-row">${row.map(renderGroup)}</div>`
            : nothing,
        )}
      </div>
      <div class="divider"></div>
    `;
  }
}
