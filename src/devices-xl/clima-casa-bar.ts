import { LitElement, html, css, nothing, type PropertyValues } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { buttonReset } from "../styles/button-reset.js";
import type { HomeAssistant } from "../types/hass.js";
import {
  applyGlobalMode,
  climateModeChipLabel,
  globalModeConfirmMessage,
  modeReincludesExcluded,
  needsModeChangeConfirm,
  SYSTEM_MODE_CHIP_ORDER,
} from "../small/state/split-climate.js";
import { climaBarWatchIds, hassEntitiesChanged } from "../utils/hass-watch.js";
import "../shared/setpoint-modal.js";
import "../shared/confirm-modal.js";

const DEFAULT_SYSTEM = "climate.casa_sistema";

/**
 * XL home — single climate rectangle (Cow Climate v4).
 *
 * One row: system mode (Cool/Heat/Dry/Fan/Off) + fan speed + a global
 * setpoint. Mode and fan are global (single Mitsubishi motor). The
 * setpoint here is a broadcast: tapping it applies the same setpoint to
 * every air zone at once (rooms keep their own when set from the room
 * tab). Floor-only rooms (bagni, ingresso) are excluded from the
 * broadcast. Mode changes ask for confirmation when the motor is
 * already running in another mode. Buongiorno/Buonanotte moved to the
 * scenes row.
 */
@customElement("cow-xl-clima-casa")
export class CowXLClimaCasa extends LitElement {
  @property({ attribute: false }) hass?: HomeAssistant;
  @property({ type: String }) systemClimate = DEFAULT_SYSTEM;

  @state() private setpointModalOpen = false;
  @state() private pendingSystemMode?: string;
  @state() private pendingMode?: string;
  @state() private pendingFan?: string;
  private cachedAirZones: string[] | null = null;

  static override styles = [
    buttonReset,
    css`
      :host {
        display: block;
      }
      .bar {
        display: flex;
        align-items: center;
        gap: 1.25rem;
        min-height: 4rem;
        padding: 0.5rem 1.25rem;
        background: var(--cow-surface-white);
        border: 0.0625rem solid var(--cow-surface-border);
        border-radius: 1rem;
        box-sizing: border-box;
      }
      .bar[data-on] {
        background: var(--cow-accent-surface, linear-gradient(180deg, #2673eb, #59a6ff));
        border-color: transparent;
        color: #fff;
      }
      .title {
        display: flex;
        align-items: center;
        gap: 0.5rem;
        font-weight: 700;
        font-size: 1rem;
        flex: 0 0 auto;
      }
      .title .icon {
        font-size: 1.25rem;
      }
      .group {
        display: flex;
        align-items: center;
        gap: 0.5rem;
      }
      .group-label {
        font-size: 0.6875rem;
        font-weight: 700;
        letter-spacing: 0.04em;
        text-transform: uppercase;
        opacity: 0.6;
      }
      .bar[data-on] .group-label {
        opacity: 0.8;
      }
      .chips {
        display: flex;
        gap: 0.375rem;
      }
      .chip {
        min-width: 3rem;
        height: 2.25rem;
        padding: 0 0.75rem;
        border-radius: 0.625rem;
        border: 0.0625rem solid var(--cow-surface-border);
        background: var(--cow-surface-background);
        font-weight: 600;
        font-size: 0.8125rem;
        color: var(--cow-text-secondary);
        cursor: pointer;
        transition:
          background-color 160ms ease,
          color 160ms ease,
          transform 120ms ease;
      }
      .chip:active {
        transform: scale(0.96);
      }
      .bar[data-on] .chip {
        border-color: rgba(255, 255, 255, 0.35);
        background: rgba(255, 255, 255, 0.12);
        color: #fff;
      }
      .chip[data-active] {
        background: var(--cow-accent-active, #2f9e6e);
        border-color: transparent;
        color: #fff;
      }
      .bar[data-on] .chip[data-active] {
        background: #fff;
        color: var(--cow-accent-active, #2673eb);
      }
      .spacer {
        flex: 1 1 auto;
      }
      .setpoint {
        display: flex;
        align-items: center;
        gap: 0.5rem;
        flex: 0 0 auto;
      }
      .setpoint-btn {
        height: 2.5rem;
        padding: 0 1rem;
        border-radius: 0.75rem;
        border: 0.0625rem solid var(--cow-surface-border);
        background: var(--cow-surface-background);
        font-weight: 700;
        font-size: 1.0625rem;
        color: var(--cow-text-primary);
        cursor: pointer;
      }
      .bar[data-on] .setpoint-btn {
        border-color: rgba(255, 255, 255, 0.35);
        background: rgba(255, 255, 255, 0.16);
        color: #fff;
      }
    `,
  ];

