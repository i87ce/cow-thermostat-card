import { LitElement, html, css } from "lit";
import { customElement, property } from "lit/decorators.js";
import type { ThermostatVariant } from "../state/thermostat.js";

const ICON_FOR: Record<ThermostatVariant, string> = {
  heating: "🔥",
  cooling: "❄",
  off: "⏻",
  idle: "✓",
};

/**
 * Top-left thermostat status glyph. Cross-fades between variants and
 * adds a soft pulse on `heating` / `cooling` to telegraph that the
 * system is actively running.
 */
@customElement("cow-thermostat-icon")
export class CowThermostatIcon extends LitElement {
  @property({ type: String }) variant: ThermostatVariant = "off";

  static override styles = css`
    :host {
      display: inline-block;
      font-size: 56px;
      line-height: 1;
      transition: transform 240ms cubic-bezier(0.22, 1, 0.36, 1),
        opacity 240ms cubic-bezier(0.22, 1, 0.36, 1);
    }
    :host([variant="heating"]),
    :host([variant="cooling"]) {
      animation: cow-pulse 2.6s ease-in-out infinite;
    }
    :host([variant="off"]) {
      opacity: 0.6;
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
    return html`${ICON_FOR[this.variant]}`;
  }
}
