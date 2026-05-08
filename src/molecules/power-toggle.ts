import { LitElement, html, css } from "lit";
import { customElement, property } from "lit/decorators.js";
import { buttonReset } from "../styles/button-reset.js";

/**
 * Power toggle — replica Figma "2. Molecules / Power Toggle" (66:72, 66:74).
 * Pill-shaped toggle, ~3.5 × 2 rem (56 × 32 px). On = warm yellow, Off = gray.
 * Knob slides left/right.
 */
@customElement("cow-power-toggle")
export class CowPowerToggle extends LitElement {
  @property({ type: Boolean, reflect: true }) on = false;
  @property({ type: Boolean }) disabled = false;

  static override styles = [
    buttonReset,
    css`
    :host {
      display: inline-block;
      width: 3.5rem;
      height: 2rem;
    }
    .track {
      position: relative;
      width: 100%;
      height: 100%;
      border-radius: 1rem;
      background: var(--cow-off-light);
      transition: background-color 160ms ease;
      cursor: pointer;
    }
    :host([on]) .track {
      background: var(--cow-lights-bright);
    }
    .knob {
      position: absolute;
      top: 0.1875rem;
      left: 0.1875rem;
      width: 1.625rem;
      height: 1.625rem;
      border-radius: 50%;
      background: var(--cow-surface-white);
      box-shadow: 0 0.0625rem 0.1875rem rgba(0, 0, 0, 0.18);
      transition: transform 160ms ease;
    }
    :host([on]) .knob {
      transform: translateX(1.5rem);
    }
    button {
      position: absolute;
      inset: 0;
      width: 100%;
      height: 100%;
      background: transparent;
    }
  `,
  ];

  private onClick = () => {
    if (this.disabled) return;
    this.dispatchEvent(
      new CustomEvent("cow-power-change", {
        detail: { on: !this.on },
        bubbles: true,
        composed: true,
      }),
    );
  };

  override render() {
    return html`
      <div class="track" role="presentation">
        <div class="knob"></div>
        <button
          @click=${this.onClick}
          ?disabled=${this.disabled}
          aria-pressed=${this.on ? "true" : "false"}
          aria-label=${this.on ? "Turn off" : "Turn on"}
        ></button>
      </div>
    `;
  }
}
