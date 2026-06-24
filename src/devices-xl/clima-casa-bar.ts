import { LitElement, html, css, nothing } from "lit";
import { customElement, property } from "lit/decorators.js";
import { buttonReset } from "../styles/button-reset.js";
import type { HomeAssistant } from "../types/hass.js";

const CLIMA_CASA = "climate.clima_casa_auto";

/**
 * Whole-house shortcuts on the XL idle dashboard — one compact row of four
 * actions under the scene row, mirroring mobile clima + day scripts.
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
        top: 43.5rem;
      }
      .status {
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 0.5rem;
        font-weight: 500;
        font-size: 0.75rem;
        color: var(--cow-text-secondary);
        margin-bottom: 0.35rem;
        min-height: 1.125rem;
      }
      .row {
        display: flex;
        justify-content: center;
        gap: 0.5rem;
      }
      .btn {
        flex: 1;
        min-width: 0;
        height: 2.35rem;
        border-radius: 0.75rem;
        font-weight: 600;
        font-size: 0.8125rem;
        border: 0.0625rem solid var(--cow-surface-border);
        background: var(--cow-surface-white);
        color: var(--cow-text-primary);
        padding: 0 0.35rem;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
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
      .btn[data-morning] {
        background: rgba(255, 199, 46, 0.2);
        border-color: rgba(255, 199, 46, 0.45);
        color: #8a5f00;
      }
      .btn[data-night] {
        background: rgba(255, 199, 46, 0.32);
        border-color: transparent;
        color: #6b4a00;
      }
      .btn:disabled {
        opacity: 0.35;
        cursor: not-allowed;
      }
      .sp-btn {
        width: 1.75rem;
        height: 1.75rem;
        flex: 0 0 1.75rem;
        border-radius: 0.5rem;
        border: 0.0625rem solid var(--cow-surface-border);
        background: var(--cow-surface-white);
        font-weight: 700;
        font-size: 0.875rem;
        color: var(--cow-text-primary);
        line-height: 1;
      }
    `,
  ];

  private runScript(entityId: string): void {
    void this.hass?.callService("script", "turn_on", {}, { entity_id: entityId });
  }

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
    const bg = this.hass?.states?.["script.buongiorno"];
    const bn = this.hass?.states?.["script.buonanotte"];
    if (!ent && !bg && !bn) return nothing;

    const on = ent?.state === "cool";
    const tgt = Number(ent?.attributes?.temperature);
    const cur = Number(ent?.attributes?.current_temperature);
    const action = ent?.attributes?.hvac_action;
    const sub = !on
      ? "spento"
      : action === "cooling"
        ? "raffredda"
        : "mantenimento";

    const showClimaOff = !!ent;
    const showClimaOn = !!ent;
    const showMorning = !!bg;
    const showNight = !!bn;

    return html`
      ${ent
        ? html`
            <div class="status">
              <span>
                Clima —
                ${Number.isFinite(cur) ? `${cur.toFixed(1)}° · ` : ""}${sub}${on &&
                Number.isFinite(tgt)
                  ? ` · ${tgt.toFixed(1)}°`
                  : ""}
              </span>
              ${on
                ? html`
                    <button
                      type="button"
                      class="sp-btn"
                      aria-label="Diminuisci setpoint"
                      @click=${() => this.bump(-0.5)}
                    >
                      −
                    </button>
                    <button
                      type="button"
                      class="sp-btn"
                      aria-label="Aumenta setpoint"
                      @click=${() => this.bump(0.5)}
                    >
                      +
                    </button>
                  `
                : nothing}
            </div>
          `
        : nothing}
      <div class="row">
        ${showClimaOff
          ? html`<button
              type="button"
              class="btn"
              data-off
              ?disabled=${!on}
              @click=${() => this.setMode(false)}
            >
              Spegni
            </button>`
          : nothing}
        ${showClimaOn
          ? html`<button
              type="button"
              class="btn"
              data-on
              ?disabled=${on}
              @click=${() => this.setMode(true)}
            >
              Freddo
            </button>`
          : nothing}
        ${showMorning
          ? html`<button
              type="button"
              class="btn"
              data-morning
              @click=${() => this.runScript("script.buongiorno")}
            >
              ☀️ AM
            </button>`
          : nothing}
        ${showNight
          ? html`<button
              type="button"
              class="btn"
              data-night
              @click=${() => this.runScript("script.buonanotte")}
            >
              🌙 Notte
            </button>`
          : nothing}
      </div>
    `;
  }
}
