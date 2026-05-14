import { LitElement, html, css } from "lit";
import { customElement, property } from "lit/decorators.js";
import { colorTransition } from "../styles/anim.js";

/**
 * Large rectangular action button used across panels:
 *   - Thermostat ▲ / ▼ (variant: arrow, neutral surface)
 *   - Blinds ▲ Open / ■ Stop / ▼ Close (variant: control, neutral surface)
 *   - Lights "Turn On" / "Turn Off" (variant: filled, accent surface)
 *
 * The visual chrome (radius, surface, text color) follows Figma
 * tokens; only the label and accent change between instances.
 */
export type ActionButtonVariant = "arrow" | "control" | "filled" | "stop";

@customElement("cow-action-button")
export class CowActionButton extends LitElement {
  @property({ type: String }) label = "";
  @property({ type: String }) variant: ActionButtonVariant = "control";

  static override styles = [
    css`
      :host {
        display: block;
      }
      button {
        appearance: none;
        border: 0;
        margin: 0;
        padding: 0;
        font: inherit;
        cursor: pointer;
        width: 100%;
        height: 100%;
        font-family: inherit;
        font-weight: 600;
        font-size: 22px;
        line-height: 1;
        letter-spacing: 0;
        border-radius: 14px;
        ${colorTransition}
      }
      :host([variant="arrow"]) button,
      :host([variant="control"]) button {
        background: var(--cow-surface-white, #fff);
        color: var(--cow-text-button, #595966);
        box-shadow: inset 0 0 0 1px var(--cow-surface-border, #ebebed);
      }
      :host([variant="filled"]) button {
        background: var(--cow-accent, #1f1f2e);
        color: #fff;
        box-shadow: none;
      }
      :host([variant="stop"]) button {
        background: var(--cow-surface-white, #fff);
        color: var(--cow-stop, #e74c3c);
        box-shadow: inset 0 0 0 1px var(--cow-surface-border, #ebebed);
      }
      :host([variant="arrow"]) button {
        font-size: 32px;
        font-weight: 500;
      }
      button:active {
        transform: scale(0.98);
      }
      button:disabled {
        opacity: 0.4;
        cursor: not-allowed;
        transform: none;
      }
    `,
  ];

  override connectedCallback(): void {
    super.connectedCallback();
    this.setAttribute("variant", this.variant);
  }
  override updated(): void {
    this.setAttribute("variant", this.variant);
  }

  override render() {
    return html`<button>${this.label}</button>`;
  }
}
