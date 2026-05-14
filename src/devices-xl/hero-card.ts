/**
 * XL hero card — the big sky panel below the room chips.
 *
 * What it shows (left to right): a giant clock + localized long date on
 * the left, and a weather hero (big temperature, condition + feels-like
 * + wind, then humidity row) on the right.
 *
 * What's new in v0.7.x (the "live sky" upgrade):
 *
 *   ┌─ Sky ───────────────────────────────────────────────────────────
 *   │ Background gradient is computed live from `sun.sun.elevation`
 *   │ through six hand-tuned keyframes (deep-night → astronomical
 *   │ twilight → civil twilight → sunrise/sunset → golden hour → day).
 *   │ Re-evaluated every 30 s.
 *   │
 *   ├─ Celestial body ───────────────────────────────────────────────
 *   │ When the sun is up (elevation > -2°), an animated sun arcs across
 *   │ the sky following live elevation+azimuth from `sun.sun`. When the
 *   │ sun is down, a moon takes over, drawn with the right phase from
 *   │ `sensor.moon` (8 states, twin-circle clip technique).
 *   │ Cross-fade between sun/moon is opacity-based, no flicker.
 *   │
 *   ├─ Stars ────────────────────────────────────────────────────────
 *   │ ~60 deterministic stars positioned via a seeded LCG so they don't
 *   │ jump around on re-render. They twinkle with staggered delays and
 *   │ fade in as the sun drops below 3°.
 *   │
 *   └─ Weather FX ──────────────────────────────────────────────────
 *     Clouds drift, rain falls, snow flakes drift, fog washes the
 *     horizon, lightning flashes. Driven off the `weather.*` state
 *     string. All transforms/opacity only — no `filter: blur()` so
 *     the MTK6580 GPU in the Shelly Wall Display stays cool.
 *
 * Performance budget: hero re-renders only when `hass` updates or the
 * 30 s tick fires; everything else (sun pulse, cloud drift, rain, snow,
 * twinkle, lightning flash) is pure CSS keyframes running on the GPU.
 */
import { LitElement, html, nothing, css } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import type { HomeAssistant } from "../types/hass.js";

import {
  skyPaletteFor,
  skyGradient,
  rgb,
  nightOpacity,
  generateStars,
} from "./hero/sky.js";
import {
  sunSvg,
  moonSvg,
  sunPosition,
  moonPosition,
  type MoonPhase,
} from "./hero/celestial.js";
import { weatherFx, cloudCoverageFor } from "./hero/weather-fx.js";
import { pollenFx } from "./hero/pollen-fx.js";

const MOON_PHASES: ReadonlySet<MoonPhase> = new Set([
  "new_moon",
  "waxing_crescent",
  "first_quarter",
  "waxing_gibbous",
  "full_moon",
  "waning_gibbous",
  "last_quarter",
  "waning_crescent",
]);

// Pre-compute the star field once per module load — same seed gives the
// same constellation everywhere, which is what we want.
const STARS = generateStars(60);

@customElement("cow-xl-hero")
export class CowXLHero extends LitElement {
  @property({ attribute: false }) hass?: HomeAssistant;
  @property({ type: String }) weatherEntity?: string;
  /** sun.sun (built-in HA entity) — drives sky color + sun position */
  @property({ type: String }) sunEntity?: string;
  /** sensor.moon — drives moon phase (requires `moon:` integration) */
  @property({ type: String }) moonEntity?: string;
  @property({ type: String }) locale?: string;

  /* ─── Pollen inputs (all optional) ────────────────────────────── */

