import { LitElement, html, css, nothing } from "lit";
import { customElement, property } from "lit/decorators.js";

/**
 * Tiny inline icon+label badge used by the XL header strip and the
 * left-pane bottom row (time / weather / humidity / status).
 *
 * Originally Figma "2. Molecules / Info Badges" (66:59..66:69).
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
      font-family: var(--cow-font-family, "Inter", sans-serif);
      font-weight: 500;
      font-size: var(--cow-font-time, 13px);
      color: var(--cow-surface-white, #fff);
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
