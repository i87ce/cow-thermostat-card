import { LitElement, html, css } from "lit";
import { customElement, property, state } from "lit/decorators.js";

/**
 * Horizontal pointer-driven swiper between three children panels (slot).
 *
 * - Pure pointer events; no library
 * - Snap to nearest index on release, animated 240ms
 * - Threshold: 25% of the panel width (≈ 6rem = 96 design-px)
 * - Indicator dots in bottom-center; tap = jump
 * - Vertical pan inside children (e.g. light brightness slider) is preserved:
 *   we only "claim" the pointer once horizontal delta exceeds 8 px AND is
 *   greater than vertical delta.
 */
@customElement("cow-device-swiper")
export class CowDeviceSwiper extends LitElement {
  /** Active index 0..2 */
  @property({ type: Number }) index = 0;

  /** RGB-ish values for the 3 dots (forwarded by parent) */
  @property({ type: Array }) accents: string[] = [
    "var(--cow-heating-primary)",
    "var(--cow-blinds-sky)",
    "var(--cow-lights-bright)",
  ];

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
      touch-action: pan-y; /* allow vertical pan inside children */
    }
    .track {
      display: flex;
      width: 300%;
      height: 100%;
      transform: translate3d(var(--tx, 0), 0, 0);
      transition: transform 240ms cubic-bezier(0.22, 1, 0.36, 1);
    }
    :host([dragging]) .track {
      transition: none;
    }
    .slide {
      flex: 0 0 33.3333%;
      width: 33.3333%;
      height: 100%;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .dots {
      position: absolute;
      left: 50%;
      bottom: 0.5rem;
      transform: translateX(-50%);
      display: flex;
      gap: 0.375rem;
      pointer-events: auto;
      z-index: 2;
    }
    .dot {
      width: 0.4375rem;
      height: 0.4375rem;
      border-radius: 50%;
      background: rgba(255, 255, 255, 0.5);
      box-shadow: 0 0 0 0.0625rem rgba(0, 0, 0, 0.08);
      cursor: pointer;
      transition: width 160ms ease, background-color 160ms ease;
    }
    .dot.active {
      width: 1rem;
      background: var(--active-color, var(--cow-text-primary));
    }
  `;

  private get viewportWidth(): number {
    return this.clientWidth || 1;
  }

  private setIndex(i: number): void {
    const next = Math.max(0, Math.min(2, i));
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

  private onPointerDown = (e: PointerEvent) => {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    this.startX = e.clientX;
    this.startY = e.clientY;
    this.claimed = false;
    this.pointerId = e.pointerId;
    this.dragX = 0;
  };

  private onPointerMove = (e: PointerEvent) => {
    if (this.pointerId == null) return;
    const dx = e.clientX - this.startX;
    const dy = e.clientY - this.startY;
    if (!this.claimed) {
      if (Math.abs(dx) > 8 && Math.abs(dx) > Math.abs(dy)) {
        this.claimed = true;
        this.toggleAttribute("dragging", true);
        const target = e.currentTarget as HTMLElement;
        target.setPointerCapture(e.pointerId);
        e.preventDefault();
      } else if (Math.abs(dy) > 8) {
        // It's a vertical gesture (e.g. slider). Release to children.
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

  private onPointerUp = (e: PointerEvent) => {
    if (this.pointerId == null) return;
    const w = this.viewportWidth;
    const threshold = w * 0.25;
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

  private goTo(i: number) {
    this.setIndex(i);
  }

  override render() {
    const baseTx = -this.index * (100 / 3);
    const w = this.viewportWidth || 1;
    const dragPct = (this.dragX / w) * (100 / 3);
    const tx = `${baseTx + dragPct}%`;

    return html`
      <div
        class="viewport"
        @pointerdown=${this.onPointerDown}
        @pointermove=${this.onPointerMove}
        @pointerup=${this.onPointerUp}
        @pointercancel=${this.onPointerUp}
      >
        <div class="track" style="--tx:${tx}">
          <div class="slide"><slot name="slide-0"></slot></div>
          <div class="slide"><slot name="slide-1"></slot></div>
          <div class="slide"><slot name="slide-2"></slot></div>
        </div>
      </div>
      <div class="dots">
        ${[0, 1, 2].map(
          (i) => html`
            <div
              class="dot ${i === this.index ? "active" : ""}"
              style=${i === this.index
                ? `--active-color: ${this.accents[i]}`
                : ""}
              @click=${() => this.goTo(i)}
              role="button"
              aria-label="Go to view ${i + 1}"
            ></div>
          `,
        )}
      </div>
    `;
  }
}
