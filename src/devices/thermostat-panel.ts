import { LitElement, html, css } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import type { HomeAssistant, HassEntity } from "../types/hass.js";
import {
  bumpTarget,
  deriveThermostatView,
  type ThermostatVariant,
  type ThermostatView,
} from "../state/thermostat-state.js";
import { accentForThermostat } from "../styles/tokens.js";
/* `accentForThermostat` is also referenced indirectly in willUpdate */
import { formatTemp, formatTime } from "../utils/format.js";

import "../components/split-panel.js";
import "../molecules/mode-button.js";
import "../molecules/fan-button.js";
import "../molecules/arrow-button.js";
import "../molecules/info-badge.js";

/**
 * Thermostat panel — replica Figma "Split Panel — All States / Thermostat":
 *   Heating  (50:5)
 *   Cooling  (50:7)
 *   Off      (50:9)
 *   Idle     (50:11)
 *
 * Left status panel layout (absolute positions match Figma node IDs 51:*):
 *   24 ↔ from left edge, top of icon at 24
 *   Status label "HEATING" 11px Medium, top 140
 *   Big value "21°"        64px Light,  top 158
 *   "Celsius"              12px Reg,    top 232
 *   bottom badges          340
 *
 * Right control panel layout (51:8..51:21, 60:2..60:10):
 *   Room name top 28, font 14 SemiBold
 *   "Set to" 12 Reg top 72
 *   Target value 32 Bold  top 88
 *   ▲ button   (148×42)   top 145
 *   ▼ button   (148×42)   top 197
 *   "Mode" label          top 255
 *   3 mode pills          top 275
 *   "Fan" label           top 322
 *   4 fan buttons         top 340
 *   Time top-right 14:32  top 30 right 28
 */
@customElement("cow-thermostat-panel")
export class CowThermostatPanel extends LitElement {
  @property({ attribute: false }) hass?: HomeAssistant;
  @property({ type: String }) entity = "";
  @property({ type: String }) roomName = "";
  @property({ type: String }) outdoorEntity?: string;
  @property({ type: String }) localHumidityEntity?: string;

  @state() private now = new Date();
  private timer?: number;

  static override styles = css`
    :host {
      display: block;
      width: 24rem;
      height: 24rem;
    }

    /* LEFT pane */
    .icon {
      position: absolute;
      left: 1.5rem;
      top: 1.5rem;
      font-size: var(--cow-font-icon-large);
      line-height: 1;
    }
    .status-label {
      position: absolute;
      left: 1.5rem;
      top: 8.75rem;
      font-weight: 500;
      font-size: var(--cow-font-status);
      color: var(--cow-surface-white);
      opacity: 0.7;
      letter-spacing: 0.15625rem; /* 2.5/16 */
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
    .bottom-badges {
      position: absolute;
      left: 1.5rem;
      right: 1rem;
      top: 21.25rem;
      display: flex;
      justify-content: space-between;
      align-items: baseline;
      gap: 0.5rem;
    }

    /* RIGHT pane (offsets are relative to right pane origin = 12rem from card left) */
    .room {
      position: absolute;
      left: 0.75rem;
      top: 1.75rem;
      font-weight: 600;
      font-size: var(--cow-font-room);
      color: var(--cow-text-room-name);
      white-space: nowrap;
    }
    .time {
      position: absolute;
      right: 1rem;
      top: 1.875rem;
      font-weight: 600;
      font-size: var(--cow-font-time);
      color: var(--cow-text-time);
    }
    .set-to {
      position: absolute;
      left: 0.75rem; /* relative to right pane */
      top: 4.5rem;
      font-weight: 400;
      font-size: var(--cow-font-caption);
      color: var(--cow-text-secondary);
    }
    .target {
      position: absolute;
      left: 0.75rem;
      top: 5.5rem;
      font-weight: 700;
      font-size: var(--cow-font-target);
      color: var(--cow-text-primary);
      line-height: 1;
    }
    .arrow-up,
    .arrow-down {
      position: absolute;
      left: 0.75rem;
    }
    .arrow-up {
      top: 9.0625rem; /* 145/16 */
    }
    .arrow-down {
      top: 12.3125rem; /* 197/16 */
    }
    .mode-label {
      position: absolute;
      left: 0.75rem;
      top: 15.9375rem; /* 255/16 */
      font-weight: 400;
      font-size: var(--cow-font-caption);
      color: var(--cow-text-secondary);
    }
    .mode-row {
      position: absolute;
      left: 0.75rem;
      top: 17.1875rem; /* 275/16 */
      display: flex;
      gap: 0.25rem;
    }
    .fan-label {
      position: absolute;
      left: 0.75rem;
      top: 20.125rem; /* 322/16 */
      font-weight: 400;
      font-size: var(--cow-font-caption);
      color: var(--cow-text-secondary);
    }
    .fan-row {
      position: absolute;
      left: 0.75rem;
      top: 21.25rem; /* 340/16 */
      display: flex;
      gap: 0.25rem;
    }

    /* Wrappers for slotted content */
    .left-content,
    .right-content {
      position: absolute;
      inset: 0;
    }
  `;

  override connectedCallback(): void {
    super.connectedCallback();
    this.now = new Date();
    this.timer = window.setInterval(() => {
      this.now = new Date();
    }, 30_000);
  }
  override disconnectedCallback(): void {
    super.disconnectedCallback();
    if (this.timer) window.clearInterval(this.timer);
  }

