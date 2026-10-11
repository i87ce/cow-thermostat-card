import { LitElement, html, css, svg, type PropertyValues } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import type { HomeAssistant, HassEntity } from "../../types/hass.js";
import type { DeviceEntry } from "../config.js";
import {
  applyTargetOverride,
  bumpTarget,
  deriveThermostatView,
  hassNumber,
  THERMOSTAT_ACCENT,
  variantFromModeAndTemps,
  type ThermostatVariant,
} from "../state/thermostat.js";
import { panelStyles } from "../styles/shell.js";
import { animTokens, colorTransition } from "../styles/anim.js";
import { buttonReset } from "../../styles/button-reset.js";
import { formatTemp, formatTime } from "../../utils/format.js";
import { hassEntitiesChanged, smallQuickWatchIds } from "../../utils/hass-watch.js";
import { subscribeSharedClock } from "../../utils/shared-clock.js";

/** MDI "power" — glyph on the big on/off button. */
const POWER_ICON = svg`<svg
  viewBox="0 0 24 24"
  width="40"
  height="40"
  fill="currentColor"
  aria-hidden="true"
><path d="M16.56,5.44L15.11,6.89C16.84,7.94 18,9.83 18,12A6,6 0 0,1 12,18A6,6 0 0,1 6,12C6,9.83 7.16,7.94 8.88,6.88L7.44,5.44C5.36,6.88 4,9.28 4,12A8,8 0 0,0 12,20A8,8 0 0,0 20,12C20,9.28 18.64,6.88 16.56,5.44M13,3H11V13H13" /></svg>`;

/** Gap (°C) on the "wrong side" of the setpoint that flips heat ⇄ cool.
 *  Same value as the `rearm` of the Studio thermostat automation. */
const AUTO_FLIP_GAP = 0.5;
/** Wait after the last setpoint tap before re-evaluating heat/cool. */
const AUTO_FLIP_DEBOUNCE_MS = 3000;
/** The Daikin goes through the Onecta cloud: give up optimistic UI
 *  after this long so a dropped command can't fake the state forever. */
const PENDING_TIMEOUT_MS = 45000;

const OFF_STATES = new Set(["off", "unavailable", "unknown", "standby"]);

function isOn(ent: HassEntity | undefined): boolean {
  return !!ent && !OFF_STATES.has(ent.state);
}

/**
 * "Auto" for a unit driven by an HA thermostat that only knows heat
 * or cool: warmer than the setpoint → cool, colder → heat. On a tie
 * (or no reading) keep the last mode the user ran.
 */
export function pickAutoMode(
  current: number | null,
  target: number | null,
  last: string | undefined,
): "heat" | "cool" {
  if (current != null && target != null) {
    if (current > target) return "cool";
    if (current < target) return "heat";
  }
  return last === "heat" ? "heat" : "cool";
}

type QuickVariant = ThermostatVariant | "paused";

/**
 * `cow-quick-panel` — "Rapidi" tab: the few things you reach for every
 * day, one tap each, no scopes or pickers.
 *
 *  +--------------------+--------------------+
 *  | CLIMA AUTO         | Studio      21:41  |
 *  | 23.7°              | 2 luci · 1 TV      |
 *  | in stanza · 💧 42% | Luci               |
 *  |                    | +-----+-----+----+ |
 *  | SETPOINT           | |Calda|Fred.|Disp| |
 *  | [ − ]  23.5°  [ + ]| +-----+-----+----+ |
 *  |                    | Televisioni        |
 *  | [ ⏻   Spegni     ] | +-----+-----+----+ |
 *  | Raffresca a 23.5°  | |Gm 1 |Gm 2 |Gm 3| |
 *  +--------------------+--------------------+
 *
 * Climate "on" means "the thermostat is armed": the unit is running,
 * or the HA thermostat paused it at the setpoint (`pauseEntity` on)
 * and will restart it by itself. "Off" clears the pause flag first so
 * the thermostat automation cannot re-arm the unit behind our back.
 */
@customElement("cow-quick-panel")
export class CowQuickPanel extends LitElement {
  @property({ attribute: false }) hass?: HomeAssistant;
  @property({ type: String }) roomName = "";
  @property({ type: String }) climate = "";
  /** `input_number.*` holding the user setpoint (see `target_entity`). */
  @property({ type: String }) targetEntity = "";
  @property({ type: String }) localTempEntity = "";
  @property({ type: String }) humidityEntity = "";
  /** `input_select.*` with the thermostat's heat/cool mode. */
  @property({ type: String }) modeEntity = "";
  /** `input_boolean.*` set by the thermostat while paused at setpoint. */
  @property({ type: String }) pauseEntity = "";
  /** `light.*` / `switch.*` tiles. */
  @property({ type: Array }) lights: DeviceEntry[] = [];
  /** `media_player.*` tiles. */
  @property({ type: Array }) tvs: DeviceEntry[] = [];

