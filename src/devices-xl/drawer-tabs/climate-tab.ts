import { LitElement, html, css, nothing } from "lit";
import { customElement, property } from "lit/decorators.js";
import type { HomeAssistant } from "../../types/hass.js";
import type { CowRoomConfig } from "../../config-xl.js";
import { buttonReset } from "../../styles/button-reset.js";
import {
  deriveThermostatView,
  bumpTarget,
} from "../../small/state/thermostat.js";

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

  /**
   * Resolve the humidity reading shown on the Climate tab.
   *
   * Lookup order (first hit wins):
   *   1. `room.humidity` sensor → the wall display's
   *      sensor.display_<room>_humidity is the most accurate reading
   *      (it's the actual sensor in the room). This is what every
   *      walldisplay-* dashboard already configures.
   *   2. `view.humidity` from the climate entity's `current_humidity`
   *      attribute → fallback for climate entities that DO publish
   *      their own humidity reading (some thermostats do).
   *   3. "—" when nothing's available.
   *
   * Without this priority chain the proxy MQTT climate (which has no
   * `current_humidity` attribute) and the Generic Thermostat (same)
   * would just show "—" even though the room has a perfectly good
   * humidity sensor wired up.
   */
  private roomHumidityText(view: ReturnType<typeof deriveThermostatView>) {
    if (this.room?.humidity && this.hass?.states?.[this.room.humidity]) {
      const n = parseFloat(this.hass.states[this.room.humidity].state);
      if (Number.isFinite(n)) return html`💧 ${Math.round(n)}%`;
    }
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

    // continued below in the original branch
    return this.renderClimate(view, variantLabel, cur, tgt, upTarget, downTarget, fans);
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
    variantLabel: string,
    cur: string,
    tgt: string,
    upTarget: number | null,
    downTarget: number | null,
    fans: string[],
  ) {
    if (!this.room) return nothing;
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
            ${
              // Mode chips are now driven by `view.hvacModes` instead of
              // being hardcoded Cool/Heat/Off. This lets the same drawer
              // render correctly for both kinds of climate entities the
              // house has wired up:
              //   * climate.casa_*       → off/heat/cool/fan_only (proxy)
              //   * climate.pavimento_*  → off/heat (Generic Thermostat)
              // Each chip is rendered only if the climate advertises it,
              // so the bathroom proxy doesn't get a stray "Cool" button
              // and the air-conditioning proxy can offer "Fan" without
              // pulling double-duty in pavimento rooms.
              view.hvacModes.includes("cool")
                ? html`<button
                    class="mode-btn"
                    ?data-active=${view.mode === "cool"}
                    @click=${() => this.setMode("cool")}
                  >
                    Cool
                  </button>`
                : ""
            }
            ${view.hvacModes.includes("heat")
              ? html`<button
                  class="mode-btn"
                  ?data-active=${view.mode === "heat"}
                  @click=${() => this.setMode("heat")}
                >
                  Heat
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
            ${this.roomHumidityText(view)}
          </div>
        </div>
      </div>
    `;
  }
}
