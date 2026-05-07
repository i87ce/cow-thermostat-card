import { LitElement, html, css, nothing } from "lit";
import { customElement, property } from "lit/decorators.js";

/**
 * Control button — replica Figma "2. Molecules / Control Buttons" (66:34..66:38).
 * Three rounded buttons in a row for Open / Stop (red) / Close.
 * Stop variant uses --cow-stop. Default uses light gray fill.
 */
@customElement("cow-control-button")
export class CowControlButton extends LitElement {
  @property({ type: String }) label = "";
  @property({ type: String }) variant: "default" | "stop" = "default";
  @property({ type: Boolean }) disabled = false;

  static override styles = css`
    :host {
      display: inline-flex;
      flex: 1;
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
      font-weight: 600;
      font-size: var(--cow-font-time); /* 13 */
      display: flex;
      align-items: center;
      justify-content: center;
      transition: background-color 120ms ease, transform 80ms ease;
    }
    :host([variant="stop"]) button {
      background: var(--cow-stop);
      color: var(--cow-surface-white);
      border-color: transparent;
    }
    button:active {
      transform: scale(0.97);
    }
    button:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }
  `;

  override render() {
    return html`
      <button ?disabled=${this.disabled}>
        ${this.label || nothing}
      </button>
    `;
  }
}
