import { LitElement, html, css } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import type { HomeAssistant, HassEntity } from "../../types/hass.js";
import {
  bumpTarget,
  deriveThermostatView,
  type ThermostatVariant,
  type ThermostatView,
} from "../state/thermostat.js";
import { panelStyles } from "../styles/shell.js";
import { animKeyframes, animTokens, colorTransition } from "../styles/anim.js";
import { formatTime } from "../../utils/format.js";
import {
  findRoomOpenings,
  renderOpeningsStrip,
} from "../openings.js";
import type { OpeningKind } from "../config.js";

import "../components/action-button.js";
import "../components/chip-row.js";
import "../visuals/thermostat-icon.js";

/**
 * Thermostat panel — pixel-exact reproduction of Figma frames
 *   50:5 (Heating) / 50:7 (Cooling) / 50:9 (Off) / 50:11 (Idle)
 * mapped 1:1 onto a 720x720 internal coordinate stage.
 *
 * Coordinates / sizes throughout this file come straight from Figma
 * scaled by 1.875 (from the original 384x384 master). Don't refactor
 * to "round numbers" — you'd silently drift from the design.
 */

interface AccentSet {
  primary: string;
  light: string;
  active: string;
  surface: string;
  textOnAccent: string;
}

const ACCENT: Record<ThermostatVariant, AccentSet> = {
  heating: {
    primary: "#fa6b2e",
    light: "#ff994d",
    active: "#f2612c",
    surface: "linear-gradient(180deg,#fa6b2e 0%,#ff994d 100%)",
    textOnAccent: "#fff",
  },
  cooling: {
    primary: "#2673eb",
    light: "#59a6ff",
    active: "#3380f2",
    surface: "linear-gradient(180deg,#2673eb 0%,#59a6ff 100%)",
    textOnAccent: "#fff",
  },
  off: {
    primary: "#80858c",
    light: "#a6abb2",
    active: "#8c9499",
    surface: "linear-gradient(180deg,#80858c 0%,#a6abb2 100%)",
    textOnAccent: "#fff",
  },
  idle: {
    primary: "#26a673",
    light: "#40c78c",
    active: "#33b27a",
    surface: "linear-gradient(180deg,#26a673 0%,#40c78c 100%)",
    textOnAccent: "#fff",
  },
};

const STATUS_LABEL: Record<ThermostatVariant, string> = {
  heating: "HEATING",
  cooling: "COOLING",
  off: "OFF",
  idle: "IDLE",
};

const SUB_LABEL: Record<ThermostatVariant, string> = {
  heating: "Sta scaldando",
  cooling: "Sta raffreddando",
  off: "Sistema spento",
  idle: "Target raggiunto",
};

@customElement("cow-thermostat-panel")
export class CowThermostatPanel extends LitElement {
  @property({ attribute: false }) hass?: HomeAssistant;
  @property({ type: String }) entity = "";
  @property({ type: String }) roomName = "";
  @property({ type: String }) outdoorEntity = "";
  @property({ type: String }) humidityEntity = "";

  /* ─── Ajax openings (forwarded from card config) ──────────────── */
  @property({ type: Array }) areas: string[] = [];
  @property({ type: String }) openingDefaultKind?: OpeningKind;
  @property({ type: Array }) openingDoors: string[] = [];
  @property({ type: Array }) openingWindows: string[] = [];
  @property({ type: Array }) openingGarages: string[] = [];

  @state() private now = new Date();
  private timer?: number;

