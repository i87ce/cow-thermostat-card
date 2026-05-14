import { LitElement, html, css, svg, type TemplateResult } from "lit";
import { customElement, property } from "lit/decorators.js";
import type { ThermostatVariant } from "../state/thermostat.js";

const iconPower = svg`<svg viewBox="0 0 24 24" width="52.5" height="52.5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
  <path d="M12 2v6"/>
  <path d="M6.34 6.34a8 8 0 1 0 11.32 0"/>
</svg>`;

const iconCheck = svg`<svg viewBox="0 0 24 24" width="52.5" height="52.5" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
  <path d="M5 13l4 4L19 7"/>
</svg>`;

const ICON_FOR: Record<ThermostatVariant, string | TemplateResult> = {
  heating: "🔥",
  cooling: "❄",
  off: iconPower,
  idle: iconCheck,
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
      font-size: 52.5px;
      line-height: 1;
      color: inherit;
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
    svg {
      display: block;
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
