import { css } from "lit";

/**
 * Global host shell:
 *  - container query "size" so 1cqmin is robust on any square viewport
 *  - root font-size = 1/24 of the smaller side  -> 1rem == 16 design-px
 *    (because 384 design-px / 24 = 16)
 *  - reset padding/margin
 *  - antialiasing & disable touch callout for kiosk
 */
export const globalShell = css`
  :host {
    display: block;
    width: 100%;
    height: 100%;
    container-type: size;
    container-name: cow-card;
    color: var(--cow-text-primary);
    font-family: var(--cow-font-family);
    -webkit-font-smoothing: antialiased;
    -moz-osx-font-smoothing: grayscale;
    -webkit-tap-highlight-color: transparent;
    -webkit-touch-callout: none;
    user-select: none;
  }

  /*
   * 1cqmin = 1% of the smaller side of the host. With base 24, font-size
   * becomes 100/24 cqmin, so 1rem = 100/24 cqmin ≈ 4.166% of the side.
   * That makes the 384-design-px unit map to 24rem = 100% of the side.
   * Therefore every Figma value in px can be written verbatim as (px/16)rem.
   */
  @container cow-card (min-width: 0px) {
    :host {
      font-size: calc(100cqmin / 24);
    }
  }

  *,
  *::before,
  *::after {
    box-sizing: border-box;
    margin: 0;
    padding: 0;
  }

  button {
    border: 0;
    background: transparent;
    color: inherit;
    font: inherit;
    cursor: pointer;
    -webkit-appearance: none;
    appearance: none;
    touch-action: manipulation;
  }
`;
