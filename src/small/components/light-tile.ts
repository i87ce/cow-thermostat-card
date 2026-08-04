import { LitElement, html, css } from "lit";
import { customElement, property } from "lit/decorators.js";
import { colorTransition } from "../styles/anim.js";

/**
 * Single light tile in the right-hand 2-col grid of the small Lights
 * panel — Figma "Proposta B" frames.
 *
 *  +--------------------------+
 *  | (●)  Soffitto            |
 *  |      80% · dim           |
 *  +--------------------------+
 *
 * The `dot` shows on/off state in the panel accent color when the
 * light is on, neutral grey when off. A surrounding `ring` is rendered
 * only when the light is dimmable — this is the canonical visual
 * convention across the card: ring = "this light can be dimmed". On/off
 * bulbs intentionally have no ring so the user knows the vertical
 * swipe on the left panel will be inert when this tile is the scope.
 *
 * Emits `cow-tile-select { id }` on click. Active state is owned by the
 * host panel and reflected back via the `selected` boolean attribute.
 *
 * The tile reads colors from CSS custom properties set on its host
 * panel (`--cow-accent`, `--cow-accent-light`), so flipping the panel
 * variant — bright/dim/off/night — automatically restyles every tile
 * in sync without prop drilling.
 */
@customElement("cow-light-tile")
export class CowLightTile extends LitElement {
  /** Stable id used in the `cow-tile-select` payload. */
  @property({ type: String }) tileId = "";
  @property({ type: String }) label = "";
  /** Compact state line, e.g. "80% · dim", "ON", "OFF". */
  @property({ type: String }) state = "";
  @property({ type: Boolean }) isOn = false;
  @property({ type: Boolean }) isDimmer = false;
  @property({ type: Boolean, reflect: true }) selected = false;

  static override styles = [
    css`
      :host {
        display: block;
        width: 100%;
        height: 100%;
      }
      .tile {
        position: relative;
        width: 100%;
        height: 100%;
        box-sizing: border-box;
        border-radius: 18px;
        background: var(--cow-tile-bg, #f5f5f7);
        cursor: pointer;
        user-select: none;
        ${colorTransition}
        /* 2px reserved as transparent border in the default state so the
           selected state's coloured border doesn't shift the tile by 2px
           (a classic 1-pixel jump bug). */
        border: 2px solid transparent;
      }
      :host([selected]) .tile {
        /* 22% accent mix matches the Figma design system tint
           (#fff2c7 for the bright variant). At 14% the result is
           barely distinguishable from the non-selected #f5f5f7 on a
           Wall Display LCD; 22% gives the selection enough presence
           without overpowering the dot/ring. */
        background: color-mix(
          in srgb,
          var(--cow-accent, #ffc72e) 22%,
          var(--cow-tile-bg, #ffffff)
        );
        border-color: var(--cow-accent, #ffc72e);
      }
      .tile:active {
        transform: scale(0.985);
      }
      /* Touch-target audit (v1.9): tiles grew 80 → 96 stage-px, so the
         internals scaled up with them (dot 14→16, label 18→21,
         state 15→17) to keep the tile readable at arm's length on the
         480-px Wall Displays. */
      .indicator {
        position: absolute;
        left: 18px;
        top: 22px;
        width: 16px;
        height: 16px;
      }
      .dot {
        position: absolute;
        inset: 0;
        border-radius: 50%;
        background: var(--cow-tile-dot-off, #c7c7d1);
        ${colorTransition}
      }
      :host([isOn]) .dot,
      .tile[data-on] .dot {
        background: var(--cow-accent, #ffc72e);
      }
      .ring {
        position: absolute;
        left: -4px;
        top: -4px;
        width: 24px;
        height: 24px;
        border-radius: 50%;
        border: 2px solid var(--cow-accent, #ffc72e);
        /* Without border-box, the 2px border would add to the 22px
           width/height — making the real ring 26×26, shifted 2px
           down-right of the 14×14 dot. With border-box the 22px is
           the *outer* size so the ring is concentric with the dot. */
        box-sizing: border-box;
        opacity: 0.38;
      }
      .label {
        position: absolute;
        left: 44px;
        top: 19px;
        right: 12px;
        font-weight: 600;
        font-size: 21px;
        line-height: 1.1;
        color: var(--cow-tile-label, #2e2e38);
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .state {
        position: absolute;
        left: 44px;
        top: 56px;
        right: 12px;
        font-weight: 400;
        font-size: 17px;
        line-height: 1.1;
        color: var(--cow-tile-state, #595966);
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .tile:not([data-on]) .state {
        color: var(--cow-tile-state-off, #9999a6);
      }
    `,
  ];

  private onPick = (e: Event): void => {
    e.stopPropagation();
    this.dispatchEvent(
      new CustomEvent("cow-tile-select", {
        detail: { id: this.tileId },
        bubbles: true,
        composed: true,
      }),
    );
  };

  override render() {
    return html`
      <div
        class="tile"
        role="button"
        aria-pressed=${this.selected ? "true" : "false"}
        ?data-on=${this.isOn}
        @click=${this.onPick}
      >
        <div class="indicator">
          ${this.isDimmer ? html`<div class="ring"></div>` : ""}
          <div class="dot"></div>
        </div>
        <div class="label">${this.label}</div>
        <div class="state">${this.state}</div>
      </div>
    `;
  }
}
