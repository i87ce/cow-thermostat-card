import { LitElement, html, css, nothing } from "lit";
import { customElement, property } from "lit/decorators.js";

/**
 * Mode pill button — replica Figma "2. Molecules / Mode Buttons" (66:5..66:13).
 * Three pills sit in a row with 8px radius. Active = filled accent, inactive = #f0f0f2.
 *
 * Figma sizes: 46.667 × 32 px each, gap implicit by absolute positioning.
 * In rem: 2.917 × 2 rem.
 */
@customElement("cow-mode-button")
export class CowModeButton extends LitElement {
  @property({ type: String }) label = "";
  @property({ type: Boolean, reflect: true }) active = false;
  @property({ type: Boolean, reflect: true }) disabled = false;

  static override styles = css`
    :host {
      display: inline-flex;
      width: 2.917rem;
      height: 2rem;
      border-radius: var(--cow-radius-medium);
      background: var(--cow-surface-button-bg);
      align-items: center;
      justify-content: center;
      transition: background-color 120ms ease, color 120ms ease;
    }
    :host([active]) {
      background: var(--cow-accent-active, var(--cow-heating-active));
    }
    :host([disabled]) {
      opacity: 0.5;
    }
    button {
      width: 100%;
      height: 100%;
      font-family: var(--cow-font-family);
      font-weight: 600;
      font-size: var(--cow-font-status); /* 11px */
      color: var(--cow-text-button-muted);
      letter-spacing: 0;
      text-align: center;
    }
    :host([active]) button {
      color: var(--cow-surface-white);
    }
  `;

  override render() {
    return html`
      <button
        ?disabled=${this.disabled}
        aria-pressed=${this.active ? "true" : "false"}
      >
        ${this.label || nothing}
      </button>
    `;
  }
}
