import { LitElement, html, css, svg } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import type { HomeAssistant, HassEntity } from "../../types/hass.js";
import {
  applyTargetOverride,
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
import { openingIconSvg } from "../../util/ajax-openings.js";
import {
  applyGlobalMode,
  climateModeChipLabel,
  deriveSplitRoomDisplayView,
  globalModeConfirmMessage,
  isFloorOnlyRoom,
  modeReincludesExcluded,
  needsModeChangeConfirm,
  roomIncluded,
  splitRoomStatusLabel,
  splitRoomSubLabel,
  SYSTEM_MODE_CHIP_ORDER,
  usesSplitClimate,
} from "../state/split-climate.js";

import "../components/action-button.js";
import "../components/chip-row.js";
import "../visuals/thermostat-icon.js";
import "../../shared/setpoint-modal.js";
import "../../shared/confirm-modal.js";

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

/** MDI lock-open — shown for 3 s after HA accepts the unlock. */
const STUDIO_UNLOCK_ICON = svg`<svg
  viewBox="0 0 24 24"
  width="100"
  height="100"
  fill="currentColor"
  aria-hidden="true"
>
  <path
    d="M18 8h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zm-6 9c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2zm3.1-9H8.9V6c0-1.71 1.39-3.1 3.1-3.1 1.71 0 3.1 1.39 3.1 3.1v2z"
  />
</svg>`;

type StudioDoorFeedback = "door" | "unlock";

@customElement("cow-thermostat-panel")
export class CowThermostatPanel extends LitElement {
  @property({ attribute: false }) hass?: HomeAssistant;
  @property({ type: String }) entity = "";
  /** Global air entity (mode + fan), e.g. climate.casa_aria */
  @property({ type: String }) systemClimate = "";
  @property({ type: String }) roomName = "";
  @property({ type: String }) outdoorEntity = "";
  @property({ type: String }) humidityEntity = "";
  /**
   * Ambient temperature sensor that overrides the climate entity's
   * `current_temperature` in the big left-pane readout. Used when the
   * room has a dedicated Zigbee sensor that's more trustworthy than
   * the AC's internal probe (e.g. Studio: Daikin vs `termostato_studio_ale`).
   */
  @property({ type: String }) localTempEntity = "";
  /**
   * ``input_number.*`` that owns the user-facing setpoint (see
   * ``CowConfig.target_entity``). When set, the big setpoint + arrows
   * + modal read/write this helper (with its own 0.5° step) instead of
   * the climate entity — an HA automation mirrors it onto the unit.
   */
  @property({ type: String }) targetEntity = "";

  /* ─── Ajax openings (forwarded from card config) ──────────────── */
  @property({ type: Array }) areas: string[] = [];
  @property({ type: String }) openingDefaultKind?: OpeningKind;
  @property({ type: Array }) openingDoors: string[] = [];
  @property({ type: Array }) openingWindows: string[] = [];
  @property({ type: Array }) openingGarages: string[] = [];
  @property({ type: Array }) openingEntities: string[] = [];
  @property({ type: Array }) openingExcludeDevices: string[] = [];
  @property({ type: Boolean }) openingsEnabled = true;
  @property({ type: Boolean }) hiddenStudioDoor = false;
  @property({ type: String }) studioDoorEntity = "";
  @property({ type: Array }) studioDoorLights: string[] = [];

  @state() private now = new Date();
  @state() private setpointModalOpen = false;
  @state() private pendingSystemMode?: string;
  private timer?: number;
  private studioDoorTapCount = 0;
  private studioDoorTapTimer?: number;
  @state() private studioDoorFeedback?: StudioDoorFeedback;
  private studioDoorUnlockTimer?: number;

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
      .display-icon {
        display: flex;
        align-items: center;
        height: 120px;
        color: inherit;
        animation: cow-fade-in var(--cow-dur-base) var(--cow-ease-out);
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

      .air-label {
        position: absolute;
        left: 397.5px;
        top: 603.75px;
        font-weight: 400;
        font-size: 22.5px;
        color: var(--cow-text-secondary, #8c8c99);
      }
      .air-row {
        position: absolute;
        left: 397.5px;
        top: 637.5px;
        right: 30px;
      }
      :host([data-split-climate]) .mode-label {
        top: 450px;
      }
      :host([data-split-climate]) .mode-row {
        top: 486px;
      }
      :host([data-split-climate]) .fan-label {
        top: 548px;
      }
      :host([data-split-climate]) .fan-row {
        top: 584px;
      }
      :host([data-split-climate]) .air-label {
        top: 646px;
      }
      :host([data-split-climate]) .air-row {
        top: 682px;
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
    if (this.studioDoorTapTimer) window.clearTimeout(this.studioDoorTapTimer);
    if (this.studioDoorUnlockTimer) window.clearTimeout(this.studioDoorUnlockTimer);
  }

  private get climate(): HassEntity | undefined {
    if (!this.hass || !this.entity) return undefined;
    return this.hass.states[this.entity];
  }

  private get systemClimateEntity(): HassEntity | undefined {
    if (!this.hass || !this.systemClimate) return undefined;
    return this.hass.states[this.systemClimate];
  }

  private roomView(): ThermostatView {
    return applyTargetOverride(
      deriveThermostatView(this.climate),
      this.targetEntity ? this.hass?.states[this.targetEntity] : undefined,
    );
  }

  private displayView(): ThermostatView {
    if (!this.isSplitClimate()) return this.roomView();
    return deriveSplitRoomDisplayView(this.climate, this.systemClimateEntity);
  }

  private systemView(): ThermostatView {
    return deriveThermostatView(this.systemClimateEntity);
  }

  private isSplitClimate(): boolean {
    return usesSplitClimate(this.systemClimate, this.roomView());
  }

  override willUpdate(): void {
    const v = this.displayView();
    const a = ACCENT[v.variant];
    this.style.setProperty("--cow-accent", a.primary);
    this.style.setProperty("--cow-accent-primary", a.primary);
    this.style.setProperty("--cow-accent-light", a.light);
    this.style.setProperty("--cow-accent-active", a.active);
    this.style.setProperty("--cow-accent-surface", a.surface);
    this.style.setProperty("--cow-on-accent", a.textOnAccent);
    this.toggleAttribute("data-split-climate", this.isSplitClimate());
  }

  private openings() {
    return findRoomOpenings(this.hass, {
      areas: this.areas,
      fallbackArea: this.roomName,
      defaultKind: this.openingDefaultKind,
      doors: this.openingDoors,
      windows: this.openingWindows,
      garages: this.openingGarages,
      entities: this.openingEntities,
      excludeDevices: this.openingExcludeDevices,
      enabled: this.openingsEnabled,
    });
  }

  private async setTarget(target: number): Promise<void> {
    if (!this.hass) return;
    if (this.targetEntity) {
      await this.hass.callService(
        "input_number",
        "set_value",
        { value: target },
        { entity_id: this.targetEntity },
      );
      return;
    }
    if (!this.entity) return;
    await this.hass.callService(
      "climate",
      "set_temperature",
      { temperature: target },
      { entity_id: this.entity },
    );
  }

  /** System mode chip → whole-house action (includes all rooms), confirm first. */
  private onSystemModeChip(mode: string): void {
    const current = this.systemClimateEntity?.state;
    const excluded = modeReincludesExcluded(this.hass?.states, this.systemClimate, mode);
    if (needsModeChangeConfirm(current, mode, excluded)) {
      this.pendingSystemMode = mode;
    } else {
      this.applyGlobalMode(mode);
    }
  }

  private applyGlobalMode(mode: string): void {
    if (!this.hass || !this.systemClimate) return;
    void applyGlobalMode(this.hass, this.systemClimate, mode);
  }

  private confirmSystemMode = (): void => {
    const mode = this.pendingSystemMode;
    this.pendingSystemMode = undefined;
    if (mode) this.applyGlobalMode(mode);
  };

  private cancelSystemMode = (): void => {
    this.pendingSystemMode = undefined;
  };

  private async setSystemFan(fan: string): Promise<void> {
    if (!this.hass || !this.systemClimate) return;
    await this.hass.callService(
      "climate",
      "set_fan_mode",
      { fan_mode: fan },
      { entity_id: this.systemClimate },
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
    const v = this.roomView();
    const next = bumpTarget(v, direction);
    if (next != null) void this.setTarget(next);
  }

  private openSetpointModal = (): void => {
    const split = this.isSplitClimate();
    // With a target_entity the setpoint stays editable even while the
    // unit is off — the thermostat automation re-arms it on demand.
    if (!split && !this.targetEntity && this.displayView().variant === "off")
      return;
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

  private onStudioDoorTap = (): void => {
    if (!this.hiddenStudioDoor || !this.studioDoorEntity) return;
    if (this.studioDoorFeedback) return;

    this.studioDoorTapCount += 1;
    if (this.studioDoorTapTimer) window.clearTimeout(this.studioDoorTapTimer);

    if (this.studioDoorTapCount >= 3) {
      this.studioDoorTapCount = 0;
      this.studioDoorTapTimer = undefined;
      this.studioDoorFeedback = "door";
      void this.unlockStudioDoor();
      return;
    }

    this.studioDoorTapTimer = window.setTimeout(() => {
      this.studioDoorTapCount = 0;
      this.studioDoorTapTimer = undefined;
    }, 2000);
  };

  private async unlockStudioDoor(): Promise<void> {
    try {
      await this.openStudioDoor();
      try {
        await this.turnOnStudioLights();
      } catch {
        /* Door unlocked — don't block padlock feedback if lights fail. */
      }
      this.studioDoorFeedback = "unlock";
      if (this.studioDoorUnlockTimer) window.clearTimeout(this.studioDoorUnlockTimer);
      this.studioDoorUnlockTimer = window.setTimeout(() => {
        this.studioDoorFeedback = undefined;
        this.studioDoorUnlockTimer = undefined;
      }, 3000);
    } catch {
      this.studioDoorFeedback = undefined;
    }
  }

  private async openStudioDoor(): Promise<void> {
    if (!this.hass || !this.studioDoorEntity) return;
    const domain = this.studioDoorEntity.split(".")[0];
    if (domain === "lock") {
      await this.hass.callService(
        "lock",
        "unlock",
        {},
        { entity_id: this.studioDoorEntity },
      );
      return;
    }
    if (domain === "cover") {
      await this.hass.callService(
        "cover",
        "open_cover",
        {},
        { entity_id: this.studioDoorEntity },
      );
      return;
    }
    if (domain === "script") {
      await this.hass.callService(
        "script",
        "turn_on",
        {},
        { entity_id: this.studioDoorEntity },
      );
      return;
    }
    if (domain === "button") {
      await this.hass.callService(
        "button",
        "press",
        {},
        { entity_id: this.studioDoorEntity },
      );
      return;
    }
    await this.hass.callService(
      domain,
      "turn_on",
      {},
      { entity_id: this.studioDoorEntity },
    );
  }

  private async turnOnStudioLights(): Promise<void> {
    if (!this.hass || this.studioDoorLights.length === 0) return;
    await this.hass.callService(
      "light",
      "turn_on",
      { brightness: 255 },
      { entity_id: this.studioDoorLights },
    );
  }

  private localTempNumber(): number | null {
    if (!this.localTempEntity || !this.hass?.states[this.localTempEntity]) {
      return null;
    }
    const n = Number(this.hass.states[this.localTempEntity].state);
    return Number.isFinite(n) ? n : null;
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

  private renderDisplayMain(current: number | null) {
    if (this.studioDoorFeedback === "door") {
      return html`<span class="display-icon"
        >${openingIconSvg("door", false, 100)}</span
      >`;
    }
    if (this.studioDoorFeedback === "unlock") {
      return html`<span class="display-icon">${STUDIO_UNLOCK_ICON}</span>`;
    }
    return current != null
      ? html`${current}°`
      : html`<span class="dash">—</span>`;
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
    const roomV = this.roomView();
    const v = this.displayView();
    const split = this.isSplitClimate();
    const sys = split ? this.systemView() : roomV;
    const localT = this.localTempNumber();
    const current =
      localT != null
        ? Math.round(localT)
        : roomV.current != null
          ? Math.round(roomV.current)
          : null;
    const target =
      roomV.target != null ? roomV.target.toFixed(1).replace(".0", "") : null;
    const hum = this.humidityText(roomV);
    const out = this.outdoorText();
    const setpointDisabled = false;
    const statusLabel = split
      ? splitRoomStatusLabel(this.climate)
      : STATUS_LABEL[v.variant];
    const subLabel = split
      ? splitRoomSubLabel(this.climate)
      : SUB_LABEL[v.variant];

    const modes = split
      ? SYSTEM_MODE_CHIP_ORDER.filter((m) => sys.hvacModes.includes(m)).map(
          (m) => ({ id: m, label: climateModeChipLabel(m) }),
        )
      : roomV.hvacModes
          .filter(
            (m) =>
              m === "off" ||
              m === "heat" ||
              m === "cool" ||
              m === "dry" ||
              m === "heat_cool" ||
              m === "auto" ||
              m === "fan_only",
          )
          .map((m) => ({ id: m, label: climateModeChipLabel(m) }));

    const fanItems = (split ? sys : roomV).fanModes.map((f) => ({
      id: f,
      label: f === "auto" ? "Auto" : f.charAt(0).toUpperCase() + f.slice(1),
    }));

    const floorOnly = split && isFloorOnlyRoom(this.climate);
    const airItems = floorOnly
      ? [
          { id: "auto", label: "On" },
          { id: "off", label: "Off" },
        ]
      : [
          { id: "auto", label: "Inclusa" },
          { id: "off", label: "Esclusa" },
        ];
    const airActiveId = roomIncluded(this.climate) ? "auto" : "off";

    return html`
      <div class="left"></div>
      <div class="right"></div>
      <cow-thermostat-icon
        class="icon"
        .variant=${v.variant}
      ></cow-thermostat-icon>
      <div class="status">${statusLabel}</div>
      <div
        class="display"
        @click=${this.hiddenStudioDoor ? this.onStudioDoorTap : undefined}
      >
        ${this.renderDisplayMain(current)}
      </div>
      <div class="unit">${v.variant === "off" ? SUB_LABEL.off : "Celsius"}</div>
      ${hum ? html`<div class="humidity">${hum}</div>` : ""}
      ${out ? html`<div class="outdoor">${out}</div>` : ""}

      <div class="room">${this.roomName}</div>
      <div class="time">${formatTime(this.now, this.hass?.locale?.language)}</div>
      <div class="sub">${subLabel}</div>
      <div class="set-label">Set to</div>
      <button
        class="target"
        type="button"
        ?disabled=${setpointDisabled}
        @click=${this.openSetpointModal}
        aria-label="Modifica setpoint"
      >
        ${setpointDisabled ? "—" : target != null ? `${target}°C` : "—"}
      </button>
      <cow-action-button
        class="arrow up"
        variant="arrow"
        label="▲"
        ?disabled=${setpointDisabled}
        @click=${() => this.bump(1)}
      ></cow-action-button>
      <cow-action-button
        class="arrow down"
        variant="arrow"
        label="▼"
        ?disabled=${setpointDisabled}
        @click=${() => this.bump(-1)}
      ></cow-action-button>
      ${floorOnly
        ? ""
        : html`
      <div class="mode-label">${split ? "Tutta la casa" : "Mode"}</div>
      <div class="mode-row">
        <cow-chip-row
          .items=${modes}
          .activeId=${split ? sys.mode : roomV.mode === "heat_cool" ? "heat_cool" : roomV.mode}
          .accent=${ACCENT[v.variant].primary}
          @cow-chip-select=${(e: CustomEvent<{ id: string }>) =>
            split
              ? this.onSystemModeChip(e.detail.id)
              : this.setMode(e.detail.id)}
        ></cow-chip-row>
      </div>`}
      ${floorOnly
        ? ""
        : fanItems.length > 1
        ? html`
            <div class="fan-label">Fan</div>
            <div class="fan-row">
              <cow-chip-row
                .items=${fanItems}
                .activeId=${split ? sys.fan : roomV.fan}
                .accent=${ACCENT[v.variant].primary}
                @cow-chip-select=${(e: CustomEvent<{ id: string }>) =>
                  split
                    ? this.setSystemFan(e.detail.id)
                    : this.setFan(e.detail.id)}
              ></cow-chip-row>
            </div>
          `
        : ""}
      ${split
        ? html`
            <div class="air-label">
              ${floorOnly ? "Riscaldamento pavimento" : "Questa stanza"}
            </div>
            <div class="air-row">
              <cow-chip-row
                .items=${airItems}
                .activeId=${airActiveId}
                .accent=${ACCENT[v.variant].primary}
                @cow-chip-select=${(e: CustomEvent<{ id: string }>) =>
                  this.setMode(e.detail.id)}
              ></cow-chip-row>
            </div>
          `
        : ""}
      ${this.renderAjaxOpenings()}
      <cow-setpoint-modal
        .open=${this.setpointModalOpen}
        .value=${roomV.target}
        .min=${roomV.minTemp}
        .max=${roomV.maxTemp}
        .step=${roomV.step}
        .accent=${ACCENT[v.variant].primary}
        .heading=${`Imposta ${this.roomName || "stanza"}`}
        .subtitle=${`Tra ${roomV.minTemp}° e ${roomV.maxTemp}° · step ${roomV.step}°`}
        @cow-setpoint-confirm=${this.onSetpointConfirm}
        @cow-setpoint-cancel=${this.closeSetpointModal}
      ></cow-setpoint-modal>
      <cow-confirm-modal
        .open=${this.pendingSystemMode != null}
        .heading=${"Modalità di tutta la casa"}
        .message=${this.pendingSystemMode
          ? globalModeConfirmMessage(sys.mode, this.pendingSystemMode)
          : ""}
        .confirmLabel=${"Applica a tutti"}
        .accent=${ACCENT[v.variant].primary}
        @cow-confirm=${this.confirmSystemMode}
        @cow-cancel=${this.cancelSystemMode}
      ></cow-confirm-modal>
    `;
  }

  /**
   * Opening indicators for every Ajax door/window in the card's owned
   * area(s), drawn top-right of the left accent pane (see
   * `src/small/openings.ts` for placement rationale + discovery).
   * Rendered only on this tab — lights/blinds dropped the strip in
   * v1.6.1 because it collided with their bottom rows.
   *
   * UX rules:
   *   * Nothing rendered when ``hass`` is missing, registries haven't
   *     bootstrapped yet, or the area has zero Ajax openings.
   *   * Max 4 glyphs visible; "+N" pill takes over after that.
   *   * Glyph: translucent white when closed, solid white + red badge
   *     dot when open — readable on every accent gradient.
   *   * ``pointer-events: none`` on the strip — read-only signal.
   */
  private renderAjaxOpenings() {
    return renderOpeningsStrip(this.openings());
  }
}
