import { LitElement, html, css, nothing } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import type { HomeAssistant } from "../types/hass.js";
import type { CowRoomConfig } from "../config-xl.js";
import { buttonReset } from "../styles/button-reset.js";

import "./drawer-tabs/lights-tab.js";
import "./drawer-tabs/blinds-tab.js";
import "./drawer-tabs/climate-tab.js";
import "./drawer-tabs/security-tab.js";

export type DrawerTab = "lights" | "blinds" | "climate" | "security";

/**
 * cow-xl-drawer — slide-up drawer with per-room controls.
 *
 * Mirrors the Figma frames "11. Mix — Drawer Open" (Lights),
 * "11. Mix — Drawer Blinds" and "11. Mix — Drawer Climate".
 *
 * Layout (1280×632 within parent root):
 *   y=0..16    drag handle (5rem wide)
 *   y=24..120  header-band (title + subtitle + status pill + close)
 *   y=132..172 tab strip (Lights / Blinds / Climate / Sicurezza)
 *   y=200..215 section caption ("LUCI — 3 IN STANZA")
 *   y=232..552 body grid (tiles for the active tab)
 *   y=568..624 bottom action buttons (full-width pair or triple)
 */
@customElement("cow-xl-drawer")
export class CowXLDrawer extends LitElement {
  @property({ attribute: false }) hass?: HomeAssistant;
  @property({ attribute: false }) room?: CowRoomConfig;
  @property({ type: Boolean, reflect: true }) open = false;
  @state() private activeTab: DrawerTab = "lights";

