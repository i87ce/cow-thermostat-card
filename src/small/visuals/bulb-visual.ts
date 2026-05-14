import { LitElement, html, css } from "lit";
import { customElement, property } from "lit/decorators.js";
import type { LightsVariant } from "../state/lights.js";

/**
 * Animated bulb — Figma left-pane light visual.
 *
 *   bright  → full glow circle around bulb, brightness 100%
 *   dim     → smaller glow, soft pulse
 *   night   → tiny glow, slow breath
 *   off     → no glow, power icon
 *
 * Glow scales with `brightnessPct` (0..100) so we get smooth
 * transitions when the user drags the slider.
 */
@customElement("cow-bulb-visual")
export class CowBulbVisual extends LitElement {
  @property({ type: String }) variant: LightsVariant = "off";
  @property({ type: Number }) brightnessPct = 0;

  static override styles = css`
    :host {
      display: block;
      position: relative;
      width: 100%;
      height: 100%;
    }
    .stage {
      position: absolute;
      inset: 0;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .glow {
      position: absolute;
      width: 100%;
      height: 100%;
      border-radius: 50%;
      background: radial-gradient(
        circle at 50% 50%,
        var(--cow-accent-light, var(--cow-accent, #ffd966)) 0%,
        rgba(255, 255, 255, 0) 65%
      );
      transform: scale(var(--glow-scale, 0));
      opacity: var(--glow-opacity, 0);
      transition:
        transform 480ms cubic-bezier(0.22, 1, 0.36, 1),
        opacity 480ms cubic-bezier(0.22, 1, 0.36, 1);
      animation: cow-glow 3.2s ease-in-out infinite;
    }
    .ring {
      position: absolute;
      width: 60%;
      height: 60%;
      border-radius: 50%;
      background: rgba(255, 255, 255, 0.18);
      transform: scale(var(--ring-scale, 0));
      opacity: var(--ring-opacity, 0);
      transition: transform 320ms ease-out, opacity 320ms ease-out;
    }
    .bulb {
      position: relative;
      font-size: 56px;
      line-height: 1;
      filter: drop-shadow(0 0 12px rgba(0, 0, 0, 0.18));
      transition: transform 240ms cubic-bezier(0.22, 1, 0.36, 1);
    }
    :host([variant="off"]) .bulb {
      transform: scale(0.85);
      opacity: 0.55;
    }
    :host([variant="night"]) .glow {
      animation-duration: 5.5s;
    }
  `;

  override connectedCallback(): void {
    super.connectedCallback();
    this.setAttribute("variant", this.variant);
  }
  override updated() {
    this.setAttribute("variant", this.variant);
  }

  override render() {
    const pct = Math.max(0, Math.min(100, this.brightnessPct));
    const isOff = this.variant === "off" || pct === 0;
    const glowScale = isOff ? 0 : 0.55 + (pct / 100) * 0.55;
    const glowOpacity = isOff ? 0 : 0.45 + (pct / 100) * 0.5;
    const ringScale = isOff ? 0 : 0.45 + (pct / 100) * 0.35;
    const ringOpacity = isOff ? 0 : 0.4 + (pct / 100) * 0.4;
    const style =
      `--glow-scale:${glowScale};` +
      `--glow-opacity:${glowOpacity};` +
      `--ring-scale:${ringScale};` +
      `--ring-opacity:${ringOpacity};`;
    return html`
      <div class="stage" style=${style}>
        <div class="glow"></div>
        <div class="ring"></div>
        <div class="bulb">${isOff ? "⏻" : "💡"}</div>
      </div>
    `;
  }
}
