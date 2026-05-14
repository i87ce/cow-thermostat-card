import { LitElement, html, css } from "lit";
import { customElement, property } from "lit/decorators.js";
import "./chip-row.js";
import type { ChipItem } from "./chip-row.js";

/**
 * Bottom block of lights/blinds panels — Figma "Apparecchi · TUTTE"
 * label row + horizontal multi-entity selector chip-row.
 *
 *  +------------------------------------------------+
 *  | Apparecchi                              TUTTE  |
 *  | [ Tutte ] [ Soffitto ] [ Tavolo ] [ Spot ]     |
 *  +------------------------------------------------+
 *
 * Active chip is "all" (id === "all") OR a specific entity id. The
 * scope label on the right always reflects the active chip's label
 * uppercased, in the panel's accent color.
 */
@customElement("cow-scope-row")
export class CowScopeRow extends LitElement {
  /** Visible chips, including the leading "Tutte" master chip. */
  @property({ type: Array }) items: ChipItem[] = [];
  @property({ type: String }) activeId = "all";
  @property({ type: String }) accent?: string;
  @property({ type: String }) sectionLabel = "Apparecchi";

  static override styles = css`
    :host {
      display: block;
      width: 100%;
    }
    .head {
      display: flex;
      align-items: baseline;
      justify-content: space-between;
      margin-bottom: 11px;
      padding: 0 1px;
    }
    .section {
      font-family: inherit;
      font-weight: 400;
      font-size: 14px;
      color: var(--cow-text-secondary, #8c8c99);
    }
    .scope {
      font-family: inherit;
      font-weight: 700;
      font-size: 14px;
      letter-spacing: 1.5px;
      text-transform: uppercase;
      color: var(--cow-accent, #1f1f2e);
      transition: color 240ms cubic-bezier(0.22, 1, 0.36, 1);
    }
  `;

  private get scopeText(): string {
    const it = this.items.find((x) => x.id === this.activeId);
    return (it?.label ?? "TUTTE").toUpperCase();
  }

  override render() {
    return html`
      <div class="head">
        <span class="section">${this.sectionLabel}</span>
        <span class="scope" style=${this.accent ? `color:${this.accent}` : ""}>
          ${this.scopeText}
        </span>
      </div>
      <cow-chip-row
        .items=${this.items}
        .activeId=${this.activeId}
        .accent=${this.accent}
      ></cow-chip-row>
    `;
  }
}
