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

  static override styles = [
    css`
      :host {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        height: 33px;
        padding: 0 11px;
        border-radius: 10px;
        background: var(--cow-surface-button-bg, #f0f0f2);
        color: var(--cow-text-button-muted, #737380);
        font-family: inherit;
        font-weight: 600;
        font-size: 14px;
        line-height: 1;
        white-space: nowrap;
        cursor: pointer;
        user-select: none;
        ${colorTransition}
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
