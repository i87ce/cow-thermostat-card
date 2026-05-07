import { LitElement, html, css, nothing } from "lit";
import { customElement, property } from "lit/decorators.js";

/**
 * Info badge — replica Figma "2. Molecules / Info Badges" (66:59..66:69).
 * Tiny 13px Medium label, white-with-opacity, used for time / weather /
 * humidity / status in the bottom strip of the left status panel.
 */
@customElement("cow-info-badge")
export class CowInfoBadge extends LitElement {
  @property({ type: String }) icon = "";
  @property({ type: String }) label = "";

  static override styles = css`
    :host {
      display: inline-flex;
      align-items: baseline;
      gap: 0.25rem;
      font-family: var(--cow-font-family);
      font-weight: 500;
      font-size: var(--cow-font-time); /* 13 */
      color: var(--cow-surface-white);
      opacity: 0.75;
      white-space: nowrap;
    }
  `;

  override render() {
    return html`
      ${this.icon ? html`<span>${this.icon}</span>` : nothing}
      <span>${this.label}</span>
    `;
  }
}
