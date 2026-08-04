import { LitElement, html, css, nothing, type PropertyValues } from "lit";
import { customElement, property } from "lit/decorators.js";
import type { HomeAssistant } from "../types/hass.js";
import type { CowRoomConfig } from "../config-xl.js";
import {
  countActiveByCategory,
  countOpenContacts,
} from "../config-xl.js";
import { findRoomOpeningsCached } from "../utils/openings-cache.js";
import { hassEntitiesChanged, xlHeaderEntityIds } from "../utils/hass-watch.js";

import "../small/components/info-badge.js";

/**
 * XL header row: STANZE label + room chips (left, scrollable if too many),
 * room-info pill + now-playing pill (right).
 *
 * The right pill shows the *active room's* ambient temperature and
 * humidity (since v0.9.x — the previous "weather" pill was redundant
 * with the hero card right below). If the active room has no ambient
 * sensors configured we fall back to the global `weatherEntity`
 * attributes so old configs keep something useful in the pill.
 *
 * Emits `cow-room-tap` { index } when a chip is tapped.
 */
@customElement("cow-xl-header")
export class CowXLHeader extends LitElement {
  @property({ attribute: false }) hass?: HomeAssistant;
  @property({ type: Array }) rooms: CowRoomConfig[] = [];
  @property({ type: Number }) activeIndex = -1;
  /**
   * Backwards-compatible fallback: when no active room is selected
   * (or the active room exposes no ambient sensors) the pill falls
   * back to this `weather.*` entity's temperature + humidity.
   */
  @property({ type: String }) weatherEntity?: string;

  private watchIds: string[] = [];
  private openingsCacheKey(room: CowRoomConfig): string {
    return `xl:${room.name}`;
  }
  private roomOpenings(room: CowRoomConfig) {
    return findRoomOpeningsCached(this.hass, this.openingsCacheKey(room), {
      areas: room.areas && room.areas.length > 0 ? room.areas : [room.name],
      defaultKind: room.opening_default_kind,
      doors: room.opening_doors,
      windows: room.opening_windows,
      garages: room.opening_garages,
      enabled: room.openings_enabled,
      entities: room.opening_entities,
      excludeDevices: room.opening_exclude_devices,
    });
  }

