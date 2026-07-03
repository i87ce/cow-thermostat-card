import { LitElement, html, css, nothing } from "lit";
import { customElement, property } from "lit/decorators.js";
import { buttonReset } from "../styles/button-reset.js";
import type { HomeAssistant } from "../types/hass.js";
import {
  climateModeChipLabel,
  SYSTEM_MODE_CHIP_ORDER,
} from "../small/state/split-climate.js";

const DEFAULT_SYSTEM = "climate.casa_sistema";

/**
 * Second row under Luci/tapparelle — global Mitsubishi mode shortcuts,
 * Buongiorno, Buonanotte. Setpoint is per-room (drawer / wall card).
 */
@customElement("cow-xl-clima-casa")
export class CowXLClimaCasa extends LitElement {
  @property({ attribute: false }) hass?: HomeAssistant;
  @property({ type: String }) systemClimate = DEFAULT_SYSTEM;

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
        flex-wrap: wrap;
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
      .modes {
        display: flex;
        gap: 0.375rem;
        flex: 1;
        justify-content: flex-end;
      }
      .mode-chip {
        min-width: 2.75rem;
        height: 2rem;
        padding: 0 0.5rem;
        border-radius: 0.5rem;
        border: 0.0625rem solid var(--cow-surface-border);
        background: var(--cow-surface-background);
        font-weight: 600;
        font-size: 0.75rem;
        color: var(--cow-text-secondary);
      }
      .mode-chip[data-active] {
        background: var(--cow-accent-active, #2f9e6e);
        border-color: transparent;
        color: #fff;
      }
    `,
  ];

  private entityId(): string {
    return this.systemClimate || DEFAULT_SYSTEM;
  }

  private runScript(entityId: string): void {
    void this.hass?.callService("script", "turn_on", {}, { entity_id: entityId });
  }

  private setMode(mode: string): void {
    const id = this.entityId();
    void this.hass?.callService(
      "climate",
      "set_hvac_mode",
      { hvac_mode: mode },
      { entity_id: id },
    );
  }

  override render() {
    const id = this.entityId();
    const ent = this.hass?.states?.[id];
    const bg = this.hass?.states?.["script.buongiorno"];
    const bn = this.hass?.states?.["script.buonanotte"];
    if (!ent && !bg && !bn) return nothing;

    const mode = ent?.state ?? "off";
    const on = mode !== "off";
    const modes = ent
      ? SYSTEM_MODE_CHIP_ORDER.filter((m) =>
          (ent.attributes?.hvac_modes as string[] | undefined)?.includes(m),
        )
      : [];

    return html`
      <div class="row">
        ${ent
          ? html`<div class="tile" ?data-on=${on}>
              <span
                class="dot"
                style=${`background:${on ? "#fff" : "#80858c"}`}
              ></span>
              <span class="icon">🌡</span>
              <span>Sistema aria</span>
              <div class="modes">
                ${modes.map(
                  (m) => html`<button
                    type="button"
                    class="mode-chip"
                    ?data-active=${mode === m}
                    @click=${() => this.setMode(m)}
                  >
                    ${climateModeChipLabel(m)}
                  </button>`,
                )}
              </div>
            </div>`
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