  @state() private now = new Date();
  @state() private pendingClimate?: boolean;
  @state() private pendingTarget?: number;
  @state() private pendingTile: Record<string, boolean> = {};
  private unsubClock?: () => void;
  private pendingClimateTimer?: number;
  private autoFlipTimer?: number;

  static override styles = [
    animTokens,
    buttonReset,
    panelStyles,
    css`
      .left {
        background: var(--cow-accent-surface);
        ${colorTransition}
        z-index: 0;
      }
      .right {
        z-index: 0;
      }
      :host > :not(.left):not(.right) {
        z-index: 1;
      }

      /* Left pane — climate */
      .status {
        position: absolute;
        left: 45px;
        top: 52.5px;
        font-weight: 500;
        font-size: 20.625px;
        letter-spacing: 4.6875px;
        color: var(--cow-on-accent, #fff);
        opacity: 0.7;
      }
      .current {
        position: absolute;
        left: 37.5px;
        top: 88px;
        font-weight: 300;
        font-size: 110px;
        line-height: 1;
        color: var(--cow-on-accent, #fff);
      }
      .current-sub {
        position: absolute;
        left: 45px;
        top: 210px;
        font-weight: 400;
        font-size: 22.5px;
        color: var(--cow-on-accent, #fff);
        opacity: 0.7;
      }
      .set-label {
        position: absolute;
        left: 45px;
        top: 282px;
        font-weight: 500;
        font-size: 18px;
        letter-spacing: 3px;
        color: var(--cow-on-accent, #fff);
        opacity: 0.7;
      }
      .bump {
        position: absolute;
        top: 316px;
        width: 92px;
        height: 92px;
        border-radius: 22px;
        background: rgba(255, 255, 255, 0.22);
        color: var(--cow-on-accent, #fff);
        font-weight: 400;
        font-size: 52px;
        line-height: 1;
        ${colorTransition}
      }
      .bump:active {
        background: rgba(255, 255, 255, 0.36);
        transform: scale(0.97);
      }
      .bump.down {
        left: 37.5px;
      }
      .bump.up {
        left: 230.5px;
      }
      .target {
        position: absolute;
        left: 129.5px;
        top: 316px;
        width: 101px;
        height: 92px;
        line-height: 92px;
        text-align: center;
        font-weight: 700;
        font-size: 40px;
        color: var(--cow-on-accent, #fff);
      }
      .power {
        position: absolute;
        left: 37.5px;
        top: 456px;
        width: 285px;
        height: 116px;
        border-radius: 26px;
        background: var(--cow-surface-white, #fff);
        color: var(--cow-accent, #1f1f2e);
        font-weight: 700;
        font-size: 34px;
        display: flex;
        align-items: center;
        justify-content: center;
        box-shadow: 0 6px 18px rgba(0, 0, 0, 0.12);
        ${colorTransition}
      }
      .power svg {
        margin-right: 14px;
      }
      .power[data-on] {
        background: rgba(0, 0, 0, 0.18);
        color: var(--cow-on-accent, #fff);
        box-shadow: none;
      }
      .power:active {
        transform: scale(0.98);
      }
      .power[disabled] {
        opacity: 0.5;
        cursor: default;
        transform: none;
      }
      .climate-sub {
        position: absolute;
        left: 45px;
        right: 30px;
        top: 596px;
        font-weight: 500;
        font-size: 21px;
        line-height: 1.3;
        color: var(--cow-on-accent, #fff);
        opacity: 0.85;
      }

      /* Right pane — header identical to the sibling panels */
      .room {
        position: absolute;
        left: 397.5px;
        top: 52.5px;
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
      .device-sub {
        position: absolute;
        left: 397.5px;
        top: 97.5px;
        font-weight: 500;
        font-size: 22.5px;
        color: var(--cow-text-secondary, #8c8c99);
      }
      .section {
        position: absolute;
        left: 397.5px;
        font-weight: 500;
        font-size: 18px;
        letter-spacing: 3px;
        color: var(--cow-text-secondary, #737380);
      }
      .section.lights {
        top: 150px;
      }
      .section.tvs {
        top: 384px;
      }
      .row {
        position: absolute;
        left: 383px;
        width: 320px;
        height: 150px;
        display: grid;
        grid-template-columns: 1fr 1fr 1fr;
        grid-column-gap: 10px;
      }
      .row.lights {
        top: 182px;
      }
      .row.tvs {
        top: 416px;
      }

      .tile {
        position: relative;
        width: 100%;
        height: 100%;
        border-radius: 20px;
        background: var(--cow-surface-button-bg, #f0f0f2);
        box-shadow: inset 0 0 0 2px transparent;
        ${colorTransition}
      }
      .tile:active {
        transform: scale(0.97);
      }
      .tile[data-on] {
        background: var(--tile-on-bg);
        box-shadow: inset 0 0 0 2px var(--tile-accent);
      }
      .tile .dot {
        position: absolute;
        left: 50%;
        top: 26px;
        width: 20px;
        height: 20px;
        margin-left: -10px;
        border-radius: 50%;
        background: var(--cow-tile-dot-off, #c7c7d1);
        ${colorTransition}
      }
      .tile[data-on] .dot {
        background: var(--tile-accent);
      }
      .tile .label {
        position: absolute;
        left: 6px;
        right: 6px;
        top: 66px;
        text-align: center;
        font-weight: 600;
        font-size: 21px;
        line-height: 1.1;
        color: var(--cow-tile-label, #2e2e38);
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .tile .state {
        position: absolute;
        left: 6px;
        right: 6px;
        top: 100px;
        text-align: center;
        font-weight: 500;
        font-size: 17px;
        color: var(--cow-tile-state-off, #9999a6);
      }
      .tile[data-on] .state {
        color: var(--cow-tile-state, #595966);
      }
      .row.lights .tile {
        --tile-accent: #ffc72e;
        --tile-on-bg: #fff2c7;
      }
      .row.tvs .tile {
        --tile-accent: #8c6be0;
        --tile-on-bg: #ece5fb;
      }
    `,
  ];