  static override styles = [
    buttonReset,
    css`
      :host {
        position: absolute;
        left: 0;
        right: 0;
        top: 10.5rem; /* y=168/16 */
        height: 39.5rem; /* h=632/16 */
        display: block;
        pointer-events: none;
        z-index: 5;
      }
      .drawer {
        position: absolute;
        inset: 0;
        background: var(--cow-surface-white);
        border-top: 0.0625rem solid var(--cow-surface-border);
        border-top-left-radius: 1.5rem;
        border-top-right-radius: 1.5rem;
        box-shadow: 0 -0.25rem 1.5rem rgba(31, 31, 46, 0.08);
        transform: translateY(100%);
        transition:
          transform 220ms cubic-bezier(0.2, 0.8, 0.2, 1),
          opacity 180ms ease;
        opacity: 0;
        pointer-events: none;
      }
      :host([open]) .drawer {
        transform: translateY(0);
        opacity: 1;
        pointer-events: auto;
      }
      .handle {
        position: absolute;
        left: 50%;
        top: 0.75rem;
        transform: translateX(-50%);
        width: 3.5rem;
        height: 0.3125rem;
        border-radius: 0.15625rem;
        background: var(--cow-text-disabled);
        cursor: pointer;
      }
      .header {
        position: absolute;
        left: 0;
        right: 0;
        top: 1.5rem;
        height: 6rem;
        padding: 0 2rem;
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 1rem;
        border-bottom: 0.0625rem solid var(--cow-surface-border);
      }
      .title-block {
        display: flex;
        flex-direction: column;
        gap: 0.25rem;
        min-width: 0;
      }
      .title-row {
        display: flex;
        align-items: center;
        gap: 0.75rem;
        min-width: 0;
      }
      .title {
        font-weight: 600;
        font-size: 2rem;
        line-height: 1.1;
        color: var(--cow-text-primary);
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        flex: 0 1 auto;
      }
      .ambient-chip {
        flex: 0 0 auto;
        display: inline-flex;
        align-items: center;
        gap: 0.5rem;
        height: 2rem;
        padding: 0 0.75rem;
        background: linear-gradient(150deg, #e8f0fa 0%, #d0e2f5 100%);
        border: 0.0625rem solid #c4d8ee;
        border-radius: 1rem;
        color: #2f5e8f;
        font-weight: 600;
        font-size: 0.875rem;
        font-variant-numeric: tabular-nums;
      }
      .ambient-chip .sep {
        opacity: 0.45;
        font-weight: 400;
      }
      .subtitle {
        font-weight: 500;
        font-size: 0.875rem;
        color: var(--cow-text-secondary);
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      .header-actions {
        display: flex;
        align-items: center;
        gap: 0.75rem;
        flex: 0 0 auto;
      }
      .status-pill {
        display: inline-flex;
        align-items: center;
        gap: 0.5rem;
        height: 2rem;
        padding: 0 0.75rem;
        background: var(--cow-surface-button-bg);
        border-radius: 1rem;
        font-weight: 500;
        font-size: 0.8125rem;
        color: var(--cow-text-primary);
      }
      .status-pill .dot {
        width: 0.5rem;
        height: 0.5rem;
        border-radius: 50%;
        background: var(--cow-accent-active, #fa6b2e);
      }
      .close {
        width: 2.5rem;
        height: 2.5rem;
        border-radius: 1.25rem;
        background: var(--cow-surface-button-bg);
        color: var(--cow-text-primary);
        font-size: 1rem;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
        border: 0.0625rem solid transparent;
        transition: background 160ms ease;
      }
      .close:hover {
        background: var(--cow-surface-border);
      }
      .tabs {
        position: absolute;
        left: 2rem;
        right: 2rem;
        top: 8.25rem; /* y=132/16 */
        height: 2.5rem;
        display: flex;
        align-items: center;
        gap: 0.5rem;
      }
      .tab {
        flex: 0 0 8.75rem; /* w=140/16 */
        height: 2.5rem;
        padding: 0 0.875rem;
        background: var(--cow-surface-button-bg);
        border: 0.0625rem solid transparent;
        border-radius: 1.25rem;
        font-weight: 600;
        font-size: 0.875rem;
        color: var(--cow-text-secondary);
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: 0.4375rem;
        cursor: pointer;
        transition:
          background 160ms ease,
          color 160ms ease,
          border-color 160ms ease;
        white-space: nowrap;
      }
      .tab[data-active] {
        background: var(--cow-text-primary);
        color: var(--cow-surface-white);
      }
      .tab[data-disabled] {
        opacity: 0.4;
        cursor: not-allowed;
      }
      .body {
        position: absolute;
        left: 0;
        right: 0;
        top: 12rem; /* y=192/16 */
        bottom: 0;
        overflow: hidden;
      }
    `,
  ];

  private get hasLights(): boolean {
    if (!this.room?.light) return false;
    const arr = Array.isArray(this.room.light)
      ? this.room.light
      : [this.room.light];
    return arr.length > 0;
  }

  private get hasBlinds(): boolean {
    if (!this.room?.cover) return false;
    const arr = Array.isArray(this.room.cover)
      ? this.room.cover
      : [this.room.cover];
    return arr.length > 0;
  }

  /** Climate-tab is also useful when only ambient sensors are wired. */
  private get hasClimateOrSensors(): boolean {
    return !!(this.room?.climate || this.room?.temperature || this.room?.humidity);
  }

  /** Pick a sensible initial tab when room changes. Lights first when
   * available (most common use case), then blinds, then climate/sensors. */
  private pickInitialTab(): DrawerTab {
    if (this.hasLights) return "lights";
    if (this.hasBlinds) return "blinds";
    if (this.hasClimateOrSensors) return "climate";
    return "security";
  }

  override willUpdate(changed: Map<string, unknown>) {
    if (changed.has("room") && this.room) {
      // If the active tab is no longer available for this room, reset it.
      if (this.activeTab === "lights" && !this.hasLights)
        this.activeTab = this.pickInitialTab();
      else if (this.activeTab === "blinds" && !this.hasBlinds)
        this.activeTab = this.pickInitialTab();
      else if (this.activeTab === "climate" && !this.hasClimateOrSensors)
        this.activeTab = this.pickInitialTab();
    }
  }

