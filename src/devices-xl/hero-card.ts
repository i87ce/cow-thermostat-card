/**
 * `<cow-xl-hero>` — XL room dashboard hero (10.1" Shelly Wall Display).
 *
 * Thin wrapper around the shared `<cow-hero-engine>` (see
 * `src/shared/hero/cow-hero-engine.ts`). The engine owns every backdrop
 * layer (sky, sun, moon, stars, weather FX, pollen specks); this
 * wrapper only composes the XL-sized foreground: big clock on the
 * left, weather hero (temp + condition + feels-like + wind) on the
 * right, optional pollen line under the meteo block.
 *
 * Visual contract (per Figma):
 *
 *   ┌──────────────────────────────────────────────────────────────────┐
 *   │  22:30                                            18°            │
 *   │  Lunedì 11 maggio                            Sereno              │
 *   │                                              sens. 17° · v. 5 km/h│
 *   │                                              🌿 bassa · graminacee│
 *   └──────────────────────────────────────────────────────────────────┘
 *
 * Compact mode shrinks the clock + meteo so the hero fits when the
 * music ribbon is visible underneath. The backdrop is unchanged by
 * compact mode — only foreground typography reflows.
 */
import { LitElement, html, nothing, css } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import type { HomeAssistant } from "../types/hass.js";

import {
  getPollen,
  getSunState,
  getWeather,
  pollenLevelColor,
  translateCondition,
} from "../shared/hero/data.js";
import { nightOpacity } from "../shared/hero/sky.js";
import "../shared/hero/cow-hero-engine.js";

@customElement("cow-xl-hero")
export class CowXLHero extends LitElement {
  @property({ attribute: false }) hass?: HomeAssistant;
  @property({ type: String }) weatherEntity?: string;
  @property({ type: String }) sunEntity?: string;
  @property({ type: String }) moonEntity?: string;
  @property({ type: String }) locale?: string;

  /* ─── Pollen inputs (forwarded to the engine + read for the line) ── */
  @property({ type: String }) pollenOverall?: string;
  @property({ type: Array }) pollenAllergens?: string[];
  @property({ type: Number }) pollenMinLevel = 1;
  @property({ type: Array }) pollenPinned?: string[];
  @property({ type: Number }) pollenMaxItems = 3;

  /** Opt-in aurora overlay — forwarded to the engine. */
  @property({ type: Boolean }) aurora = false;

  /**
   * Compact mode: when the music ribbon is visible, the hero is
   * squeezed from 23 rem tall to ~17.5 rem. The clock + sun/moon
   * shrink so the sky-and-time aesthetic stays readable in less
   * vertical space.
   */
  @property({ type: Boolean, reflect: true }) compact = false;

  @state() private now = new Date();
  private timer?: number;