  override connectedCallback(): void {
    super.connectedCallback();
    this.unsubClock = subscribeSharedClock(() => {
      this.now = new Date();
    });
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback();
    this.unsubClock?.();
    if (this.pendingClimateTimer) window.clearTimeout(this.pendingClimateTimer);
    if (this.autoFlipTimer) window.clearTimeout(this.autoFlipTimer);
  }

  override shouldUpdate(changed: PropertyValues): boolean {
    if (changed.size === 1 && changed.has("hass")) {
      return hassEntitiesChanged(
        changed.get("hass") as HomeAssistant | undefined,
        this.hass,
        smallQuickWatchIds({
          climate: this.climate,
          targetEntity: this.targetEntity,
          localTempEntity: this.localTempEntity,
          humidityEntity: this.humidityEntity,
          modeEntity: this.modeEntity,
          pauseEntity: this.pauseEntity,
          lights: this.lights,
          tvs: this.tvs,
        }),
      );
    }
    return true;
  }

  private ent(id?: string): HassEntity | undefined {
    if (!id || !this.hass) return undefined;
    return this.hass.states[id];
  }

  /* ─── Climate ─────────────────────────────────────────────────── */

  private climateActuallyOn(): boolean {
    const ac = this.ent(this.climate);
    if (!ac || ac.state === "unavailable" || ac.state === "unknown") return false;
    return ac.state !== "off" || this.ent(this.pauseEntity)?.state === "on";
  }

  private climateOn(): boolean {
    return this.pendingClimate ?? this.climateActuallyOn();
  }

  private currentTemp(): number | null {
    return (
      hassNumber(this.ent(this.localTempEntity)) ??
      deriveThermostatView(this.ent(this.climate)).current
    );
  }

  private targetView() {
    return applyTargetOverride(
      deriveThermostatView(this.ent(this.climate)),
      this.ent(this.targetEntity),
    );
  }

  private target(): number | null {
    return this.pendingTarget ?? this.targetView().target;
  }

  private variant(): QuickVariant {
    if (!this.climateOn()) return "off";
    const ac = this.ent(this.climate);
    // Just switched on from here: the unit hasn't reported yet.
    if (!ac || ac.state === "off") {
      return this.pendingClimate ? "idle" : "paused";
    }
    return variantFromModeAndTemps(
      ac.state as Parameters<typeof variantFromModeAndTemps>[0],
      this.currentTemp(),
      this.target(),
    );
  }

  private setPendingClimate(want: boolean): void {
    this.pendingClimate = want;
    if (this.pendingClimateTimer) window.clearTimeout(this.pendingClimateTimer);
    this.pendingClimateTimer = window.setTimeout(() => {
      this.pendingClimate = undefined;
      this.pendingClimateTimer = undefined;
    }, PENDING_TIMEOUT_MS);
  }

