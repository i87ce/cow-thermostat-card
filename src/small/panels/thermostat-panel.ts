import { LitElement, html, css } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import type { HomeAssistant, HassEntity } from "../../types/hass.js";
import {
  bumpTarget,
  deriveThermostatView,
  THERMOSTAT_ACCENT,
  THERMOSTAT_STATUS_LABEL,
  THERMOSTAT_SUB_LABEL,
  type ThermostatView,
} from "../state/thermostat.js";
import { panelStyles } from "../styles/shell.js";
import { animKeyframes, animTokens, colorTransition } from "../styles/anim.js";
import { formatTime } from "../../utils/format.js";
import {
  findRoomOpenings,
  openingsStripStyles,
  renderOpeningsStrip,
} from "../openings.js";
import type { OpeningKind } from "../config.js";

import "../components/action-button.js";
import "../components/chip-row.js";
import "../visuals/thermostat-icon.js";
import "../../shared/setpoint-modal.js";

/**
 * Thermostat panel — pixel-exact reproduction of Figma frames
 *   50:5 (Heating) / 50:7 (Cooling) / 50:9 (Off) / 50:11 (Idle)
 * mapped 1:1 onto a 720x720 internal coordinate stage.
 *
 * Coordinates / sizes throughout this file come straight from Figma
 * scaled by 1.875 (from the original 384x384 master). Don't refactor
 * to "round numbers" — you'd silently drift from the design.
 */

// Accent palette + status / sub labels are imported from
// `small/state/thermostat.ts` so the XL Climate tab can share them
// verbatim — keeps the small panel and the XL drawer visually identical
// when the same climate enters the same variant.
const ACCENT = THERMOSTAT_ACCENT;
const STATUS_LABEL = THERMOSTAT_STATUS_LABEL;
const SUB_LABEL = THERMOSTAT_SUB_LABEL;

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
  @state() private setpointModalOpen = false;
  private timer?: number;

  static override styles = [
    animTokens,
    animKeyframes,
    panelStyles,
    openingsStripStyles,
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
        /* Tappable: opens the native-keyboard setpoint modal. The
           number itself renders as a <button> so it's keyboard-
           focusable and announces correctly to assistive tech, but
           the visual styling must stay identical to the previous
           <div>. Order matters here: the reset (background, border,
           padding, appearance, tap-highlight, font-family) MUST come
           BEFORE the typography (font-weight, font-size, line-height)
           — otherwise the "font" shorthand or "font-family: inherit"
           would silently wipe the weight + size and we'd render the
           setpoint at the inherited 16px instead of the 60px Figma
           spec. (This was the regression in v1.4.15.) */
        background: transparent;
        border: 0;
        padding: 0;
        margin: 0;
        color: var(--cow-text-primary, #1f1f2e);
        font-family: inherit;
        font-weight: 700;
        font-size: 60px;
        line-height: 1;
        text-align: left;
        cursor: pointer;
        -webkit-appearance: none;
        appearance: none;
        -webkit-tap-highlight-color: transparent;
        transition: opacity 120ms ease;
      }
      .target[disabled] {
        cursor: default;
      }
      .target:not([disabled]):active {
        opacity: 0.7;
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

      /* When the room has Ajax openings, drop fan-label + fan-row into
         the visual midpoint between the .mode-row (ends at y≈548) and
         the openings strip (starts at y≈652). Originally fan-row sat
         at y=637.5 and the openings strip overlapped its chips. The
         new y≈605 leaves ~21px of air above and ~14px below, which
         visually centres the fan chips in the lower-right quadrant.
         Host attribute is toggled in willUpdate(). */
      :host([data-has-openings]) .fan-label {
        top: 569.0625px;
      }
      :host([data-has-openings]) .fan-row {
        top: 605.625px;
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
    this.toggleAttribute("data-has-openings", this.openings().length > 0);
  }

  private openings() {
    return findRoomOpenings(this.hass, {
      areas: this.areas,
      fallbackArea: this.roomName,
      defaultKind: this.openingDefaultKind,
      doors: this.openingDoors,
      windows: this.openingWindows,
      garages: this.openingGarages,
    });
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

  private openSetpointModal = (): void => {
    // Match the bump-button rule: setpoint editing is disabled while
    // the climate is OFF, because the proxy queues set_temperature
    // without effect until a mode is picked again.
    if (this.view().variant === "off") return;
    this.setpointModalOpen = true;
    // Imperatively open synchronously inside the click handler — the
    // reactive `open` prop also opens the dialog, but on iOS Safari
    // the deferred focus() call lands outside the user-gesture
    // window and the on-screen keyboard stays hidden until the user
    // taps the input a second time. Calling `show()` here preserves
    // the gesture chain. The modal is rendered unconditionally in
    // the template, so the element is in the DOM by the time the
    // user can tap the setpoint.
    const modal = this.renderRoot.querySelector("cow-setpoint-modal");
    modal?.show();
  };

  private closeSetpointModal = (): void => {
    this.setpointModalOpen = false;
  };

  private onSetpointConfirm = (e: CustomEvent<{ value: number }>): void => {
    this.setpointModalOpen = false;
    void this.setTarget(e.detail.value);
  };

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

    // Surface every climate mode the underlying entity actually
    // supports — including `fan_only`, which the casa_<room> MQTT
    // proxies expose for the new "ventola sola" coordinated mode
    // (Koolnova fan_only, pavimento off). `dry` we deliberately
    // skip: Koolnova advertises it on the air side but the proxies
    // don't, and nobody runs dehumidification from a wall display
    // anyway.
    const modes = v.hvacModes
      .filter(
        (m) =>
          m === "off" ||
          m === "heat" ||
          m === "cool" ||
          m === "heat_cool" ||
          m === "auto" ||
          m === "fan_only",
      )
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
                  : m === "fan_only"
                    ? "Fan"
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
      <button
        class="target"
        type="button"
        ?disabled=${v.variant === "off"}
        @click=${this.openSetpointModal}
        aria-label="Modifica setpoint"
      >
        ${v.variant === "off" ? "—" : target != null ? `${target}°C` : "—"}
      </button>
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
      <cow-setpoint-modal
        .open=${this.setpointModalOpen}
        .value=${v.target}
        .min=${v.minTemp}
        .max=${v.maxTemp}
        .step=${v.step}
        .accent=${ACCENT[v.variant].primary}
        .heading=${`Imposta ${this.roomName || "stanza"}`}
        .subtitle=${`Tra ${v.minTemp}° e ${v.maxTemp}° · step ${v.step}°`}
        @cow-setpoint-confirm=${this.onSetpointConfirm}
        @cow-setpoint-cancel=${this.closeSetpointModal}
      ></cow-setpoint-modal>
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
    return renderOpeningsStrip(this.openings());
  }
}
