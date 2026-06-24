import { LitElement, html, css, nothing } from "lit";
import { customElement, property } from "lit/decorators.js";
import { buttonReset } from "../styles/button-reset.js";
import type { HomeAssistant } from "../types/hass.js";

const CLIMA_CASA = "climate.clima_casa_auto";

/**
 * Second row under Luci/tapparelle — same 17.5×4 rem tiles: clima toggle,
 * setpoint (− / value / +), Buongiorno, Buonanotte.
 */
@customElement("cow-xl-clima-casa")
export class CowXLClimaCasa extends LitElement {
  @property({ attribute: false }) hass?: HomeAssistant;

  static override styles = [
    buttonReset,
    css`
      :host {
        display: block;
      }
      .row {
        display: flex;
        justify-content: center;
        gap: 1rem;
      }
      .tile {
        width: 17.5rem;
        height: 4rem;
        background: var(--cow-surface-white);
        border: 0.0625rem solid var(--cow-surface-border);
        border-radius: 1rem;
        display: flex;
        align-items: center;
        gap: 0.75rem;
        padding: 0 1rem;
        font-weight: 600;
        font-size: 1rem;
        color: var(--cow-text-primary);
      }
      .tile[data-on] {
        background: var(--cow-accent-active, #2f9e6e);
        border-color: transparent;
        color: #fff;
      }
      .tile[data-morning] {
        background: rgba(255, 199, 46, 0.2);
        border-color: rgba(255, 199, 46, 0.45);
        color: #8a5f00;
      }
      .tile[data-night] {
        background: rgba(255, 199, 46, 0.32);
        border-color: transparent;
        color: #6b4a00;
      }
      .dot {
        width: 0.625rem;
        height: 0.625rem;
        border-radius: 50%;
        flex: 0 0 0.625rem;
      }
      .icon {
        font-size: 1.125rem;
        flex: 0 0 auto;
      }
      .setpoint {
        width: 17.5rem;
        height: 4rem;
        display: flex;
        align-items: stretch;
        border: 0.0625rem solid var(--cow-surface-border);
        border-radius: 1rem;
        background: var(--cow-surface-white);
        overflow: hidden;
      }
      .setpoint button {
        flex: 0 0 3.25rem;
        font-weight: 700;
        font-size: 1.25rem;
        color: var(--cow-text-primary);
        background: transparent;
        border: 0;
      }
      .setpoint button:disabled {
        opacity: 0.35;
        cursor: not-allowed;
      }
      .setpoint .val {
        flex: 1;
        display: flex;
        align-items: center;
        justify-content: center;
        font-weight: 700;
        font-size: 1.25rem;
        color: var(--cow-text-primary);
        border-left: 0.0625rem solid var(--cow-surface-border);
        border-right: 0.0625rem solid var(--cow-surface-border);
      }
      .setpoint[data-off] .val {
        color: var(--cow-text-secondary);
      }
    `,
  ];

  private runScript(entityId: string): void {
    void this.hass?.callService("script", "turn_on", {}, { entity_id: entityId });
  }

  private toggleClima(): void {
    const ent = this.hass?.states?.[CLIMA_CASA];
    if (!ent) return;
    void this.hass?.callService(
      "climate",
      "set_hvac_mode",
      { hvac_mode: ent.state === "cool" ? "off" : "cool" },
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

    return html`
      <div class="row">
        ${ent
          ? html`<button
              type="button"
              class="tile"
              ?data-on=${on}
              @click=${this.toggleClima}
            >
              <span
                class="dot"
                style=${`background:${on ? "#fff" : "#66BFFF"}`}
              ></span>
              <span class="icon">❄</span>
              <span>${on ? "Spegni clima" : "Accendi freddo"}</span>
            </button>`
          : nothing}
        ${ent
          ? html`
              <div class="setpoint" ?data-off=${!on}>
                <button
                  type="button"
                  ?disabled=${!on}
                  aria-label="Diminuisci setpoint"
                  @click=${() => this.bump(-0.5)}
                >
                  −
                </button>
                <span class="val"
                  >${on && Number.isFinite(tgt) ? `${tgt.toFixed(1)}°` : "—"}</span
                >
                <button
                  type="button"
                  ?disabled=${!on}
                  aria-label="Aumenta setpoint"
                  @click=${() => this.bump(0.5)}
                >
                  +
                </button>
              </div>
            `
          : nothing}
        ${bg
          ? html`<button
              type="button"
              class="tile"
              data-morning
              @click=${() => this.runScript("script.buongiorno")}
            >
              <span class="dot" style="background:#FFC72E"></span>
              <span class="icon">☀️</span>
              <span>Buongiorno</span>
            </button>`
          : nothing}
        ${bn
          ? html`<button
              type="button"
              class="tile"
              data-night
              @click=${() => this.runScript("script.buonanotte")}
            >
              <span class="dot" style="background:#1F1F2E"></span>
              <span class="icon">🌙</span>
              <span>Buonanotte</span>
            </button>`
          : nothing}
      </div>
    `;
  }
}