  /** Overall allergy-risk sensor (e.g. `sensor.polleninformation_*_allergy_risk`). */
  @property({ type: String }) pollenOverall?: string;
  /** Per-allergen pollen sensors. */
  @property({ type: Array }) pollenAllergens?: string[];
  /** Minimum `numeric_state` to surface an allergen in the inline list. */
  @property({ type: Number }) pollenMinLevel = 1;
  /** Allergens to always include in the list, regardless of level. */
  @property({ type: Array }) pollenPinned?: string[];
  /** Max number of allergens listed inline. */
  @property({ type: Number }) pollenMaxItems = 3;
  /**
   * Compact mode: when the music ribbon is visible, the hero is squeezed
   * from 23rem tall to ~17.5rem. The clock + sun/moon shrink so the
   * sky-and-time aesthetic stays readable in less vertical space.
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
      border-radius: 1.5rem;
      overflow: hidden;
      /* fallback gradient if sun entity is missing */
      background: var(
        --cow-sky,
        linear-gradient(180deg, #87ceeb 0%, #b8dff5 55%, #fff4d6 100%)
      );
      transition: background 4s ease, height 280ms ease;
      color: var(--cow-text-primary);
    }
    :host([compact]) {
      height: 17.5rem;
    }
    :host([compact]) .clock {
      font-size: 7rem;
      top: 3.5rem;
    }
    :host([compact]) .date {
      top: 12.75rem;
      font-size: 1.0625rem;
    }
    :host([compact]) .meteo {
      bottom: 2.5rem;
      right: 3.5rem;
    }
    :host([compact]) .meteo .temp-big { font-size: 4.5rem; }
    :host([compact]) .meteo .meteo-desc { font-size: 0.9375rem; margin-top: 0.375rem; }
    :host([compact]) .meteo .meteo-desc-2 { display: none; }
    :host([compact]) .celestial {
      width: 14rem;
      height: 14rem;
    }

    /* ─── Sky layers ─────────────────────────────────────────────── */

    .horizon-haze {
      position: absolute;
      left: 0;
      right: 0;
      bottom: 0;
      height: 7rem;
      background: linear-gradient(
        180deg,
        rgba(0, 0, 0, 0) 0%,
        var(--cow-horizon-haze, rgba(255, 200, 130, 0.18)) 100%
      );
      pointer-events: none;
    }

    .stars {
      position: absolute;
      inset: 0;
      opacity: var(--cow-night-opacity, 0);
      transition: opacity 4s ease;
      pointer-events: none;
    }
    .star {
      position: absolute;
      width: var(--s, 2px);
      height: var(--s, 2px);
      background: white;
      border-radius: 50%;
      box-shadow: 0 0 0.5rem rgba(255, 255, 255, 0.6);
      animation: cow-twinkle 3.6s ease-in-out infinite;
      animation-delay: var(--d, 0s);
      will-change: opacity;
    }

    @keyframes cow-twinkle {
      0%, 100% { opacity: var(--brightness, 0.8); }
      50%      { opacity: calc(var(--brightness, 0.8) * 0.35); }
    }

    /* ─── Celestial body (sun or moon) ───────────────────────────── */

    .celestial {
      position: absolute;
      width: 22rem;
      height: 22rem;
      transform: translate(-50%, -50%);
      transition: left 30s linear, top 30s linear, opacity 4s ease;
      pointer-events: none;
      will-change: opacity, transform;
    }
    .celestial-svg {
      width: 100%;
      height: 100%;
      display: block;
    }

    .sun-glow {
      transform-origin: center;
      animation: cow-sun-breathe 6s ease-in-out infinite;
    }
    .sun-rays {
      transform-origin: center;
      animation: cow-sun-rays 18s linear infinite;
    }
    .sun-core {
      transform-origin: center;
      animation: cow-sun-pulse 4.5s ease-in-out infinite;
    }
    @keyframes cow-sun-breathe {
      0%, 100% { transform: scale(1);    opacity: 1;   }
      50%      { transform: scale(1.05); opacity: 0.9; }
    }
    @keyframes cow-sun-pulse {
      0%, 100% { transform: scale(1);    }
      50%      { transform: scale(1.025);}
    }
    @keyframes cow-sun-rays {
      from { transform: rotate(0deg);   }
      to   { transform: rotate(360deg); }
    }
    .moon-halo {
      animation: cow-moon-glow 8s ease-in-out infinite;
      transform-origin: center;
    }
    @keyframes cow-moon-glow {
      0%, 100% { opacity: 1;   transform: scale(1);    }
      50%      { opacity: 0.7; transform: scale(1.06); }
    }

    /* ─── Weather FX ─────────────────────────────────────────────── */