  private async runMode(mode: "heat" | "cool"): Promise<void> {
    if (!this.hass) return;
    if (this.modeEntity) {
      await this.hass.callService(
        "input_select",
        "select_option",
        { option: mode },
        { entity_id: this.modeEntity },
      );
    }
    await this.hass.callService(
      "climate",
      "set_hvac_mode",
      { hvac_mode: mode },
      { entity_id: this.climate },
    );
    // Without a helper the unit holds the setpoint itself.
    const target = this.target();
    if (!this.targetEntity && target != null) {
      await this.hass.callService(
        "climate",
        "set_temperature",
        { temperature: target },
        { entity_id: this.climate },
      );
    }
  }

  private onPowerTap = async (): Promise<void> => {
    if (!this.hass || !this.climate) return;
    if (this.climateOn()) {
      this.setPendingClimate(false);
      if (this.pauseEntity) {
        await this.hass.callService(
          "input_boolean",
          "turn_off",
          {},
          { entity_id: this.pauseEntity },
        );
      }
      await this.hass.callService(
        "climate",
        "set_hvac_mode",
        { hvac_mode: "off" },
        { entity_id: this.climate },
      );
      return;
    }
    this.setPendingClimate(true);
    const last = this.modeEntity
      ? this.ent(this.modeEntity)?.state
      : this.ent(this.climate)?.state;
    await this.runMode(pickAutoMode(this.currentTemp(), this.target(), last));
  };

  private async setTarget(value: number): Promise<void> {
    if (!this.hass) return;
    this.pendingTarget = value;
    if (this.targetEntity) {
      await this.hass.callService(
        "input_number",
        "set_value",
        { value },
        { entity_id: this.targetEntity },
      );
    } else if (this.climate) {
      await this.hass.callService(
        "climate",
        "set_temperature",
        { temperature: value },
        { entity_id: this.climate },
      );
    }
  }

  private bump(direction: 1 | -1): void {
    const v = this.targetView();
    const next = bumpTarget({ ...v, target: this.target() }, direction);
    if (next == null) return;
    void this.setTarget(next);
    if (this.autoFlipTimer) window.clearTimeout(this.autoFlipTimer);
    this.autoFlipTimer = window.setTimeout(() => {
      this.autoFlipTimer = undefined;
      void this.maybeFlipMode();
    }, AUTO_FLIP_DEBOUNCE_MS);
  }

  /** New setpoint on the other side of the room temperature → swap
   *  heat ⇄ cool, so "auto" keeps meaning auto after power-on. */
  private async maybeFlipMode(): Promise<void> {
    if (!this.climateOn()) return;
    const cur = this.currentTemp();
    const tgt = this.target();
    if (cur == null || tgt == null) return;
    const mode = this.modeEntity
      ? this.ent(this.modeEntity)?.state
      : this.ent(this.climate)?.state;
    const flip =
      mode === "cool" && tgt - cur >= AUTO_FLIP_GAP
        ? "heat"
        : mode === "heat" && cur - tgt >= AUTO_FLIP_GAP
          ? "cool"
          : undefined;
    if (!flip) return;
    if (this.ent(this.climate)?.state === "off" && this.modeEntity) {
      // Paused at setpoint: the thermostat re-arms in the new mode by
      // itself once the helper changes.
      await this.hass?.callService(
        "input_select",
        "select_option",
        { option: flip },
        { entity_id: this.modeEntity },
      );
      return;
    }
    await this.runMode(flip);
  }

  /* ─── Tiles ───────────────────────────────────────────────────── */

  private tileOn(id: string): boolean {
    return this.pendingTile[id] ?? isOn(this.ent(id));
  }

  private async toggleTile(id: string): Promise<void> {
    if (!this.hass) return;
    const on = this.tileOn(id);
    this.pendingTile = { ...this.pendingTile, [id]: !on };
    await this.hass.callService(
      id.split(".")[0],
      on ? "turn_off" : "turn_on",
      {},
      { entity_id: id },
    );
  }