  private deviceCount(): { lights: number; blinds: number; climate: boolean } {
    if (!this.room) return { lights: 0, blinds: 0, climate: false };
    const lights = Array.isArray(this.room.light)
      ? this.room.light.length
      : this.room.light
        ? 1
        : 0;
    const blinds = Array.isArray(this.room.cover)
      ? this.room.cover.length
      : this.room.cover
        ? 1
        : 0;
    return { lights, blinds, climate: !!this.room.climate };
  }

  private subtitleText(): string {
    const c = this.deviceCount();
    const parts: string[] = [];
    if (c.lights > 0)
      parts.push(`${c.lights} ${c.lights === 1 ? "luce" : "luci"}`);
    if (c.blinds > 0)
      parts.push(`${c.blinds} ${c.blinds === 1 ? "tapparella" : "tapparelle"}`);
    if (c.climate) parts.push("termostato");
    return parts.length === 0 ? "Nessun dispositivo" : parts.join(" · ");
  }

  /** When the room has ambient sensors (no climate), expose them as a chip
   * inline with the room title — replaces the climate-mini tile in Lights. */
  private ambientChipValue(): { temp: string | null; hum: string | null } | null {
    if (this.room?.climate) return null; // full climate-tab handles it
    if (!this.room?.temperature && !this.room?.humidity) return null;
    const states = this.hass?.states ?? {};
    const tempEl = this.room?.temperature
      ? states[this.room.temperature]
      : undefined;
    const humEl = this.room?.humidity ? states[this.room.humidity] : undefined;
    const tempVal = tempEl ? parseFloat(tempEl.state) : NaN;
    const humVal = humEl ? parseFloat(humEl.state) : NaN;
    return {
      temp: Number.isFinite(tempVal)
        ? `${Math.round(tempVal * 10) / 10}°`
        : null,
      hum: Number.isFinite(humVal) ? `${Math.round(humVal)}%` : null,
    };
  }

  /** Contextual status pill text based on the active tab. */
  private statusPill(): { text: string; show: boolean } {
    const states = this.hass?.states ?? {};
    if (this.activeTab === "climate") {
      if (this.room?.climate) {
        const s = states[this.room.climate];
        if (!s) return { text: "—", show: true };
        const setpointAttr = s.attributes?.temperature;
        const setpoint =
          typeof setpointAttr === "number" ? setpointAttr : null;
        const mode = s.state;
        const t = setpoint != null ? `${Math.round(setpoint)}°` : "";
        const verb =
          mode === "heat"
            ? "Riscaldando"
            : mode === "cool"
              ? "Raffreddando"
              : mode === "off"
                ? "Spento"
                : mode;
        return { text: `${verb}${t ? " " + t : ""}`, show: true };
      }
      // Sensors-only fallback
      if (this.room?.temperature || this.room?.humidity) {
        const tempEl = this.room.temperature
          ? states[this.room.temperature]
          : undefined;
        const humEl = this.room.humidity
          ? states[this.room.humidity]
          : undefined;
        const tempVal = tempEl ? parseFloat(tempEl.state) : NaN;
        const humVal = humEl ? parseFloat(humEl.state) : NaN;
        const parts: string[] = [];
        if (Number.isFinite(tempVal)) parts.push(`${Math.round(tempVal)}°`);
        if (Number.isFinite(humVal)) parts.push(`${Math.round(humVal)}%`);
        return {
          text: parts.length > 0 ? parts.join(" · ") : "—",
          show: true,
        };
      }
    }
    if (this.activeTab === "lights" && this.hasLights) {
      const arr = Array.isArray(this.room!.light)
        ? this.room!.light
        : [this.room!.light as string];
      const on = arr.filter((id) => states[id]?.state === "on").length;
      return {
        text: on === 0 ? "Tutte spente" : `${on}/${arr.length} accese`,
        show: true,
      };
    }
    if (this.activeTab === "blinds" && this.hasBlinds) {
      const arr = Array.isArray(this.room!.cover)
        ? this.room!.cover
        : [this.room!.cover as string];
      const open = arr.filter(
        (id) => states[id] && states[id].state !== "closed",
      ).length;
      return {
        text: open === 0 ? "Tutte chiuse" : `${open}/${arr.length} aperte`,
        show: true,
      };
    }
    return { text: "", show: false };
  }