  override shouldUpdate(changed: PropertyValues): boolean {
    if (changed.has("rooms") || changed.has("activeIndex") || changed.has("weatherEntity")) {
      this.watchIds = xlHeaderEntityIds(this.rooms, this.weatherEntity);
      return true;
    }
    if (changed.has("hass")) {
      return hassEntitiesChanged(
        changed.get("hass") as HomeAssistant | undefined,
        this.hass,
        this.watchIds.length ? this.watchIds : xlHeaderEntityIds(this.rooms, this.weatherEntity),
      );
    }
    return true;
  }

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
    .room-pill {
      gap: 0.75rem;
      padding: 0 1.125rem;
    }
    .room-pill-label {
      font-weight: 600;
      font-size: 0.75rem;
      color: var(--cow-text-secondary);
      letter-spacing: 0.0125rem;
      max-width: 8rem;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .room-pill-metric {
      display: inline-flex;
      align-items: center;
      gap: 0.25rem;
      font-weight: 600;
      font-variant-numeric: tabular-nums;
    }
    .room-pill-icon {
      font-size: 0.875rem;
      line-height: 1;
      opacity: 0.85;
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
      font: inherit;
      font-size: 0.75rem;
      border: 0;
      cursor: pointer;
      -webkit-appearance: none;
      appearance: none;
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
      padding: 0.5rem 0.625rem 0.625rem;
      display: flex;
      flex-direction: column;
      gap: 0.5rem;
    }
    .group-label {
      font-size: 0.875rem;
      font-weight: 700;
      letter-spacing: 0.0625rem;
      text-transform: uppercase;
      color: var(--cow-text-primary);
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
      /* The chip is a <button>: without this rule, the room name inherits
         the browser/HA-theme default button color (often white or system
         grey) instead of our text-primary, which makes it invisible on
         the white chip background. */
      color: var(--cow-text-primary);
      font: inherit;
      -webkit-appearance: none;
      appearance: none;
    }
    .chip:hover {
      box-shadow: 0 0.125rem 0.5rem rgba(31, 31, 46, 0.06);
    }
    .chip:active {
      transform: scale(0.97);
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
    .chip-badges {
      position: absolute;
      top: 0.4375rem;
      right: 0.4375rem;
      display: flex;
      gap: 0.25rem;
      pointer-events: none;
    }
    .chip-badge {
      min-width: 1.0625rem;
      height: 1.0625rem;
      padding: 0 0.3125rem;
      border-radius: 0.53125rem;
      font-size: 0.625rem;
      font-weight: 700;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      line-height: 1;
    }
    .chip-badge.lights {
      /* warm yellow from the design system — the lights/heating accent */
      background: var(--cow-lights-bright);
      color: var(--cow-text-primary);
    }
    .chip-badge.covers {
      /* cool blue from the design system — the blinds accent */
      background: var(--cow-blinds-medium);
      color: var(--cow-surface-white);
    }
    .chip-badge.climate {
      /* orange — the heating accent */
      background: var(--cow-heating-primary);
      color: var(--cow-surface-white);
    }
    .chip-badge.openings {
      /* alert red — same hue the small-card opening strip uses for the
         "open" state, so the visual language is consistent between the
         wall display chip and the small thermostat panel. */
      background: var(--cow-stop, #e74c3c);
      color: var(--cow-surface-white);
    }
    .chip[data-active] .chip-badge {
      /* On the active (dark) chip background, invert badges to white-on-text */
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
      top: 19rem;
      height: 0.0625rem;
      background: var(--cow-surface-border);
    }
  `;

  /**
   * Build the right-side info pill. Priority order:
   *  1. The active room's `climate` entity, reading from its
   *     `current_temperature` + `current_humidity` attributes. For
   *     casa_<room> MQTT proxies these come straight from the
   *     mqtt.publish automations in cow_climate.yaml that mirror
   *     sensor.display_<room>_* — so we hit the same single source of
   *     truth the room drawer's Climate tab uses, and the two
   *     surfaces can never disagree.
   *  2. Sensor fallback (`room.temperature` / `room.humidity`) for
   *     rooms with no climate entity at all — e.g. Lavanderia, which
   *     only has a contact-sensor temperature reading.
   *  3. Global `weatherEntity` as a last resort so legacy configs
   *     still show something on the pill.
   *
   * Returns `null` when no source has any data — in that case the
   * pill is hidden entirely.
   */
  private getInfoPill(): { temp?: number; humidity?: number; label?: string } | null {
    if (!this.hass) return null;
    const states = this.hass.states;
    const room =
      this.activeIndex >= 0 && this.activeIndex < this.rooms.length
        ? this.rooms[this.activeIndex]
        : undefined;

    let temp: number | undefined;
    let humidity: number | undefined;
    let label: string | undefined;

    if (room) {
      // 1. Climate proxy first — single source of truth for any heated
      //    / cooled room.
      if (room.climate) {
        const c = states[room.climate];
        if (c) {
          const a = c.attributes as Record<string, unknown>;
          if (typeof a.current_temperature === "number") temp = a.current_temperature;
          if (typeof a.current_humidity === "number") humidity = a.current_humidity;
        }
      }
      // 2. Sensor fallback for rooms with no climate entity.
      if (temp == null && room.temperature) {
        const tEntity = states[room.temperature];
        if (tEntity) {
          const v = Number(tEntity.state);
          if (Number.isFinite(v)) temp = v;
        }
      }
      if (humidity == null && room.humidity) {
        const hEntity = states[room.humidity];
        if (hEntity) {
          const v = Number(hEntity.state);
          if (Number.isFinite(v)) humidity = v;
        }
      }
      if (temp != null || humidity != null) label = room.name;
    }

    if (temp == null && humidity == null && this.weatherEntity) {
      const e = states[this.weatherEntity];
      if (e) {
        const a = e.attributes as Record<string, unknown>;
        if (typeof a.temperature === "number") temp = a.temperature;
        if (typeof a.humidity === "number") humidity = a.humidity;
      }
    }

    if (temp == null && humidity == null) return null;
    return { temp, humidity, label };
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
    const info = this.getInfoPill();
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
            const counts = countActiveByCategory(room, states);
            const openContacts = countOpenContacts(
              this.roomOpenings(room),
            );
            const total =
              counts.lights + counts.covers + counts.climate + openContacts;
            return html`
              <button
                class="chip"
                ?data-active=${index === this.activeIndex}
                ?data-zero=${total === 0}
                @click=${() => this.onChipTap(index)}
              >
                <div class="chip-badges">
                  ${openContacts > 0
                    ? html`<span
                        class="chip-badge openings"
                        title="${openContacts} apertur${openContacts === 1 ? "a aperta" : "e aperte"}"
                      >${openContacts}</span>`
                    : nothing}
                  ${counts.covers > 0
                    ? html`<span
                        class="chip-badge covers"
                        title="${counts.covers} tapparell${counts.covers === 1 ? "a aperta" : "e aperte"}"
                      >${counts.covers}</span>`
                    : nothing}
                  ${counts.lights > 0
                    ? html`<span
                        class="chip-badge lights"
                        title="${counts.lights} luc${counts.lights === 1 ? "e accesa" : "i accese"}"
                      >${counts.lights}</span>`
                    : nothing}
                  ${counts.climate > 0
                    ? html`<span
                        class="chip-badge climate"
                        title="Termostato attivo"
                      >●</span>`
                    : nothing}
                </div>
                <span class="chip-icon">${room.icon ?? "•"}</span>
                <div class="chip-name">${room.name}</div>
              </button>
            `;
          })}
        </div>
      </div>
    `;

    const infoPill = info
      ? html`<div class="pill room-pill">
          ${info.label
            ? html`<span class="room-pill-label">${info.label}</span>`
            : nothing}
          ${info.temp != null
            ? html`<span class="room-pill-metric"
                ><span class="room-pill-icon">🌡</span
                >${info.temp.toFixed(1).replace(/\.0$/, "")}°C</span
              >`
            : nothing}
          ${info.humidity != null
            ? html`<span class="room-pill-metric"
                ><span class="room-pill-icon">💧</span
                >${Math.round(info.humidity)}%</span
              >`
            : nothing}
        </div>`
      : nothing;

    return html`
      <div class="label">STANZE</div>
      <div class="pills">
        ${infoPill}
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
