import { LitElement, html, css, nothing } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import type { HomeAssistant, HassEntity } from "../../types/hass.js";
import type { CowRoomConfig } from "../../config-xl.js";
import { buttonReset } from "../../styles/button-reset.js";
import {
  deriveThermostatView,
  bumpTarget,
  THERMOSTAT_ACCENT,
  THERMOSTAT_STATUS_LABEL,
  THERMOSTAT_SUB_LABEL,
} from "../../small/state/thermostat.js";
import {
  anyRoomExcluded,
  applyGlobalMode,
  climateModeChipLabel,
  deriveSplitRoomDisplayView,
  globalModeConfirmMessage,
  isFloorOnlyRoom,
  needsModeChangeConfirm,
  readAirState,
  roomIncluded,
  splitRoomStatusLabel,
  splitRoomSubLabel,
  SYSTEM_MODE_CHIP_ORDER,
  usesSplitClimate,
} from "../../small/state/split-climate.js";
import "../../shared/setpoint-modal.js";
import "../../shared/confirm-modal.js";

/**
 * Climate tab — replicates Figma "11. Mix — Drawer Climate" body.
 *
 * Single 1216×320 climate-full card with:
 *   - Big current temperature on the left (orange section)
 *   - Setpoint + ▼/▲ buttons in the middle
 *   - MODALITÀ (Cool/Heat/Off) + VENTOLA (Auto/1/2/3) + schedule on the right
 *
 * Bottom bar: 3 preset shortcuts (Comfort / Eco / Antigelo) full-width.
 */
@customElement("cow-xl-climate-tab")
export class CowXLClimateTab extends LitElement {
  @property({ attribute: false }) hass?: HomeAssistant;
  @property({ attribute: false }) room?: CowRoomConfig;
  /** Global air entity (mode + fan), e.g. climate.casa_aria */
  @property({ type: String }) systemClimate = "";
  @state() private setpointModalOpen = false;
  @state() private pendingSystemMode?: string;

