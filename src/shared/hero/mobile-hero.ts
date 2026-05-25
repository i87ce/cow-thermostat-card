/**
 * `<cow-mobile-hero>` — phone-sized hero for `cow-mobile-dashboard-card`.
 *
 * Thin wrapper around the shared `<cow-hero-engine>` (same engine the
 * XL dashboard uses). Owns the mobile-specific foreground layout:
 *
 *   ┌────────────────────────────────────┐
 *   │ 18:58                              │
 *   │ Lunedì 25 maggio                   │
 *   │                                    │
 *   │                            33°     │
 *   │                          Sereno    │
 *   │             percepiti 35° · 8 km/h │
 *   │             🌿 bassa · graminacee  │
 *   ├────────────────────────────────────┤
 *   │  (footer slot — alarm + presence)  │
 *   └────────────────────────────────────┘
 *
 * Foreground tokens (`--cow-fg`, `--cow-fg-shadow`, `--cow-pollen-color`)
 * are applied on the wrapper's own `:host` because slotted children
 * inherit from the wrapper's light DOM, not from the engine's shadow
 * tree.
 */
import { LitElement, html, nothing, css } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import type { HomeAssistant } from "../../types/hass.js";

import {
  getPollen,
  getSunState,
  getWeather,
  pollenLevelColor,
  translateCondition,
} from "./data.js";
import { nightOpacity } from "./sky.js";
import "./cow-hero-engine.js";

@customElement("cow-mobile-hero")
export class CowMobileHero extends LitElement {
  @property({ attribute: false }) hass?: HomeAssistant;
  @property({ type: String }) weatherEntity?: string;
  @property({ type: String }) sunEntity?: string;
  @property({ type: String }) moonEntity?: string;
  @property({ type: String }) locale?: string;

  /* ─── Pollen inputs ───────────────────────────────────────────── */
  @property({ type: String }) pollenOverall?: string;
  @property({ type: Array }) pollenAllergens?: string[];
  @property({ type: Number }) pollenMinLevel = 1;
  @property({ type: Array }) pollenPinned?: string[];
  @property({ type: Number }) pollenMaxItems = 3;

  /** Opt-in aurora overlay — forwarded to the engine. */
  @property({ type: Boolean }) aurora = false;

  @state() private now = new Date();
  private timer?: number;

  static override styles = css`
    :host {
      display: block;
      width: 100%;
      min-height: 20rem;
      position: relative;
    }

    cow-hero-engine {
      width: 100%;
      min-height: 20rem;
      border-radius: 1.375rem;
      overflow: hidden;
      display: block;
    }

    /* Layout: clock + date pinned top-left, meteo block + pollen line
       pinned right (vertically centred-ish), footer slot at the bottom
       full-width. Positions are absolute against the engine (its :host
       is position: relative). */

    .clock {
      position: absolute;
      left: 1.5rem;
      top: 1.25rem;
      font-weight: 300;
      font-size: 3.25rem;
      line-height: 1;
      letter-spacing: -0.0625rem;
      color: var(--cow-fg, var(--cow-text-primary));
      text-shadow: 0 0.0625rem 0.375rem rgba(0, 0, 0, var(--cow-fg-shadow, 0));
      transition: color 4s ease, text-shadow 4s ease;
    }
    .date {
      position: absolute;
      left: 1.5rem;
      top: 5.5rem;
      font-weight: 500;
      font-size: 0.875rem;
      color: var(--cow-fg, var(--cow-text-primary));
      opacity: 0.85;
      transition: color 4s ease;
    }

    .meteo {
      position: absolute;
      right: 1.5rem;
      top: 8rem;
      text-align: right;
      color: var(--cow-fg, var(--cow-text-primary));
      transition: color 4s ease;
      max-width: 60%;
    }
    .temp-big {
      font-weight: 300;
      font-size: 3.5rem;
      line-height: 1;
    }
    .meteo-desc {
      margin-top: 0.25rem;
      font-weight: 500;
      font-size: 0.875rem;
      opacity: 0.85;
    }
    .meteo-desc-2 {
      margin-top: 0.125rem;
      font-weight: 400;
      font-size: 0.75rem;
      opacity: 0.7;
    }

    /* Pollen line lives bottom-left so it doesn't fight the meteo
       column on narrow screens. */
    .pollen {
      position: absolute;
      left: 1.5rem;
      right: 1.5rem;
      bottom: 4.5rem;
      font-weight: 600;
      font-size: 0.8125rem;
      letter-spacing: 0.0125rem;
      color: var(--cow-pollen-color, #f2c94c);
      text-shadow: 0 0.0625rem 0.375rem rgba(0, 0, 0, var(--cow-fg-shadow, 0));
      display: inline-flex;
      align-items: center;
      gap: 0.375rem;
      max-width: calc(100% - 3rem);
    }
    .pollen .pollen-icon { font-size: 0.9375rem; line-height: 1; }
    .pollen .pollen-level { font-weight: 700; text-transform: capitalize; }
    .pollen .pollen-names { font-weight: 500; opacity: 0.9; }
    .pollen[data-pollen-level="4"] {
      animation: cow-pollen-pulse 2.4s ease-in-out infinite;
    }
    @keyframes cow-pollen-pulse {
      0%, 100% { opacity: 1;    }
      50%      { opacity: 0.55; }
    }

    /* Footer slot — pinned to the bottom of the hero. The wrapper's
       host card supplies presence chips, alarm pill, etc. */
    .footer-wrap {
      position: absolute;
      left: 1.25rem;
      right: 1.25rem;
      bottom: 1rem;
      display: flex;
      flex-direction: row;
      align-items: center;
      gap: 0.5rem;
      flex-wrap: wrap;
    }
  `;

