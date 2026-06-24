import { LitElement, html, css, nothing } from "lit";
import { customElement, property } from "lit/decorators.js";
import { buttonReset } from "../styles/button-reset.js";
import type { HomeAssistant } from "../types/hass.js";

const CLIMA_CASA = "climate.clima_casa_auto";

/**
 * Whole-house climate shortcuts on the XL idle dashboard — sits directly
 * under the scene row (Tutto OFF / Apri tutto / …), mirroring mobile
 * `renderClimaCasa()`.
 *
 * TEMPORANEO: generic_thermostat keep-alive via Camera padronale until
 * per-room control is operational.
 */
@customElement("cow-xl-clima-casa")
export class CowXLClimaCasa extends LitElement {
  @property({ attribute: false }) hass?: HomeAssistant;

  static override styles = [
    buttonReset,
    css`
      :host {
        display: block;
        position: absolute;
        left: 1.5rem;
        right: 1.5rem;
        top: 47.75rem;
      }
      .status {
        text-align: center;
        font-weight: 500;
        font-size: 0.875rem;
        color: var(--cow-text-secondary);
        margin-bottom: 0.5rem;
      }
      .row {
        display: flex;
        justify-content: center;
        gap: 1rem;
      }
      .btn {
        width: 35.75rem;
        height: 3.5rem;
        border-radius: 1rem;
        font-weight: 600;
        font-size: 1rem;
        border: 0.0625rem solid var(--cow-surface-border);
        background: var(--cow-surface-white);
        color: var(--cow-text-primary);
      }
      .btn[data-on] {
        background: var(--cow-accent-active, #2f9e6e);
        border-color: transparent;
        color: #fff;
      }
      .btn[data-off] {
        background: var(--cow-danger, #c0473b);
        border-color: transparent;
        color: #fff;
      }
      .btn[data-soft] {
        background: transparent;
        color: var(--cow-text-primary);
        width: auto;
        flex: 1;
        max-width: 35.75rem;
      }
      .btn:disabled {
        opacity: 0.35;
        cursor: not-allowed;
      }
      .setpoint {
        flex: 1.4;
        text-align: center;
        font-weight: 700;
        font-size: 0.95rem;
        color: var(--cow-text-primary);
      }
    `,
  ];

  private setMode(on: boolean): void {
    void this.hass?.callService(
      "climate",
      "set_hvac_mode",
      { hvac_mode: on ? "cool" : "off" },
      { entity_id: CLIMA_CASA },
    );
  }

  private bump(delta: number): void {
    const cur = Number(
      this.hass?.states?.[CLIMA_CASA]?.attributes?.temperature,
    );
    if (!Number.isFinite(cur)) return;
    void this.hass?.callService(
      "climate",
      "set_temperature",
      { temperature: Math.round((cur + delta) * 2) / 2 },
      { entity_id: CLIMA_CASA },
    );
  }

  override render() {
    const ent = this.hass?.states?.[CLIMA_CASA];
    if (!ent) return nothing;

    const on = ent.state === "cool";
    const tgt = Number(ent.attributes?.temperature);
    const cur = Number(ent.attributes?.current_temperature);
    const action = ent.attributes?.hvac_action;
    const sub = !on
      ? "spento"
      : action === "cooling"
        ? "raffredda"
        : "mantenimento";

    return html`
      <div class="status">
        Clima casa —
        ${Number.isFinite(cur) ? `media ${cur.toFixed(1)}° · ` : ""}${sub}${on &&
        Number.isFinite(tgt)
          ? ` · obiettivo ${tgt.toFixed(1)}°`
          : ""}
      </div>
      <div class="row">
        <button
          type="button"
          class="btn"
          data-off
          ?disabled=${!on}
          @click=${() => this.setMode(false)}
        >
          Spegni clima
        </button>
        <button
          type="button"
          class="btn"
          data-on
          ?disabled=${on}
          @click=${() => this.setMode(true)}
        >
          Accendi freddo
        </button>
      </div>
      ${on
        ? html`
            <div class="row" style="margin-top:0.5rem;">
              <button
                type="button"
                class="btn"
                data-soft
                @click=${() => this.bump(-0.5)}
              >
                − 0,5°
              </button>
              <span class="setpoint">
                obiettivo ${Number.isFinite(tgt) ? tgt.toFixed(1) : "—"}°
              </span>
              <button
                type="button"
                class="btn"
                data-soft
                @click=${() => this.bump(0.5)}
              >
                + 0,5°
              </button>
            </div>
          `
        : nothing}
    `;
  }
}
