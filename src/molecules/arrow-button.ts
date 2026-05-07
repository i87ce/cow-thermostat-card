import { LitElement, html, css } from "lit";
import { customElement, property } from "lit/decorators.js";

/**
 * Arrow Up / Down button — replica Figma "2. Molecules / Arrow Buttons" (66:29, 66:31).
 * 148 × 42 px white card, 10px radius, ▲ or ▼ centered.
 *
 * Figma exact values: width 148px, height 42px → 9.25rem × 2.625rem.
 */
@customElement("cow-arrow-button")
export class CowArrowButton extends LitElement {
  @property({ type: String }) direction: "up" | "down" = "up";
  @property({ type: Boolean }) disabled = false;

  static override styles = css`
    :host {
      display: block;
      width: 9.25rem;
      height: 2.625rem;
    }
    button {
      width: 100%;
      height: 100%;
      background: var(--cow-surface-white);
      border: 0.0625rem solid var(--cow-surface-button-border);
      border-radius: var(--cow-radius-default);
      color: var(--cow-text-button);
      font-family: var(--cow-font-family);
      font-weight: 500;
      font-size: var(--cow-font-symbol-arrow); /* 16px */
      display: flex;
      align-items: center;
      justify-content: center;
      transition: background-color 120ms ease, transform 80ms ease;
    }
    button:active {
      background: var(--cow-surface-background);
      transform: scale(0.98);
    }
    button:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }
  `;

  override render() {
    return html`
      <button
        ?disabled=${this.disabled}
        aria-label=${this.direction === "up" ? "Increase" : "Decrease"}
      >
        ${this.direction === "up" ? "▲" : "▼"}
      </button>
    `;
  }
}