    .fx-clouds {
      position: absolute;
      inset: 0;
      pointer-events: none;
      overflow: hidden;
    }
    .fx-cloud {
      position: absolute;
      width: 24rem;
      height: 9rem;
      transform: scale(var(--cloud-scale, 1));
      opacity: var(--cloud-opacity, 0.85);
      animation: cow-cloud-drift var(--cloud-dur, 100s) linear infinite;
      animation-delay: var(--cloud-delay, 0s);
      will-change: transform;
      left: -28rem;
    }
    .fx-cloud-svg {
      width: 100%;
      height: 100%;
      display: block;
      filter: drop-shadow(0 0.25rem 0.5rem rgba(0, 0, 0, 0.04));
    }
    @keyframes cow-cloud-drift {
      from { transform: translateX(0)             scale(var(--cloud-scale, 1)); }
      to   { transform: translateX(calc(100vw + 32rem)) scale(var(--cloud-scale, 1)); }
    }

    .fx-rain {
      position: absolute;
      inset: 0;
      pointer-events: none;
    }
    @keyframes cow-rain-fall {
      from { transform: translate(0, 0);      opacity: 0; }
      10%  {                                  opacity: 1; }
      90%  {                                  opacity: 1; }
      to   { transform: translate(-12px, 90vh); opacity: 0; }
    }

    .fx-snow {
      position: absolute;
      inset: 0;
      pointer-events: none;
    }
    @keyframes cow-snow-fall {
      from { transform: translate(0, 0);                          opacity: 0; }
      10%  {                                                      opacity: 1; }
      90%  {                                                      opacity: 1; }
      to   { transform: translate(var(--sway, 0), 95vh);          opacity: 0; }
    }

    .fx-fog {
      position: absolute;
      left: 0; right: 0;
      bottom: 0;
      height: 11rem;
      pointer-events: none;
    }
    .fx-fog-band {
      position: absolute;
      left: -20%;
      right: -20%;
      height: 6rem;
      background: linear-gradient(
        180deg,
        rgba(245, 245, 250, 0) 0%,
        rgba(245, 245, 250, 0.55) 60%,
        rgba(245, 245, 250, 0.7) 100%
      );
      animation: cow-fog-drift 22s ease-in-out infinite alternate;
    }
    .fx-fog-band-1 { bottom: 0;    opacity: 0.85; }
    .fx-fog-band-2 { bottom: 2rem; opacity: 0.55; animation-duration: 28s; animation-delay: -8s; }
    .fx-fog-band-3 { bottom: 4rem; opacity: 0.35; animation-duration: 35s; animation-delay: -16s; }
    @keyframes cow-fog-drift {
      from { transform: translateX(-3%); }
      to   { transform: translateX(3%);  }
    }

    .fx-lightning {
      position: absolute;
      inset: 0;
      pointer-events: none;
    }
    .fx-lightning-flash {
      position: absolute;
      inset: 0;
      background: white;
      opacity: 0;
      animation: cow-lightning-flash 9s steps(1, end) infinite;
    }
    .fx-lightning-bolt {
      position: absolute;
      top: 15%;
      left: 38%;
      width: 4rem;
      height: 12rem;
      opacity: 0;
      animation: cow-lightning-bolt 9s steps(1, end) infinite;
      filter: drop-shadow(0 0 1rem rgba(255, 249, 214, 0.7));
    }
    @keyframes cow-lightning-flash {
      0%, 88%, 92%, 100% { opacity: 0;    }
      89%, 91%           { opacity: 0.55; }
      90%                { opacity: 0.7;  }
    }
    @keyframes cow-lightning-bolt {
      0%, 88%, 100% { opacity: 0; }
      89%, 91%      { opacity: 1; }
      90%           { opacity: 0.6;}
    }

