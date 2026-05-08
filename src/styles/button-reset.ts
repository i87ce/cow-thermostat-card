import { css } from "lit";

/**
 * Shared button reset for the molecules.
 *
 * Each molecule (mode-button, fan-button, arrow-button, control-button,
 * preset-chip, power-toggle) lives in its own shadow root, so the
 * `button { ... }` reset in `global.ts` (scoped to cow-thermostat-card's
 * shadow) doesn't reach them. We import this fragment in every molecule
 * to kill the user-agent focus outline that surfaces as a hard black/blue
 * rectangle on the Shelly Wall Display webview when a tap leaves a button
 * focused, and to neutralize tap-highlight + appearance defaults.
 */
export const buttonReset = css`
  button {
    border: 0;
    background: transparent;
    color: inherit;
    font: inherit;
    cursor: pointer;
    -webkit-appearance: none;
    appearance: none;
    -webkit-tap-highlight-color: transparent;
    touch-action: manipulation;
    outline: none;
  }
  button:focus {
    outline: none;
  }
  /* Keep keyboard accessibility for desktop users who tab through */
  button:focus-visible {
    outline: 0.125rem solid var(--cow-accent-active, var(--cow-text-button));
    outline-offset: 0.125rem;
  }
`;