  override willUpdate(): void {
    if (
      this.pendingClimate != null &&
      this.pendingClimate === this.climateActuallyOn()
    ) {
      this.pendingClimate = undefined;
      if (this.pendingClimateTimer) {
        window.clearTimeout(this.pendingClimateTimer);
        this.pendingClimateTimer = undefined;
      }
    }
    if (this.pendingTarget != null) {
      const actual = this.targetView().target;
      if (actual != null && Math.abs(actual - this.pendingTarget) < 0.01) {
        this.pendingTarget = undefined;
      }
    }
    const next = { ...this.pendingTile };
    let changed = false;
    for (const [id, want] of Object.entries(this.pendingTile)) {
      if (isOn(this.ent(id)) === want) {
        delete next[id];
        changed = true;
      }
    }
    if (changed) this.pendingTile = next;

    const v = this.variant();
    const a = THERMOSTAT_ACCENT[v === "paused" ? "idle" : v];
    this.style.setProperty("--cow-accent", a.primary);
    this.style.setProperty("--cow-accent-surface", a.surface);
    this.style.setProperty("--cow-on-accent", a.textOnAccent);
  }

  private climateSubLabel(v: QuickVariant, target: number | null): string {
    const t = formatTemp(target);
    switch (v) {
      case "off":
        return "Spento";
      case "paused":
        return `In pausa a ${t}, riparte da solo`;
      case "heating":
        return `Riscalda fino a ${t}`;
      case "cooling":
        return `Raffresca fino a ${t}`;
      default:
        return this.pendingClimate ? "Accensione…" : `Acceso, ${t} raggiunti`;
    }
  }

  private renderTile(d: DeviceEntry) {
    const ent = this.ent(d.entity);
    const on = this.tileOn(d.entity);
    const na = !ent || ent.state === "unavailable" || ent.state === "unknown";
    return html`
      <button
        class="tile"
        type="button"
        ?data-on=${on}
        aria-pressed=${on ? "true" : "false"}
        @click=${() => void this.toggleTile(d.entity)}
      >
        <span class="dot"></span>
        <span class="label">${d.label}</span>
        <span class="state">${na && this.pendingTile[d.entity] == null ? "N.D." : on ? "ON" : "OFF"}</span>
      </button>
    `;
  }

  override render() {
    const v = this.variant();
    const on = this.climateOn();
    const cur = this.currentTemp();
    const target = this.target();
    const hum = hassNumber(this.ent(this.humidityEntity));
    const ac = this.ent(this.climate);
    const acDown = !ac || ac.state === "unavailable";

    const lightsOn = this.lights.filter((d) => this.tileOn(d.entity)).length;
    const tvsOn = this.tvs.filter((d) => this.tileOn(d.entity)).length;
    const summary: string[] = [];
    if (this.lights.length > 0) {
      summary.push(
        lightsOn === 0 ? "luci spente" : lightsOn === 1 ? "1 luce" : `${lightsOn} luci`,
      );
    }
    if (this.tvs.length > 0) {
      summary.push(tvsOn === 0 ? "TV spente" : `${tvsOn} TV`);
    }

    return html`
      <div class="left"></div>
      <div class="right"></div>

      ${this.climate
        ? html`
            <div class="status">CLIMA AUTO</div>
            <div class="current">${formatTemp(cur)}</div>
            <div class="current-sub">
              in stanza${hum != null ? html` · 💧 ${Math.round(hum)}%` : ""}
            </div>
            <div class="set-label">SETPOINT</div>
            <button
              class="bump down"
              type="button"
              aria-label="Abbassa setpoint"
              @click=${() => this.bump(-1)}
            >
              −
            </button>
            <div class="target">${formatTemp(target)}</div>
            <button
              class="bump up"
              type="button"
              aria-label="Alza setpoint"
              @click=${() => this.bump(1)}
            >
              +
            </button>
            <button
              class="power"
              type="button"
              ?data-on=${on}
              ?disabled=${acDown}
              @click=${this.onPowerTap}
            >
              ${POWER_ICON}<span>${on ? "Spegni" : "Accendi"}</span>
            </button>
            <div class="climate-sub">
              ${acDown ? "Climatizzatore non raggiungibile" : this.climateSubLabel(v, target)}
            </div>
          `
        : ""}

      <div class="room">${this.roomName}</div>
      <div class="time">${formatTime(this.now, this.hass?.locale?.language)}</div>
      <div class="device-sub">${summary.join(" · ")}</div>

      ${this.lights.length > 0
        ? html`
            <div class="section lights">LUCI</div>
            <div class="row lights">
              ${this.lights.map((d) => this.renderTile(d))}
            </div>
          `
        : ""}
      ${this.tvs.length > 0
        ? html`
            <div class="section tvs">TELEVISIONI</div>
            <div class="row tvs">
              ${this.tvs.map((d) => this.renderTile(d))}
            </div>
          `
        : ""}
    `;
  }
}
