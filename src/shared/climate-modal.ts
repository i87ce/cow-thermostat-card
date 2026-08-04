import { LitElement, html, css } from "lit";
import { customElement, property, query, state } from "lit/decorators.js";
import { buttonReset } from "../styles/button-reset.js";
import { climateIconSvg } from "./climate-icons.js";

export interface ClimateModalItem {
  id: string;
  label: string;
  /** Optional glyph id resolved via climate-icons (e.g. "heat", "cool"). */
  icon?: string;
}

export interface ClimateModalSection {
  id: string;
  label: string;
  items: ClimateModalItem[];
  activeId: string;
  /** Options per row. Defaults to 2 (icon grids) — use 3 for text-only. */
  columns?: number;
}

/**
 * cow-climate-modal — full-screen mode / fan picker for the wall
 * displays.
 *
 * Born from a touch-target audit (v1.9): the inline Mode/Fan chip rows
 * rendered at 33 stage-px ≈ 3 mm on a Wall Display — far below the
 * 44 px minimum. Instead of cramming 6 modes + 7 fan speeds into the
 * right column, the thermostat panel now shows ONE large summary
 * button that opens this picker, where every option is a ≥64 real-px
 * target.
 *
 * Same architecture as cow-setpoint-modal: a native `<dialog>` in the
 * browser top layer (escapes the card's transform-scale stage and any
 * Lovelace stacking context), fully controlled by the parent via the
 * `open` prop + `show()` for gesture-preserving imperative opens.
 * Because the top layer is a stack, cow-confirm-modal can still open
 * ABOVE this one (system-mode confirmation flow).
 *
 * Selection is applied immediately (`cow-climate-select`); the modal
 * stays open so mode + fan can be adjusted in one visit. The tapped
 * option is highlighted optimistically until the entity state echoes
 * back through the `sections` property (HA round-trip ~0.5-2 s on
 * Zigbee/cloud units — without this the tap would feel ignored).
 */
@customElement("cow-climate-modal")
export class CowClimateModal extends LitElement {
  @property({ type: Boolean, reflect: true }) open = false;
  @property({ type: String }) heading = "Clima";
  @property({ type: String }) accent = "#fa6b2e";
  @property({ type: Array }) sections: ClimateModalSection[] = [];

  @query("dialog.modal") private dialogEl?: HTMLDialogElement;

  /** Optimistic per-section selection, cleared once HA state echoes. */
  @state() private pending: Record<string, string> = {};

  static override styles = [
    buttonReset,
    css`
      :host {
        display: contents;
      }
      dialog.modal[open] {
        position: fixed;
        inset: 0;
        margin: 0;
        border: 0;
        padding: 1.25rem 1.25rem 1rem;
        width: 100vw;
        height: 100vh;
        max-width: 100vw;
        max-height: 100vh;
        box-sizing: border-box;
        background: var(--card-background-color, #f7f7fa);
        color: var(--primary-text-color, #1f1f2e);
        display: flex;
        flex-direction: column;
        overflow: hidden;
        animation: cow-climate-rise 240ms cubic-bezier(0.22, 1, 0.36, 1);
      }
      dialog.modal:not([open]) {
        display: none;
      }
      @keyframes cow-climate-rise {
        from {
          transform: translateY(2rem);
          opacity: 0.5;
        }
        to {
          transform: translateY(0);
          opacity: 1;
        }
      }
      @media (prefers-reduced-motion: reduce) {
        dialog.modal[open] {
          animation: none;
        }
      }
      @media (prefers-color-scheme: dark) {
        dialog.modal[open] {
          background: var(--ha-card-background, #1f1f2a);
        }
      }

      .head {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 0.75rem;
        flex: 0 0 auto;
      }
      .heading {
        font-weight: 700;
        font-size: 1.375rem;
        line-height: 1.2;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .close {
        flex: 0 0 auto;
        width: 3rem;
        height: 3rem;
        border-radius: 50%;
        background: var(--secondary-background-color, rgba(31, 31, 46, 0.07));
        color: inherit;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
      }
      .close:active {
        transform: scale(0.94);
      }

      .body {
        flex: 1 1 auto;
        overflow-y: auto;
        margin-top: 0.25rem;
        /* Room for the last row's press-scale so it never clips. */
        padding-bottom: 0.25rem;
      }

      .section-label {
        margin: 1rem 0 0.625rem;
        font-weight: 600;
        font-size: 0.9375rem;
        letter-spacing: 0.09375rem;
        text-transform: uppercase;
        color: var(--secondary-text-color, #73737f);
      }

      .options {
        display: grid;
        grid-template-columns: repeat(var(--cols, 2), 1fr);
        gap: 0.625rem;
      }
      .option {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: 0.375rem;
        min-height: 4.25rem;
        padding: 0.5rem 0.375rem;
        border-radius: 1rem;
        background: var(--secondary-background-color, #ececf2);
        color: var(--cow-modal-option-fg, #4a4a57);
        font-weight: 600;
        font-size: 1.125rem;
        line-height: 1.1;
        cursor: pointer;
        transition:
          background-color 160ms ease,
          color 160ms ease,
          transform 120ms ease;
      }
      .option svg {
        opacity: 0.85;
      }
      .option:active {
        transform: scale(0.96);
      }
      .option[data-active] {
        background: var(--cow-modal-accent, #fa6b2e);
        color: #fff;
      }
      .option[data-active] svg {
        opacity: 1;
      }

      .done {
        flex: 0 0 auto;
        margin-top: 0.875rem;
        width: 100%;
        height: 3.5rem;
        border-radius: 1rem;
        background: var(--cow-modal-accent, #fa6b2e);
        color: #fff;
        font-weight: 700;
        font-size: 1.1875rem;
        cursor: pointer;
      }
      .done:active {
        filter: brightness(0.94);
        transform: scale(0.99);
      }
    `,
  ];

