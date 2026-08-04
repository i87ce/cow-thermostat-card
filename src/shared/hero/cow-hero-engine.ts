/**
 * `<cow-hero-engine>` — shared hero backdrop component.
 *
 * Owns every visual layer that lives BEHIND the foreground content:
 *
 *   ┌─ z 0 ─ :host         — sky gradient (var(--cow-sky))
 *   ├─ z 1 ─ .horizon-haze — warm wash at the horizon
 *   ├─ z 1 ─ .stars        — deterministic twinkling star field
 *   ├─ z 1 ─ .celestial    — sun OR moon (swap by sun.sun.elevation)
 *   ├─ z 1 ─ .fx-*         — weather FX (clouds/rain/snow/hail/fog/
 *   │                        lightning/wind/godrays/aurora)
 *   ├─ z 2 ─ .evening-dim  — global dim scrim that ramps in at dusk
 *   ├─ z 2 ─ .fx-pollen    — airborne pollen specks
 *   └─ z 3 ─ <slot>        — foreground (clock, meteo, presence, …)
 *
 * The foreground itself is the wrapper's responsibility — drop content
 * into the named slots (`content`, `footer`) or the default slot.
 * Wrappers also read `--cow-fg`, `--cow-fg-shadow`, `--cow-pollen-color`
 * which the engine sets on `:host` based on the current sky state, so
 * the clock + meteo text stay readable across the full day/night arc.
 *
 * Public surface kept minimal so XL + mobile + future wrappers all use
 * the same shape. See `wrappers/` for concrete examples.
 */
import { LitElement, html, nothing, css } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import type { HomeAssistant } from "../../types/hass.js";

import {
  skyPaletteFor,
  skyGradient,
  rgb,
  nightOpacity,
  eveningDim,
  generateStars,
} from "./sky.js";
import {
  sunSvg,
  moonSvg,
  sunPosition,
  moonPosition,
} from "./celestial.js";
import { weatherFx, cloudCoverageFor } from "./weather-fx.js";
import { pollenFx } from "./pollen-fx.js";
import {
  getMoonPhase,
  getPollen,
  getSunState,
  getWeather,
  isDay,
} from "./data.js";
import { heroEngineStyles } from "./styles.js";

// Pre-compute the star field once per module load — same seed gives the
// same constellation everywhere, which is what we want.
const STARS = generateStars(30);

@customElement("cow-hero-engine")
export class CowHeroEngine extends LitElement {
  @property({ attribute: false }) hass?: HomeAssistant;

  /** ``weather.*`` entity — drives weather FX + meteo data. */
  @property({ type: String }) weatherEntity?: string;
  /** ``sun.sun`` — drives sky palette + sun arc position. */
  @property({ type: String }) sunEntity?: string;
  /** ``sensor.moon`` — drives moon phase. Optional. */
  @property({ type: String }) moonEntity?: string;
  @property({ type: String }) locale?: string;

  /* ─── Pollen inputs (all optional) ────────────────────────────── */
  @property({ type: String }) pollenOverall?: string;
  @property({ type: Array }) pollenAllergens?: string[];
  @property({ type: Number }) pollenMinLevel = 1;
  @property({ type: Array }) pollenPinned?: string[];
  @property({ type: Number }) pollenMaxItems = 3;

  /* ─── Opt-in FX flags ─────────────────────────────────────────── */
  /**
   * Aurora overlay. There is no HA weather state for aurora, so the
   * host card decides when to switch it on (config flag, Kp-index
   * sensor, special-night toggle, …). Default false.
   */
  @property({ type: Boolean }) aurora = false;
  /** When true, pause infinite backdrop animations (drawer open). */
  @property({ type: Boolean, reflect: true }) paused = false;

  @state() private now = new Date();
  private timer?: number;