  static override styles = [
    buttonReset,
    css`
      :host {
        display: block;
        position: relative;
        height: 100%;
      }
      .caption {
        position: absolute;
        left: 2rem;
        top: 0.5rem;
        font-weight: 700;
        font-size: 0.8125rem;
        letter-spacing: 0.075rem;
        color: var(--cow-text-secondary);
        text-transform: uppercase;
      }
      /* Body background follows the variant accent. The host element
         sets --cow-accent-surface / --cow-accent-primary via inline
         style in render() based on view.variant, so heating stays
         orange, cooling turns blue, idle is green, off is grey —
         pixel-identical to the small wall display panel because both
         pull from THERMOSTAT_ACCENT in small/state/thermostat.ts. */
      .full {
        position: absolute;
        left: 2rem;
        right: 2rem;
        top: 2.5rem;
        height: 20rem;
        background: var(--cow-accent-surface,
          linear-gradient(
            120deg,
            var(--cow-thermostat-orange) 0%,
            var(--cow-thermostat-orange-dark, #e55a1f) 60%,
            #ffd2a8 100%
          ));
        border-radius: 1.25rem;
        padding: 2rem;
        display: grid;
        grid-template-columns: 1fr 1fr 1fr;
        gap: 2rem;
        color: var(--cow-surface-white);
        transition: background 320ms ease;
      }
      .col {
        display: flex;
        flex-direction: column;
        min-width: 0;
      }
      .col-label {
        font-weight: 700;
        font-size: 0.8125rem;
        letter-spacing: 0.075rem;
        text-transform: uppercase;
        opacity: 0.85;
      }
      .col-icon {
        font-size: 2rem;
        line-height: 1;
        margin-top: 0.75rem;
      }
      .col-big {
        margin-top: 0.5rem;
        font-weight: 200;
        font-size: 8rem;
        line-height: 1;
        font-variant-numeric: tabular-nums;
      }
      .col-sub {
        margin-top: auto;
        font-weight: 500;
        font-size: 1rem;
        opacity: 0.85;
      }

      .setpoint-big {
        /* Tappable surface — opens the native-keyboard setpoint
           modal. The visual stays identical to the original <div>
           (same 7rem light weight, white inherited color). Order
           matters: button reset first, then explicit typography, so
           "font-family: inherit" can't silently clobber the size /
           weight (the same regression that hit ".target" in the
           small wall panel in v1.4.15). */
        background: transparent;
        border: 0;
        padding: 0;
        color: inherit;
        font-family: inherit;
        font-weight: 300;
        font-size: 7rem;
        line-height: 1;
        margin-top: 0.5rem;
        font-variant-numeric: tabular-nums;
        text-align: left;
        cursor: pointer;
        -webkit-appearance: none;
        appearance: none;
        -webkit-tap-highlight-color: transparent;
        transition: opacity 120ms ease;
      }
      .setpoint-big[disabled] {
        cursor: default;
      }
      .setpoint-big:not([disabled]):active {
        opacity: 0.7;
      }
      .setpoint-controls {
        margin-top: 1.5rem;
        display: flex;
        gap: 1rem;
      }
      .arrow-btn {
        width: 5rem;
        height: 5rem;
        border-radius: 50%;
        background: rgba(255, 255, 255, 0.18);
        color: var(--cow-surface-white);
        font-size: 2rem;
        font-weight: 600;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
        transition: background 160ms ease, opacity 160ms ease;
      }
      .arrow-btn:active {
        background: rgba(255, 255, 255, 0.32);
      }
      /* When the climate is OFF we don't accept setpoint nudges — the
         small panel disables its up/down arrows in this state, mirror
         that here so the XL drawer doesn't quietly accept commands the
         downstream service will reject. */
      .arrow-btn[disabled] {
        opacity: 0.4;
        cursor: not-allowed;
      }
      .arrow-btn[disabled]:active {
        background: rgba(255, 255, 255, 0.18);
      }

      .right {
        display: flex;
        flex-direction: column;
        gap: 0.625rem;
      }
      .modes {
        margin-top: 0.5rem;
        display: flex;
        gap: 0.5rem;
      }
      .mode-btn {
        flex: 1;
        height: 2.75rem;
        border-radius: 0.75rem;
        background: rgba(255, 255, 255, 0.18);
        color: var(--cow-surface-white);
        font-weight: 600;
        font-size: 0.9375rem;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
      }
      /* Selected mode chip uses the same accent as the small wall card:
         heating → orange, cooling → blue, idle → green, off → grey.
         The fallback (var(--cow-accent-primary,#fff)) keeps the previous
         all-white look when no accent has been pushed down yet, so the
         component degrades gracefully in tests / Storybook. */
      .mode-btn[data-active] {
        background: var(--cow-accent-primary, var(--cow-surface-white));
        color: var(--cow-surface-white);
        box-shadow: inset 0 0 0 0.125rem rgba(255, 255, 255, 0.35);
      }
      .fans {
        margin-top: 0.25rem;
        display: flex;
        gap: 0.5rem;
      }
      .fan-btn {
        flex: 1;
        height: 2.5rem;
        border-radius: 0.625rem;
        background: rgba(255, 255, 255, 0.18);
        color: var(--cow-surface-white);
        font-weight: 600;
        font-size: 0.875rem;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
      }
      .fan-btn[data-active] {
        background: rgba(255, 255, 255, 0.95);
        color: var(--cow-text-primary);
      }
      .schedule-label {
        margin-top: 0.625rem;
        font-weight: 700;
        font-size: 0.75rem;
        letter-spacing: 0.075rem;
        text-transform: uppercase;
        opacity: 0.8;
      }
      .schedule-text {
        margin-top: 0.25rem;
        font-weight: 500;
        font-size: 0.9375rem;
        opacity: 0.9;
      }
      .air-modes {
        margin-top: 0.25rem;
        display: flex;
        gap: 0.5rem;
      }

      /* === Sensors-only mode (no climate entity) === */
      .full.sensors-only {
        height: auto;
        bottom: 1rem; /* stretch from top:2.5rem down to body bottom */
        padding: 1.5rem 2rem;
        grid-template-columns: 1fr 1fr 1.4fr;
        gap: 2rem;
        align-items: stretch;
      }
      .so-col {
        display: grid;
        grid-template-rows: auto 1fr auto;
        row-gap: 0.5rem;
        min-width: 0;
      }
      .so-col.so-advisory {
        border-left: 0.0625rem solid rgba(255, 255, 255, 0.35);
        padding-left: 1.5rem;
      }
      .so-label {
        display: inline-flex;
        align-items: center;
        gap: 0.5rem;
        font-weight: 700;
        font-size: 0.8125rem;
        letter-spacing: 0.075rem;
        text-transform: uppercase;
        opacity: 0.92;
      }
      .so-big {
        align-self: center;
        font-weight: 200;
        font-size: 5.5rem;
        line-height: 1;
        font-variant-numeric: tabular-nums;
      }
      .so-sub {
        font-weight: 500;
        font-size: 0.9375rem;
        opacity: 0.85;
      }
      .so-advice {
        align-self: center;
        font-weight: 500;
        font-size: 1rem;
        line-height: 1.4;
        opacity: 0.95;
      }
      .so-hint {
        font-weight: 400;
        font-size: 0.8125rem;
        opacity: 0.7;
        line-height: 1.4;
      }
      .so-hint code {
        font-family: inherit;
        background: rgba(255, 255, 255, 0.18);
        padding: 0 0.375rem;
        border-radius: 0.25rem;
        font-weight: 600;
      }

    `,
  ];

