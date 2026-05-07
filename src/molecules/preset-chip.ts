import { LitElement, html, css, nothing } from "lit";
import { customElement, property } from "lit/decorators.js";

/**
 * Preset chip — replica Figma "2. Molecules / Preset Chips" (66:41..66:49).
 * Used for blinds presets (e.g. "25%", "50%", "75%"). Active = filled accent.
 */
@customElement("cow-preset-chip")
export class CowPresetChip extends LitElement {
  @property({ type: String }) label = "";
  @property({ type: Boolean, reflect: true }) active = false;

  static override styles = css`
    :host {
      display: inline-flex;
      height: 1.75rem;
      padding: 0 0.625rem;
      border-radius: var(--cow-radius-small);
      background: var(--cow-surface-button-bg);
      align-items: center;
      justify-content: center;
      transition: background-color 120ms ease, color 120ms ease;
    }
    :host([active]) {
      background: var(--cow-accent-active, var(--cow-blinds-medium));
    }
    button {
      font-family: var(--cow-font-family);
      font-weight: 600;
      font-size: var(--cow-font-micro);
      color: var(--cow-text-button-muted);
    }
    :host([active]) button {
      color: var(--cow-surface-white);
    }
  `;

  override render() {
    return html`
      <button aria-pressed=${this.active ? "true" : "false"}>
        ${this.label || nothing}
      </button>
    `;
  }
}
