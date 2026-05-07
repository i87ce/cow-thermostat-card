import { LitElement, html, css } from "lit";
import { customElement } from "lit/decorators.js";

/**
 * Split-panel base shell — replica Figma "3. Components / Anatomy" (67:51).
 *
 *   Total card     : 384 × 384 px → 24 × 24 rem
 *   Left panel     : 192 px wide (status, color background, padding 24/24)
 *   Right panel    : 192 px wide (controls, white bg, padding 20 left / 20 top)
 *   Corner radius  : 16 px
 *
 * Two named slots: "left" and "right".
 */
@customElement("cow-split-panel")
export class CowSplitPanel extends LitElement {
  static override styles = css`
    :host {
      display: block;
      width: 24rem;
      height: 24rem;
      border-radius: var(--cow-radius-xl);
      background: var(--cow-surface-background);
      overflow: hidden;
      position: relative;
      box-shadow: var(--cow-shadow-card);
    }
    .grid {
      display: grid;
      grid-template-columns: 12rem 12rem;
      width: 100%;
      height: 100%;
    }
    .left {
      position: relative;
      overflow: hidden;
      background: linear-gradient(
        180deg,
        var(--cow-accent, var(--cow-heating-primary)),
        var(--cow-accent-light, var(--cow-heating-light))
      );
      transition: background 320ms ease;
    }
    .right {
      position: relative;
      background: var(--cow-surface-white);
    }
  `;

  override render() {
    return html`
      <div class="grid">
        <div class="left"><slot name="left"></slot></div>
        <div class="right"><slot name="right"></slot></div>
      </div>
    `;
  }
}
