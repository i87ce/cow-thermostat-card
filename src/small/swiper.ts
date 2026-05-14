import { LitElement, html, css } from "lit";
import { customElement, property, state } from "lit/decorators.js";

/**
 * Horizontal pointer-driven swiper with snap-to-index.
 *
 * Behavioural notes:
 *   - Threshold = 22% of viewport width before commit.
 *   - Vertical pan inside children is preserved: we only "claim" the
 *     pointer once horizontal delta > 8px AND > vertical delta.
 *     This lets the lights brightness slider keep its drag.
 *   - Track uses translate3d for hardware-accelerated motion.
 *   - Active dot stretches to a "pill" in the panel's accent color.
 */
@customElement("cow-swiper")
export class CowSwiper extends LitElement {
  @property({ type: Number }) index = 0;
  @property({ type: Number }) count = 1;
  @property({ type: Array }) accents: string[] = [];

  @state() private dragX = 0;
  private startX = 0;
  private startY = 0;
  private claimed = false;
  private pointerId: number | null = null;

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
    }
    .slide > ::slotted(*) {
      flex: 1 1 auto;
      width: 100%;
      height: 100%;
    }
    .dots {
      position: absolute;
      left: 50%;
      bottom: 8px;
      transform: translateX(-50%);
      display: flex;
      gap: 6px;
      z-index: 4;
      pointer-events: auto;
    }
    .dot {
      width: 7px;
      height: 7px;
      border-radius: 50%;
      background: rgba(0, 0, 0, 0.18);
      cursor: pointer;
      transition: width 200ms cubic-bezier(0.22, 1, 0.36, 1),
        background-color 200ms cubic-bezier(0.22, 1, 0.36, 1);
    }
    .dot.active {
      width: 18px;
      border-radius: 4px;
      background: var(--dot-active, #1f1f2e);
    }
  `;

  private get vw(): number {
    return this.clientWidth || 1;
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

  private onMove = (e: PointerEvent) => {
    if (this.pointerId == null) return;
    const dx = e.clientX - this.startX;
    const dy = e.clientY - this.startY;
    if (!this.claimed) {
      if (Math.abs(dx) > 8 && Math.abs(dx) > Math.abs(dy)) {
        this.claimed = true;
        this.toggleAttribute("dragging", true);
        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
        e.preventDefault();
      } else if (Math.abs(dy) > 8) {
        this.pointerId = null;
        return;
      }
    }
    if (this.claimed) {
      this.dragX = dx;
      this.requestUpdate();
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
    this.requestUpdate();
  };

  override render() {
    const count = Math.max(1, this.count);
    const slidePct = 100 / count;
    const baseTx = -this.index * slidePct;
    const dragPct = (this.dragX / (this.vw || 1)) * slidePct;
    const tx = `${baseTx + dragPct}%`;
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
        <div class="track" style="--tx:${tx}; --count:${count}">
          ${slides.map(
            (i) => html`
              <div class="slide" style="--count:${count}">
                <slot name="slide-${i}"></slot>
              </div>
            `,
          )}
        </div>
      </div>
      ${count > 1
        ? html`
            <div class="dots">
              ${slides.map(
                (i) => html`
                  <div
                    class=${i === this.index ? "dot active" : "dot"}
                    style=${i === this.index
                      ? `--dot-active:${this.accents[i] ?? "#1f1f2e"}`
                      : ""}
                    role="button"
                    aria-label="Vai alla vista ${i + 1}"
                    @click=${() => this.setIndex(i)}
                  ></div>
                `,
              )}
            </div>
          `
        : ""}
    `;
  }
}
