import { LitElement, html, css, nothing } from "lit";
import { customElement, property } from "lit/decorators.js";
import type { HomeAssistant } from "../../types/hass.js";
import type { CowRoomConfig } from "../../config-xl.js";
import { buttonReset } from "../../styles/button-reset.js";
import {
  deriveThermostatView,
  bumpTarget,
} from "../../state/thermostat-state.js";

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
      .full {
        position: absolute;
        left: 2rem;
        right: 2rem;
        top: 2.5rem;
        height: 20rem;
        background: linear-gradient(
          120deg,
          var(--cow-thermostat-orange) 0%,
          var(--cow-thermostat-orange-dark, #e55a1f) 60%,
          #ffd2a8 100%
        );
        border-radius: 1.25rem;
        padding: 2rem;
        display: grid;
        grid-template-columns: 1fr 1fr 1fr;
        gap: 2rem;
        color: var(--cow-surface-white);
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
        font-weight: 300;
        font-size: 7rem;
        line-height: 1;
        margin-top: 0.5rem;
        font-variant-numeric: tabular-nums;
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
        transition: background 160ms ease;
      }
      .arrow-btn:active {
        background: rgba(255, 255, 255, 0.32);
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
      .mode-btn[data-active] {
        background: var(--cow-surface-white);
        color: var(--cow-text-primary);
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

      .actions {
        position: absolute;
        left: 2rem;
        right: 2rem;
        bottom: 1rem;
        height: 3.5rem;
        display: flex;
        gap: 1rem;
      }
      .act {
        flex: 1;
        height: 100%;
        border-radius: 1rem;
        font-weight: 600;
        font-size: 1rem;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: 0.5rem;
        cursor: pointer;
        background: var(--cow-surface-button-bg);
        color: var(--cow-text-primary);
        border: 0.0625rem solid var(--cow-surface-border);
      }
      .act-comfort {
        background: var(--cow-thermostat-orange);
        color: var(--cow-surface-white);
        border-color: transparent;
      }
      .act-eco {
        background: #2eb86b;
        color: var(--cow-surface-white);
        border-color: transparent;
      }
      .act-antigelo {
        background: #3b7ed1;
        color: var(--cow-surface-white);
        border-color: transparent;
      }
    `,
  ];

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

  private async preset(preset: "comfort" | "eco" | "antigelo") {
    if (!this.room?.climate || !this.hass) return;
    const targets: Record<string, number> = {
      comfort: 22,
      eco: 19,
      antigelo: 8,
    };
    const modes: Record<string, string> = {
      comfort: "heat",
      eco: "heat",
      antigelo: "heat",
    };
    await this.hass.callService("climate", "set_hvac_mode", {
      entity_id: this.room.climate,
      hvac_mode: modes[preset],
    });
    await this.hass.callService("climate", "set_temperature", {
      entity_id: this.room.climate,
      temperature: targets[preset],
    });
  }

  override render() {
    if (!this.room) return nothing;
    if (!this.room.climate) {
      return html`
        <div class="caption">CLIMA</div>
        <div
          style="position:absolute;left:2rem;right:2rem;top:2.5rem;height:20rem;display:flex;align-items:center;justify-content:center;color:var(--cow-text-secondary);font-size:1rem;background:var(--cow-surface-white);border:0.0625rem dashed var(--cow-surface-border);border-radius:1.25rem;"
        >
          Nessun termostato configurato per questa stanza
        </div>
      `;
    }
    const climate = this.hass?.states?.[this.room.climate];
    const view = deriveThermostatView(climate);
    const variantLabel =
      view.variant === "heating"
        ? "RISCALDAMENTO ATTIVO"
        : view.variant === "cooling"
          ? "RAFFREDDAMENTO ATTIVO"
          : view.variant === "off"
            ? "SPENTO"
            : "IN MANTENIMENTO";
    const cur = view.current != null ? `${Math.round(view.current)}°` : "—";
    const tgt = view.target != null ? `${Math.round(view.target)}°C` : "—";

    const upTarget = bumpTarget(view, 1);
    const downTarget = bumpTarget(view, -1);

    const fans = view.fanModes.length > 0 ? view.fanModes : ["auto"];

    return html`
      <div class="caption">CLIMA — ${variantLabel}</div>
      <div class="full">
        <div class="col">
          <div class="col-label">${view.variant.toUpperCase()}</div>
          <div class="col-icon">
            ${view.variant === "heating"
              ? "🔥"
              : view.variant === "cooling"
                ? "❄"
                : view.variant === "off"
                  ? "○"
                  : "⚖"}
          </div>
          <div class="col-big">${cur}</div>
          <div class="col-sub">Temperatura attuale · ${this.room.name}</div>
        </div>
        <div class="col" style="align-items:flex-start;">
          <div class="col-label">IMPOSTATO A</div>
          <div class="setpoint-big">${tgt}</div>
          <div class="setpoint-controls">
            <button
              class="arrow-btn"
              @click=${() => downTarget != null && this.setTarget(downTarget)}
              aria-label="Diminuisci setpoint"
            >
              ▼
            </button>
            <button
              class="arrow-btn"
              @click=${() => upTarget != null && this.setTarget(upTarget)}
              aria-label="Aumenta setpoint"
            >
              ▲
            </button>
          </div>
        </div>
        <div class="col right">
          <div class="col-label">MODALITÀ</div>
          <div class="modes">
            <button
              class="mode-btn"
              ?data-active=${view.mode === "cool"}
              @click=${() => this.setMode("cool")}
            >
              Cool
            </button>
            <button
              class="mode-btn"
              ?data-active=${view.mode === "heat"}
              @click=${() => this.setMode("heat")}
            >
              Heat
            </button>
            <button
              class="mode-btn"
              ?data-active=${view.mode === "off"}
              @click=${() => this.setMode("off")}
            >
              Off
            </button>
          </div>
          <div class="schedule-label">VENTOLA</div>
          <div class="fans">
            ${fans.slice(0, 4).map(
              (f) => html`
                <button
                  class="fan-btn"
                  ?data-active=${view.fan === f}
                  @click=${() => this.setFan(f)}
                >
                  ${f}
                </button>
              `,
            )}
          </div>
          <div class="schedule-label">UMIDITÀ</div>
          <div class="schedule-text">
            ${view.humidity != null
              ? html`💧 ${Math.round(view.humidity)}%`
              : "—"}
          </div>
        </div>
      </div>
      <div class="actions">
        <button
          class="act act-comfort"
          @click=${() => this.preset("comfort")}
        >
          🏠 Comfort 22°
        </button>
        <button class="act act-eco" @click=${() => this.preset("eco")}>
          🌿 Eco 19°
        </button>
        <button
          class="act act-antigelo"
          @click=${() => this.preset("antigelo")}
        >
          ❄ Antigelo 8°
        </button>
      </div>
    `;
  }
}
