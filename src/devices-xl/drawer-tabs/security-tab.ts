import { LitElement, html, css, nothing } from "lit";
import { customElement, property } from "lit/decorators.js";
import type { HomeAssistant } from "../../types/hass.js";
import type { CowRoomConfig } from "../../config-xl.js";

/**
 * Security tab — placeholder for Phase 3 (alarm, locks, motion sensors).
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
    .empty .icon {
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

  override render() {
    if (!this.room) return nothing;
    return html`
      <div class="caption">SICUREZZA</div>
      <div class="empty">
        <div class="icon">🔒</div>
        <div class="title">Sicurezza in arrivo</div>
        <div class="desc">
          Allarmi, serrature smart, sensori di movimento e telecamere saranno
          disponibili nella prossima fase.
        </div>
      </div>
    `;
  }
}