  override willUpdate(): void {
    // Clear optimistic picks that HA has confirmed (state echoed back).
    for (const s of this.sections) {
      if (this.pending[s.id] != null && this.pending[s.id] === s.activeId) {
        const { [s.id]: _done, ...rest } = this.pending;
        this.pending = rest;
      }
    }
  }

  override updated(changed: Map<string, unknown>): void {
    if (changed.has("open")) {
      const d = this.dialogEl;
      if (d) {
        if (this.open && !d.open) this.openDialog();
        else if (!this.open && d.open) d.close();
      }
    }
    this.style.setProperty("--cow-modal-accent", this.accent);
  }

  /** Open synchronously from a click handler (same rationale as
   *  cow-setpoint-modal.show — keeps the user-gesture chain intact). */
  show(): void {
    this.openDialog();
  }

  private openDialog(): void {
    const d = this.dialogEl;
    if (!d || d.open) return;
    this.pending = {};
    try {
      d.showModal();
    } catch {
      /* already open or detached */
    }
  }

  /** Drop the optimistic highlight for one section — used by parents
   *  when a selection needs a confirmation step and the user cancels. */
  revert(sectionId: string): void {
    if (this.pending[sectionId] == null) return;
    const { [sectionId]: _drop, ...rest } = this.pending;
    this.pending = rest;
  }

  private pick(sectionId: string, id: string): void {
    this.pending = { ...this.pending, [sectionId]: id };
    this.dispatchEvent(
      new CustomEvent("cow-climate-select", {
        detail: { section: sectionId, id },
        bubbles: true,
        composed: true,
      }),
    );
  }

  private requestClose = (): void => {
    this.dispatchEvent(
      new CustomEvent("cow-climate-close", { bubbles: true, composed: true }),
    );
  };

  private renderSection(s: ClimateModalSection) {
    const active = this.pending[s.id] ?? s.activeId;
    const cols = s.columns ?? 2;
    return html`
      <div class="section-label">${s.label}</div>
      <div class="options" style="--cols:${cols}" role="radiogroup" aria-label=${s.label}>
        ${s.items.map(
          (it) => html`
            <button
              class="option"
              role="radio"
              aria-checked=${it.id === active ? "true" : "false"}
              ?data-active=${it.id === active}
              @click=${() => this.pick(s.id, it.id)}
            >
              ${it.icon ? climateIconSvg(it.icon, 30) : ""}
              <span>${it.label}</span>
            </button>
          `,
        )}
      </div>
    `;
  }

  override render() {
    return html`
      <dialog class="modal" @close=${this.requestClose}>
        <div class="head">
          <div class="heading">${this.heading}</div>
          <button class="close" aria-label="Chiudi" @click=${this.requestClose}>
            ${climateIconSvg("close", 24)}
          </button>
        </div>
        <div class="body">
          ${this.sections.map((s) => this.renderSection(s))}
        </div>
        <button class="done" @click=${this.requestClose}>Fatto</button>
      </dialog>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "cow-climate-modal": CowClimateModal;
  }
}
