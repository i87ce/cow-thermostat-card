import { LitElement, html, css } from "lit";
import { customElement, property } from "lit/decorators.js";
import "./chip.js";

export interface ChipItem {
  /** Stable identifier used in the cow-chip-select event. */
  id: string;
  /** Visible chip label. */
  label: string;
  /** When true, the chip is interactive but greyed out. */
  disabled?: boolean;
}

/**
 * Horizontal row of chips with single-select behavior. Emits
 * `cow-chip-select` { id } on click; the host owns the active state
 * and re-passes `activeId`. Mirrors Figma chip-row patterns:
 * Mode (Cool/Heat/Off), Fan (Auto/1/2/3), Preset (0%/50%/100%),
 * Entity Selector (Tutte/Soffitto/...).
 */
@customElement("cow-chip-row")
export class CowChipRow extends LitElement {
  @property({ type: Array }) items: ChipItem[] = [];
  @property({ type: String }) activeId = "";
  /** Optional accent override for active chip background. */
  @property({ type: String }) accent?: string;
  /** Gap in pixels between chips. */
  @property({ type: Number }) gap = 6;

  static override styles = css`
    :host {
      display: block;
    }
    .row {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
    }
  `;

  private onPick(id: string, disabled?: boolean) {
    if (disabled) return;
    this.dispatchEvent(
      new CustomEvent("cow-chip-select", {
        detail: { id },
        bubbles: true,
        composed: true,
      }),
    );
  }

  override render() {
    return html`
      <div class="row" style=${`gap:${this.gap}px`}>
        ${this.items.map(
          (it) => html`
            <cow-chip
              .label=${it.label}
              ?active=${it.id === this.activeId}
              ?disabled=${!!it.disabled}
              .accent=${this.accent}
              @click=${() => this.onPick(it.id, it.disabled)}
              role="button"
              aria-pressed=${it.id === this.activeId ? "true" : "false"}
            ></cow-chip>
          `,
        )}
      </div>
    `;
  }
}
