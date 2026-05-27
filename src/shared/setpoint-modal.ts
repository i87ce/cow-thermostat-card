import { LitElement, html, css } from "lit";
import { customElement, property, query, state } from "lit/decorators.js";
import { buttonReset } from "../styles/button-reset.js";

/**
 * cow-setpoint-modal — full-screen modal with a native numeric keyboard
 * for typing a climate setpoint directly.
 *
 * The element renders a native `<dialog>` controlled imperatively via
 * `showModal()` / `close()`. `<dialog>` is the only reliable way to
 * draw above HA Lovelace's nested "contain: layout" stacking contexts
 * — it escapes to the browser's top layer, just like the mobile
 * dashboard's room drawer (`cow-mobile-dashboard-card`). Because the
 * top layer is a stack, this modal can sit on top of the mobile
 * drawer's own `<dialog>` without z-index gymnastics.
 *
 * The input is `type="text" inputmode="decimal"` rather than
 * `type="number"` so that:
 *
 *   - Italian users can type "21,5" without `<input type="number">`
 *     silently rejecting the comma (Italian locale uses `,` as decimal
 *     separator); we normalise comma → period on parse.
 *   - We don't get the chunky up/down spinner UI on desktop browsers.
 *   - Mobile Safari / Chrome / WebView still surface the numeric
 *     keypad thanks to `inputmode="decimal"`.
 *
 * The component is fully controlled: the parent owns the `open` flag
 * and listens for `cow-setpoint-confirm` (with `{ value: number }`) or
 * `cow-setpoint-cancel`. The new value is already clamped to
 * `[min, max]` and snapped to `step` before it leaves the modal — so
 * the caller can pipe it straight into
 * `climate.set_temperature` without re-validating.
 */
@customElement("cow-setpoint-modal")
export class CowSetpointModal extends LitElement {
  @property({ type: Boolean, reflect: true }) open = false;
  @property({ type: Number }) value: number | null = null;
  @property({ type: Number }) min = 5;
  @property({ type: Number }) max = 35;
  @property({ type: Number }) step = 0.5;
  @property({ type: String }) unit = "°C";
  @property({ type: String }) accent = "#fa6b2e";
  @property({ type: String }) heading = "Imposta temperatura";
  @property({ type: String }) subtitle = "";

  @query("dialog.modal") private dialogEl?: HTMLDialogElement;
  @query("input.value-input") private inputEl?: HTMLInputElement;

  @state() private draft = "";
  @state() private error = "";

