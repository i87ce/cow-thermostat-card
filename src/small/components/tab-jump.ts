import { LitElement, html, css, svg, type SVGTemplateResult } from "lit";
import { customElement, property, query, state } from "lit/decorators.js";

import type { InitialView } from "../config.js";
import { buttonReset } from "../../styles/button-reset.js";
import { animTokens } from "../styles/anim.js";

/**
 * Overlay sheet to jump between small-card swiper tabs.
 *
 * Opens from a double-tap on the pagination dots (`cow-dots-doubletap`).
 * We do not listen on the top edge: Shelly Wall Display firmware owns
 * that swipe for a hidden system menu, and a competing gesture there
 * is unusable. Dismiss with a tab tap, backdrop tap, swipe up, or
 * Escape. Horizontal swiper, lights brightness, hidden studio-door
 * triple-tap, and setpoint dialogs stay untouched — the host is
 * `pointer-events: none` until the sheet is open, and we only claim
 * a pointer for the dismiss drag. Small 720×720 stage only (not XL).
 */
export const TAB_JUMP_LABEL: Record<InitialView, string> = {
  thermostat: "Termostato",
  lights: "Luci",
  blinds: "Tapparelle",
  extras: "Comandi",
};

/** Screen px — same order of magnitude as the swiper / lights slop. */
const CLAIM_PX = 10;
const CLOSE_RATIO = 0.55;
const FLICK_MS = 220;
const FLICK_PX = 48;

const ICON: Record<InitialView, SVGTemplateResult> = {
  thermostat: svg`<svg viewBox="0 0 24 24" width="52" height="52" fill="currentColor" aria-hidden="true"><path d="M15 13V5A3 3 0 0 0 9 5V13A5 5 0 1 0 15 13M12 4A1 1 0 0 1 13 5V8H11V5A1 1 0 0 1 12 4Z"/></svg>`,
  lights: svg`<svg viewBox="0 0 24 24" width="52" height="52" fill="currentColor" aria-hidden="true"><path d="M12,2A7,7 0 0,0 5,9C5,11.38 6.19,13.47 8,14.74V17A1,1 0 0,0 9,18H15A1,1 0 0,0 16,17V14.74C17.81,13.47 19,11.38 19,9A7,7 0 0,0 12,2M9,21A1,1 0 0,0 10,22H14A1,1 0 0,0 15,21V20H9V21Z"/></svg>`,
  blinds: svg`<svg viewBox="0 0 24 24" width="52" height="52" fill="currentColor" aria-hidden="true"><path d="M3,4H21V8H19V20H17V8H7V20H5V8H3V4M8,9H16V11H8V9M8,12H16V14H8V12M8,15H16V17H8V15Z"/></svg>`,
  extras: svg`<svg viewBox="0 0 24 24" width="52" height="52" fill="currentColor" aria-hidden="true"><path d="M3,17V19H9V17H3M3,5V7H13V5H3M13,21V19H21V17H13V15H11V21H13M7,9V11H3V13H7V15H9V9H7M21,13V11H11V13H21M15,9H17V7H21V5H17V3H15V9Z"/></svg>`,
};

@customElement("cow-tab-jump")
export class CowTabJump extends LitElement {
  @property({ type: Array }) kinds: InitialView[] = [];
  @property({ type: Number }) index = 0;
  @property({ type: Array }) accents: string[] = [];

  @state() private open = false;
  @query(".sheet") private sheetEl?: HTMLElement;
  @query(".scrim") private scrimEl?: HTMLElement;

  private parentEl: HTMLElement | null = null;
  private startX = 0;
  private startY = 0;
  private startT = 0;
  private offset = 0;
  private claimed = false;
  private pointerId: number | null = null;
  private sheetH = 248;
  private onKey = (e: KeyboardEvent): void => {
    if (e.key === "Escape" && this.open) this.setOpen(false);
  };