  static override styles = [
    animTokens,
    animKeyframes,
    panelStyles,
    css`
      .left {
        background: var(--cow-accent-surface, linear-gradient(180deg, #fa6b2e, #ff994d));
        ${colorTransition}
        z-index: 0;
      }
      .right {
        background: var(--cow-surface-background, #f7f7fa);
        z-index: 0;
      }
      :host > :not(.left):not(.right) {
        z-index: 1;
      }

      /* Left pane — absolute coords from Figma */
      .icon {
        position: absolute;
        left: 45px;
        top: 45px;
      }
      .status {
        position: absolute;
        left: 45px;
        top: 262.5px;
        font-weight: 500;
        font-size: 20.625px;
        letter-spacing: 4.6875px;
        opacity: 0.7;
      }
      .display {
        position: absolute;
        left: 37.5px;
        top: 296.25px;
        font-weight: 300;
        font-size: 120px;
        line-height: 1;
      }
      .display .dash {
        opacity: 0.7;
      }
      .unit {
        position: absolute;
        left: 45px;
        top: 435px;
        font-weight: 400;
        font-size: 22.5px;
        opacity: 0.6;
      }
      .humidity,
      .outdoor {
        position: absolute;
        top: 637.5px;
        font-weight: 500;
        font-size: 24.375px;
        opacity: 0.75;
      }
      .humidity {
        left: 45px;
      }
      .outdoor {
        left: 187.5px;
      }

      /* Right pane */
      .room {
        position: absolute;
        left: 397.5px;
        top: 52.5px;
        /* Stretched from 200 → 235 to fit "Camera Padronale" without
           ellipsis. The right edge now butts up against the time text,
           which is right-anchored so the layout stays locale-safe
           (12h vs 24h time strings don't shift the room name). */
        max-width: 235px;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        font-weight: 600;
        font-size: 26.25px;
        color: var(--cow-text-room-name, #262633);
      }
      .time {
        position: absolute;
        right: 30px;
        top: 56.25px;
        font-weight: 600;
        font-size: 24.375px;
        color: var(--cow-text-time, #666673);
      }
      .sub {
        position: absolute;
        left: 397.5px;
        top: 97.5px;
        font-weight: 500;
        font-size: 22.5px;
        color: var(--cow-text-secondary, #8c8c99);
      }
      .set-label {
        position: absolute;
        left: 397.5px;
        top: 135px;
        font-weight: 400;
        font-size: 22.5px;
        color: var(--cow-text-secondary, #8c8c99);
      }
      .target {
        position: absolute;
        left: 397.5px;
        top: 165px;
        font-weight: 700;
        font-size: 60px;
        line-height: 1;
        color: var(--cow-text-primary, #1f1f2e);
      }
      .arrow {
        position: absolute;
        left: 397.5px;
        width: 277.5px;
        height: 78px;
      }
      .arrow.up {
        top: 271.875px;
      }
      .arrow.down {
        top: 369.375px;
      }
      .mode-label {
        position: absolute;
        left: 397.5px;
        top: 478.125px;
        font-weight: 400;
        font-size: 22.5px;
        color: var(--cow-text-secondary, #8c8c99);
      }
      .mode-row {
        position: absolute;
        left: 397.5px;
        top: 515.625px;
        right: 30px;
      }
      .fan-label {
        position: absolute;
        left: 397.5px;
        top: 603.75px;
        font-weight: 400;
        font-size: 22.5px;
        color: var(--cow-text-secondary, #8c8c99);
      }
      .fan-row {
        position: absolute;
        left: 397.5px;
        top: 637.5px;
        right: 30px;
      }

      cow-chip-row {
        --cow-accent: var(--cow-accent-primary);
      }

      /* Ajax openings strip — bottom of the right (white) panel.
         Auto-discovered from the entity registry via findAjaxOpeningsForClimate;
         rendered only when at least one Ajax door/window exists in the
         climate's HA area. Closed = neutral grey, open = stop-alert red.
         Position mirrors the Fan row's left edge (397.5px) and sits
         just under it so it doesn't fight the swipe-affordance edge. */
      .ajax-openings {
        position: absolute;
        left: 397.5px;
        right: 30px;
        bottom: 22.5px;
        display: flex;
        flex-direction: row;
        align-items: center;
        gap: 16.875px; /* 9px @ 384 → 9*1.875 */
        pointer-events: none;
      }
      .ajax-opening {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 45px; /* 24px @ 384 → 24*1.875 */
        height: 45px;
        color: var(--cow-text-disabled, #b3b3bd);
        transition: color 200ms ease;
      }
      .ajax-opening[data-open] {
        color: var(--cow-stop, #e74c3c);
      }
      .ajax-opening svg {
        width: 100%;
        height: 100%;
        display: block;
      }
      .ajax-openings-more {
        font-weight: 600;
        font-size: 22.5px;
        color: var(--cow-text-secondary, #8c8c99);
        margin-left: 4px;
      }
    `,
  ];

  override connectedCallback(): void {
    super.connectedCallback();
    this.timer = window.setInterval(() => (this.now = new Date()), 30_000);
  }
  override disconnectedCallback(): void {
    super.disconnectedCallback();
    if (this.timer) window.clearInterval(this.timer);
  }

  private get climate(): HassEntity | undefined {
    if (!this.hass || !this.entity) return undefined;
    return this.hass.states[this.entity];
  }

  private view(): ThermostatView {
    return deriveThermostatView(this.climate);
  }

  override willUpdate(): void {
    const v = this.view();
    const a = ACCENT[v.variant];
    this.style.setProperty("--cow-accent", a.primary);
    this.style.setProperty("--cow-accent-primary", a.primary);
    this.style.setProperty("--cow-accent-light", a.light);
    this.style.setProperty("--cow-accent-active", a.active);
    this.style.setProperty("--cow-accent-surface", a.surface);
    this.style.setProperty("--cow-on-accent", a.textOnAccent);
  }

  private async setTarget(target: number): Promise<void> {
    if (!this.hass || !this.entity) return;
    await this.hass.callService(
      "climate",
      "set_temperature",
      { temperature: target },
      { entity_id: this.entity },
    );
  }

  private async setMode(mode: string): Promise<void> {
    if (!this.hass || !this.entity) return;
    await this.hass.callService(
      "climate",
      "set_hvac_mode",
      { hvac_mode: mode },
      { entity_id: this.entity },
    );
  }

  private async setFan(fan: string): Promise<void> {
    if (!this.hass || !this.entity) return;
    await this.hass.callService(
      "climate",
      "set_fan_mode",
      { fan_mode: fan },
      { entity_id: this.entity },
    );
  }

  private bump(direction: 1 | -1) {
    const v = this.view();
    const next = bumpTarget(v, direction);
    if (next != null) void this.setTarget(next);
  }

