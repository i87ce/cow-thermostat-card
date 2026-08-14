import { LitElement, html, css } from "lit";
import { customElement, property, state, query } from "lit/decorators.js";

/**
 * Horizontal pointer-driven swiper with snap-to-index.
 *
 * Behavioural notes:
 *   - Threshold = 22% of viewport width before commit.
 *   - Vertical pan inside children is preserved: we only "claim" the
 *     pointer once horizontal delta > 8px AND > vertical delta.
 *     This lets the lights brightness slider keep its drag. Vertical
 *     motion aborts the swipe (|dy| > 8) so it never fights those
 *     sliders. Tab jump is a double-tap on the pagination dots, not
 *     a top-edge pull — Shelly firmware owns that edge.
 *   - Dots are indicators: a single tap does not change page (that
 *     would fight swipe). Double-tap opens the jump sheet. The dots
 *     live in the swipe viewport so a horizontal drag that starts on
 *     them still changes slides.
 *   - Track uses translate3d for hardware-accelerated motion.
 *   - Active dot stretches to a "pill" in the panel's accent color.
 */
const TAP_SLOP = 8;
/** Window after the first tap; second tap opens the jump sheet. */
const DOUBLE_TAP_MS = 380;

@customElement("cow-swiper")
export class CowSwiper extends LitElement {
  @property({ type: Number }) index = 0;
  @property({ type: Number }) count = 1;
  @property({ type: Array }) accents: string[] = [];

  @state() private dragX = 0;
  @query(".track") private trackEl?: HTMLElement;
  private startX = 0;
  private startY = 0;
  private claimed = false;
  private pointerId: number | null = null;
  private tapTimer: number | null = null;

  static override styles = css`
    :host {
      display: block;
      position: relative;
      width: 100%;
      height: 100%;
      overflow: hidden;
    }
    .viewport {
      position: relative;
      width: 100%;
      height: 100%;
      touch-action: pan-y;
    }
    .track {
      display: flex;
      width: calc(100% * var(--count, 1));
      height: 100%;
      transform: translate3d(var(--tx, 0), 0, 0);
      transition: transform 320ms cubic-bezier(0.22, 1, 0.36, 1);
    }
    :host([dragging]) .track {
      transition: none;
    }
    .slide {
      flex: 0 0 calc(100% / var(--count, 1));
      width: calc(100% / var(--count, 1));
      height: 100%;
      display: flex;
      align-items: stretch;
      justify-content: stretch;
      position: relative;
      overflow: hidden;
    }
    .slide > ::slotted(*) {
      flex: 1 1 auto;
      width: 100%;
      height: 100%;
    }
    .dots {
      position: absolute;
      left: 50%;
      bottom: 0;
      transform: translateX(-50%);
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 6px;
      z-index: 4;
      pointer-events: auto;
      min-height: 44px;
      padding: 12px 20px;
      box-sizing: border-box;
      touch-action: manipulation;
      -webkit-user-select: none;
      user-select: none;
      cursor: pointer;
      transition: transform 120ms cubic-bezier(0.22, 1, 0.36, 1);
    }
    :host([armed]) .dots {
      transform: translateX(-50%) scale(1.22);
    }
    .dot {
      width: 7px;
      height: 7px;
      border-radius: 50%;
      background: rgba(0, 0, 0, 0.18);
      pointer-events: none;
      transition:
        transform 200ms cubic-bezier(0.22, 1, 0.36, 1),
        background-color 200ms cubic-bezier(0.22, 1, 0.36, 1);
    }
    .dot.active {
      width: 18px;
      border-radius: 4px;
      background: var(--dot-active, #1f1f2e);
      transform: scaleX(2.57);
      transform-origin: center;
    }
    :host([armed]) .dot:not(.active) {
      background: rgba(31, 31, 46, 0.4);
    }
  `;

  private get vw(): number {
    return this.clientWidth || 1;
  }

  private clearArmed(): void {
    if (this.tapTimer != null) {
      clearTimeout(this.tapTimer);
      this.tapTimer = null;
    }
    this.toggleAttribute("armed", false);
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback();
    this.clearArmed();
  }

