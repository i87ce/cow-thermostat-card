import { LitElement, html, css, nothing } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import type { HomeAssistant } from "../types/hass.js";

/**
 * XL hero card: gradient sky-to-peach, big sun glow on the right, clock+date
 * on the left, weather hero (temp + description) on the right.
 *
 * Position absolute inside its parent. Width 1232px / height 380px in design
 * coords (corresponds to 77rem × 23.75rem with our 1rem = 16px scaling).
 */
@customElement("cow-xl-hero")
export class CowXLHero extends LitElement {
  @property({ attribute: false }) hass?: HomeAssistant;
  @property({ type: String }) weatherEntity?: string;
  @property({ type: String }) locale?: string;

  @state() private now = new Date();
  private timer?: number;

  static override styles = css`
    :host {
      display: block;
      width: 100%;
      height: 23rem;
      position: relative;
      border-radius: 1.5rem;
      overflow: hidden;
      background: linear-gradient(
        90deg,
        #cfe6ff 0%,
        #ffe4c2 55%,
        #ffc58a 100%
      );
    }
    /* Soft sun glow contained on the right side, doesn't bleed over text */
    .sun-glow {
      position: absolute;
      right: 4rem;
      top: 1rem;
      width: 18rem;
      height: 18rem;
      border-radius: 50%;
      background: radial-gradient(
        circle at center,
        rgba(255, 225, 122, 0.95) 0%,
        rgba(255, 200, 58, 0.55) 45%,
        rgba(255, 200, 58, 0) 100%
      );
      pointer-events: none;
    }
    .sun-core {
      position: absolute;
      right: 7rem;
      top: 4rem;
      width: 7rem;
      height: 7rem;
      border-radius: 50%;
      background: #ffd55a;
      box-shadow: inset 0 -0.375rem 1.125rem rgba(255, 255, 255, 0.55);
      pointer-events: none;
    }
    .horizon {
      position: absolute;
      left: 0;
      right: 0;
      bottom: 0;
      height: 5rem;
      background: linear-gradient(
        180deg,
        rgba(31, 31, 46, 0) 0%,
        rgba(31, 31, 46, 0.16) 100%
      );
      pointer-events: none;
    }
    .clock {
      position: absolute;
      left: 4rem;
      top: 6rem;
      font-weight: 300;
      font-size: 10rem;
      line-height: 1;
      color: var(--cow-text-primary);
      letter-spacing: -0.375rem;
    }
    .date {
      position: absolute;
      left: 4rem;
      top: 17.75rem;
      font-weight: 500;
      font-size: 1.25rem;
      color: var(--cow-text-primary);
      opacity: 0.75;
    }
    .meteo {
      position: absolute;
      right: 4rem;
      bottom: 4rem;
      text-align: right;
      width: 26rem;
    }
    .temp-big {
      font-weight: 300;
      font-size: 6rem;
      line-height: 1;
      color: var(--cow-text-primary);
    }
    .meteo-desc {
      margin-top: 0.625rem;
      font-weight: 500;
      font-size: 1.125rem;
      color: var(--cow-text-primary);
      opacity: 0.7;
    }
    .meteo-desc-2 {
      margin-top: 0.375rem;
      font-weight: 400;
      font-size: 0.875rem;
      color: var(--cow-text-primary);
      opacity: 0.55;
    }
  `;

  override connectedCallback(): void {
    super.connectedCallback();
    this.timer = window.setInterval(() => (this.now = new Date()), 30_000);
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

  private getWeather(): {
    temp?: number;
    desc?: string;
    apparent?: number;
    wind?: number;
    humidity?: number;
  } {
    if (!this.weatherEntity || !this.hass) return {};
    const e = this.hass.states[this.weatherEntity];
    if (!e) return {};
    const a = e.attributes as Record<string, unknown>;
    return {
      temp: typeof a.temperature === "number" ? a.temperature : undefined,
      desc: typeof e.state === "string" ? e.state : undefined,
      apparent:
        typeof a.apparent_temperature === "number"
          ? a.apparent_temperature
          : undefined,
      wind:
        typeof a.wind_speed === "number" ? Math.round(a.wind_speed) : undefined,
      humidity:
        typeof a.humidity === "number" ? Math.round(a.humidity) : undefined,
    };
  }

  override render() {
    const w = this.getWeather();
    const tempStr = w.temp != null ? `${Math.round(w.temp)}°` : "--°";
    const descParts: string[] = [];
    if (w.desc) descParts.push(this.translateCondition(w.desc));
    if (w.apparent != null)
      descParts.push(`sens. ${Math.round(w.apparent)}°`);
    if (w.wind != null) descParts.push(`vento ${w.wind} km/h`);
    const desc = descParts.join("  ·  ");
    const desc2Parts: string[] = [];
    if (w.humidity != null) desc2Parts.push(`💧 ${w.humidity}%`);
    return html`
      <div class="sun-glow"></div>
      <div class="sun-core"></div>
      <div class="horizon"></div>
      <div class="clock">${this.fmtTime()}</div>
      <div class="date">${this.fmtDate()}</div>
      <div class="meteo">
        <div class="temp-big">${tempStr}</div>
        ${desc ? html`<div class="meteo-desc">${desc}</div>` : nothing}
        ${desc2Parts.length > 0
          ? html`<div class="meteo-desc-2">${desc2Parts.join("  ·  ")}</div>`
          : nothing}
      </div>
    `;
  }

  private translateCondition(state: string): string {
    const map: Record<string, string> = {
      sunny: "Sereno",
      clear: "Sereno",
      "clear-night": "Notte serena",
      cloudy: "Nuvoloso",
      partlycloudy: "Parzialmente nuvoloso",
      fog: "Nebbia",
      rainy: "Pioggia",
      pouring: "Pioggia battente",
      snowy: "Neve",
      windy: "Ventoso",
      "windy-variant": "Ventoso",
      hail: "Grandine",
      lightning: "Temporale",
      "lightning-rainy": "Temporale",
      exceptional: "Eccezionale",
    };
    return map[state] ?? state;
  }
}