    /* ─── Foreground content (clock + weather) ───────────────────── */

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
      z-index: 3;
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
      z-index: 3;
    }
    .meteo {
      position: absolute;
      right: 4rem;
      bottom: 4rem;
      text-align: right;
      width: 26rem;
      color: var(--cow-fg, var(--cow-text-primary));
      transition: color 4s ease;
      z-index: 3;
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
      0%, 100% { opacity: 1;   }
      50%      { opacity: 0.55; }
    }
    :host([compact]) .meteo-pollen {
      font-size: 0.8125rem;
    }
    :host([compact]) .meteo-pollen .pollen-names {
      display: none;
    }

    /* ─── Pollen FX (airborne specks) ────────────────────────────── */
    .fx-pollen {
      position: absolute;
      inset: 0;
      pointer-events: none;
      mix-blend-mode: screen;
    }
    @keyframes cow-pollen-drift {
      from { transform: translate(0, 0);                       opacity: 0; }
      10%  {                                                   opacity: 1; }
      90%  {                                                   opacity: 1; }
      to   { transform: translate(var(--sway, 0), 110vh);      opacity: 0; }
    }
  `;

  override connectedCallback(): void {
    super.connectedCallback();
    // 30 s tick: re-evaluate sky / sun position / clock
    this.timer = window.setInterval(() => {
      this.now = new Date();
    }, 30_000);
  }
  override disconnectedCallback(): void {
    super.disconnectedCallback();
    if (this.timer) window.clearInterval(this.timer);
  }

  /* ─── Data extraction ────────────────────────────────────────── */

  /**
   * Map an Italian or English pollen level label to a 0..4 numeric.
   * Defensive fallback for sensors that don't expose `numeric_state`.
   */
  private parsePollenLevel(state: string): number {
    const s = state.trim().toLowerCase();
    switch (s) {
      case "nessuna":
      case "none":
        return 0;
      case "bassa":
      case "low":
        return 1;
      case "moderata":
      case "moderate":
        return 2;
      case "alta":
      case "high":
        return 3;
      case "molto alta":
      case "very high":
        return 4;
      default: {
        const n = Number(s);
        return Number.isFinite(n) ? Math.max(0, Math.min(4, Math.round(n))) : 0;
      }
    }
  }

  /** Italian label for a numeric pollen level. */
  private pollenLevelLabel(level: number): string {
    const labels = ["nessuna", "bassa", "moderata", "alta", "molto alta"];
    return labels[Math.max(0, Math.min(4, Math.round(level)))]!;
  }

  /**
   * Strip the "Polleninformation (<Location>) " prefix from a sensor
   * friendly_name. Falls back to the raw friendly_name or the entity id
   * suffix when no prefix is present.
   */
  private prettyAllergenName(entityId: string, friendlyName?: string): string {
    if (friendlyName) {
      const stripped = friendlyName.replace(
        /^Polleninformation\s*\([^)]+\)\s*/i,
        "",
      );
      if (stripped.length > 0) return stripped;
    }
    // Fallback: last segment of the entity id, slugified back to a word.
    const tail = entityId.split(".").pop() ?? entityId;
    const last = tail.split("_").pop() ?? tail;
    return last.charAt(0).toUpperCase() + last.slice(1);
  }

  private readPollenSensor(entityId: string):
    | {
        entity: string;
        name: string;
        level: number;
        levelName: string;
      }
    | undefined {
    if (!this.hass) return undefined;
    const e = this.hass.states[entityId];
    if (!e) return undefined;
    const a = e.attributes as Record<string, unknown>;
    const numericRaw = a.numeric_state;
    const level =
      typeof numericRaw === "number"
        ? Math.max(0, Math.min(4, Math.round(numericRaw)))
        : typeof e.state === "string"
          ? this.parsePollenLevel(e.state)
          : 0;
    const levelName =
      typeof a.named_state === "string"
        ? (a.named_state as string)
        : typeof e.state === "string"
          ? e.state
          : this.pollenLevelLabel(level);
    const name = this.prettyAllergenName(
      entityId,
      typeof a.friendly_name === "string" ? a.friendly_name : undefined,
    );
    return { entity: entityId, name, level, levelName };
  }

  /**
   * Build the inline pollen display: overall level (driven by the
   * optional aggregate sensor or by the max of `allergens`), plus a
   * short, sorted list of "interesting" allergens (level ≥ min_level,
   * union pinned allergens, capped to `max_items`, ordered by level
   * desc and then by name).
   */
  private getPollen(): {
    level: number;
    levelName: string;
    items: Array<{ name: string; level: number }>;
  } | null {
    const allergenIds = this.pollenAllergens ?? [];
    if (!this.pollenOverall && allergenIds.length === 0) return null;

    const allergens = allergenIds
      .map((id) => this.readPollenSensor(id))
      .filter((r): r is NonNullable<typeof r> => r != null);

    // Overall level: explicit sensor wins, else max across allergens.
    let level = 0;
    let levelName = "";
    if (this.pollenOverall) {
      const overall = this.readPollenSensor(this.pollenOverall);
      if (overall) {
        level = overall.level;
        levelName = overall.levelName;
      }
    }
    if (level === 0 && allergens.length > 0) {
      const maxA = allergens.reduce((m, a) => (a.level > m.level ? a : m), {
        level: 0,
        levelName: "nessuna",
      } as { level: number; levelName: string });
      level = maxA.level;
      levelName = maxA.levelName;
    }
    if (!levelName) levelName = this.pollenLevelLabel(level);

    const pinnedSet = new Set(this.pollenPinned ?? []);
    const minLevel = this.pollenMinLevel ?? 1;
    const maxItems = this.pollenMaxItems ?? 3;

    const filtered = allergens.filter(
      (a) => pinnedSet.has(a.entity) || a.level >= minLevel,
    );
    filtered.sort((a, b) => {
      // Pinned allergens float to the top within their level bucket.
      if (b.level !== a.level) return b.level - a.level;
      const ap = pinnedSet.has(a.entity) ? 0 : 1;
      const bp = pinnedSet.has(b.entity) ? 0 : 1;
      if (ap !== bp) return ap - bp;
      return a.name.localeCompare(b.name, this.locale ?? "it-IT");
    });
    const items = filtered
      .slice(0, Math.max(0, maxItems))
      .map((a) => ({ name: a.name, level: a.level }));

    // If overall is 0 and nothing pinned/filtered would show, hide entirely.
    if (level === 0 && items.length === 0) return null;
    return { level, levelName, items };
  }

  /** Map a 0..4 pollen level to a foreground color (CSS). */
  private pollenLevelColor(level: number): string {
    switch (Math.max(0, Math.min(4, Math.round(level)))) {
      case 0:
        return "rgba(180, 180, 180, 0.85)";
      case 1:
        return "#F2C94C"; // giallo
      case 2:
        return "#F2994A"; // arancione
      case 3:
        return "#EB5757"; // rosso
      case 4:
        return "#C92A2A"; // rosso scuro
      default:
        return "#F2C94C";
    }
  }

  private getSunState(): {
    elevation: number;
    azimuth: number;
    rising: boolean;
    sunset?: number;
    nextRising?: number;
  } {
    const e = this.sunEntity ? this.hass?.states[this.sunEntity] : undefined;
    if (!e) {
      // No sun entity: fall back to "always noon" so the UI looks fine.
      return { elevation: 45, azimuth: 180, rising: false };
    }
    const a = e.attributes as Record<string, unknown>;
    const parseTs = (v: unknown): number | undefined => {
      if (typeof v !== "string") return undefined;
      const t = Date.parse(v);
      return Number.isFinite(t) ? t : undefined;
    };
    const nextSetting = parseTs(a.next_setting);
    const nextRising = parseTs(a.next_rising);
    const aboveHorizon = e.state === "above_horizon";
    // Best-effort "today's sunset" — when above horizon, the next setting
    // IS today's sunset. When below, the previous setting was; we don't
    // have that directly, so derive from next_rising and assume a 12 h
    // night (good enough for synthesizing moon position).
    const sunset = aboveHorizon
      ? nextSetting
      : nextRising != null
        ? nextRising - 12 * 3600_000
        : undefined;
    return {
      elevation: typeof a.elevation === "number" ? a.elevation : 0,
      azimuth: typeof a.azimuth === "number" ? a.azimuth : 180,
      rising: a.rising === true,
      sunset,
      nextRising,
    };
  }

  private getMoonPhase(): MoonPhase | undefined {
    const e = this.moonEntity ? this.hass?.states[this.moonEntity] : undefined;
    if (!e || typeof e.state !== "string") return undefined;
    return MOON_PHASES.has(e.state as MoonPhase)
      ? (e.state as MoonPhase)
      : undefined;
  }

  private getWeather(): {
    temp?: number;
    desc?: string;
    apparent?: number;
    wind?: number;
    humidity?: number;
    raw?: string;
  } {
    if (!this.weatherEntity || !this.hass) return {};
    const e = this.hass.states[this.weatherEntity];
    if (!e) return {};
    const a = e.attributes as Record<string, unknown>;
    return {
      temp: typeof a.temperature === "number" ? a.temperature : undefined,
      desc: typeof e.state === "string" ? e.state : undefined,
      raw: typeof e.state === "string" ? e.state : undefined,
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

  /* ─── Render ─────────────────────────────────────────────────── */

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
    const sun = this.getSunState();
    const w = this.getWeather();
    const palette = skyPaletteFor(sun.elevation);
    const nightT = nightOpacity(sun.elevation);
    const horizonRgb = rgb(palette.horizon);

    // Foreground readability: switch the clock+text color toward white
    // when the sky goes deep enough.
    const fgColor =
      nightT > 0.5
        ? `rgba(245, 245, 250, ${0.92})`
        : `var(--cow-text-primary)`;
    const fgShadow = nightT > 0.5 ? 0.35 : 0;

    // Position the celestial body
    const sunPos = sunPosition(sun.elevation, sun.azimuth);
    const moonPhase = this.getMoonPhase();
    const showMoon = nightT > 0.15 && moonPhase != null;
    const moonPos =
      sun.sunset != null && sun.nextRising != null
        ? moonPosition(this.now.getTime(), sun.sunset, sun.nextRising)
        : { x: 78, y: 22, visible: true };

    // Sun opacity: visible while up, fades through twilight
    // Cloud coverage (0..1): dims sun & moon so the celestial body
    // doesn't shine through a "pouring" / "rainy" / "cloudy" sky.
    // We keep a small floor (1 - coverage * 0.95) so a fully overcast
    // partlycloudy day still hints at the sun behind the haze, but a
    // truly "pouring" sky (coverage = 1) blanks them out entirely.
    const cloudCoverage = w.raw ? cloudCoverageFor(w.raw) : 0;
    const skyOpacityMult = 1 - cloudCoverage * 0.95;
    const sunOpacity = sunPos.visible
      ? Math.max(0, (1 - nightT) * skyOpacityMult)
      : 0;
    const moonOpacity = showMoon
      ? Math.min(1, nightT * 1.4) * skyOpacityMult
      : 0;

    const tempStr = w.temp != null ? `${Math.round(w.temp)}°` : "--°";
    const descParts: string[] = [];
    if (w.desc) descParts.push(this.translateCondition(w.desc));
    if (w.apparent != null)
      descParts.push(`sens. ${Math.round(w.apparent)}°`);
    if (w.wind != null) descParts.push(`vento ${w.wind} km/h`);
    const desc = descParts.join("  ·  ");
    const desc2Parts: string[] = [];
    if (w.humidity != null) desc2Parts.push(`💧 ${w.humidity}%`);

    const pollen = this.getPollen();
    const pollenColor = pollen ? this.pollenLevelColor(pollen.level) : null;

    return html`
      <style>
        :host {
          --cow-sky: ${skyGradient(palette)};
          --cow-night-opacity: ${nightT};
          --cow-horizon-haze: ${horizonRgb};
          --cow-fg: ${fgColor};
          --cow-fg-shadow: ${fgShadow};
          ${pollenColor ? `--cow-pollen-color: ${pollenColor};` : ""}
        }
      </style>

      <!-- Star field, fades in as the sun drops -->
      <div class="stars">
        ${STARS.map(
          (s) => html`
            <div
              class="star"
              style=${`left:${s.x}%;
                       top:${s.y}%;
                       --s:${s.size}px;
                       --d:${s.delay}s;
                       --brightness:${s.brightness};`}
            ></div>
          `,
        )}
      </div>

      <!-- Sun -->
      <div
        class="celestial"
        style=${`left:${sunPos.x}%; top:${sunPos.y}%; opacity:${sunOpacity};`}
      >
        ${sunSvg()}
      </div>

      <!-- Moon (rendered when night and phase known) -->
      ${moonPhase
        ? html`
            <div
              class="celestial"
              style=${`left:${moonPos.x}%; top:${moonPos.y}%; opacity:${moonOpacity};`}
            >
              ${moonSvg(moonPhase)}
            </div>
          `
        : nothing}

      <!-- Weather FX (clouds drift, rain falls, etc.) -->
      ${w.raw ? weatherFx(w.raw, { night: nightT > 0.5 }) : nothing}

      <!-- Pollen FX (airborne specks) layered on top of weather FX -->
      ${pollen ? pollenFx(pollen.level, { night: nightT > 0.5 }) : nothing}

      <!-- Horizon haze on top of FX, below text -->
      <div class="horizon-haze"></div>

      <!-- Clock + date + weather -->
      <div class="clock">${this.fmtTime()}</div>
      <div class="date">${this.fmtDate()}</div>
      <div class="meteo">
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
      "snowy-rainy": "Pioggia mista a neve",
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