  private setIndex(i: number): void {
    const max = Math.max(0, this.count - 1);
    const next = Math.max(0, Math.min(max, i));
    if (next !== this.index) {
      this.index = next;
      this.dispatchEvent(
        new CustomEvent("cow-index-change", {
          detail: { index: next },
          bubbles: true,
          composed: true,
        }),
      );
    }
  }

  private onDown = (e: PointerEvent) => {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    this.startX = e.clientX;
    this.startY = e.clientY;
    this.claimed = false;
    this.pointerId = e.pointerId;
    this.dragX = 0;
  };

  private applyTrackTransform(): void {
    const count = Math.max(1, this.count);
    const slidePct = 100 / count;
    const baseTx = -this.index * slidePct;
    const dragPct = (this.dragX / (this.vw || 1)) * slidePct;
    const tx = `${baseTx + dragPct}%`;
    const track = this.trackEl;
    if (track) track.style.setProperty("--tx", tx);
  }

  private onMove = (e: PointerEvent) => {
    if (this.pointerId == null) return;
    const dx = e.clientX - this.startX;
    const dy = e.clientY - this.startY;
    if (!this.claimed) {
      if (Math.abs(dx) > TAP_SLOP && Math.abs(dx) > Math.abs(dy)) {
        this.claimed = true;
        this.clearArmed();
        this.toggleAttribute("dragging", true);
        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
        e.preventDefault();
      } else if (Math.abs(dy) > TAP_SLOP) {
        this.pointerId = null;
        this.clearArmed();
        return;
      }
    }
    if (this.claimed) {
      this.dragX = dx;
      this.applyTrackTransform();
      e.preventDefault();
    }
  };

  private onUp = (e: PointerEvent) => {
    if (this.pointerId == null) return;
    const w = this.vw;
    const threshold = w * 0.22;
    if (this.claimed && Math.abs(this.dragX) > threshold) {
      this.setIndex(this.index + (this.dragX < 0 ? 1 : -1));
    }
    this.dragX = 0;
    this.toggleAttribute("dragging", false);
    this.pointerId = null;
    this.claimed = false;
    if (e.currentTarget instanceof HTMLElement) {
      try {
        e.currentTarget.releasePointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
    }
    this.applyTrackTransform();
  };

  private onDotsUp = (e: PointerEvent): void => {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    if (this.claimed) {
      this.clearArmed();
      return;
    }
    if (
      Math.abs(e.clientX - this.startX) > TAP_SLOP ||
      Math.abs(e.clientY - this.startY) > TAP_SLOP
    ) {
      this.clearArmed();
      return;
    }
    if (this.hasAttribute("armed")) {
      this.clearArmed();
      this.dispatchEvent(
        new CustomEvent("cow-dots-doubletap", {
          bubbles: true,
          composed: true,
        }),
      );
      return;
    }
    this.toggleAttribute("armed", true);
    this.tapTimer = window.setTimeout(() => this.clearArmed(), DOUBLE_TAP_MS);
  };

  override updated(): void {
    this.applyTrackTransform();
  }

  override render() {
    const count = Math.max(1, this.count);
    const slides = Array.from({ length: count }, (_, i) => i);

    return html`
      <div
        class="viewport"
        @pointerdown=${this.onDown}
        @pointermove=${this.onMove}
        @pointerup=${this.onUp}
        @pointercancel=${this.onUp}
        style="--count:${count}"
      >
        <div class="track" style="--tx:0%; --count:${count}">
          ${slides.map(
            (i) => html`
              <div class="slide" style="--count:${count}">
                <slot name="slide-${i}"></slot>
              </div>
            `,
          )}
        </div>
        ${count > 1
          ? html`
              <div
                class="dots"
                role="group"
                aria-label="Tocca due volte per cambiare vista"
                @pointerup=${this.onDotsUp}
              >
                ${slides.map(
                  (i) => html`
                    <div
                      class=${i === this.index ? "dot active" : "dot"}
                      style=${i === this.index
                        ? `--dot-active:${this.accents[i] ?? "#1f1f2e"}`
                        : ""}
                      aria-hidden="true"
                    ></div>
                  `,
                )}
              </div>
            `
          : ""}
      </div>
    `;
  }
}
