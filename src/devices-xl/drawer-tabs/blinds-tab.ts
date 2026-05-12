import { LitElement, html, css, nothing } from "lit";
import { customElement, property } from "lit/decorators.js";
import type { HomeAssistant } from "../../types/hass.js";
import type { CowRoomConfig } from "../../config-xl.js";
import { buttonReset } from "../../styles/button-reset.js";
import { deriveBlindsView } from "../../state/blinds-state.js";
import "../../visuals/blind-visual.js";

/**
 * Blinds tab — replicates Figma "11. Mix — Drawer Blinds" body.
 *
 * Each blind card is 600×320 (37.5rem × 20rem). Two cards fit side-by-side
 * with 16px gap. Below: full-width Apri tutte / Chiudi tutte action bar.
 */
@customElement("cow-xl-blinds-tab")
export class CowXLBlindsTab extends LitElement {
  @property({ attribute: false }) hass?: HomeAssistant;
  @property({ attribute: false }) room?: CowRoomConfig;

  static override styles = [
    buttonReset,
    css`
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
        top: 2.25rem;
        bottom: 5rem;
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(24rem, 1fr));
        grid-auto-rows: 8.75rem; /* 140px fixed card height */
        gap: 0.625rem;
        overflow-y: auto;
        align-content: start;
        scrollbar-width: thin;
      }
      .blind-card {
        background: var(--cow-surface-white);
        border: 0.0625rem solid var(--cow-surface-border);
        border-radius: 1rem;
        padding: 0.75rem 1rem;
        display: grid;
        grid-template-columns: 4.5rem 1fr;
        column-gap: 0.875rem;
        align-items: stretch;
        min-height: 0;
      }
      .visual-wrap {
        width: 4.5rem;
        align-self: center;
        height: 5.5rem;
        background: linear-gradient(
          180deg,
          var(--cow-blinds-blue) 0%,
          var(--cow-blinds-blue-dark, #2f6cb5) 100%
        );
        border-radius: 0.625rem;
        display: flex;
        align-items: center;
        justify-content: center;
        position: relative;
      }
      cow-blind-visual {
        width: 3.5rem;
        height: 4.5rem;
        --cow-blinds-amber-light: #f6c47a;
      }
      .info {
        display: grid;
        grid-template-rows: auto auto 1fr auto;
        min-width: 0;
        row-gap: 0.125rem;
      }
      .b-head {
        display: flex;
        align-items: baseline;
        justify-content: space-between;
        gap: 0.5rem;
        min-width: 0;
      }
      .b-label {
        font-weight: 700;
        font-size: 0.75rem;
        letter-spacing: 0.075rem;
        text-transform: uppercase;
        color: var(--cow-text-secondary);
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        min-width: 0;
      }
      .b-value {
        font-weight: 400;
        font-size: 1.5rem;
        line-height: 1;
        color: var(--cow-text-primary);
        font-variant-numeric: tabular-nums;
        flex: 0 0 auto;
      }
      .b-status {
        font-weight: 500;
        font-size: 0.75rem;
        color: var(--cow-text-secondary);
      }
      .b-buttons {
        align-self: end;
        display: flex;
        gap: 0.375rem;
      }
      .b-btn {
        flex: 1;
        height: 2rem;
        border-radius: 0.75rem;
        background: var(--cow-surface-button-bg);
        color: var(--cow-text-primary);
        font-weight: 600;
        font-size: 0.875rem;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: 0.375rem;
        cursor: pointer;
        transition: background 160ms ease, color 160ms ease;
      }
      .b-btn[data-active] {
        background: var(--cow-blinds-blue, #3b7ed1);
        color: var(--cow-surface-white);
      }
      .b-btn-stop[data-active] {
        background: var(--cow-stop, #e74c3c);
      }
      .b-btn .ico {
        font-size: 0.6875rem;
        opacity: 0.85;
      }
      .actions {
        position: absolute;
        left: 2rem;
        right: 2rem;
        bottom: 1rem;
        height: 3.5rem;
        display: flex;
        gap: 1rem;
      }
      .act {
        flex: 1;
        height: 100%;
        border-radius: 1rem;
        font-weight: 600;
        font-size: 1rem;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
      }
      .act-open {
        background: var(--cow-blinds-blue, #3b7ed1);
        color: var(--cow-surface-white);
      }
      .act-close {
        background: var(--cow-text-primary);
        color: var(--cow-surface-white);
      }
    `,
  ];