  static override styles = css`
    :host {
      display: block;
      width: 100%;
      height: 23rem;
      position: relative;
      transition: height 280ms ease;
    }
    :host([compact]) {
      height: 17.5rem;
    }

    /* The engine takes over the entire host — it draws the sky and
       acts as the sole positioned container for slotted children. */
    cow-hero-engine {
      width: 100%;
      height: 100%;
      border-radius: 1.5rem;
      overflow: hidden;
    }

    /* ─── Foreground (slotted into the engine) ───────────────────── */

    .clock {
      position: absolute;
      left: 4rem;
      top: 6rem;
      font-weight: 300;
      font-size: 10rem;
      line-height: 1;
      letter-spacing: -0.375rem;
      color: var(--cow-fg, var(--cow-text-primary));
      text-shadow: 0 0.125rem 0.5rem rgba(0, 0, 0, var(--cow-fg-shadow, 0));
      transition: color 4s ease, text-shadow 4s ease;
    }
    .date {
      position: absolute;
      left: 4rem;
      top: 17.75rem;
      font-weight: 500;
      font-size: 1.25rem;
      color: var(--cow-fg, var(--cow-text-primary));
      opacity: 0.78;
      transition: color 4s ease;
    }
    :host([compact]) .clock {
      font-size: 7rem;
      top: 3.5rem;
    }
    :host([compact]) .date {
      top: 12.75rem;
      font-size: 1.0625rem;
    }

    .meteo {
      position: absolute;
      right: 4rem;
      bottom: 4rem;
      text-align: right;
      width: 26rem;
      color: var(--cow-fg, var(--cow-text-primary));
      transition: color 4s ease;
    }
    .temp-big {
      font-weight: 300;
      font-size: 6rem;
      line-height: 1;
    }
    .meteo-desc {
      margin-top: 0.625rem;
      font-weight: 500;
      font-size: 1.125rem;
      opacity: 0.78;
    }
    .meteo-desc-2 {
      margin-top: 0.375rem;
      font-weight: 400;
      font-size: 0.875rem;
      opacity: 0.6;
    }
    :host([compact]) .meteo {
      bottom: 2.5rem;
      right: 3.5rem;
    }
    :host([compact]) .meteo .temp-big { font-size: 4.5rem; }
    :host([compact]) .meteo .meteo-desc { font-size: 0.9375rem; margin-top: 0.375rem; }
    /* v1.1.3: keep the humidity row visible in compact mode (was
       hidden); with pollen below it the hero felt too sparse. */
    :host([compact]) .meteo .meteo-desc-2 {
      margin-top: 0.25rem;
      font-size: 0.8125rem;
    }

    /* ─── Pollen line (under meteo-desc-2) ───────────────────────── */
    .meteo-pollen {
      margin-top: 0.375rem;
      font-weight: 600;
      font-size: 0.9375rem;
      letter-spacing: 0.0125rem;
      color: var(--cow-pollen-color, #f2c94c);
      text-shadow: 0 0.125rem 0.5rem rgba(0, 0, 0, var(--cow-fg-shadow, 0));
      display: inline-flex;
      align-items: center;
      gap: 0.375rem;
      max-width: 100%;
    }
    .meteo-pollen .pollen-icon {
      font-size: 1rem;
      line-height: 1;
    }
    .meteo-pollen .pollen-level {
      font-weight: 700;
      text-transform: capitalize;
    }
    .meteo-pollen .pollen-names {
      font-weight: 500;
      opacity: 0.9;
    }
    /* "molto alta" gets a soft pulse so it's hard to miss. */
    .meteo-pollen[data-pollen-level="4"] {
      animation: cow-pollen-pulse 2.4s ease-in-out infinite;
    }
    @keyframes cow-pollen-pulse {
      0%, 100% { opacity: 1;    }
      50%      { opacity: 0.55; }
    }
    :host([compact]) .meteo-pollen {
      font-size: 0.8125rem;
      margin-top: 0.25rem;
    }
    :host([compact]) .meteo-pollen .pollen-names {
      font-size: 0.75rem;
    }
  `;

  override connectedCallback(): void {
    super.connectedCallback();
    // Only the clock needs a wall-clock refresh in the wrapper; the
    // engine has its own 30 s tick for the sky/sun position.
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
    return new Intl.DateTimeFormat(this.locale || undefined, {
      weekday: "long",
      day: "numeric",
      month: "long",
      year: "numeric",
    }).format(this.now);
  }

  override render() {
    const w = getWeather(this.hass, this.weatherEntity);
    const tempStr = w.temp != null ? `${Math.round(w.temp)}°` : "--°";
    const descParts: string[] = [];
    if (w.desc) descParts.push(translateCondition(w.desc));
    if (w.apparent != null)
      descParts.push(`sens. ${Math.round(w.apparent)}°`);
    if (w.wind != null) descParts.push(`vento ${w.wind} km/h`);
    const desc = descParts.join("  ·  ");
    const desc2Parts: string[] = [];
    if (w.humidity != null) desc2Parts.push(`💧 ${w.humidity}%`);

    const pollen = getPollen(this.hass, {
      pollenOverall: this.pollenOverall,
      pollenAllergens: this.pollenAllergens,
      pollenMinLevel: this.pollenMinLevel,
      pollenPinned: this.pollenPinned,
      pollenMaxItems: this.pollenMaxItems,
      locale: this.locale,
    });

    // Foreground readability tokens live on the WRAPPER's :host so that
    // the slotted children — which remain in the wrapper's light DOM —
    // can inherit them. The engine handles its own backdrop tokens.
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
          ${pollen
            ? html`<div
                class="meteo-pollen"
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
        </div>
      </cow-hero-engine>
    `;
  }
}
