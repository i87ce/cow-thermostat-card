import { LitElement, html, css, nothing } from "lit";
import { customElement, property } from "lit/decorators.js";

/**
 * Fan speed button — replica Figma "2. Molecules / Fan Speed Buttons" (66:18..66:26).
 * 34 × 28 px (Auto/1/2/3), 7px radius. Active = filled accent.
 */
@customElement("cow-fan-button")
export class CowFanButton extends LitElement {
  @property({ type: String }) label = "";
  @property({ type: Boolean, reflect: true }) active = false;
  @property({ type: Boolean, reflect: true }) disabled = false;

  static override styles = css`
    :host {
      display: inline-flex;
      width: 2.125rem;
      height: 1.75rem;
      border-radius: var(--cow-radius-small);
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
      font-size: var(--cow-font-micro); /* 10px */
      color: var(--cow-text-button-muted);
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