  override willUpdate(): void {
    /* Apply accent vars on the host so they inherit into both the split-panel
     * shadow and the slotted button molecules (slotted nodes inherit from
     * their light-tree parent, which is this host). */
    if (!this.hass) return;
    const climate = this.getEntity(this.entity);
    const view = deriveThermostatView(climate);
    const a = accentForThermostat(view.variant);
    this.style.setProperty("--cow-accent", a.primary);
    this.style.setProperty("--cow-accent-light", a.light);
    this.style.setProperty("--cow-accent-active", a.active);
  }

  private getEntity(id?: string): HassEntity | undefined {
    if (!id || !this.hass) return undefined;
    return this.hass.states[id];
  }

  private statusLabelFor(v: ThermostatVariant): string {
    switch (v) {
      case "heating":
        return "HEATING";
      case "cooling":
        return "COOLING";
      case "off":
        return "OFF";
      case "idle":
        return "IDLE";
    }
  }

  private iconFor(v: ThermostatVariant): string {
    switch (v) {
      case "heating":
        return "🔥";
      case "cooling":
        return "❄";
      case "off":
        return "○";
      case "idle":
        return "✓";
    }
  }

  private async bump(view: ThermostatView, dir: 1 | -1): Promise<void> {
    if (!this.hass) return;
    const next = bumpTarget(view, dir);
    if (next == null) return;
    await this.hass.callService(
      "climate",
      "set_temperature",
      { temperature: next },
      { entity_id: this.entity },
    );
  }

  private async setMode(mode: "heat" | "cool" | "off"): Promise<void> {
    if (!this.hass) return;
    await this.hass.callService(
      "climate",
      "set_hvac_mode",
      { hvac_mode: mode },
      { entity_id: this.entity },
    );
  }

  private async setFan(mode: string): Promise<void> {
    if (!this.hass) return;
    await this.hass.callService(
      "climate",
      "set_fan_mode",
      { fan_mode: mode },
      { entity_id: this.entity },
    );
  }

  override render() {
    const climate = this.getEntity(this.entity);
    const view = deriveThermostatView(climate);
    const outdoor = this.getEntity(this.outdoorEntity);
    const humidityEnt = this.getEntity(this.localHumidityEntity);
    const humidity = humidityEnt
      ? Number(humidityEnt.state)
      : view.humidity ?? null;

    const fanModes =
      view.fanModes && view.fanModes.length > 0
        ? view.fanModes
        : ["auto", "low", "med", "high"];
    // Figma shows: Auto, 1, 2, 3 — we map first 4 fan_modes to those visual slots
    const fanLabels = ["Auto", "1", "2", "3"];
    const fanSlots = fanModes.slice(0, 4);

    return html`
      <cow-split-panel>
        <div slot="left" class="left-content">
          <div class="icon">${this.iconFor(view.variant)}</div>
          <div class="status-label">${this.statusLabelFor(view.variant)}</div>
          <div class="display-value">
            ${formatTemp(view.current, "°")}
          </div>
          <div class="display-unit">${view.unit === "°C" ? "Celsius" : "Fahrenheit"}</div>
          <div class="bottom-badges">
            ${humidity != null
              ? html`<cow-info-badge icon="💧" label="${Math.round(humidity)}%"></cow-info-badge>`
              : html`<span></span>`}
            ${outdoor
              ? html`<cow-info-badge
                  icon="☀"
                  label="${formatTemp(Number(outdoor.state))}"
                ></cow-info-badge>`
              : html`<span></span>`}
          </div>
        </div>

        <div slot="right" class="right-content">
          <div class="room">${this.roomName}</div>
          <div class="time">${formatTime(this.now, this.hass?.locale?.language)}</div>
          <div class="set-to">Set to</div>
          <div class="target">
            ${view.target != null ? `${view.target}${view.unit}` : "--"}
          </div>
          <cow-arrow-button
            class="arrow-up"
            direction="up"
            ?disabled=${view.variant === "off"}
            @click=${() => this.bump(view, 1)}
          ></cow-arrow-button>
          <cow-arrow-button
            class="arrow-down"
            direction="down"
            ?disabled=${view.variant === "off"}
            @click=${() => this.bump(view, -1)}
          ></cow-arrow-button>

          <div class="mode-label">Mode</div>
          <div class="mode-row">
            <cow-mode-button
              label="Cool"
              ?active=${view.mode === "cool"}
              @click=${() => this.setMode("cool")}
            ></cow-mode-button>
            <cow-mode-button
              label="Heat"
              ?active=${view.mode === "heat"}
              @click=${() => this.setMode("heat")}
            ></cow-mode-button>
            <cow-mode-button
              label="Off"
              ?active=${view.mode === "off"}
              @click=${() => this.setMode("off")}
            ></cow-mode-button>
          </div>

          <div class="fan-label">Fan</div>
          <div class="fan-row">
            ${fanSlots.map(
              (m, i) => html`
                <cow-fan-button
                  label=${fanLabels[i]}
                  ?active=${view.fan === m}
                  ?disabled=${view.variant === "off"}
                  @click=${() => this.setFan(m)}
                ></cow-fan-button>
              `,
            )}
          </div>
        </div>
      </cow-split-panel>
    `;
  }
}