  static override styles = [
    buttonReset,
    animTokens,
    css`
      :host {
        position: absolute;
        inset: 0;
        z-index: 20;
        pointer-events: none;
        display: block;
      }
      :host([open]),
      :host([pulling]) {
        pointer-events: auto;
        touch-action: none;
      }

      .scrim {
        position: absolute;
        inset: 0;
        background: #1f1f2e;
        opacity: 0;
        pointer-events: none;
        transition: opacity 320ms cubic-bezier(0.22, 1, 0.36, 1);
      }
      :host([open]) .scrim,
      :host([pulling]) .scrim {
        pointer-events: auto;
      }
      :host([pulling]) .scrim {
        transition: none;
      }

      .sheet {
        position: absolute;
        left: 0;
        right: 0;
        top: 0;
        transform: translate3d(0, -100%, 0);
        transition: transform 320ms cubic-bezier(0.22, 1, 0.36, 1);
        background: var(--cow-surface-white, #fff);
        border-radius: 0 0 var(--cow-radius-xl, 16px) var(--cow-radius-xl, 16px);
        box-shadow: 0 0.5rem 1.5rem rgba(31, 31, 46, 0.18);
        padding: 22px 22px 18px;
        box-sizing: border-box;
        touch-action: none;
        -webkit-user-select: none;
        user-select: none;
      }
      :host([pulling]) .sheet {
        transition: none;
      }

      .tabs {
        display: flex;
        gap: 12px;
      }
      .tab {
        flex: 1 1 0;
        min-width: 0;
        height: 168px;
        padding: 18px 8px 16px;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: 12px;
        border-radius: var(--cow-radius-xl, 16px);
        background: var(--cow-surface-button-bg, #f0f0f2);
        color: var(--cow-text-primary, #1f1f2e);
        font-weight: 600;
        font-size: 22px;
        line-height: 1.15;
        text-align: center;
        touch-action: none;
      }
      .tab svg {
        display: block;
        flex: 0 0 auto;
        color: var(--tab-accent, var(--cow-text-secondary, #8c8c99));
      }
      .tab[aria-current="page"] {
        background: var(--cow-surface-white, #fff);
        box-shadow: var(--cow-shadow-card, 0 0.125rem 0.5rem rgba(31, 31, 46, 0.08));
        color: var(--tab-accent, var(--cow-text-primary, #1f1f2e));
      }
      .tab:active {
        transform: scale(0.97);
      }
      .tab-label {
        min-height: 2.3em;
        display: flex;
        align-items: center;
        justify-content: center;
      }

      .handle {
        width: 48px;
        height: 5px;
        margin: 16px auto 0;
        border-radius: 3px;
        background: rgba(31, 31, 46, 0.18);
      }
    `,
  ];

  override connectedCallback(): void {
    super.connectedCallback();
    this.bindParent(this.parentElement);
    this.addEventListener("pointerdown", this.onDown);
    this.addEventListener("pointermove", this.onMove);
    this.addEventListener("pointerup", this.onUp);
    this.addEventListener("pointercancel", this.onUp);
    window.addEventListener("keydown", this.onKey);
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback();
    this.unbindParent();
    this.removeEventListener("pointerdown", this.onDown);
    this.removeEventListener("pointermove", this.onMove);
    this.removeEventListener("pointerup", this.onUp);
    this.removeEventListener("pointercancel", this.onUp);
    window.removeEventListener("keydown", this.onKey);
  }

  override firstUpdated(): void {
    this.bindParent(this.parentElement);
    this.measure();
    this.applyPull();
  }

  override updated(): void {
    this.toggleAttribute("open", this.open);
    if (!this.claimed) this.applyPull();
  }

  private bindParent(el: HTMLElement | null): void {
    if (el === this.parentEl) return;
    this.unbindParent();
    this.parentEl = el;
    el?.addEventListener("cow-dots-doubletap", this.onDotsDoubletap);
  }

  private unbindParent(): void {
    this.parentEl?.removeEventListener(
      "cow-dots-doubletap",
      this.onDotsDoubletap,
    );
    this.parentEl = null;
  }

  private onDotsDoubletap = (): void => {
    this.reveal();
  };

  /** Open the sheet (double-tap on the pagination dots). */
  reveal(): void {
    if (this.kinds.length < 2 || this.open) return;
    this.measure();
    this.setOpen(true);
  }

  private measure(): void {
    const h = this.sheetEl?.offsetHeight;
    if (h && h > 0) this.sheetH = h;
  }

  private applyPull(): void {
    const h = this.sheetH || 1;
    const shown = this.open && !this.claimed ? h : this.offset;
    const ty = shown - h;
    const scrim = Math.max(0, Math.min(1, shown / h)) * 0.45;
    if (this.sheetEl) {
      this.sheetEl.style.transform = `translate3d(0, ${ty}px, 0)`;
    }
    if (this.scrimEl) this.scrimEl.style.opacity = String(scrim);
  }