  private entityId(): string {
    return this.systemClimate || DEFAULT_SYSTEM;
  }

  override shouldUpdate(changed: PropertyValues): boolean {
    if (changed.has("systemClimate")) {
      this.cachedAirZones = null;
      return true;
    }
    if (changed.has("hass")) {
      const ids = climaBarWatchIds(this.hass, this.entityId());
      return hassEntitiesChanged(
        changed.get("hass") as HomeAssistant | undefined,
        this.hass,
        ids,
      );
    }
    return true;
  }

  override willUpdate(): void {
    const id = this.entityId();
    const ent = this.hass?.states?.[id];
    if (ent) {
      const mode = ent.state ?? "off";
      const fan = ent.attributes?.fan_mode as string | undefined;
      if (this.pendingMode != null && this.pendingMode === mode) {
        this.pendingMode = undefined;
      }
      if (this.pendingFan != null && this.pendingFan === fan) {
        this.pendingFan = undefined;
      }
    }
  }

  /** Air zones = casa_* proxies with modes [off,auto] and not floor-only. */
  private airZones(): string[] {
    const st = this.hass?.states ?? {};
    if (!this.cachedAirZones) {
      this.cachedAirZones = Object.keys(st).filter((id) => {
        if (!id.startsWith("climate.casa_")) return false;
        if (id === this.entityId()) return false;
        const e = st[id];
        const modes = e.attributes?.hvac_modes as string[] | undefined;
        const isAir =
          !!modes &&
          modes.includes("off") &&
          modes.includes("auto") &&
          !modes.some((m) => ["heat", "cool", "dry", "fan_only"].includes(m));
        return isAir && e.attributes?.floor_only !== true;
      });
    }
    return this.cachedAirZones;
  }

  private setpoints(): number[] {
    const st = this.hass?.states ?? {};
    return this.airZones()
      .map((z) => st[z]?.attributes?.temperature)
      .filter((n): n is number => typeof n === "number");
  }

  private avgSetpoint(): number {
    const sps = this.setpoints();
    if (sps.length === 0) return 21;
    return Math.round((sps.reduce((a, b) => a + b, 0) / sps.length) * 2) / 2;
  }

  /** The shared setpoint if every air zone agrees, else null (→ "—"). */
  private commonSetpoint(): number | null {
    const sps = this.setpoints();
    if (sps.length === 0) return null;
    return sps.every((v) => v === sps[0]) ? sps[0] : null;
  }

  private applyMode(mode: string): void {
    if (!this.hass) return;
    void applyGlobalMode(this.hass, this.entityId(), mode);
  }

  private onModeChip(mode: string): void {
    const current = this.hass?.states?.[this.entityId()]?.state;
    const excluded = modeReincludesExcluded(this.hass?.states, this.entityId(), mode);
    if (needsModeChangeConfirm(current, mode, excluded)) {
      this.pendingSystemMode = mode;
    } else {
      this.pendingMode = mode;
      this.applyMode(mode);
    }
  }

  private confirmMode = (): void => {
    const mode = this.pendingSystemMode;
    this.pendingSystemMode = undefined;
    if (mode) {
      this.pendingMode = mode;
      this.applyMode(mode);
    }
  };

