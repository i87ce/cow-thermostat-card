import { LitElement, html, css } from "lit";
import { customElement, property } from "lit/decorators.js";
import { unsafeSVG } from "lit/directives/unsafe-svg.js";
import type { LightsVariant } from "../state/lights.js";
import { bulbOffSvg, bulbOnSvg } from "./bulb-svg-assets.js";

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
  /**
   * Render an extra outer halo to signal that the user is actively
   * dragging the brightness on the left panel. Mirrors the Figma
   * "Mid-Drag" frame — a 300×300 soft glow at 0.45 opacity expanding
   * beyond the bulb circle, so the user gets clear visual feedback
   * that the gesture is being captured even before the % digits update.
   */
  @property({ type: Boolean }) dragging = false;

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
    .halo {
      position: absolute;
      /* -16.5% on each side expands a 225px square to ~300px, matching
         the Figma "Glow Halo" node in the Mid-Drag mock. */
      inset: -16.5%;
      border-radius: 50%;
      background: radial-gradient(
        circle at 50% 50%,
        var(--cow-accent-light, var(--cow-accent, #ffd966)) 0%,
        rgba(255, 255, 255, 0) 70%
      );
      opacity: 0;
      transform: scale(0.9);
      transition:
        opacity 200ms cubic-bezier(0.22, 1, 0.36, 1),
        transform 240ms cubic-bezier(0.22, 1, 0.36, 1);
      pointer-events: none;
    }
    :host([dragging]) .halo {
      opacity: 0.45;
      transform: scale(1);
    }
    /* The halo would look weird over the dim "off" background — the
       light isn't on so there's nothing to radiate. Suppress it. */
    :host([variant="off"]) .halo {
      opacity: 0 !important;
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
      /* Native bulb viewBox is 659.8×1124.2 (portrait, aspect ~1.7).
         At height: 60% / max-height: 165px the bulb's socket overshot
         the bottom of the 225×225 glow disc — visually escaping the
         halo. Capped to 48% / 110px so the whole bulb (glass + socket)
         fits comfortably inside the glow circle on every variant. */
      width: auto;
      height: 48%;
      max-height: 110px;
      display: flex;
      align-items: center;
      justify-content: center;
      line-height: 1;
      color: currentColor;
      transition:
        transform 240ms cubic-bezier(0.22, 1, 0.36, 1),
        opacity 240ms cubic-bezier(0.22, 1, 0.36, 1);
    }
    .bulb svg {
      height: 100%;
      width: auto;
      display: block;
    }
    :host([variant="off"]) .bulb {
      transform: scale(0.9);
      opacity: 0.85;
    }
    /* On dim/night variants we still want the lit bulb anatomy, but a bit
       muted so the panel mood reads "soft glow", not "blazing 100%". */
    :host([variant="dim"]) .bulb {
      opacity: 0.92;
    }
    :host([variant="night"]) .bulb {
      opacity: 0.78;
    }
    :host([variant="night"]) .glow {
      animation-duration: 5.5s;
    }
    @keyframes cow-glow {
      0%, 100% { opacity: 1; }
      50% { opacity: 0.82; }
    }
  `;

  override connectedCallback(): void {
    super.connectedCallback();
    this.setAttribute("variant", this.variant);
    this.toggleAttribute("dragging", this.dragging);
  }
  override updated() {
    this.setAttribute("variant", this.variant);
    this.toggleAttribute("dragging", this.dragging);
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
        <div class="halo"></div>
        <div class="glow"></div>
        <div class="ring"></div>
        <div class="bulb">${unsafeSVG(isOff ? bulbOffSvg : bulbOnSvg)}</div>
      </div>
    `;
  }
}