  static override styles = [
    buttonReset,
    css`
      :host {
        display: contents;
      }

      /* The modal lives in the browser top layer once showModal() is
         called. We override the UA centering to keep the sheet near
         the top on phones (so the on-screen keyboard doesn't shove
         the input off-screen) and the centre on larger surfaces. */
      dialog.modal[open] {
        position: fixed;
        margin: 0;
        padding: 1.25rem;
        border: 0;
        border-radius: 1.25rem;
        background: var(--card-background-color, #fff);
        color: var(--primary-text-color, #1f1f2e);
        box-shadow: 0 1.25rem 3rem rgba(0, 0, 0, 0.35);
        width: min(22rem, 92vw);
        max-width: 92vw;
        box-sizing: border-box;
        top: 18vh;
        left: 50%;
        transform: translateX(-50%);
        animation: cow-setpoint-pop 200ms cubic-bezier(0.22, 1, 0.36, 1);
      }
      dialog.modal:not([open]) {
        display: none;
      }
      dialog.modal::backdrop {
        background: rgba(0, 0, 0, 0.55);
        animation: cow-setpoint-fade 180ms ease;
      }
      @keyframes cow-setpoint-fade {
        from { opacity: 0; }
        to   { opacity: 1; }
      }
      @keyframes cow-setpoint-pop {
        from { transform: translate(-50%, 1rem); opacity: 0.6; }
        to   { transform: translate(-50%, 0); opacity: 1; }
      }

      @media (prefers-color-scheme: dark) {
        dialog.modal[open] {
          background: var(--ha-card-background, #1f1f2a);
          border: 0.0625rem solid rgba(255, 255, 255, 0.08);
        }
      }

      .heading {
        font-weight: 700;
        font-size: 1rem;
        line-height: 1.2;
      }
      .subtitle {
        margin-top: 0.25rem;
        font-weight: 500;
        font-size: 0.8125rem;
        opacity: 0.7;
      }

      .input-row {
        display: flex;
        align-items: center;
        gap: 0.5rem;
        margin-top: 1.25rem;
        padding: 0.75rem 1rem;
        border-radius: 0.875rem;
        background: var(--secondary-background-color, rgba(31, 31, 46, 0.05));
        border: 0.125rem solid transparent;
        transition: border-color 160ms ease;
      }
      .input-row[data-focused] {
        border-color: var(--cow-setpoint-accent, #fa6b2e);
      }
      .input-row[data-error] {
        border-color: var(--error-color, #db4437);
      }

      .value-input {
        flex: 1;
        min-width: 0;
        appearance: none;
        -webkit-appearance: none;
        background: transparent;
        border: 0;
        outline: none;
        color: inherit;
        font: inherit;
        font-weight: 300;
        font-size: 2.75rem;
        line-height: 1;
        font-variant-numeric: tabular-nums;
        text-align: right;
        padding: 0;
        /* Kill the native number spinner just in case the UA decides
           to render it from inputmode="decimal" */
        -moz-appearance: textfield;
      }
      .value-input::-webkit-outer-spin-button,
      .value-input::-webkit-inner-spin-button {
        -webkit-appearance: none;
        margin: 0;
      }
      .unit {
        font-weight: 500;
        font-size: 1.5rem;
        opacity: 0.7;
      }

      .hint {
        margin-top: 0.625rem;
        font-size: 0.75rem;
        opacity: 0.6;
        font-weight: 500;
      }
      .hint[data-error] {
        color: var(--error-color, #db4437);
        opacity: 1;
        font-weight: 600;
      }

      .actions {
        margin-top: 1.25rem;
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
        background: var(--cow-setpoint-accent, #fa6b2e);
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
          // Reactive open path — opens cleanly but the input focus
          // may land outside the user-gesture window on iOS (so the
          // on-screen keyboard might not pop). Parents that care
          // about that should also call `show()` from within the
          // click handler; see the method docstring.
          this.openDialog();
        } else if (!this.open && d.open) {
          d.close();
        }
      }
    }
    // Push the accent down as a CSS variable so the button + focus
    // ring tint follows whatever climate variant opened the modal.
    this.style.setProperty("--cow-setpoint-accent", this.accent);
  }

  /**
   * Open the dialog and focus the input synchronously. Call this
   * from a click handler — NOT from `updated()` or a microtask — to
   * preserve the iOS Safari "user gesture" attribute so the native
   * on-screen keyboard surfaces immediately. The reactive `open`
   * prop also opens the dialog, but on iOS the focus call lands in
   * a follow-up frame and the keyboard stays hidden until the user
   * taps the input a second time.
   */
  show(): void {
    this.openDialog();
  }

  private openDialog(): void {
    const d = this.dialogEl;
    if (!d) return;
    this.resetDraft();
    if (!d.open) {
      try {
        d.showModal();
      } catch {
        /* already open or detached */
      }
    }
    // Focus + select inline with the gesture so iOS opens the
    // on-screen keyboard. select() also seeds the field so typing
    // immediately overwrites the previous value — saves the user a
    // backspace.
    const input = this.inputEl;
    if (input) {
      input.focus({ preventScroll: true });
      input.select();
    }
  }

  private resetDraft(): void {
    this.draft = this.value != null ? this.formatForInput(this.value) : "";
    this.error = "";
  }

  /**
   * Render the seed value in whatever decimal separator the user's
   * locale prefers. We keep the parse forgiving (both `,` and `.`
   * accepted on read) but the seed value lines up with what they'd
   * type themselves, which feels more native on Italian setups.
   */
  private formatForInput(n: number): string {
    const fixed = Number.isInteger(n)
      ? String(n)
      : n.toFixed(2).replace(/0+$/, "").replace(/\.$/, "");
    return fixed;
  }

  private onInput = (e: Event): void => {
    const v = (e.target as HTMLInputElement).value;
    // Strip anything that isn't a digit, comma, dot, or minus sign
    // — keeps Android softkey "qwerty fallback" honest if the user
    // somehow types a letter into a numeric input.
    const cleaned = v.replace(/[^0-9.,\-]/g, "");
    this.draft = cleaned;
    if (this.error) this.error = "";
  };

  private onKeyDown = (e: KeyboardEvent): void => {
    if (e.key === "Enter") {
      e.preventDefault();
      this.confirm();
    } else if (e.key === "Escape") {
      // Native <dialog> already handles Escape via the `close` event,
      // but we want our `cow-setpoint-cancel` event to fire too.
      e.preventDefault();
      this.cancel();
    }
  };

  private parseDraft(): number | null {
    const raw = this.draft.trim().replace(",", ".");
    if (raw === "") return null;
    const n = parseFloat(raw);
    return Number.isFinite(n) ? n : null;
  }

  private confirm = (): void => {
    const n = this.parseDraft();
    if (n == null) {
      this.error = "Inserisci un numero valido";
      return;
    }
    if (n < this.min || n > this.max) {
      this.error = `Valore tra ${this.min} e ${this.max}`;
      return;
    }
    // Snap to step so service calls land on a valid setpoint. We do
    // this AFTER the range check so out-of-range inputs surface as a
    // clear error rather than silently being clamped.
    const snapped = Math.round(n / this.step) * this.step;
    // Round to 1 decimal place to kill floating-point drift
    // (e.g. 21.500000003 → 21.5) before it reaches HA.
    const rounded = Math.round(snapped * 10) / 10;
    this.dispatchEvent(
      new CustomEvent("cow-setpoint-confirm", {
        detail: { value: rounded },
        bubbles: true,
        composed: true,
      }),
    );
  };

  private cancel = (): void => {
    this.dispatchEvent(
      new CustomEvent("cow-setpoint-cancel", {
        bubbles: true,
        composed: true,
      }),
    );
  };

  private onDialogClick = (e: MouseEvent): void => {
    // Native <dialog> click event fires for clicks on the dialog
    // itself when the user hits the backdrop area (the dialog node
    // occupies the whole viewport in modal mode). We match by target
    // to distinguish backdrop clicks from content clicks.
    if (e.target === this.dialogEl) this.cancel();
  };

  private onFocus = (): void => {
    const row = this.renderRoot.querySelector(".input-row");
    row?.setAttribute("data-focused", "");
  };
  private onBlur = (): void => {
    const row = this.renderRoot.querySelector(".input-row");
    row?.removeAttribute("data-focused");
  };

  override render() {
    const hint = this.error
      ? this.error
      : `Min ${this.min} · Max ${this.max} · Step ${this.step}`;
    return html`
      <dialog
        class="modal"
        @close=${this.cancel}
        @click=${this.onDialogClick}
      >
        <div class="heading">${this.heading}</div>
        ${this.subtitle
          ? html`<div class="subtitle">${this.subtitle}</div>`
          : ""}
        <div class="input-row" ?data-error=${!!this.error}>
          <input
            class="value-input"
            type="text"
            inputmode="decimal"
            autocomplete="off"
            enterkeyhint="done"
            .value=${this.draft}
            @input=${this.onInput}
            @keydown=${this.onKeyDown}
            @focus=${this.onFocus}
            @blur=${this.onBlur}
            aria-label=${this.heading}
          />
          <span class="unit">${this.unit}</span>
        </div>
        <div class="hint" ?data-error=${!!this.error}>${hint}</div>
        <div class="actions">
          <button class="btn cancel" @click=${this.cancel}>Annulla</button>
          <button class="btn confirm" @click=${this.confirm}>OK</button>
        </div>
      </dialog>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "cow-setpoint-modal": CowSetpointModal;
  }
}