  private cancelMode = (): void => {
    this.pendingSystemMode = undefined;
  };

  private setFan(fan: string): void {
    this.pendingFan = fan;
    void this.hass?.callService(
      "climate",
      "set_fan_mode",
      { fan_mode: fan },
      { entity_id: this.entityId() },
    );
  }

  private openSetpointModal = (): void => {
    this.setpointModalOpen = true;
    const modal = this.renderRoot.querySelector("cow-setpoint-modal");
    modal?.show();
  };

  private onSetpointConfirm = (e: CustomEvent<{ value: number }>): void => {
    this.setpointModalOpen = false;
    const value = e.detail.value;
    for (const z of this.airZones()) {
      void this.hass?.callService(
        "climate",
        "set_temperature",
        { temperature: value },
        { entity_id: z },
      );
    }
  };

  override render() {
    const id = this.entityId();
    const ent = this.hass?.states?.[id];
    if (!ent) return nothing;

    const mode = this.pendingMode ?? ent.state ?? "off";
    const on = mode !== "off";
    const modes = SYSTEM_MODE_CHIP_ORDER.filter((m) =>
      (ent.attributes?.hvac_modes as string[] | undefined)?.includes(m),
    );
    const fanModes = (ent.attributes?.fan_modes as string[] | undefined) ?? [];
    const fan = this.pendingFan ?? (ent.attributes?.fan_mode as string | undefined);
    const common = this.commonSetpoint();
    const setpointLabel =
      common != null ? `${common.toFixed(1).replace(/\.0$/, "")}°C` : "—°C";

    return html`
      <div class="bar" ?data-on=${on}>
        <div class="title">
          <span class="icon">🌡</span><span>Sistema</span>
        </div>

        <div class="group">
          <span class="group-label">Modo</span>
          <div class="chips">
            ${modes.map(
              (m) => html`<button
                class="chip"
                ?data-active=${mode === m}
                @click=${() => this.onModeChip(m)}
              >
                ${climateModeChipLabel(m)}
              </button>`,
            )}
          </div>
        </div>

        ${fanModes.length > 1
          ? html`<div class="group">
              <span class="group-label">Ventola</span>
              <div class="chips">
                ${fanModes.map(
                  (f) => html`<button
                    class="chip"
                    ?data-active=${fan === f}
                    @click=${() => this.setFan(f)}
                  >
                    ${f === "auto"
                      ? "Auto"
                      : f.charAt(0).toUpperCase() + f.slice(1)}
                  </button>`,
                )}
              </div>
            </div>`
          : nothing}

        <div class="spacer"></div>

        <div class="setpoint">
          <span class="group-label">Tutte</span>
          <button
            class="setpoint-btn"
            type="button"
            @click=${this.openSetpointModal}
            aria-label="Imposta setpoint per tutte le zone"
          >
            ${setpointLabel}
          </button>
        </div>
      </div>

      <cow-setpoint-modal
        .open=${this.setpointModalOpen}
        .value=${this.avgSetpoint()}
        .min=${15}
        .max=${30}
        .step=${0.5}
        .heading=${"Imposta tutte le stanze"}
        .subtitle=${"Applica lo stesso setpoint a tutte le zone con aria"}
        @cow-setpoint-confirm=${this.onSetpointConfirm}
        @cow-setpoint-cancel=${() => (this.setpointModalOpen = false)}
      ></cow-setpoint-modal>

      <cow-confirm-modal
        .open=${this.pendingSystemMode != null}
        .heading=${"Modalità di tutta la casa"}
        .message=${this.pendingSystemMode
          ? globalModeConfirmMessage(mode, this.pendingSystemMode)
          : ""}
        .confirmLabel=${"Applica a tutti"}
        @cow-confirm=${this.confirmMode}
        @cow-cancel=${this.cancelMode}
      ></cow-confirm-modal>
    `;
  }
}
