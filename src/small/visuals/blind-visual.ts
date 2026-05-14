import { LitElement, html, css } from "lit";
import { customElement, property } from "lit/decorators.js";
import type { BlindsVariant } from "../state/blinds.js";

/**
 * Animated blind — Figma left-pane blinds visual.
 *
 * A small window frame with horizontal slats. Number of visible slats
 * scales inversely with `position`:
 *
 *   position 100 → 1 slat at top (fully open, only header bar shows)
 *   position 50  → 4-5 slats
 *   position   0 → 9 slats (fully closed)
 *
 * Each slat fades+slides in via the shared `cow-slat-down` keyframe.
 * Moving state adds a soft glow on the frame.
 */
@customElement("cow-blind-visual")
export class CowBlindVisual extends LitElement {
  @property({ type: String }) variant: BlindsVariant = "closed";
  @property({ type: Number }) position = 0;

  static override styles = css`
    :host {
      display: block;
      position: relative;
      width: 100%;
      height: 100%;
    }
    .frame {
      position: absolute;
      inset: 0;
      border-radius: 7.5px;
      background: rgba(255, 255, 255, 0.16);
      box-shadow: inset 0 0 0 2px rgba(255, 255, 255, 0.22);
      overflow: hidden;
      transition: box-shadow 240ms ease;
    }
    :host([variant="moving"]) .frame {
      animation: cow-glow 1.6s ease-in-out infinite;
    }
    .slats {
      position: absolute;
      left: 8%;
      right: 8%;
      top: 8%;
      display: flex;
      flex-direction: column;
      gap: 4px;
    }
    .slat {
      height: 9.375px;
      border-radius: 1.875px;
      background: rgba(255, 255, 255, 0.30);
      animation: cow-slat-down 320ms cubic-bezier(0.22, 1, 0.36, 1) both;
    }
    @keyframes cow-glow {
      0%, 100% { opacity: 1; }
      50% { opacity: 0.82; }
    }
    @keyframes cow-slat-down {
      from { transform: translateY(-6px); opacity: 0; }
      to   { transform: translateY(0);    opacity: 1; }
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
    const pct = Math.max(0, Math.min(100, this.position));
    const slatCount = Math.max(1, Math.round(1 + (1 - pct / 100) * 8));
    const slats = Array.from({ length: slatCount }, (_, i) => i);
    return html`
      <div class="frame"></div>
      <div class="slats">
        ${slats.map(
          (i) => html`
            <div
              class="slat"
              style=${`animation-delay:${i * 28}ms`}
            ></div>
          `,
        )}
      </div>
    `;
  }
}