  static override styles = [
    ...heroEngineStyles,
    css`
      :host {
        display: block;
        position: relative;
        overflow: hidden;
        /* Fallback gradient if the sun entity is missing. */
        background: var(
          --cow-sky,
          linear-gradient(180deg, #87ceeb 0%, #b8dff5 55%, #fff4d6 100%)
        );
        transition: background 4s ease;
        color: var(--cow-text-primary);
      }
      /* Push every slotted child above the backdrop layers (z 0-2).
         Position is left to the slotted element so wrappers can use
         absolute coordinates against the engine's :host as needed. */
      ::slotted(*) {
        z-index: 3;
      }
      :host([paused]) * {
        animation-play-state: paused !important;
      }
    `,
  ];

  override connectedCallback(): void {
    super.connectedCallback();
    // 30 s tick: re-evaluate sky / sun position / clock-driven moon arc.
    this.timer = window.setInterval(() => {
      this.now = new Date();
    }, 30_000);
  }
  override disconnectedCallback(): void {
    super.disconnectedCallback();
    if (this.timer) window.clearInterval(this.timer);
  }

  override render() {
    const sun = getSunState(this.hass, this.sunEntity);
    const w = getWeather(this.hass, this.weatherEntity);
    const palette = skyPaletteFor(sun.elevation);
    const nightT = nightOpacity(sun.elevation);
    const dimT = eveningDim(sun.elevation);
    const horizonRgb = rgb(palette.horizon);

    // Position the celestial body.
    const sunPos = sunPosition(sun.elevation, sun.azimuth);
    const moonPhase = getMoonPhase(this.hass, this.moonEntity);
    const showMoon = nightT > 0.15 && moonPhase != null;
    const moonPos =
      sun.sunset != null && sun.nextRising != null
        ? moonPosition(this.now.getTime(), sun.sunset, sun.nextRising)
        : { x: 78, y: 22, visible: true };

    // Cloud coverage dims the sun + moon — celestial bodies must not
    // shine through a "pouring" sky. Floor at 5% so a partly-cloudy
    // day still hints at the sun behind the haze.
    const cloudCoverage = w.raw ? cloudCoverageFor(w.raw) : 0;
    const skyOpacityMult = 1 - cloudCoverage * 0.95;
    const sunOpacity = sunPos.visible
      ? Math.max(0, (1 - nightT) * skyOpacityMult)
      : 0;
    const moonOpacity = showMoon
      ? Math.min(1, nightT * 1.4) * skyOpacityMult
      : 0;

    const pollen = getPollen(this.hass, {
      pollenOverall: this.pollenOverall,
      pollenAllergens: this.pollenAllergens,
      pollenMinLevel: this.pollenMinLevel,
      pollenPinned: this.pollenPinned,
      pollenMaxItems: this.pollenMaxItems,
      locale: this.locale,
    });

    // Opt-in FX:
    //  * godrays auto-fire whenever the sun is above the horizon (we
    //    prefer the explicit ``sun.sun.state`` check from data.ts to
    //    a noisy elevation > 0 heuristic);
    //  * aurora is host-driven via the ``aurora`` prop.
    const dayLight = isDay(this.hass, this.sunEntity);

    return html`
      <style>
        :host {
          /* These tokens drive the engine's own backdrop layers. The
             foreground tokens (--cow-fg, --cow-fg-shadow,
             --cow-pollen-color) are deliberately set by the host
             wrapper on its OWN :host so slotted children — which
             live in the wrapper's light DOM — inherit them. */
          --cow-sky: ${skyGradient(palette)};
          --cow-night-opacity: ${nightT};
          --cow-evening-dim: ${dimT.toFixed(3)};
          --cow-horizon-haze: ${horizonRgb};
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

      <!-- Moon (only when night + phase known) -->
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
      ${w.raw
        ? weatherFx(w.raw, {
            night: nightT > 0.5,
            isDay: dayLight,
            aurora: this.aurora,
          })
        : nothing}

      <!-- Pollen FX (airborne specks) -->
      ${pollen ? pollenFx(pollen.level, { night: nightT > 0.5 }) : nothing}

      <!-- Evening dim scrim -->
      <div class="evening-dim"></div>

      <!-- Horizon haze on top of FX, below the foreground slot -->
      <div class="horizon-haze"></div>

      <!-- Foreground content slots (clock, meteo, presence, alarm, …) -->
      <slot name="content"></slot>
      <slot name="footer"></slot>
      <slot></slot>
    `;
  }
}
