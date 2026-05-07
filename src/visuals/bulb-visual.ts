import { LitElement, html, css } from "lit";
import { customElement, property } from "lit/decorators.js";
import type { LightsVariant } from "../state/lights-state.js";

/**
 * Light bulb visual with radial glow.
 * Replica Figma "2. Molecules / Light Bulb Visual" (71:40, 71:45, 71:51, 71:57).
 *
 * Glow is a radial-gradient layer (NO filter:blur — too expensive on MTK6580).
 * Intensity scales with brightnessPct (0..100).
 */
@customElement("cow-bulb-visual")
export class CowBulbVisual extends LitElement {
  @property({ type: String }) variant: LightsVariant = "off";
  @property({ type: Number }) brightnessPct = 0;

  static override styles = css`
    :host {
      display: block;
      width: 6rem;
      height: 6rem;
      position: relative;
    }
    .glow {
      position: absolute;
      inset: -1rem;
      border-radius: 50%;
      background: radial-gradient(
        circle at center,
        rgba(255, 199, 46, var(--glow-alpha, 0)) 0%,
        rgba(255, 199, 46, 0) 60%
      );
      transition: --glow-alpha 240ms ease;
      pointer-events: none;
    }
    svg {
      position: relative;
      width: 100%;
      height: 100%;
      display: block;
    }
    .bulb-body {
      fill: var(--bulb-fill, rgba(255, 255, 255, 0.88));
      transition: fill 240ms ease;
    }
    .bulb-base {
      fill: rgba(255, 255, 255, 0.6);
    }
    .filament {
      fill: none;
      stroke: var(--filament-stroke, rgba(0, 0, 0, 0.18));
      stroke-width: 1.6;
      stroke-linecap: round;
      transition: stroke 240ms ease;
    }
  `;

  override render() {
    const a =
      this.variant === "off"
        ? 0
        : this.variant === "night"
          ? 0.05
          : this.variant === "dim"
            ? 0.35
            : 0.85;
    const fill =
      this.variant === "off"
        ? "rgba(255,255,255,0.5)"
        : this.variant === "night"
          ? "rgba(255, 230, 160, 0.85)"
          : this.variant === "dim"
            ? "rgba(255, 217, 102, 0.95)"
            : "rgba(255, 235, 130, 1)";
    const filament =
      this.variant === "off" ? "rgba(0,0,0,0.18)" : "rgba(120, 60, 0, 0.55)";
    return html`
      <div class="glow" style="--glow-alpha:${a}"></div>
      <svg
        viewBox="0 0 96 96"
        xmlns="http://www.w3.org/2000/svg"
        style="--bulb-fill:${fill}; --filament-stroke:${filament}"
      >
        <path
          class="bulb-body"
          d="M48 12 C32 12, 22 24, 22 38 C22 50, 30 56, 34 64 L34 70 L62 70 L62 64 C66 56, 74 50, 74 38 C74 24, 64 12, 48 12 Z"
        />
        <rect class="bulb-base" x="36" y="72" width="24" height="6" rx="1" />
        <rect class="bulb-base" x="38" y="80" width="20" height="4" rx="1" />
        <rect class="bulb-base" x="40" y="86" width="16" height="4" rx="1" />
        <path
          class="filament"
          d="M38 44 Q42 36, 48 36 Q54 36, 58 44 M40 50 Q48 46, 56 50"
        />
      </svg>
    `;
  }
}
