import { LitElement, html, css, nothing } from "lit";
import { customElement, property } from "lit/decorators.js";
import type { HomeAssistant, HassEntity } from "../../types/hass.js";
import type { CowRoomConfig } from "../../config-xl.js";
import { buttonReset } from "../../styles/button-reset.js";
import {
  deriveLightsView,
  brightnessFromPct,
} from "../../state/lights-state.js";
import { deriveThermostatView } from "../../state/thermostat-state.js";
import "../../visuals/bulb-visual.js";

/**
 * Lights tab — replicates Figma "11. Mix — Drawer Open" body content.
 *
 * Layout (within drawer body, parent is 80rem wide, body starts at top=12rem):
 *   - Section caption "LUCI — N IN STANZA" at top
 *   - climate-mini tile (280×320) on the left, sticky for the room context
 *   - N light tiles (296×320) to the right, gap 16
 *   - Bottom action bar with "Tutte ON" / "Tutte OFF" full-width buttons
 */
@customElement("cow-xl-lights-tab")
export class CowXLLightsTab extends LitElement {
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
        top: 0.5rem; /* drawer body starts at y=192, caption at y=200 */
        font-weight: 700;
        font-size: 0.8125rem;
        letter-spacing: 0.075rem;
        color: var(--cow-text-secondary);
        text-transform: uppercase;
      }
      .row {
        position: absolute;
        left: 2rem;
        right: 2rem;
        top: 2.5rem; /* y=232/16 - body offset (12rem) */
        height: 20rem;
        display: flex;
        gap: 1rem;
        overflow-x: auto;
        scrollbar-width: none;
      }
      .row::-webkit-scrollbar { display: none; }
      .climate-mini {
        flex: 0 0 17.5rem; /* 280/16 */
        height: 100%;
        background: linear-gradient(
          150deg,
          var(--cow-thermostat-orange) 0%,
          var(--cow-thermostat-orange-dark, #e55a1f) 100%
        );
        border-radius: 1.25rem;
        padding: 1.5rem;
        color: var(--cow-surface-white);
        display: flex;
        flex-direction: column;
        gap: 0;
        position: relative;
        box-shadow: inset 0 0 0 0.0625rem rgba(255, 255, 255, 0.08);
      }
      .cm-icon {
        font-size: 1.75rem;
        line-height: 1;
      }
      .cm-spacer { flex: 1; }
      .cm-label {
        font-weight: 700;
        font-size: 0.8125rem;
        letter-spacing: 0.05rem;
        text-transform: uppercase;
        opacity: 0.8;
      }
      .cm-temp {
        font-weight: 300;
        font-size: 6rem;
        line-height: 1;
        margin-top: 0.5rem;
      }
      .cm-target {
        margin-top: 0.5rem;
        font-weight: 500;
        font-size: 1rem;
        opacity: 0.9;
      }
      .cm-humidity {
        margin-top: 0.25rem;
        font-weight: 400;
        font-size: 0.875rem;
        opacity: 0.75;
      }

      .light-tile {
        flex: 0 0 18.5rem; /* 296/16 */
        height: 100%;
        background: var(--cow-surface-white);
        border: 0.0625rem solid var(--cow-surface-border);
        border-radius: 1.25rem;
        padding: 1.5rem 1.5rem 1rem;
        display: flex;
        flex-direction: column;
        align-items: center;
        position: relative;
      }
      .light-tile[data-on] {
        background: var(--cow-lights-glow-bg, #fff8e0);
        border-color: var(--cow-lights-yellow, #ffc72e);
      }
      .lt-bulb {
        width: 7.5rem;
        height: 7.5rem;
        flex: 0 0 auto;
      }
      .lt-label {
        margin-top: 0.5rem;
        font-weight: 700;
        font-size: 0.8125rem;
        letter-spacing: 0.075rem;
        text-transform: uppercase;
        color: var(--cow-text-secondary);
      }
      .lt-value {
        margin-top: 0.125rem;
        font-weight: 300;
        font-size: 3rem;
        line-height: 1;
        color: var(--cow-text-primary);
        font-variant-numeric: tabular-nums;
      }
      .lt-spacer { flex: 1; }
      .lt-controls {
        margin-top: 0.5rem;
        width: 100%;
        display: flex;
        align-items: center;
        gap: 0.625rem;
      }
      .lt-slider {
        flex: 1;
        height: 0.375rem;
        background: var(--cow-surface-button-bg);
        border-radius: 0.1875rem;
        position: relative;
        cursor: pointer;
      }
      .lt-slider .fill {
        position: absolute;
        left: 0;
        top: 0;
        bottom: 0;
        background: var(--cow-lights-yellow, #ffc72e);
        border-radius: 0.1875rem;
        transition: width 160ms ease;
      }
      .lt-btn {
        width: 2.25rem;
        height: 2.25rem;
        border-radius: 1.125rem;
        background: var(--cow-surface-button-bg);
        color: var(--cow-text-primary);
        font-size: 1.125rem;
        font-weight: 600;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
      }
      .lt-power {
        margin-top: 0.625rem;
        width: 3.5rem;
        height: 2rem;
        border-radius: 1rem;
        background: var(--cow-surface-button-bg);
        position: relative;
        cursor: pointer;
        transition: background 160ms ease;
      }
      .lt-power[data-on] {
        background: var(--cow-lights-yellow, #ffc72e);
      }
      .lt-power::after {
        content: "";
        position: absolute;
        top: 0.1875rem;
        left: 0.1875rem;
        width: 1.625rem;
        height: 1.625rem;
        border-radius: 50%;
        background: var(--cow-surface-white);
        transition: transform 160ms ease;
        box-shadow: 0 0.0625rem 0.1875rem rgba(0, 0, 0, 0.15);
      }
      .lt-power[data-on]::after {
        transform: translateX(1.5rem);
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
        cursor: pointer;
        transition:
          background 160ms ease,
          color 160ms ease;
      }
      .act-on {
        background: var(--cow-lights-yellow, #ffc72e);
        color: var(--cow-text-primary);
      }
      .act-off {
        background: var(--cow-text-primary);
        color: var(--cow-surface-white);
      }
    `,
  ];

  private getLightIds(): string[] {
    if (!this.room?.light) return [];
    return Array.isArray(this.room.light)
      ? this.room.light
      : [this.room.light];
  }

  private getLightLabels(): string[] {
    const ids = this.getLightIds();
    const labels = this.room?.light_labels ?? [];
    return ids.map((id, i) => {
      const lbl = labels[i];
      if (lbl) return lbl;
      const friendly = this.hass?.states?.[id]?.attributes?.friendly_name;
      if (typeof friendly === "string" && friendly.length > 0) return friendly;
      return id.split(".")[1] ?? id;
    });
  }

  private async toggleLight(id: string) {
    if (!this.hass) return;
    const s = this.hass.states[id];
    const isOn = s?.state === "on";
    await this.hass.callService("light", isOn ? "turn_off" : "turn_on", {
      entity_id: id,
    });
  }

  private async setBrightness(id: string, pct: number) {
    if (!this.hass) return;
    const clamped = Math.max(0, Math.min(100, pct));
    if (clamped === 0) {
      await this.hass.callService("light", "turn_off", { entity_id: id });
      return;
    }
    await this.hass.callService("light", "turn_on", {
      entity_id: id,
      brightness: brightnessFromPct(clamped),
    });
  }

  private async bumpBrightness(id: string, delta: number) {
    const view = deriveLightsView(this.hass?.states?.[id]);
    const next = view.brightnessPct + delta;
    await this.setBrightness(id, next);
  }

  private onSliderTap = (e: PointerEvent, id: string) => {
    const target = e.currentTarget as HTMLElement;
    const rect = target.getBoundingClientRect();
    const pct = Math.round(((e.clientX - rect.left) / rect.width) * 100);
    void this.setBrightness(id, pct);
  };

  private async masterAction(turnOn: boolean) {
    if (!this.hass) return;
    const ids = this.getLightIds();
    if (ids.length === 0) return;
    await this.hass.callService(
      "light",
      turnOn ? "turn_on" : "turn_off",
      { entity_id: ids },
    );
  }

  private renderClimateMini() {
    if (!this.room) return nothing;

    // === Climate entity present → full thermostat mini ===
    if (this.room.climate) {
      const climate = this.hass?.states?.[this.room.climate];
      const view = deriveThermostatView(climate);
      const variantLabel =
        view.variant === "heating"
          ? "HEATING"
          : view.variant === "cooling"
            ? "COOLING"
            : view.variant === "off"
              ? "OFF"
              : "IDLE";
      const icon =
        view.variant === "heating"
          ? "🔥"
          : view.variant === "cooling"
            ? "❄"
            : view.variant === "off"
              ? "○"
              : "⚖";
      const cur = view.current != null ? `${Math.round(view.current)}°` : "—";
      const tgt = view.target != null ? `${Math.round(view.target)}°C` : "—";
      return html`
        <div class="climate-mini" role="group" aria-label="Termostato stanza">
          <div class="cm-icon">${icon}</div>
          <div class="cm-spacer"></div>
          <div class="cm-label">${variantLabel}</div>
          <div class="cm-temp">${cur}</div>
          <div class="cm-target">→ ${tgt} · Fan ${view.fan}</div>
          ${view.humidity != null
            ? html`<div class="cm-humidity">💧 ${Math.round(view.humidity)}% umidità</div>`
            : nothing}
        </div>
      `;
    }

    // === Sensors-only fallback (sky-blue, no setpoint) ===
    if (this.room.temperature || this.room.humidity) {
      const states = this.hass?.states ?? {};
      const tempEl = this.room.temperature
        ? states[this.room.temperature]
        : undefined;
      const humEl = this.room.humidity ? states[this.room.humidity] : undefined;
      const tempVal = tempEl ? parseFloat(tempEl.state) : NaN;
      const humVal = humEl ? parseFloat(humEl.state) : NaN;
      const tempStr = Number.isFinite(tempVal)
        ? `${Math.round(tempVal * 10) / 10}°`
        : "—";
      return html`
        <div
          class="climate-mini"
          role="group"
          aria-label="Sensori ambiente stanza"
          style="background: linear-gradient(150deg, #6da3d6 0%, #4f8cc7 100%);"
        >
          <div class="cm-icon">🌡</div>
          <div class="cm-spacer"></div>
          <div class="cm-label">AMBIENTE</div>
          <div class="cm-temp">${tempStr}</div>
          <div class="cm-target">
            ${Number.isFinite(humVal)
              ? `💧 ${Math.round(humVal)}% umidità`
              : "Solo monitoraggio"}
          </div>
          <div class="cm-humidity">Nessun termostato in stanza</div>
        </div>
      `;
    }

    // No climate, no sensors → don't render the tile (more room for lights)
    return nothing;
  }

  private renderLightTile(id: string, label: string) {
    const entity: HassEntity | undefined = this.hass?.states?.[id];
    const view = deriveLightsView(entity);
    const on = view.variant !== "off";
    const valueText = on ? `${view.brightnessPct}%` : "OFF";
    return html`
      <div class="light-tile" ?data-on=${on}>
        <cow-bulb-visual
          class="lt-bulb"
          .variant=${view.variant}
          .brightnessPct=${view.brightnessPct}
        ></cow-bulb-visual>
        <div class="lt-label">${label}</div>
        <div class="lt-value">${valueText}</div>
        <div class="lt-spacer"></div>
        <div class="lt-controls">
          <button
            class="lt-btn"
            @click=${() => this.bumpBrightness(id, -10)}
            aria-label="Diminuisci luminosità"
          >
            −
          </button>
          <div
            class="lt-slider"
            @pointerdown=${(e: PointerEvent) => this.onSliderTap(e, id)}
            role="slider"
            aria-valuemin="0"
            aria-valuemax="100"
            aria-valuenow=${view.brightnessPct}
          >
            <div class="fill" style="width: ${view.brightnessPct}%"></div>
          </div>
          <button
            class="lt-btn"
            @click=${() => this.bumpBrightness(id, 10)}
            aria-label="Aumenta luminosità"
          >
            +
          </button>
        </div>
        <div
          class="lt-power"
          ?data-on=${on}
          @click=${() => this.toggleLight(id)}
          role="switch"
          aria-checked=${on ? "true" : "false"}
          aria-label="${label} on/off"
        ></div>
      </div>
    `;
  }

  override render() {
    if (!this.room) return nothing;
    const ids = this.getLightIds();
    const labels = this.getLightLabels();
    const captionN = ids.length;
    return html`
      <div class="caption">LUCI — ${captionN} IN STANZA</div>
      <div class="row">
        ${this.renderClimateMini()}
        ${ids.map((id, i) => this.renderLightTile(id, labels[i] ?? id))}
      </div>
      <div class="actions">
        <button class="act act-on" @click=${() => this.masterAction(true)}>
          Tutte ON
        </button>
        <button class="act act-off" @click=${() => this.masterAction(false)}>
          Tutte OFF
        </button>
      </div>
    `;
  }
}
