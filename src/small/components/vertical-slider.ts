import { LitElement, html, css } from "lit";
import { customElement, property, state } from "lit/decorators.js";

/**
 * Vertical slider — Figma lights brightness control.
 *
 *   Track:  36 × 140  (scaled  67.5 × 262.5  in 720x720 frame)
 *   Fill:   bottom-up, height proportional to value (0..100)
 *
 * Pointer drag updates `value` locally and emits `cow-slider-change`
 * on release (committed value) and `cow-slider-input` on drag (live
 * preview, throttled by browser pointer events).
 *
 * The host panel keeps its own `value` and re-passes it on update;
 * this component is fully controlled.
 */
@customElement("cow-vertical-slider")
export class CowVerticalSlider extends LitElement {
  /** Current value 0..100. */
  @property({ type: Number }) value = 0;
  @property({ type: Number }) min = 0;
  @property({ type: Number }) max = 100;
  @property({ type: Number }) step = 1;

  @state() private dragging = false;
  @state() private dragValue = 0;

  static override styles = css`
    :host {
      display: block;
      width: 100%;
      height: 100%;
      touch-action: none;
    }
    .track {
      position: relative;
      width: 100%;
      height: 100%;
      background: var(--cow-surface-button-bg, #f0f0f2);
      border-radius: 18px;
      overflow: hidden;
      cursor: ns-resize;
    }
    .fill {
      position: absolute;
      left: 0;
      right: 0;
      bottom: 0;
      background: var(--cow-accent, #1f1f2e);
      border-radius: 18px;
      transition: height 240ms cubic-bezier(0.22, 1, 0.36, 1),
        background-color 240ms cubic-bezier(0.22, 1, 0.36, 1);
    }
    :host([dragging]) .fill {
      transition: none;
    }
  `;

  private get displayValue(): number {
    return this.dragging ? this.dragValue : this.value;
  }

  private valueFromEvent(e: PointerEvent): number {
    const r = this.getBoundingClientRect();
    const ratio = 1 - (e.clientY - r.top) / r.height;
    const raw = this.min + ratio * (this.max - this.min);
    const stepped = Math.round(raw / this.step) * this.step;
    return Math.max(this.min, Math.min(this.max, stepped));
  }

  private onDown = (e: PointerEvent) => {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    this.dragging = true;
    this.toggleAttribute("dragging", true);
    this.dragValue = this.valueFromEvent(e);
    this.emit("cow-slider-input", this.dragValue);
    e.preventDefault();
  };

  private onMove = (e: PointerEvent) => {
    if (!this.dragging) return;
    this.dragValue = this.valueFromEvent(e);
    this.emit("cow-slider-input", this.dragValue);
  };

  private onUp = (e: PointerEvent) => {
    if (!this.dragging) return;
    this.dragging = false;
    this.toggleAttribute("dragging", false);
    const v = this.valueFromEvent(e);
    try {
      (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
    this.emit("cow-slider-change", v);
  };

  private emit(name: string, value: number) {
    this.dispatchEvent(
      new CustomEvent(name, {
        detail: { value },
        bubbles: true,
        composed: true,
      }),
    );
  }

  override render() {
    const pct = Math.max(0, Math.min(100, this.displayValue));
    return html`
      <div
        class="track"
        @pointerdown=${this.onDown}
        @pointermove=${this.onMove}
        @pointerup=${this.onUp}
        @pointercancel=${this.onUp}
        role="slider"
        aria-valuemin=${this.min}
        aria-valuemax=${this.max}
        aria-valuenow=${this.value}
      >
        <div class="fill" style=${`height:${pct}%`}></div>
      </div>
    `;
  }
}