  override connectedCallback(): void {
    super.connectedCallback();
    this.timer = window.setInterval(() => {
      this.now = new Date();
    }, 30_000);
  }
  override disconnectedCallback(): void {
    super.disconnectedCallback();
    if (this.timer) window.clearInterval(this.timer);
  }

  private fmtTime(): string {
    return new Intl.DateTimeFormat(this.locale || undefined, {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(this.now);
  }

  private fmtDate(): string {
    return new Intl.DateTimeFormat(this.locale || "it-IT", {
      weekday: "long",
      day: "numeric",
      month: "long",
    }).format(this.now);
  }

  override render() {
    const w = getWeather(this.hass, this.weatherEntity);
    const tempStr = w.temp != null ? `${Math.round(w.temp)}°` : "--°";
    const descParts: string[] = [];
    if (w.desc) descParts.push(translateCondition(w.desc));
    const desc = descParts.join("  ·  ");
    const desc2Parts: string[] = [];
    if (w.apparent != null) desc2Parts.push(`percepiti ${Math.round(w.apparent)}°`);
    if (w.wind != null) desc2Parts.push(`💨 ${w.wind} km/h`);

    const pollen = getPollen(this.hass, {
      pollenOverall: this.pollenOverall,
      pollenAllergens: this.pollenAllergens,
      pollenMinLevel: this.pollenMinLevel,
      pollenPinned: this.pollenPinned,
      pollenMaxItems: this.pollenMaxItems,
      locale: this.locale,
    });

    const sun = getSunState(this.hass, this.sunEntity);
    const nightT = nightOpacity(sun.elevation);
    const fgColor =
      nightT > 0.5 ? `rgba(245, 245, 250, 0.92)` : `var(--cow-text-primary)`;
    const fgShadow = nightT > 0.5 ? 0.35 : 0;
    const pollenColor = pollen ? pollenLevelColor(pollen.level) : null;

    return html`
      <style>
        :host {
          --cow-fg: ${fgColor};
          --cow-fg-shadow: ${fgShadow};
          ${pollenColor ? `--cow-pollen-color: ${pollenColor};` : ""}
        }
      </style>
      <cow-hero-engine
        .hass=${this.hass}
        .weatherEntity=${this.weatherEntity}
        .sunEntity=${this.sunEntity}
        .moonEntity=${this.moonEntity}
        .locale=${this.locale}
        .pollenOverall=${this.pollenOverall}
        .pollenAllergens=${this.pollenAllergens}
        .pollenMinLevel=${this.pollenMinLevel}
        .pollenPinned=${this.pollenPinned}
        .pollenMaxItems=${this.pollenMaxItems}
        .aurora=${this.aurora}
      >
        <div slot="content" class="clock">${this.fmtTime()}</div>
        <div slot="content" class="date">${this.fmtDate()}</div>
        <div slot="content" class="meteo">
          <div class="temp-big">${tempStr}</div>
          ${desc ? html`<div class="meteo-desc">${desc}</div>` : nothing}
          ${desc2Parts.length > 0
            ? html`<div class="meteo-desc-2">${desc2Parts.join("  ·  ")}</div>`
            : nothing}
        </div>
        ${pollen
          ? html`<div
              slot="content"
              class="pollen"
              data-pollen-level=${String(pollen.level)}
            >
              <span class="pollen-icon">🌿</span>
              <span class="pollen-level">${pollen.levelName}</span>
              ${pollen.items.length > 0
                ? html`<span class="pollen-names">
                    · ${pollen.items.map((it) => it.name.toLowerCase()).join(", ")}
                  </span>`
                : nothing}
            </div>`
          : nothing}
        <div slot="footer" class="footer-wrap">
          <slot name="footer"></slot>
        </div>
      </cow-hero-engine>
    `;
  }
}
