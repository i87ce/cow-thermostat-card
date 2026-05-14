import { css } from "lit";

/**
 * Animation tokens shared across panels. Single source of truth so
 * every component breathes at the same rhythm and we can retune the
 * card globally without hunting through 12 files.
 */
export const animTokens = css`
  :host {
    /* Durations */
    --cow-dur-fast: 120ms;
    --cow-dur-base: 240ms;
    --cow-dur-slow: 480ms;
    --cow-dur-pulse: 1600ms;

    /* Easings (iOS-style spring + soft) */
    --cow-ease-out: cubic-bezier(0.22, 1, 0.36, 1);
    --cow-ease-in-out: cubic-bezier(0.65, 0, 0.35, 1);
    --cow-ease-spring: cubic-bezier(0.34, 1.56, 0.64, 1);
  }
`;

/**
 * Reusable @keyframes definitions. Imported once in the card shell so
 * every component can reference them by name without redefining.
 */
export const animKeyframes = css`
  @keyframes cow-pulse {
    0%, 100% { transform: scale(1); opacity: 1; }
    50% { transform: scale(1.06); opacity: 0.85; }
  }
  @keyframes cow-spin {
    to { transform: rotate(360deg); }
  }
  @keyframes cow-slat-down {
    from { transform: translateY(-6px); opacity: 0; }
    to { transform: translateY(0); opacity: 1; }
  }
  @keyframes cow-fade-in {
    from { opacity: 0; transform: translateY(4px); }
    to { opacity: 1; transform: translateY(0); }
  }
  @keyframes cow-glow {
    0%, 100% { filter: brightness(1); }
    50% { filter: brightness(1.18); }
  }
  @keyframes cow-shimmer {
    0% { background-position: -200% 0; }
    100% { background-position: 200% 0; }
  }
`;

/** Default transition shorthand for color/state morphing. */
export const colorTransition = css`
  transition:
    color var(--cow-dur-base) var(--cow-ease-out),
    background-color var(--cow-dur-base) var(--cow-ease-out),
    fill var(--cow-dur-base) var(--cow-ease-out),
    stroke var(--cow-dur-base) var(--cow-ease-out),
    opacity var(--cow-dur-base) var(--cow-ease-out),
    transform var(--cow-dur-base) var(--cow-ease-out);
`;
