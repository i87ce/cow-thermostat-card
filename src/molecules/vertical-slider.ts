import { LitElement, html, css } from "lit";
import { customElement, property, state } from "lit/decorators.js";

/**
 * Vertical slider — replica Figma "2. Molecules / Vertical Slider" (66:51..66:56).
 * Used for light brightness. Track is 24×148 (1.5 × 9.25 rem), fill bottom-up.
 * Emits `cow-slider-change` { value: 0..100 } on commit (pointerup).
 */
@customElement("cow-vertical-slider")
export class CowVerticalSlider extends LitElement {
  @property({ type: Number }) value = 50; // 0..100
  @property({ type: Number }) min = 0;
  @property({ type: Number }) max = 100;

  @state() private dragging = false;
  @state() private liveValue = 50;

  static override styles = css`
    :host {
      display: inline-block;
      width: 1.5rem;
      height: 9.25rem;
      touch-action: none;
    }
    .track {
      position: relative;
      width: 100%;
      height: 100%;
      border-radius: 0.75rem;
      background: var(--cow-surface-button-bg);
      overflow: hidden;
      cursor: pointer;
    }
    .fill {
      position: absolute;
      left: 0;
      right: 0;
      bottom: 0;
      background: linear-gradient(
        to top,
        var(--cow-accent-active, var(--cow-lights-bright)),
        var(--cow-accent-light, var(--cow-lights-bright))
      );
      transition: height 120ms ease;
    }
    :host([dragging]) .fill {
      transition: none;
    }
  `;

  override willUpdate(): void {
    if (!this.dragging) this.liveValue = this.value;
  }

  private clamp(v: number): number {
    return Math.max(this.min, Math.min(this.max, v));
  }

  private percentFromEvent(e: PointerEvent): number {
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const dy = e.clientY - rect.top;
    const pct = 1 - dy / rect.height;
    return Math.round(this.clamp(pct * (this.max - this.min) + this.min));
  }

  private onPointerDown = (e: PointerEvent) => {
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    this.dragging = true;
    this.toggleAttribute("dragging", true);
    this.liveValue = this.percentFromEvent(e);
    this.requestUpdate();
  };

  private onPointerMove = (e: PointerEvent) => {
    if (!this.dragging) return;
    this.liveValue = this.percentFromEvent(e);
    this.requestUpdate();
  };

  private onPointerUp = (e: PointerEvent) => {
    if (!this.dragging) return;
    this.dragging = false;
    this.toggleAttribute("dragging", false);
    const finalValue = this.percentFromEvent(e);
    this.value = finalValue;
    this.dispatchEvent(
      new CustomEvent("cow-slider-change", {
        detail: { value: finalValue },
        bubbles: true,
        composed: true,
      }),
    );
  };

  override render() {
    const v = this.dragging ? this.liveValue : this.value;
    const pct = ((v - this.min) / (this.max - this.min)) * 100;
    return html`
      <div
        class="track"
        @pointerdown=${this.onPointerDown}
        @pointermove=${this.onPointerMove}
        @pointerup=${this.onPointerUp}
        @pointercancel=${this.onPointerUp}
        role="slider"
        aria-valuemin=${this.min}
        aria-valuemax=${this.max}
        aria-valuenow=${v}
        aria-orientation="vertical"
      >
        <div class="fill" style="height: ${pct}%"></div>
      </div>
    `;
  }
}
