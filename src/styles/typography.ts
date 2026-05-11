import { css, unsafeCSS } from "lit";
import { INTER_FONTS_CSS } from "./font-data.js";

/**
 * Inter font faces.
 *
 * The 5 weights are inlined as base64 `data:` URLs (generated at build time
 * by `scripts/embed-fonts.mjs` into `font-data.ts`). This is the only
 * reliable way to ship the fonts via HACS without a `zip_release` setup,
 * which misregisters the Lovelace resource. Trade-off: bundle is ~830KB,
 * cached by the browser after first load.
 *
 * `unsafeCSS` is required because `INTER_FONTS_CSS` is a generated string;
 * its content is fully under our control (woff2 base64 + literal CSS) so
 * the "unsafe" name doesn't apply here.
 */
export const fontFaces = css`
  ${unsafeCSS(INTER_FONTS_CSS)}
`;

/**
 * Typography scale — extracted 1:1 from Figma "1. Atoms / Typography".
 * All sizes are in design-px / 16, so they multiply correctly with the
 * container-relative root font-size set on the card host.
 */
export const typography = css`
  :host {
    --cow-font-family: "Inter", -apple-system, BlinkMacSystemFont, "Segoe UI",
      Roboto, Helvetica, Arial, sans-serif;

    /* font-size : design-px @ 16px-rem-base = rem */
    --cow-font-display: 4rem; /* 64 Light  - main value */
    --cow-font-display-secondary: 3.5rem; /* 56 Light  - secondary value */
    --cow-font-target: 2rem; /* 32 Bold   - target value */
    --cow-font-icon-large: 1.75rem; /* 28 Reg    - bulb icon */
    --cow-font-symbol-button: 1.25rem; /* 20 Medium - button symbol */
    --cow-font-symbol-arrow: 1rem; /* 16 Medium - arrow symbol */
    --cow-font-room: 0.875rem; /* 14 SemiB  - room name */
    --cow-font-time: 0.8125rem; /* 13 SemiB  - time / humidity */
    --cow-font-caption: 0.75rem; /* 12 Reg    - subtitle */
    --cow-font-status: 0.6875rem; /* 11 Medium - status label */
    --cow-font-micro: 0.625rem; /* 10 SemiB  - mode/fan label */
  }
`;
