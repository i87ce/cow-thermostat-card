import { css } from "lit";

/**
 * Inter font face declarations.
 *
 * The Shelly Wall Display SAWD1 has a constrained WebView (MTK6580) and is on a
 * LAN-only network in many setups, so we deliberately do NOT pull from Google
 * Fonts. The five woff2 files live next to cow-thermostat-card.js inside the
 * HACS plugin folder (HACS serves the whole repo under /hacsfiles/).
 *
 * The relative URL works regardless of the dashboard URL because Lovelace
 * loads the script from /hacsfiles/cow-thermostat-card/cow-thermostat-card.js
 * and `url(./inter-light.woff2)` resolves against that same folder.
 */
export const fontFaces = css`
  @font-face {
    font-family: "Inter";
    font-style: normal;
    font-weight: 300;
    font-display: block;
    src: url("./inter-light.woff2") format("woff2");
  }
  @font-face {
    font-family: "Inter";
    font-style: normal;
    font-weight: 400;
    font-display: block;
    src: url("./inter-regular.woff2") format("woff2");
  }
  @font-face {
    font-family: "Inter";
    font-style: normal;
    font-weight: 500;
    font-display: block;
    src: url("./inter-medium.woff2") format("woff2");
  }
  @font-face {
    font-family: "Inter";
    font-style: normal;
    font-weight: 600;
    font-display: block;
    src: url("./inter-semibold.woff2") format("woff2");
  }
  @font-face {
    font-family: "Inter";
    font-style: normal;
    font-weight: 700;
    font-display: block;
    src: url("./inter-bold.woff2") format("woff2");
  }
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
