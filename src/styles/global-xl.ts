import { css } from "lit";

/**
 * XL dashboard root — landscape 1280×800 design canvas.
 *
 * The XL card scales by container width (cqw): 1rem = 100cqw/80, so on a
 * 1280px-wide viewport 1rem = 16px (matches the Figma design 1:1). On any
 * other width the layout scales proportionally while preserving the
 * 1280:800 aspect ratio of the design (height is set explicitly to
 * 100cqw * 800/1280 = 62.5cqw).
 */
export const globalShellXL = css`
  :host {
    display: block;
    width: 100%;
    container-type: inline-size;
    container-name: cow-xl;
    color: var(--cow-text-primary);
    font-family: var(--cow-font-family);
    -webkit-font-smoothing: antialiased;
    -moz-osx-font-smoothing: grayscale;
    -webkit-tap-highlight-color: transparent;
    -webkit-touch-callout: none;
    user-select: none;
  }

  @container cow-xl (min-width: 0px) {
    :host {
      font-size: calc(100cqw / 80);
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
    outline: none;
  }
`;
