import { LitElement, html, css } from "lit";
import { customElement, property } from "lit/decorators.js";
import { colorTransition } from "../styles/anim.js";

/**
 * Generic small chip — the building block for scope/mode/fan/preset rows.
 *
 * Visual matches Figma 720x720 chip:
 *   inactive  → light grey bg + secondary text
 *   active    → accent bg + white text
 *
 * Active accent is read from the `--cow-accent` CSS variable on the
 * panel root, so changing variant (heating/cooling/bright/etc.) on the
 * panel automatically morphs every active chip to the new color.
 */
@customElement("cow-chip")
export class CowChip extends LitElement {
  @property({ type: String }) label = "";
  @property({ type: Boolean, reflect: true }) active = false;
  /** Optional override for active background. Defaults to --cow-accent. */
  @property({ type: String }) accent?: string;
  /** Chip size: "default" (52px) or "large" (72px, for preset rows). */
  @property({ type: String, reflect: true }) size: "default" | "large" =
    "default";

  static override styles = [
    css`
      /* Touch-target audit (v1.9): default chips grew 33 → 52 stage-px
         and large 56.25 → 72 so they stay ≥ 35 real px even on the
         480-px Wall Displays (stage scales ×0.667 there). Don't shrink
         these to "fit more chips" — wrap to a second row instead. */
      :host {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        height: 52px;
        padding: 0 18px;
        border-radius: 14px;
        background: var(--cow-surface-button-bg, #f0f0f5);
        color: var(--cow-text-button-muted, #5c5c6b);
        font-family: inherit;
        font-weight: 600;
        font-size: 19px;
        line-height: 1;
        white-space: nowrap;
        cursor: pointer;
        user-select: none;
        ${colorTransition}
      }
      :host(:active) {
        transform: scale(0.96);
      }
      :host([size="large"]) {
        height: 72px;
        padding: 0 20px;
        border-radius: 18px;
        font-size: 25px;
        color: var(--cow-text-button-muted, #666673);
      }
      :host([active]) {
        background: var(--cow-chip-active-bg, var(--cow-accent, #1f1f2e));
        color: #fff;
      }
      :host(:not([active]):hover) {
        background: var(--cow-surface-button-border, #e5e5eb);
      }
      :host([disabled]) {
        opacity: 0.4;
        pointer-events: none;
      }
    `,
  ];

  override render() {
    const style = this.accent
      ? `--cow-chip-active-bg:${this.accent}`
      : undefined;
    return html`<span style=${style ?? ""}>${this.label}</span>`;
  }
}
