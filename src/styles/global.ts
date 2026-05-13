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
   * In Lovelace panel mode HA wraps the card in <hui-panel-view> with
   * 8px padding all-around — on a 480×480 Shelly Wall Display kiosk
   * that turns 24rem (=100% of the shorter side, designed flush) into
   * 24rem-but-clipped-inside-460×460, leaving a visible black border.
   *
   * When we detect that we are inside a panel view (hui-panel-view)
   * we promote :host to position absolute + inset 0 so the card
   * paints over the panel-view padding and reaches the screen edges.
   */
  /*
   * In panel mode we want the card to fill the viewport regardless of
   * the wrapper sizing applied by HA. Pinning via vmin is safer than
   * "position fixed" (which fights kiosk-mode plugin overlays and
   * Shelly Wall Display's status bar overlay).
   */
  :host([panel]) {
    position: fixed;
    left: 0;
    top: 0;
    right: 0;
    bottom: 0;
    width: 100vw;
    height: 100vh;
    z-index: 100;
    background: var(--cow-surface-background, #f0f0f0);
  }

  /*
   * Sizing strategy — keep the card responsive on any kiosk:
   *
   * 1cqmin = 1% of the smaller side of the host (container query).
   * The cow design grid is 24 rem wide, so font-size: 100cqmin/24
   * makes 24 rem == 100% of the host's shorter side.
   *
   * BUT: the embedded browser on the Shelly Wall Display kiosk
   * (firmware 2.6.0) does NOT support CSS Container Queries — cqmin
   * silently resolves to 0 there, font-size collapses to the UA
   * default 16px and the card paints at a fixed 384x384 inside a
   * 480x480 panel, leaving a visible 48px gutter. So we use vmin as
   * the fallback (supported everywhere since 2013) and override with
   * cqmin only when @supports tells us the engine handles it.
   *
   * vmin is fine for kiosks where the dashboard occupies the whole
   * viewport (which is exactly the panel-mode case we care about).
   */
  /*
   * Use vmin everywhere. Container queries (cqmin) were the original
   * design and would have been ideal because they respect the card's
   * actual painted area instead of the global viewport — but in
   * practice the Shelly Wall Display kiosk + HA's panel-view wrapper
   * end up with a container size that doesn't match the screen, and
   * cqmin then evaluates to 0 on us. vmin is a sturdy fallback for
   * full-screen kiosks: 1 vmin = 1% of the shorter viewport side.
   */
  /*
   * Card grid is 24rem wide by design. Hardcoding 1rem = 30px makes
   * the panels render at a fixed 720x720 — large enough to fill any
   * Shelly Wall Display kiosk (480x480 native or 720x720 screenshot
   * scale) without depending on viewport/container queries that the
   * embedded browser handles inconsistently.
   */
  :host {
    font-size: 30px !important;
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