  private onClose = () => {
    this.dispatchEvent(
      new CustomEvent("cow-drawer-close", { bubbles: true, composed: true }),
    );
  };

  private onTab(tab: DrawerTab) {
    this.activeTab = tab;
  }

  private renderAmbientChip() {
    const a = this.ambientChipValue();
    if (!a) return nothing;
    const parts: unknown[] = [];
    if (a.temp) parts.push(html`<span>🌡 ${a.temp}</span>`);
    if (a.temp && a.hum) parts.push(html`<span class="sep">·</span>`);
    if (a.hum) parts.push(html`<span>💧 ${a.hum}</span>`);
    return html`<div
      class="ambient-chip"
      role="status"
      aria-label="Sensori ambiente stanza"
    >
      ${parts}
    </div>`;
  }

  private renderBody() {
    if (!this.room) return nothing;
    switch (this.activeTab) {
      case "lights":
        return html`<cow-xl-lights-tab
          .hass=${this.hass}
          .room=${this.room}
        ></cow-xl-lights-tab>`;
      case "blinds":
        return html`<cow-xl-blinds-tab
          .hass=${this.hass}
          .room=${this.room}
        ></cow-xl-blinds-tab>`;
      case "climate":
        return html`<cow-xl-climate-tab
          .hass=${this.hass}
          .room=${this.room}
        ></cow-xl-climate-tab>`;
      case "security":
        return html`<cow-xl-security-tab
          .hass=${this.hass}
          .room=${this.room}
        ></cow-xl-security-tab>`;
    }
  }

  override render() {
    if (!this.room) return nothing;
    const status = this.statusPill();
    return html`
      <div class="drawer">
        <div
          class="handle"
          @click=${this.onClose}
          role="button"
          aria-label="Chiudi"
        ></div>

        <div class="header">
          <div class="title-block">
            <div class="title-row">
              <div class="title">${this.room.name}</div>
              ${this.renderAmbientChip()}
            </div>
            <div class="subtitle">${this.subtitleText()}</div>
          </div>
          <div class="header-actions">
            ${status.show
              ? html`<div class="status-pill">
                  <span class="dot"></span>
                  <span>${status.text}</span>
                </div>`
              : nothing}
            <button
              class="close"
              @click=${this.onClose}
              aria-label="Chiudi drawer"
            >
              ✕
            </button>
          </div>
        </div>

        <div class="tabs" role="tablist">
          <button
            class="tab"
            ?data-active=${this.activeTab === "lights"}
            ?data-disabled=${!this.hasLights}
            @click=${() => this.hasLights && this.onTab("lights")}
          >
            <span>💡</span><span>Lights</span>
          </button>
          <button
            class="tab"
            ?data-active=${this.activeTab === "blinds"}
            ?data-disabled=${!this.hasBlinds}
            @click=${() => this.hasBlinds && this.onTab("blinds")}
          >
            <span>▤</span><span>Blinds</span>
          </button>
          <button
            class="tab"
            ?data-active=${this.activeTab === "climate"}
            ?data-disabled=${!this.hasClimateOrSensors}
            @click=${() => this.hasClimateOrSensors && this.onTab("climate")}
          >
            <span>🌡</span><span>Climate</span>
          </button>
          <button
            class="tab"
            ?data-active=${this.activeTab === "security"}
            @click=${() => this.onTab("security")}
          >
            <span>🔒</span><span>Sicurezza</span>
          </button>
        </div>

        <div class="body">${this.renderBody()}</div>
      </div>
    `;
  }
}
