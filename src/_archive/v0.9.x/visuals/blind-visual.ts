import { LitElement, html, svg, css } from "lit";
import { customElement, property } from "lit/decorators.js";
import type { BlindsVariant } from "../state/blinds-state.js";

/**
 * Window-with-slats visual for the blinds left status panel.
 * Replica Figma "2. Molecules / Blind Visual" (71:5, 71:8, 71:17, 71:31).
 *
 *   open(100%)  -> slats fully retracted at top
 *   half(50%)   -> slats halfway down
 *   closed(0%)  -> slats fully covering window
 *   moving      -> amber slats with subtle pulse
 *
 * Pure SVG, no filter blur. The host provides accent vars; we only paint.
 */
@customElement("cow-blind-visual")
export class CowBlindVisual extends LitElement {
  @property({ type: String }) variant: BlindsVariant = "open";
  @property({ type: Number }) position = 100; // 0 = closed, 100 = open

  static override styles = css`
    :host {
      display: block;
      width: 6rem;
      height: 6rem;
    }
    svg {
      width: 100%;
      height: 100%;
      display: block;
    }
    .frame {
      fill: none;
      stroke: rgba(255, 255, 255, 0.85);
      stroke-width: 4;
    }
    .pane {
      fill: rgba(255, 255, 255, 0.18);
    }
    .slat {
      fill: rgba(255, 255, 255, 0.92);
      transition: y 240ms ease, height 240ms ease;
    }
    @keyframes movingPulse {
      0%, 100% { opacity: 0.85; }
      50% { opacity: 1; }
    }
    :host([variant="moving"]) .slat {
      fill: var(--cow-blinds-amber-light);
      animation: movingPulse 1.6s ease-in-out infinite;
    }
  `;

  override render() {
    const coverage = 1 - this.position / 100; // 0 open .. 1 closed
    const slatTop = 8;
    const slatBottom = 88;
    const slatTotal = slatBottom - slatTop;
    const slatHeight = slatTotal * coverage;
    const slatCount = 6;
    const slatGap = 2;
    const visibleSlats = Math.max(0, Math.round(slatCount * coverage));

    const slats = [];
    for (let i = 0; i < visibleSlats; i++) {
      const h = (slatHeight - slatGap * (visibleSlats - 1)) / visibleSlats;
      const y = slatTop + i * (h + slatGap);
      slats.push(
        svg`<rect class="slat" x="14" y=${y} width="68" height=${Math.max(2, h)} rx="1.5" />`,
      );
    }

    return html`
      <svg viewBox="0 0 96 96" xmlns="http://www.w3.org/2000/svg">
        <rect class="pane" x="10" y="6" width="76" height="84" rx="3" />
        ${slats}
        <rect class="frame" x="10" y="6" width="76" height="84" rx="3" />
        <line class="frame" x1="48" y1="6" x2="48" y2="90" />
        <line class="frame" x1="10" y1="48" x2="86" y2="48" />
      </svg>
    `;
  }
}
