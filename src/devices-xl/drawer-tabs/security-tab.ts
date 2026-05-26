import { LitElement, html, css, nothing } from "lit";
import { customElement, property } from "lit/decorators.js";
import type { HomeAssistant } from "../../types/hass.js";
import type { CowRoomConfig } from "../../config-xl.js";
import { findRoomOpeningsXL } from "../../config-xl.js";
import {
  openingIconSvg,
  type AjaxOpening,
} from "../../util/ajax-openings.js";

/**
 * Security tab — per-room list of Ajax door/window contacts.
 *
 * Read-only by design (the contacts themselves can't be opened/closed
 * remotely): each row shows the kind icon, the device's display name,
 * and a coloured pill saying "Aperta" / "Chiusa". Empty state covers
 * the common case of a bathroom or service room with no Ajax devices
 * at all.
 *
 * Alarms / locks / motion / cameras remain Phase 3 — they'll grow into
 * additional sections below the openings list when implemented.
 */
@customElement("cow-xl-security-tab")
export class CowXLSecurityTab extends LitElement {
  @property({ attribute: false }) hass?: HomeAssistant;
  @property({ attribute: false }) room?: CowRoomConfig;

  static override styles = css`
    :host {
      display: block;
      position: relative;
      height: 100%;
    }
    .caption {
      position: absolute;
      left: 2rem;
      top: 0.5rem;
      font-weight: 700;
      font-size: 0.8125rem;
      letter-spacing: 0.075rem;
      color: var(--cow-text-secondary);
      text-transform: uppercase;
    }
    .grid {
      position: absolute;
      left: 2rem;
      right: 2rem;
      top: 2.5rem;
      bottom: 1rem;
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(15rem, 1fr));
      grid-auto-rows: 4.5rem;
      gap: 0.625rem;
      overflow-y: auto;
      padding-right: 0.25rem;
    }
    .row {
      display: flex;
      align-items: center;
      gap: 0.875rem;
      padding: 0 1rem;
      background: var(--cow-surface-white);
      border: 0.0625rem solid var(--cow-surface-border);
      border-radius: 1rem;
      transition: border-color 160ms ease, background 160ms ease;
    }
    .row[data-open] {
      border-color: rgba(231, 76, 60, 0.35);
      background: linear-gradient(
        180deg,
        rgba(231, 76, 60, 0.06) 0%,
        var(--cow-surface-white) 100%
      );
    }
    .icon {
      flex: 0 0 auto;
      width: 2.25rem;
      height: 2.25rem;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      color: var(--cow-text-disabled, #b3b3bd);
      transition: color 160ms ease;
    }
    .row[data-open] .icon {
      color: var(--cow-stop, #e74c3c);
    }
    .icon svg {
      width: 100%;
      height: 100%;
      display: block;
    }
    .meta {
      flex: 1 1 auto;
      min-width: 0;
      display: flex;
      flex-direction: column;
      gap: 0.125rem;
    }
    .name {
      font-weight: 600;
      font-size: 0.9375rem;
      color: var(--cow-text-primary);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .sub {
      font-size: 0.75rem;
      color: var(--cow-text-secondary);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .pill {
      flex: 0 0 auto;
      display: inline-flex;
      align-items: center;
      gap: 0.375rem;
      height: 1.75rem;
      padding: 0 0.75rem;
      border-radius: 0.875rem;
      font-weight: 600;
      font-size: 0.75rem;
      letter-spacing: 0.02em;
      background: var(--cow-surface-button-bg);
      color: var(--cow-text-secondary);
    }
    .row[data-open] .pill {
      background: var(--cow-stop, #e74c3c);
      color: var(--cow-surface-white);
    }
    .empty {
      position: absolute;
      left: 2rem;
      right: 2rem;
      top: 2.5rem;
      bottom: 1rem;
      background: var(--cow-surface-white);
      border: 0.0625rem dashed var(--cow-surface-border);
      border-radius: 1.25rem;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 0.5rem;
      color: var(--cow-text-secondary);
      text-align: center;
      padding: 2rem;
    }
    .empty .glyph {
      font-size: 2.5rem;
      line-height: 1;
    }
    .empty .title {
      font-weight: 600;
      font-size: 1rem;
      color: var(--cow-text-primary);
    }
    .empty .desc {
      font-size: 0.875rem;
      max-width: 28rem;
    }
  `;

  private openings(): AjaxOpening[] {
    if (!this.room) return [];
    return findRoomOpeningsXL(this.hass, this.room);
  }

  override render() {
    if (!this.room) return nothing;
    const openings = this.openings();

    if (openings.length === 0) {
      return html`
        <div class="caption">SICUREZZA</div>
        <div class="empty">
          <div class="glyph">🔒</div>
          <div class="title">Nessun sensore Ajax</div>
          <div class="desc">
            Non risultano sensori porta/finestra Ajax assegnati a questa
            stanza. Allarmi, serrature smart e telecamere arriveranno in
            una prossima versione.
          </div>
        </div>
      `;
    }

    return html`
      <div class="caption">
        APERTURE — ${openings.length}
        ${openings.length === 1 ? "sensore" : "sensori"}
      </div>
      <div class="grid">
        ${openings.map((o) => this.renderRow(o))}
      </div>
    `;
  }

  private renderRow(o: AjaxOpening) {
    const sub = this.subtitleFor(o);
    return html`
      <div class="row" ?data-open=${o.isOpen}>
        <span class="icon">${openingIconSvg(o.kind, o.isOpen)}</span>
        <div class="meta">
          <div class="name">${o.deviceName}</div>
          ${sub ? html`<div class="sub">${sub}</div>` : nothing}
        </div>
        <span class="pill">${o.isOpen ? "Aperta" : "Chiusa"}</span>
      </div>
    `;
  }

  private subtitleFor(o: AjaxOpening): string {
    const bits: string[] = [];
    if (o.kind === "door") bits.push("Porta");
    else if (o.kind === "garage") bits.push("Garage");
    else bits.push("Finestra");
    if (o.ajaxRoomName) bits.push(o.ajaxRoomName);
    else if (o.areaName) bits.push(o.areaName);
    return bits.join(" · ");
  }
}