  private onSystemModeChip(mode: string): void {
    const current = this.hass?.states?.[this.systemClimate]?.state;
    const excluded = anyRoomExcluded(this.hass?.states, this.systemClimate);
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

  private async setSystemFan(fan: string) {
    if (!this.systemClimate || !this.hass) return;
    await this.hass.callService("climate", "set_fan_mode", {
      entity_id: this.systemClimate,
      fan_mode: fan,
    });
  }

  private async setMode(mode: string) {
    if (!this.room?.climate || !this.hass) return;
    await this.hass.callService("climate", "set_hvac_mode", {
      entity_id: this.room.climate,
      hvac_mode: mode,
    });
  }

  private async setFan(fan: string) {
    if (!this.room?.climate || !this.hass) return;
    await this.hass.callService("climate", "set_fan_mode", {
      entity_id: this.room.climate,
      fan_mode: fan,
    });
  }

  private async setTarget(t: number) {
    if (!this.room?.climate || !this.hass) return;
    await this.hass.callService("climate", "set_temperature", {
      entity_id: this.room.climate,
      temperature: t,
    });
  }

  private openSetpointModal = (): void => {
    if (!this.room?.climate) return;
    const view = deriveThermostatView(this.hass?.states?.[this.room.climate]);
    const split = usesSplitClimate(this.systemClimate, view);
    if (!split && view.variant === "off") return;
    this.setpointModalOpen = true;
    // Imperatively open inside the click handler so iOS Safari keeps
    // the user-gesture chain alive through the input.focus() call —
    // see the same comment in the small wall panel. The modal is
    // always rendered, so the element is in the DOM by tap time.
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

  /**
   * Render the humidity readout shown on the Climate tab.
   *
   * Reads strictly from `view.humidity`, i.e. the climate entity's
   * `current_humidity` attribute. For the casa_<room> MQTT proxies
   * this is mirrored from sensor.display_<room>_humidity by the
   * mqtt.publish automations in cow_climate.yaml, so the proxy is
   * the single source of truth. Falls back to "—" if the climate
   * doesn't publish humidity (e.g. when the upstream wall display is
   * offline) — and we deliberately don't fall back to the
   * `room.humidity` sensor here: if the proxy can't see it, the UI
   * shouldn't pretend it can.
   */
  private roomHumidityText(view: ReturnType<typeof deriveThermostatView>) {
    if (view.humidity != null) {
      return html`💧 ${Math.round(view.humidity)}%`;
    }
    return html`—`;
  }

  override render() {
    if (!this.room) return nothing;

    // === SENSORS-ONLY MODE ===
    // No climate entity but room has temperature/humidity sensors → show
    // a "monitoring only" full-width card.
    if (!this.room.climate) {
      if (!this.room.temperature && !this.room.humidity) {
        return html`
          <div class="caption">CLIMA</div>
          <div
            style="position:absolute;left:2rem;right:2rem;top:2.5rem;height:20rem;display:flex;align-items:center;justify-content:center;color:var(--cow-text-secondary);font-size:1rem;background:var(--cow-surface-white);border:0.0625rem dashed var(--cow-surface-border);border-radius:1.25rem;"
          >
            Nessun termostato o sensore configurato per questa stanza
          </div>
        `;
      }
      return this.renderSensorsOnly();
    }
    const climate = this.hass?.states?.[this.room.climate];
    const roomView = deriveThermostatView(climate);
    const split = usesSplitClimate(this.systemClimate, roomView);
    const sysClimate = this.hass?.states?.[this.systemClimate];
    const sysView = split ? deriveThermostatView(sysClimate) : roomView;
    const view = split
      ? deriveSplitRoomDisplayView(climate, sysClimate)
      : roomView;
    // Caption "CLIMA — …". In split mode the rich air_state drives the
    // wording; otherwise fall back to the variant.
    const air = split ? readAirState(climate) : undefined;
    const variantLabel = split
      ? splitRoomStatusLabel(climate)
      : view.variant === "cooling"
        ? "RAFFREDDAMENTO ATTIVO"
        : view.variant === "heating"
          ? "RISCALDAMENTO ATTIVO"
          : view.variant === "off"
            ? "SPENTO"
            : "IN MANTENIMENTO";
    // Keep one decimal so a "24.5°" room doesn't render as "25°" here
    // while the header pill still shows "24.5°C" — the two surfaces
    // would otherwise look like they're reading different sensors.
    // Strip a trailing ".0" so an exact integer setpoint reads "21°"
    // instead of the slightly ugly "21.0°".
    const fmt = (n: number, unit: string) =>
      `${n.toFixed(1).replace(/\.0$/, "")}${unit}`;
    const cur = roomView.current != null ? fmt(roomView.current, "°") : "—";
    const tgt = roomView.target != null ? fmt(roomView.target, "°C") : "—";

    const upTarget = bumpTarget(roomView, 1);
    const downTarget = bumpTarget(roomView, -1);

    const fans = (split ? sysView : view).fanModes.length > 0
      ? (split ? sysView : view).fanModes
      : ["auto"];

    // Push the variant's accent palette onto the host as CSS variables
    // so the body gradient + selected mode chip + everything else that
    // reads `--cow-accent-*` paint with the right colour for OFF /
    // IDLE / HEATING / COOLING — same palette the small panel uses.
    const accent = THERMOSTAT_ACCENT[view.variant];
    this.style.setProperty("--cow-accent-primary", accent.primary);
    this.style.setProperty("--cow-accent-light", accent.light);
    this.style.setProperty("--cow-accent-active", accent.active);
    this.style.setProperty("--cow-accent-surface", accent.surface);

    return this.renderClimate(
      view,
      roomView,
      sysView,
      split,
      variantLabel,
      cur,
      tgt,
      upTarget,
      downTarget,
      fans,
      climate,
      air,
    );
  }

  private renderSensorsOnly() {
    const states = this.hass?.states ?? {};
    const tempEntity = this.room?.temperature
      ? states[this.room.temperature]
      : undefined;
    const humEntity = this.room?.humidity
      ? states[this.room.humidity]
      : undefined;
    const tempVal = tempEntity ? parseFloat(tempEntity.state) : NaN;
    const humVal = humEntity ? parseFloat(humEntity.state) : NaN;
    const tempStr = Number.isFinite(tempVal)
      ? `${Math.round(tempVal * 10) / 10}°`
      : "—";
    const humStr = Number.isFinite(humVal) ? `${Math.round(humVal)}%` : "—";

    // Comfort hint based on temperature reading
    let comfort = "—";
    if (Number.isFinite(tempVal)) {
      if (tempVal < 18) comfort = "Freddo";
      else if (tempVal < 20) comfort = "Fresco";
      else if (tempVal <= 23) comfort = "Confortevole";
      else if (tempVal <= 26) comfort = "Caldo";
      else comfort = "Molto caldo";
    }

    const humSub = Number.isFinite(humVal)
      ? humVal < 35
        ? "Aria secca"
        : humVal > 65
          ? "Aria umida"
          : "Umidità ottimale"
      : "—";
    return html`
      <div class="caption">CLIMA — SOLO MONITORAGGIO</div>
      <div
        class="full sensors-only"
        style="background: linear-gradient(120deg, #6da3d6 0%, #8fb9e0 60%, #cfe6ff 100%);"
      >
        <div class="so-col">
          <div class="so-label"><span>🌡</span><span>TEMPERATURA</span></div>
          <div class="so-big">${tempStr}</div>
          <div class="so-sub">${comfort}</div>
        </div>
        <div class="so-col">
          <div class="so-label"><span>💧</span><span>UMIDITÀ</span></div>
          <div class="so-big">${humStr}</div>
          <div class="so-sub">${humSub}</div>
        </div>
        <div class="so-col so-advisory">
          <div class="so-label">SUGGERIMENTO</div>
          <div class="so-advice">${this.advisoryText(tempVal, humVal)}</div>
          <div class="so-hint">
            Aggiungi un <code>climate.*</code> alla stanza per regolare
            temperatura e modalità.
          </div>
        </div>
      </div>
    `;
  }

  private advisoryText(temp: number, hum: number): string {
    if (!Number.isFinite(temp) && !Number.isFinite(hum)) return "—";
    const advices: string[] = [];
    if (Number.isFinite(temp)) {
      if (temp < 19) advices.push("Considera di alzare il riscaldamento");
      else if (temp > 25) advices.push("Apri le tapparelle o ventila");
      else advices.push("Comfort termico nella norma");
    }
    if (Number.isFinite(hum)) {
      if (hum < 35) advices.push("aria secca, valuta un umidificatore");
      else if (hum > 65) advices.push("umidità alta, ventila");
    }
    return advices.join(" · ");
  }

  private renderClimate(
    view: ReturnType<typeof deriveThermostatView>,
    roomView: ReturnType<typeof deriveThermostatView>,
    sysView: ReturnType<typeof deriveThermostatView>,
    split: boolean,
    variantLabel: string,
    cur: string,
    tgt: string,
    upTarget: number | null,
    downTarget: number | null,
    fans: string[],
    room?: HassEntity,
    air?: string,
  ) {
    if (!this.room) return nothing;
    const arrowsDisabled = false;
    const floorOnly = split && isFloorOnlyRoom(room);
    const systemModes = split && !floorOnly
      ? SYSTEM_MODE_CHIP_ORDER.filter((m) => sysView.hvacModes.includes(m))
      : [];
    const statusLabel = split
      ? splitRoomStatusLabel(room)
      : THERMOSTAT_STATUS_LABEL[view.variant];
    const subLabel = split
      ? splitRoomSubLabel(room)
      : THERMOSTAT_SUB_LABEL[view.variant];
    return html`
      <div class="caption">CLIMA — ${variantLabel}</div>
      <div class="full">
        <div class="col">
          <div class="col-label">${statusLabel}</div>
          <div class="col-icon">
            ${air === "drying"
              ? "💧"
              : view.variant === "heating"
              ? "🔥"
              : view.variant === "cooling"
                ? "❄"
                : view.variant === "off"
                  ? "○"
                  : "⚖"}
          </div>
          <div class="col-big">${cur}</div>
          <div class="col-sub">${subLabel} · ${this.room.name}</div>
        </div>
        <div class="col" style="align-items:flex-start;">
          <div class="col-label">IMPOSTATO A</div>
          <button
            class="setpoint-big"
            type="button"
            ?disabled=${arrowsDisabled}
            @click=${this.openSetpointModal}
            aria-label="Modifica setpoint"
          >
            ${tgt}
          </button>
          <div class="setpoint-controls">
            <button
              class="arrow-btn"
              ?disabled=${arrowsDisabled}
              @click=${() =>
                !arrowsDisabled &&
                downTarget != null &&
                this.setTarget(downTarget)}
              aria-label="Diminuisci setpoint"
            >
              ▼
            </button>
            <button
              class="arrow-btn"
              ?disabled=${arrowsDisabled}
              @click=${() =>
                !arrowsDisabled &&
                upTarget != null &&
                this.setTarget(upTarget)}
              aria-label="Aumenta setpoint"
            >
              ▲
            </button>
          </div>
        </div>
        <div class="col right">
          ${floorOnly
            ? ""
            : html`<div class="col-label">${split ? "TUTTA LA CASA" : "MODALITÀ"}</div>
          <div class="modes">
            ${split
              ? systemModes.map(
                  (m) => html`<button
                    class="mode-btn"
                    ?data-active=${sysView.mode === m}
                    @click=${() => this.onSystemModeChip(m)}
                  >
                    ${climateModeChipLabel(m)}
                  </button>`,
                )
              : html`
                  ${view.hvacModes.includes("cool")
                    ? html`<button
                        class="mode-btn"
                        ?data-active=${view.mode === "cool"}
                        @click=${() => this.setMode("cool")}
                      >
                        Cool
                      </button>`
                    : ""}
                  ${view.hvacModes.includes("heat")
                    ? html`<button
                        class="mode-btn"
                        ?data-active=${view.mode === "heat"}
                        @click=${() => this.setMode("heat")}
                      >
                        Heat
                      </button>`
                    : ""}
                  ${view.hvacModes.includes("dry")
                    ? html`<button
                        class="mode-btn"
                        ?data-active=${view.mode === "dry"}
                        @click=${() => this.setMode("dry")}
                      >
                        Dry
                      </button>`
                    : ""}
                  ${view.hvacModes.includes("fan_only")
                    ? html`<button
                        class="mode-btn"
                        ?data-active=${view.mode === "fan_only"}
                        @click=${() => this.setMode("fan_only")}
                      >
                        Fan
                      </button>`
                    : ""}
                  <button
                    class="mode-btn"
                    ?data-active=${view.mode === "off"}
                    @click=${() => this.setMode("off")}
                  >
                    Off
                  </button>
                `}
          </div>`}
          ${split
            ? html`
                <div class="schedule-label">
                  ${floorOnly ? "RISCALDAMENTO PAVIMENTO" : "QUESTA STANZA"}
                </div>
                <div class="air-modes">
                  <button
                    class="mode-btn"
                    ?data-active=${roomIncluded(room)}
                    @click=${() => this.setMode("auto")}
                  >
                    ${floorOnly ? "On" : "Inclusa"}
                  </button>
                  <button
                    class="mode-btn"
                    ?data-active=${!roomIncluded(room)}
                    @click=${() => this.setMode("off")}
                  >
                    ${floorOnly ? "Off" : "Esclusa"}
                  </button>
                </div>
              `
            : ""}
          ${floorOnly
            ? ""
            : html`
          <div class="schedule-label">VENTOLA</div>
          <div class="fans">
            ${fans.slice(0, 4).map(
              (f) => html`
                <button
                  class="fan-btn"
                  ?data-active=${(split ? sysView : view).fan === f}
                  @click=${() =>
                    split ? this.setSystemFan(f) : this.setFan(f)}
                >
                  ${f}
                </button>
              `,
            )}
          </div>`}
          <div class="schedule-label">UMIDITÀ</div>
          <div class="schedule-text">
            ${this.roomHumidityText(roomView)}
          </div>
        </div>
      </div>
      <cow-setpoint-modal
        .open=${this.setpointModalOpen}
        .value=${roomView.target}
        .min=${roomView.minTemp}
        .max=${roomView.maxTemp}
        .step=${roomView.step}
        .accent=${THERMOSTAT_ACCENT[view.variant].primary}
        .heading=${`Imposta ${this.room?.name || "stanza"}`}
        .subtitle=${`Tra ${roomView.minTemp}° e ${roomView.maxTemp}° · step ${roomView.step}°`}
        @cow-setpoint-confirm=${this.onSetpointConfirm}
        @cow-setpoint-cancel=${this.closeSetpointModal}
      ></cow-setpoint-modal>
      <cow-confirm-modal
        .open=${this.pendingSystemMode != null}
        .heading=${"Modalità di tutta la casa"}
        .message=${this.pendingSystemMode
          ? globalModeConfirmMessage(sysView.mode, this.pendingSystemMode)
          : ""}
        .confirmLabel=${"Applica a tutti"}
        .accent=${THERMOSTAT_ACCENT[view.variant].primary}
        @cow-confirm=${this.confirmSystemMode}
        @cow-cancel=${this.cancelSystemMode}
      ></cow-confirm-modal>
    `;
  }
}