  private humidityText(v: ThermostatView): string | null {
    if (this.humidityEntity && this.hass?.states[this.humidityEntity]) {
      const s = this.hass.states[this.humidityEntity].state;
      const n = Number(s);
      if (Number.isFinite(n)) return `💧 ${Math.round(n)}%`;
    }
    if (v.humidity != null) return `💧 ${Math.round(v.humidity)}%`;
    return null;
  }

  private outdoorText(): string | null {
    if (!this.outdoorEntity || !this.hass?.states[this.outdoorEntity])
      return null;
    const s = this.hass.states[this.outdoorEntity].state;
    const n = Number(s);
    if (!Number.isFinite(n)) return null;
    const t = Math.round(n);
    const icon = t <= 0 ? "❄" : t <= 12 ? "🌧" : t < 22 ? "⛅" : "☀";
    return `${icon} ${t}°C`;
  }

  override render() {
    const v = this.view();
    const current = v.current != null ? Math.round(v.current) : null;
    const target = v.target != null ? v.target.toFixed(1).replace(".0", "") : null;
    const hum = this.humidityText(v);
    const out = this.outdoorText();

    const modes = v.hvacModes
      .filter((m) => m === "off" || m === "heat" || m === "cool" || m === "heat_cool" || m === "auto")
      .map((m) => ({
        id: m,
        label:
          m === "heat"
            ? "Heat"
            : m === "cool"
              ? "Cool"
              : m === "off"
                ? "Off"
                : m === "heat_cool"
                  ? "Auto"
                  : "Auto",
      }));
    const fanItems = v.fanModes.map((f) => ({
      id: f,
      label: f === "auto" ? "Auto" : f.charAt(0).toUpperCase() + f.slice(1),
    }));

    return html`
      <div class="left"></div>
      <div class="right"></div>
      <cow-thermostat-icon
        class="icon"
        .variant=${v.variant}
      ></cow-thermostat-icon>
      <div class="status">${STATUS_LABEL[v.variant]}</div>
      <div class="display">
        ${current != null
          ? html`${current}°`
          : html`<span class="dash">—</span>`}
      </div>
      <div class="unit">${v.variant === "off" ? SUB_LABEL.off : "Celsius"}</div>
      ${hum ? html`<div class="humidity">${hum}</div>` : ""}
      ${out ? html`<div class="outdoor">${out}</div>` : ""}

      <div class="room">${this.roomName}</div>
      <div class="time">${formatTime(this.now, this.hass?.locale?.language)}</div>
      <div class="sub">${SUB_LABEL[v.variant]}</div>
      <div class="set-label">Set to</div>
      <div class="target">
        ${v.variant === "off" ? "—" : target != null ? `${target}°C` : "—"}
      </div>
      <cow-action-button
        class="arrow up"
        variant="arrow"
        label="▲"
        ?disabled=${v.variant === "off"}
        @click=${() => this.bump(1)}
      ></cow-action-button>
      <cow-action-button
        class="arrow down"
        variant="arrow"
        label="▼"
        ?disabled=${v.variant === "off"}
        @click=${() => this.bump(-1)}
      ></cow-action-button>
      <div class="mode-label">Mode</div>
      <div class="mode-row">
        <cow-chip-row
          .items=${modes}
          .activeId=${v.mode === "heat_cool" ? "heat_cool" : v.mode}
          .accent=${ACCENT[v.variant].primary}
          @cow-chip-select=${(e: CustomEvent<{ id: string }>) =>
            this.setMode(e.detail.id)}
        ></cow-chip-row>
      </div>
      ${fanItems.length > 1
        ? html`
            <div class="fan-label">Fan</div>
            <div class="fan-row">
              <cow-chip-row
                .items=${fanItems}
                .activeId=${v.fan}
                .accent=${ACCENT[v.variant].primary}
                @cow-chip-select=${(e: CustomEvent<{ id: string }>) =>
                  this.setFan(e.detail.id)}
              ></cow-chip-row>
            </div>
          `
        : ""}
      ${this.renderAjaxOpenings()}
    `;
  }

  /**
   * Bottom-right opening indicators for every Ajax door/window in the
   * card's owned area(s). See `src/small/openings.ts` for the
   * discovery + override logic; this method only wires the panel
   * properties to the shared helper.
   *
   * UX rules:
   *   * Nothing rendered when ``hass`` is missing, registries haven't
   *     bootstrapped yet, or the area has zero Ajax openings.
   *   * Max 4 glyphs visible; "+N" pill takes over after that to keep
   *     the row from colliding with the fan chips on small displays.
   *   * Glyph color: closed → ``--cow-text-disabled``; open → ``--cow-stop``.
   *   * ``pointer-events: none`` on the strip — read-only signal, the
   *     panel's swipe affordance and chip buttons stay tappable.
   */
  private renderAjaxOpenings() {
    return renderOpeningsStrip(
      findRoomOpenings(this.hass, {
        areas: this.areas,
        fallbackArea: this.roomName,
        defaultKind: this.openingDefaultKind,
        doors: this.openingDoors,
        windows: this.openingWindows,
        garages: this.openingGarages,
      }),
    );
  }
}
