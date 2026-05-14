import { css } from "lit";

/**
 * Card shell + design-grid scaling.
 *
 * The card is authored at a fixed 720x720 internal coordinate space
 * (matches Figma 1:1). At runtime we observe the host container width
 * and apply `transform: scale(ratio)` so the panel fills any size
 * while every child position remains pixel-exact.
 *
 * Why not rem? rem resolves against <html>, which is unreachable from
 * inside a shadow DOM without bumping the document font-size globally
 * (the v1 hack). Transform-scale keeps the side-effect zero.
 */
export const shellStyles = css`
  :host {
    display: block;
    width: 100%;
    aspect-ratio: 1 / 1;
    container-type: inline-size;
    background: transparent;
    color: var(--cow-text-primary, #1f1f2e);
    font-family: var(--cow-font-family, "Inter", system-ui, sans-serif);
    -webkit-font-smoothing: antialiased;
  }

  :host([panel]) {
    position: fixed;
    inset: 0;
    width: 100vw;
    height: 100vh;
    aspect-ratio: auto;
    z-index: 1;
  }

  .scaler {
    position: absolute;
    inset: 0;
    overflow: hidden;
    border-radius: var(--cow-radius-xl, 1rem);
    background: var(--cow-surface-background, #f7f7fa);
    box-shadow: var(--cow-shadow-card, 0 0.125rem 0.5rem rgba(31, 31, 46, 0.08));
  }

  :host([panel]) .scaler {
    border-radius: 0;
    box-shadow: none;
  }

  .stage {
    position: absolute;
    top: 0;
    left: 0;
    width: 720px;
    height: 720px;
    transform-origin: top left;
    transform: scale(var(--cow-scale, 1));
  }

  .error {
    padding: 1rem;
    font-family: var(--cow-font-family);
    font-size: 0.875rem;
    color: var(--cow-stop, #e74c3c);
    background: var(--cow-surface-white, #fff);
    border: 1px solid currentColor;
    border-radius: var(--cow-radius-default, 0.625rem);
    white-space: pre-wrap;
  }
`;

/**
 * Internal panel layout (used by every panel root). Renders the
 * 360+360 split inside the 720x720 stage, with absolute-positioned
 * children so we mirror Figma frames 1:1.
 */
export const panelStyles = css`
  :host {
    display: block;
    position: absolute;
    inset: 0;
    width: 720px;
    height: 720px;
    overflow: hidden;
    contain: layout paint;
  }
  .left,
  .right {
    position: absolute;
    top: 0;
    bottom: 0;
    width: 360px;
  }
  .left {
    left: 0;
    color: var(--cow-on-accent, #fff);
    overflow: hidden;
  }
  .right {
    right: 0;
    background: var(--cow-surface-background, #f7f7fa);
  }
`;