  private setOpen(next: boolean): void {
    this.open = next;
    this.offset = next ? this.sheetH : 0;
    this.toggleAttribute("open", next);
    this.toggleAttribute("pulling", false);
    // Reflow so the snap animates from the dragged transform instead
    // of jumping (pulling disables the sheet/scrim transition).
    void this.sheetEl?.offsetWidth;
    this.applyPull();
  }

  private resetPointer(pointerId: number): void {
    this.pointerId = null;
    this.claimed = false;
    this.toggleAttribute("pulling", false);
    try {
      this.releasePointerCapture(pointerId);
    } catch {
      /* ignore */
    }
  }

  private onDown = (e: PointerEvent): void => {
    if (!this.open) return;
    if (this.kinds.length < 2) return;
    if (!e.isPrimary) return;
    if (e.pointerType === "mouse" && e.button !== 0) return;
    if (this.pointerId != null) return;

    this.pointerId = e.pointerId;
    this.startX = e.clientX;
    this.startY = e.clientY;
    this.startT = performance.now();
    this.claimed = false;
    this.measure();
    this.offset = this.sheetH;
  };

  private onMove = (e: PointerEvent): void => {
    if (this.pointerId !== e.pointerId) return;
    const dx = e.clientX - this.startX;
    const dy = e.clientY - this.startY;

    if (!this.claimed) {
      if (Math.abs(dx) > CLAIM_PX && Math.abs(dx) > Math.abs(dy)) {
        this.pointerId = null;
        return;
      }
      if (Math.abs(dy) > CLAIM_PX && Math.abs(dy) >= Math.abs(dx)) {
        this.claimed = true;
        this.toggleAttribute("pulling", true);
        this.setPointerCapture(e.pointerId);
        e.preventDefault();
        e.stopPropagation();
      } else {
        return;
      }
    }

    e.preventDefault();
    e.stopPropagation();
    const h = this.sheetH;
    let raw = h + dy;
    if (raw < 0) raw *= 0.22;
    if (raw > h) raw = h + (raw - h) * 0.18;
    this.offset = raw;
    this.applyPull();
  };

  private onUp = (e: PointerEvent): void => {
    if (this.pointerId !== e.pointerId) return;
    const claimed = this.claimed;
    const dy = e.clientY - this.startY;
    const elapsed = performance.now() - this.startT;
    const flick = elapsed < FLICK_MS && Math.abs(dy) > FLICK_PX;
    this.resetPointer(e.pointerId);

    if (!claimed) {
      const path = e.composedPath();
      const onSheet = this.sheetEl ? path.includes(this.sheetEl) : false;
      if (this.open && !onSheet) this.setOpen(false);
      return;
    }

    e.preventDefault();
    e.stopPropagation();
    const dismiss = flick ? dy < 0 : this.offset < this.sheetH * CLOSE_RATIO;
    this.setOpen(!dismiss);
  };

  private onTab = (i: number): void => {
    if (i !== this.index) {
      this.dispatchEvent(
        new CustomEvent("cow-tab-jump", {
          detail: { index: i },
          bubbles: true,
          composed: true,
        }),
      );
    }
    this.setOpen(false);
  };

  override render() {
    return html`
      <div
        class="scrim"
        @click=${() => {
          if (this.open && !this.claimed) this.setOpen(false);
        }}
      ></div>
      <div
        class="sheet"
        role="navigation"
        aria-label="Viste della stanza"
        aria-hidden=${this.open ? "false" : "true"}
      >
        <div class="tabs">
          ${this.kinds.map((kind, i) => {
            const accent = this.accents[i] ?? "#1f1f2e";
            const current = i === this.index;
            return html`
              <button
                class="tab"
                type="button"
                style="--tab-accent:${accent}"
                aria-current=${current ? "page" : "false"}
                aria-label=${TAB_JUMP_LABEL[kind]}
                @click=${() => this.onTab(i)}
              >
                ${ICON[kind]}
                <span class="tab-label">${TAB_JUMP_LABEL[kind]}</span>
              </button>
            `;
          })}
        </div>
        <div class="handle" aria-hidden="true"></div>
      </div>
    `;
  }
}
