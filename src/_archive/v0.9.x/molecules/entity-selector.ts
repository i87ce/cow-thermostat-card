import { LitElement, html, css } from "lit";
import { customElement, property } from "lit/decorators.js";
import { buttonReset } from "../styles/button-reset.js";

/**
 * Horizontal chip selector to pick which sub-entity the master controls
 * are acting on. Index -1 = "All" (master controls every entity).
 *
 * Designed for the bottom of the right pane in lights-panel and
 * blinds-panel. Wraps to a second line if labels overflow. Active chip
 * uses the current accent color (--cow-accent-active).
 */
@customElement("cow-entity-selector")
export class CowEntitySelector extends LitElement {
  @property({ type: Array }) labels: string[] = [];
  /** -1 = all selected; 0..labels.length-1 = single entity selected */
  @property({ type: Number }) activeIndex = -1;
  /** Label for the "All" chip (default "Tutte") */
  @property({ type: String }) allLabel = "Tutte";

  static override styles = [
    buttonReset,
    css`
      :host {
        display: block;
        width: 100%;
      }
      .row {
        display: flex;
        flex-wrap: wrap;
        gap: 0.25rem;
        align-items: center;
        justify-content: flex-start;
      }
      button {
        height: 1.5rem;
        padding: 0 0.5rem;
        border-radius: var(--cow-radius-small);
        background: var(--cow-surface-button-bg);
        font-family: var(--cow-font-family);
        font-weight: 600;
        font-size: 0.625rem; /* micro */
        color: var(--cow-text-button-muted);
        white-space: nowrap;
        max-width: 5.5rem;
        overflow: hidden;
        text-overflow: ellipsis;
        transition: background-color 120ms ease, color 120ms ease;
      }
      button.active {
        background: var(--cow-accent-active, var(--cow-text-primary));
        color: var(--cow-surface-white);
      }
    `,
  ];

  private select(i: number) {
    this.dispatchEvent(
      new CustomEvent("cow-select", {
        detail: { index: i },
        bubbles: true,
        composed: true,
      }),
    );
  }

  override render() {
    if (this.labels.length <= 1) return html``;
    return html`
      <div class="row">
        <button
          class=${this.activeIndex === -1 ? "active" : ""}
          @click=${() => this.select(-1)}
          aria-pressed=${this.activeIndex === -1 ? "true" : "false"}
        >
          ${this.allLabel}
        </button>
        ${this.labels.map(
          (label, i) => html`
            <button
              class=${this.activeIndex === i ? "active" : ""}
              @click=${() => this.select(i)}
              aria-pressed=${this.activeIndex === i ? "true" : "false"}
              title=${label}
            >
              ${label}
            </button>
          `,
        )}
      </div>
    `;
  }
}
