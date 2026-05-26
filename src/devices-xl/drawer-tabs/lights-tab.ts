import { LitElement, html, css, nothing } from "lit";
import { customElement, property } from "lit/decorators.js";
import type { HomeAssistant, HassEntity } from "../../types/hass.js";
import type { CowRoomConfig } from "../../config-xl.js";
import { buttonReset } from "../../styles/button-reset.js";
import {
  deriveLightsView,
  brightnessFromPct,
} from "../../small/state/lights.js";
import { deriveThermostatView } from "../../small/state/thermostat.js";
import "../../small/visuals/bulb-visual.js";

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
        top: 2.25rem;
        bottom: 5rem; /* leave 80px for the actions bar (h 3.5rem + bottom 1rem + gap 0.5rem) */
        display: flex;
        gap: 1rem;
        overflow-x: auto;
        scrollbar-width: none;
      }
      .row::-webkit-scrollbar { display: none; }
      .climate-mini {
        flex: 0 0 17.5rem;
        align-self: stretch;
        background: linear-gradient(
          150deg,
          var(--cow-thermostat-orange) 0%,
          var(--cow-thermostat-orange-dark, #e55a1f) 100%
        );
        border-radius: 1.25rem;
        padding: 1.25rem 1.25rem 1.125rem;
        color: var(--cow-surface-white);
        display: grid;
        grid-template-rows: auto 1fr auto;
        row-gap: 0.5rem;
        position: relative;
        box-shadow: inset 0 0 0 0.0625rem rgba(255, 255, 255, 0.08);
      }
      .cm-top {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 0.5rem;
      }
      .cm-icon {
        font-size: 1.5rem;
        line-height: 1;
      }
      .cm-label {
        font-weight: 700;
        font-size: 0.75rem;
        letter-spacing: 0.075rem;
        text-transform: uppercase;
        opacity: 0.85;
      }
      .cm-mid {
        align-self: center;
        display: flex;
        align-items: baseline;
        gap: 0.25rem;
      }
      .cm-temp {
        font-weight: 300;
        font-size: 4.25rem;
        line-height: 1;
        font-variant-numeric: tabular-nums;
      }
      .cm-target {
        font-weight: 500;
        font-size: 0.9375rem;
        opacity: 0.9;
      }
      .cm-bot {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 0.5rem;
        font-weight: 500;
        font-size: 0.8125rem;
        opacity: 0.85;
      }
      .cm-humidity {
        display: inline-flex;
        align-items: center;
        gap: 0.25rem;
      }

      .light-tile {
        flex: 0 0 17rem;
        align-self: stretch;
        background: var(--cow-surface-white);
        border: 0.0625rem solid var(--cow-surface-border);
        border-radius: 1.25rem;
        padding: 1rem 1.25rem 1rem;
        display: grid;
        grid-template-rows: auto auto auto 1fr auto;
        row-gap: 0.25rem;
        justify-items: center;
        position: relative;
        cursor: pointer;
        transition:
          background 160ms ease,
          border-color 160ms ease,
          transform 120ms ease,
          box-shadow 160ms ease;
        -webkit-tap-highlight-color: transparent;
      }
      .light-tile:hover {
        box-shadow: 0 0.125rem 0.5rem rgba(31, 31, 46, 0.06);
      }
      .light-tile:active {
        transform: scale(0.985);
      }
      .light-tile[data-on] {
        background: var(--cow-lights-glow-bg, #fff8e0);
        border-color: var(--cow-lights-yellow, #ffc72e);
      }
      .lt-bulb {
        width: 5.5rem;
        height: 5.5rem;
        --cow-accent-light: var(--cow-lights-bright, #ffd966);
        --cow-accent: var(--cow-lights-bright, #ffc72e);
      }
      .lt-label {
        font-weight: 700;
        font-size: 0.75rem;
        letter-spacing: 0.075rem;
        text-transform: uppercase;
        color: var(--cow-text-secondary);
        text-align: center;
        max-width: 100%;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      .lt-value {
        font-weight: 300;
        font-size: 2rem;
        line-height: 1;
        color: var(--cow-text-primary);
        font-variant-numeric: tabular-nums;
      }
      .lt-controls {
        align-self: end;
        width: 100%;
        display: flex;
        align-items: center;
        gap: 0.5rem;
      }
      /* Non-dimmable bulbs only render the on/off switch — center it so
         the lone control sits visually balanced where the slider used
         to be, instead of floating against the right edge. */
      .lt-controls.toggle-only {
        justify-content: center;
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
        width: 2rem;
        height: 2rem;
        border-radius: 1rem;
        background: var(--cow-surface-button-bg);
        color: var(--cow-text-primary);
        font-size: 1rem;
        font-weight: 600;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
        flex: 0 0 auto;
      }
      .lt-power {
        flex: 0 0 auto;
        width: 3rem;
        height: 1.75rem;
        border-radius: 0.875rem;
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
        width: 1.375rem;
        height: 1.375rem;
        border-radius: 50%;
        background: var(--cow-surface-white);
        transition: transform 160ms ease;
        box-shadow: 0 0.0625rem 0.1875rem rgba(0, 0, 0, 0.15);
      }
      .lt-power[data-on]::after {
        transform: translateX(1.25rem);
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

  /** Climate mini tile inside Lights tab.
   *
   * Renders ONLY when the room has a real climate entity (full thermostat
   * mini). When the room only has ambient sensors we skip the tile here —
   * the temperature/humidity is shown in the drawer header chip instead,
   * and the dedicated Climate tab handles the monitoring view. */
  private renderClimateMini() {
    if (!this.room) return nothing;

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
      const tgt = view.target != null ? `${Math.round(view.target)}°C` : null;
      return html`
        <div class="climate-mini" role="group" aria-label="Termostato stanza">
          <div class="cm-top">
            <span class="cm-icon">${icon}</span>
            <span class="cm-label">${variantLabel}</span>
          </div>
          <div class="cm-mid">
            <span class="cm-temp">${cur}</span>
            ${tgt ? html`<span class="cm-target">→ ${tgt}</span>` : nothing}
          </div>
          <div class="cm-bot">
            <span>Fan ${view.fan}</span>
            ${view.humidity != null
              ? html`<span class="cm-humidity">💧 ${Math.round(view.humidity)}%</span>`
              : html`<span></span>`}
          </div>
        </div>
      `;
    }

    return nothing;
  }

  private renderLightTile(id: string, label: string) {
    const entity: HassEntity | undefined = this.hass?.states?.[id];
    const view = deriveLightsView(entity);
    const on = view.variant !== "off";
    // On/off-only bulbs report `dimmable=false` (see `isDimmable` in
    // small/state/lights.ts). For them we must not display a percentage
    // (HA would silently ignore any `brightness:` we send) and we hide
    // the −/slider/+ row entirely so the user isn't offered a control
    // that does nothing. The on/off toggle remains, centered.
    const dimmable = view.dimmable;
    const valueText = on ? (dimmable ? `${view.brightnessPct}%` : "ON") : "OFF";
    // Inner controls swallow the click so they don't trigger the tile-level
    // toggle. Without this, dragging the slider or tapping +/− would also
    // flip the light on/off, which is a confusing double-effect.
    const stop = (e: Event) => e.stopPropagation();
    return html`
      <div
        class="light-tile"
        ?data-on=${on}
        @click=${() => this.toggleLight(id)}
        role="button"
        tabindex="0"
        aria-pressed=${on ? "true" : "false"}
        aria-label="${label} ${on ? "accesa" : "spenta"} — tap per ${on ? "spegnere" : "accendere"}"
        @keydown=${(e: KeyboardEvent) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            this.toggleLight(id);
          }
        }}
      >
        <cow-bulb-visual
          class="lt-bulb"
          .variant=${view.variant}
          .brightnessPct=${view.brightnessPct}
        ></cow-bulb-visual>
        <div class="lt-label">${label}</div>
        <div class="lt-value">${valueText}</div>
        <div></div>
        <div
          class="lt-controls ${dimmable ? "" : "toggle-only"}"
          @click=${stop}
          @pointerdown=${stop}
        >
          ${dimmable
            ? html`
                <button
                  class="lt-btn"
                  @click=${(e: Event) => {
                    stop(e);
                    this.bumpBrightness(id, -10);
                  }}
                  aria-label="Diminuisci luminosità"
                >
                  −
                </button>
                <div
                  class="lt-slider"
                  @pointerdown=${(e: PointerEvent) => {
                    stop(e);
                    this.onSliderTap(e, id);
                  }}
                  role="slider"
                  aria-valuemin="0"
                  aria-valuemax="100"
                  aria-valuenow=${view.brightnessPct}
                >
                  <div class="fill" style="width: ${view.brightnessPct}%"></div>
                </div>
                <button
                  class="lt-btn"
                  @click=${(e: Event) => {
                    stop(e);
                    this.bumpBrightness(id, 10);
                  }}
                  aria-label="Aumenta luminosità"
                >
                  +
                </button>
              `
            : nothing}
          <div
            class="lt-power"
            ?data-on=${on}
            @click=${(e: Event) => {
              stop(e);
              this.toggleLight(id);
            }}
            role="switch"
            aria-checked=${on ? "true" : "false"}
            aria-label="${label} on/off"
          ></div>
        </div>
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
