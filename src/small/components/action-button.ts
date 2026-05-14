import { LitElement, html, css } from "lit";
import { customElement, property } from "lit/decorators.js";
import { colorTransition } from "../styles/anim.js";

/**
 * Large rectangular action button used across panels:
 *   - Thermostat ▲ / ▼ (variant: arrow, neutral surface)
 *   - Blinds ▲ Open / ■ Stop / ▼ Close (variant: control, neutral surface)
 *   - Lights +/− (variant: control), "Turn On/Off" (variant: control + panel override)
 *   - Lights "Turn On" / "Turn Off" (variant: filled, accent surface)
 *
 * The visual chrome (radius, surface, text color) follows Figma
 * tokens; only the label and accent change between instances.
 *
 * ## Exposed CSS custom properties (overridable by host panels)
 *
 *   --cow-action-font-size   (default: 22px)
 *   --cow-action-font-weight (default: 600)
 *   --cow-action-color       (default: inherits --cow-text-button → #4d4d59)
 *   --cow-action-radius      (default: 18.75px)
 *   --cow-action-bg          (default: inherits --cow-surface-button-bg → #f2f2f5)
 *
 * Example panel override for "Turn On" button:
 *   .turn { --cow-action-font-size: 24.375px;
 *           --cow-action-font-weight: 700;
 *           --cow-action-color: #666673; }
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
        font-weight: var(--cow-action-font-weight, 600);
        font-size: var(--cow-action-font-size, 22px);
        line-height: 1;
        letter-spacing: 0;
        border-radius: var(--cow-action-radius, 18.75px);
        background: var(--cow-action-bg, var(--cow-surface-button-bg, #f2f2f5));
        color: var(--cow-action-color, var(--cow-text-button, #4d4d59));
        box-shadow: none;
        ${colorTransition}
      }
      :host([variant="arrow"]) button,
      :host([variant="control"]) button {
        --cow-action-bg: var(--cow-surface-button-bg, #f2f2f5);
        --cow-action-color: var(--cow-text-button, #4d4d59);
      }
      :host([variant="control"]) button {
        --cow-action-font-size: 37.5px;
        --cow-action-font-weight: 500;
      }
      :host([variant="arrow"]) button {
        --cow-action-font-size: 32px;
        --cow-action-font-weight: 500;
      }
      :host([variant="filled"]) button {
        --cow-action-bg: var(--cow-accent, #1f1f2e);
        --cow-action-color: #fff;
      }
      :host([variant="stop"]) button {
        --cow-action-bg: var(--cow-surface-white, #fff);
        --cow-action-color: var(--cow-stop, #e74c3c);
        box-shadow: inset 0 0 0 1px var(--cow-surface-border, #ebebed);
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
