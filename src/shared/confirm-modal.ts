import { LitElement, html, css } from "lit";
import { customElement, property, query } from "lit/decorators.js";
import { buttonReset } from "../styles/button-reset.js";

/**
 * cow-confirm-modal — generic yes/no confirmation dialog.
 *
 * Used for the global system-mode change (Cow Climate v4): changing the
 * mode on one display switches the single Mitsubishi motor for the whole
 * house, so we ask before applying when the motor is already running in a
 * different mode (spec §8-bis / D3).
 *
 * Fully controlled: parent owns `open` and listens for `cow-confirm` or
 * `cow-cancel`. Mirrors cow-setpoint-modal: native <dialog> in the top
 * layer so it stacks above the mobile room drawer.
 */
@customElement("cow-confirm-modal")
export class CowConfirmModal extends LitElement {
  @property({ type: Boolean, reflect: true }) open = false;
  @property({ type: String }) heading = "Confermi?";
  @property({ type: String }) message = "";
  @property({ type: String }) confirmLabel = "Conferma";
  @property({ type: String }) cancelLabel = "Annulla";
  @property({ type: String }) accent = "#fa6b2e";

  @query("dialog.modal") private dialogEl?: HTMLDialogElement;

  static override styles = [
    buttonReset,
    css`
      :host {
        display: contents;
      }
      dialog.modal[open] {
        position: fixed;
        margin: 0;
        padding: 1.25rem;
        border: 0;
        border-radius: 1.25rem;
        background: var(--card-background-color, #fff);
        color: var(--primary-text-color, #1f1f2e);
        box-shadow: 0 1.25rem 3rem rgba(0, 0, 0, 0.35);
        width: min(24rem, 92vw);
        max-width: 92vw;
        box-sizing: border-box;
        top: 22vh;
        left: 50%;
        transform: translateX(-50%);
        animation: cow-confirm-pop 200ms cubic-bezier(0.22, 1, 0.36, 1);
      }
      dialog.modal:not([open]) {
        display: none;
      }
      dialog.modal::backdrop {
        background: rgba(0, 0, 0, 0.55);
        animation: cow-confirm-fade 180ms ease;
      }
      @keyframes cow-confirm-fade {
        from { opacity: 0; }
        to { opacity: 1; }
      }
      @keyframes cow-confirm-pop {
        from { transform: translate(-50%, 1rem); opacity: 0.6; }
        to { transform: translate(-50%, 0); opacity: 1; }
      }
      @media (prefers-color-scheme: dark) {
        dialog.modal[open] {
          background: var(--ha-card-background, #1f1f2a);
          border: 0.0625rem solid rgba(255, 255, 255, 0.08);
        }
      }
      .heading {
        font-weight: 700;
        font-size: 1.0625rem;
        line-height: 1.2;
      }
      .message {
        margin-top: 0.625rem;
        font-weight: 500;
        font-size: 0.9375rem;
        line-height: 1.35;
        opacity: 0.85;
      }
      .actions {
        margin-top: 1.5rem;
        display: flex;
        gap: 0.5rem;
      }
      .btn {
        flex: 1;
        height: 2.75rem;
        border-radius: 0.75rem;
        font-weight: 600;
        font-size: 0.9375rem;
        cursor: pointer;
      }
      .btn.cancel {
        background: var(--secondary-background-color, rgba(31, 31, 46, 0.08));
        color: inherit;
      }
      .btn.confirm {
        background: var(--cow-confirm-accent, #fa6b2e);
        color: #fff;
      }
      .btn:active {
        filter: brightness(0.95);
      }
    `,
  ];

  override updated(changed: Map<string, unknown>): void {
    if (changed.has("open")) {
      const d = this.dialogEl;
      if (d) {
        if (this.open && !d.open) {
          try {
            d.showModal();
          } catch {
            /* already open or detached */
          }
        } else if (!this.open && d.open) {
          d.close();
        }
      }
    }
    this.style.setProperty("--cow-confirm-accent", this.accent);
  }

  private confirm = (): void => {
    this.dispatchEvent(
      new CustomEvent("cow-confirm", { bubbles: true, composed: true }),
    );
  };

  private cancel = (): void => {
    this.dispatchEvent(
      new CustomEvent("cow-cancel", { bubbles: true, composed: true }),
    );
  };

  private onDialogClick = (e: MouseEvent): void => {
    if (e.target === this.dialogEl) this.cancel();
  };

  override render() {
    return html`
      <dialog class="modal" @close=${this.cancel} @click=${this.onDialogClick}>
        <div class="heading">${this.heading}</div>
        ${this.message ? html`<div class="message">${this.message}</div>` : ""}
        <div class="actions">
          <button class="btn cancel" @click=${this.cancel}>
            ${this.cancelLabel}
          </button>
          <button class="btn confirm" @click=${this.confirm}>
            ${this.confirmLabel}
          </button>
        </div>
      </dialog>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "cow-confirm-modal": CowConfirmModal;
  }
}