  private getCoverIds(): string[] {
    if (!this.room?.cover) return [];
    return Array.isArray(this.room.cover)
      ? this.room.cover
      : [this.room.cover];
  }

  private getCoverLabels(): string[] {
    const ids = this.getCoverIds();
    const labels = this.room?.cover_labels ?? [];
    return ids.map((id, i) => {
      const lbl = labels[i];
      if (lbl) return lbl;
      const friendly = this.hass?.states?.[id]?.attributes?.friendly_name;
      if (typeof friendly === "string" && friendly.length > 0) return friendly;
      return id.split(".")[1] ?? id;
    });
  }

  private async open(id: string) {
    await this.hass?.callService("cover", "open_cover", { entity_id: id });
  }
  private async close(id: string) {
    await this.hass?.callService("cover", "close_cover", { entity_id: id });
  }
  private async stop(id: string) {
    await this.hass?.callService("cover", "stop_cover", { entity_id: id });
  }
  private async setPosition(id: string, pos: number) {
    await this.hass?.callService("cover", "set_cover_position", {
      entity_id: id,
      position: pos,
    });
  }

  private async masterOpenAll() {
    if (!this.hass) return;
    const ids = this.getCoverIds();
    if (ids.length === 0) return;
    await this.hass.callService("cover", "open_cover", { entity_id: ids });
  }
  private async masterCloseAll() {
    if (!this.hass) return;
    const ids = this.getCoverIds();
    if (ids.length === 0) return;
    await this.hass.callService("cover", "close_cover", { entity_id: ids });
  }

  private statusLabel(pos: number, raw: string): string {
    if (raw === "opening") return "In apertura…";
    if (raw === "closing") return "In chiusura…";
    if (pos === 100) return "Tutta aperta";
    if (pos === 0) return "Tutta chiusa";
    return `${pos}% aperta`;
  }

  private renderBlindCard(id: string, label: string) {
    const entity = this.hass?.states?.[id];
    const view = deriveBlindsView(entity);
    return html`
      <div class="blind-card">
        <div class="visual-wrap">
          <cow-blind-visual
            .variant=${view.variant}
            .position=${view.position}
          ></cow-blind-visual>
        </div>
        <div class="info">
          <div class="b-head">
            <div class="b-label">${label}</div>
            <div class="b-value">${view.position}%</div>
          </div>
          <div class="b-status">
            ${this.statusLabel(view.position, view.raw)}
          </div>
          <div></div>
          <div class="b-buttons">
            <button
              class="b-btn"
              ?data-active=${view.raw === "opening" || view.position === 100}
              @click=${() => this.open(id)}
              aria-label="Apri ${label}"
            >
              <span class="ico">▲</span> Apri
            </button>
            <button
              class="b-btn b-btn-stop"
              ?data-active=${view.raw === "opening" || view.raw === "closing"}
              @click=${() => this.stop(id)}
              aria-label="Ferma ${label}"
            >
              <span class="ico">■</span> Stop
            </button>
            <button
              class="b-btn"
              ?data-active=${view.raw === "closing" || view.position === 0}
              @click=${() => this.close(id)}
              aria-label="Chiudi ${label}"
            >
              <span class="ico">▼</span> Chiudi
            </button>
          </div>
        </div>
      </div>
    `;
  }

  override render() {
    if (!this.room) return nothing;
    const ids = this.getCoverIds();
    const labels = this.getCoverLabels();
    return html`
      <div class="caption">TAPPARELLE — ${ids.length} IN STANZA</div>
      <div class="grid">
        ${ids.map((id, i) => this.renderBlindCard(id, labels[i] ?? id))}
      </div>
      <div class="actions">
        <button class="act act-open" @click=${() => this.masterOpenAll()}>
          Apri tutte
        </button>
        <button class="act act-close" @click=${() => this.masterCloseAll()}>
          Chiudi tutte
        </button>
      </div>
    `;
  }
}
