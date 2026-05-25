/**
 * Shared CSS for the hero engine — all weather FX, celestial bodies,
 * stars, pollen specks.
 *
 * Why split this out of ``cow-xl-hero``: the same engine now needs to
 * run inside the mobile dashboard's hero too. Keeping the styles in
 * one place means: a) one source of truth for the keyframes, b) adding
 * a new FX (e.g. wind, aurora, hail, godrays) just touches this module
 * and ``weather-fx.ts`` — every host card picks it up for free.
 *
 * Each export is a chunk of ``css\`...\``` you mix into the host
 * component's ``static styles = [ ... ]`` array. They are independent
 * — pull only what you need (mobile hero might skip ``celestialStyles``
 * on the tiniest viewports, for instance).
 *
 * All animations are pure ``transform`` / ``opacity`` so they stay
 * GPU-accelerated on the MTK6580 in the Shelly Wall Display — no
 * ``filter: blur``, no backdrop filters, no canvas. Anything new added
 * here MUST follow the same constraint.
 */
import { css } from "lit";

/* ────────────────────────────────────────────────────────────────────── */
/*  Sky layers (horizon haze, stars field, evening dim scrim)              */
/* ────────────────────────────────────────────────────────────────────── */

export const skyStyles = css`
  .horizon-haze {
    position: absolute;
    left: 0;
    right: 0;
    bottom: 0;
    height: 7rem;
    background: linear-gradient(
      180deg,
      rgba(0, 0, 0, 0) 0%,
      var(--cow-horizon-haze, rgba(255, 200, 130, 0.18)) 100%
    );
    pointer-events: none;
  }

  .stars {
    position: absolute;
    inset: 0;
    opacity: var(--cow-night-opacity, 0);
    transition: opacity 4s ease;
    pointer-events: none;
  }
  .star {
    position: absolute;
    width: var(--s, 2px);
    height: var(--s, 2px);
    background: white;
    border-radius: 50%;
    box-shadow: 0 0 0.5rem rgba(255, 255, 255, 0.6);
    animation: cow-twinkle 3.6s ease-in-out infinite;
    animation-delay: var(--d, 0s);
    will-change: opacity;
  }
  @keyframes cow-twinkle {
    0%, 100% { opacity: var(--brightness, 0.8); }
    50%      { opacity: calc(var(--brightness, 0.8) * 0.35); }
  }

  /* A soft black overlay that ramps in around sunset so the screen
     doesn't blast a living room with a fully-bright golden-hour
     palette at 8 PM. Sits above weather FX / celestial bodies /
     pollen specks but below the horizon haze and the text. */
  .evening-dim {
    position: absolute;
    inset: 0;
    background: rgba(0, 0, 0, var(--cow-evening-dim, 0));
    pointer-events: none;
    transition: background 4s ease;
    z-index: 2;
  }
`;

/* ────────────────────────────────────────────────────────────────────── */
/*  Celestial body (sun + moon)                                            */
/* ────────────────────────────────────────────────────────────────────── */

export const celestialStyles = css`
  .celestial {
    position: absolute;
    width: 22rem;
    height: 22rem;
    transform: translate(-50%, -50%);
    transition: left 30s linear, top 30s linear, opacity 4s ease;
    pointer-events: none;
    will-change: opacity, transform;
  }
  .celestial-svg {
    width: 100%;
    height: 100%;
    display: block;
  }
  .sun-glow {
    transform-origin: center;
    animation: cow-sun-breathe 6s ease-in-out infinite;
  }
  .sun-rays {
    transform-origin: center;
    animation: cow-sun-rays 18s linear infinite;
  }
  .sun-core {
    transform-origin: center;
    animation: cow-sun-pulse 4.5s ease-in-out infinite;
  }
  @keyframes cow-sun-breathe {
    0%, 100% { transform: scale(1);    opacity: 1;   }
    50%      { transform: scale(1.05); opacity: 0.9; }
  }
  @keyframes cow-sun-pulse {
    0%, 100% { transform: scale(1);    }
    50%      { transform: scale(1.025);}
  }
  @keyframes cow-sun-rays {
    from { transform: rotate(0deg);   }
    to   { transform: rotate(360deg); }
  }
  .moon-halo {
    animation: cow-moon-glow 8s ease-in-out infinite;
    transform-origin: center;
  }
  @keyframes cow-moon-glow {
    0%, 100% { opacity: 1;   transform: scale(1);    }
    50%      { opacity: 0.7; transform: scale(1.06); }
  }
`;

/* ────────────────────────────────────────────────────────────────────── */
/*  Weather FX — clouds, rain, snow, fog, lightning + 4 new effects        */
/* ────────────────────────────────────────────────────────────────────── */

export const weatherFxStyles = css`
  /* ───── Clouds ──────────────────────────────────────────────────── */
  .fx-clouds {
    position: absolute;
    inset: 0;
    pointer-events: none;
    overflow: hidden;
  }
  .fx-cloud {
    position: absolute;
    width: 24rem;
    height: 9rem;
    transform: scale(var(--cloud-scale, 1));
    opacity: var(--cloud-opacity, 0.85);
    animation: cow-cloud-drift var(--cloud-dur, 100s) linear infinite;
    animation-delay: var(--cloud-delay, 0s);
    will-change: transform;
    left: -28rem;
  }
  .fx-cloud-svg {
    width: 100%;
    height: 100%;
    display: block;
    filter: drop-shadow(0 0.25rem 0.5rem rgba(0, 0, 0, 0.04));
  }
  @keyframes cow-cloud-drift {
    from { transform: translateX(0)             scale(var(--cloud-scale, 1)); }
    to   { transform: translateX(calc(100vw + 32rem)) scale(var(--cloud-scale, 1)); }
  }

  /* ───── Rain ────────────────────────────────────────────────────── */
  .fx-rain {
    position: absolute;
    inset: 0;
    pointer-events: none;
  }
  @keyframes cow-rain-fall {
    from { transform: translate(0, 0);        opacity: 0; }
    10%  {                                    opacity: 1; }
    90%  {                                    opacity: 1; }
    to   { transform: translate(-12px, 90vh); opacity: 0; }
  }

  /* ───── Snow ────────────────────────────────────────────────────── */
  .fx-snow {
    position: absolute;
    inset: 0;
    pointer-events: none;
  }
  @keyframes cow-snow-fall {
    from { transform: translate(0, 0);                          opacity: 0; }
    10%  {                                                      opacity: 1; }
    90%  {                                                      opacity: 1; }
    to   { transform: translate(var(--sway, 0), 95vh);          opacity: 0; }
  }

  /* ───── Fog ─────────────────────────────────────────────────────── */
  .fx-fog {
    position: absolute;
    left: 0; right: 0;
    bottom: 0;
    height: 11rem;
    pointer-events: none;
  }
  .fx-fog-band {
    position: absolute;
    left: -20%;
    right: -20%;
    height: 6rem;
    background: linear-gradient(
      180deg,
      rgba(245, 245, 250, 0) 0%,
      rgba(245, 245, 250, 0.55) 60%,
      rgba(245, 245, 250, 0.7) 100%
    );
    animation: cow-fog-drift 22s ease-in-out infinite alternate;
  }
  .fx-fog-band-1 { bottom: 0;    opacity: 0.85; }
  .fx-fog-band-2 { bottom: 2rem; opacity: 0.55; animation-duration: 28s; animation-delay: -8s; }
  .fx-fog-band-3 { bottom: 4rem; opacity: 0.35; animation-duration: 35s; animation-delay: -16s; }
  @keyframes cow-fog-drift {
    from { transform: translateX(-3%); }
    to   { transform: translateX(3%);  }
  }

  /* ───── Lightning ───────────────────────────────────────────────── */
  .fx-lightning {
    position: absolute;
    inset: 0;
    pointer-events: none;
  }
  .fx-lightning-flash {
    position: absolute;
    inset: 0;
    background: white;
    opacity: 0;
    animation: cow-lightning-flash 9s steps(1, end) infinite;
  }
  .fx-lightning-bolt {
    position: absolute;
    top: 15%;
    left: 38%;
    width: 4rem;
    height: 12rem;
    opacity: 0;
    animation: cow-lightning-bolt 9s steps(1, end) infinite;
    filter: drop-shadow(0 0 1rem rgba(255, 249, 214, 0.7));
  }
  @keyframes cow-lightning-flash {
    0%, 88%, 92%, 100% { opacity: 0;    }
    89%, 91%           { opacity: 0.55; }
    90%                { opacity: 0.7;  }
  }
  @keyframes cow-lightning-bolt {
    0%, 88%, 100% { opacity: 0; }
    89%, 91%      { opacity: 1; }
    90%           { opacity: 0.6;}
  }

  /* ───── WIND (NEW) ──────────────────────────────────────────────── *
   * Decorative tree silhouettes anchored to the bottom corners that
   * sway gently. Two trees (left + right) at offset phase so they
   * don't tick in unison. SVG is a hand-drawn fluffy crown so we don't
   * pull an icon font; sway is a small rotate around the trunk base
   * (transform-origin bottom). Independent of weather intensity for
   * v1; could later read wind_speed to drive amplitude.             */
  .fx-wind {
    position: absolute;
    inset: 0;
    pointer-events: none;
    overflow: hidden;
  }
  .fx-tree {
    position: absolute;
    bottom: -1rem;
    width: 11rem;
    height: 13rem;
    transform-origin: 50% 100%;
    animation: cow-tree-sway 4.2s ease-in-out infinite;
    will-change: transform;
    opacity: 0.55;
  }
  .fx-tree-left  { left: -1.5rem;  animation-delay: -0.7s; }
  .fx-tree-right { right: -1.5rem; animation-delay: -2.3s; transform: scaleX(-1); }
  .fx-tree svg { width: 100%; height: 100%; display: block; }
  @keyframes cow-tree-sway {
    0%, 100% { transform: rotate(-3deg); }
    50%      { transform: rotate( 3deg); }
  }
  /* Right tree starts mirrored; sway has to compose with scaleX(-1). */
  .fx-tree-right {
    animation-name: cow-tree-sway-right;
  }
  @keyframes cow-tree-sway-right {
    0%, 100% { transform: scaleX(-1) rotate(-3deg); }
    50%      { transform: scaleX(-1) rotate( 3deg); }
  }

  /* ───── HAIL (NEW) ──────────────────────────────────────────────── *
   * Distinct from rain: small bright pellets (not streaks) that fall
   * fast and bounce a touch on the horizon. Same SVG-pellet pattern as
   * snow but smaller, denser, no sway, and a steel-blue tint.        */
  .fx-hail {
    position: absolute;
    inset: 0;
    pointer-events: none;
  }
  @keyframes cow-hail-fall {
    from { transform: translate(0, 0);     opacity: 0; }
    5%   {                                 opacity: 1; }
    92%  {                                 opacity: 1; }
    to   { transform: translate(-3px, 96vh); opacity: 0; }
  }

  /* ───── GODRAYS (NEW) ───────────────────────────────────────────── *
   * Sun beams diffusing through scattered clouds, daytime only.
   * Pure CSS gradient cone anchored near the sun position; we don't
   * compute the exact angle (the live sun position drifts and the
   * rays read fine as a static fan). Slow opacity pulse so it doesn't
   * feel static.                                                     */
  .fx-godrays {
    position: absolute;
    inset: 0;
    pointer-events: none;
    background:
      conic-gradient(
        from 200deg at 75% 8%,
        transparent 0deg,
        rgba(255, 235, 170, 0.0) 18deg,
        rgba(255, 235, 170, 0.22) 24deg,
        rgba(255, 235, 170, 0.0) 30deg,
        transparent 36deg,
        rgba(255, 245, 200, 0.18) 44deg,
        transparent 52deg,
        rgba(255, 235, 170, 0.14) 60deg,
        transparent 68deg,
        rgba(255, 240, 195, 0.20) 74deg,
        transparent 82deg
      );
    mix-blend-mode: screen;
    opacity: 0.7;
    animation: cow-godrays-pulse 7s ease-in-out infinite;
    will-change: opacity;
  }
  @keyframes cow-godrays-pulse {
    0%, 100% { opacity: 0.55; }
    50%      { opacity: 0.85; }
  }

  /* ───── AURORA (NEW, opt-in) ────────────────────────────────────── *
   * Slow, sweeping bands of green/cyan/violet over the top half of
   * the sky. Only renders when the host card opts in (the weather
   * state machine has no aurora value, and we don't want to guess
   * latitude). Two layered conic gradients on a vertical mask so the
   * effect fades into the upper sky and never crosses the horizon
   * onto the foreground content.                                    */
  .fx-aurora {
    position: absolute;
    inset: 0;
    pointer-events: none;
    overflow: hidden;
    mix-blend-mode: screen;
  }
  .fx-aurora-band {
    position: absolute;
    top: -10%;
    left: -10%;
    width: 120%;
    height: 60%;
    filter: blur(18px);
    opacity: 0.45;
    -webkit-mask-image: linear-gradient(180deg, black 0%, black 60%, transparent 100%);
            mask-image: linear-gradient(180deg, black 0%, black 60%, transparent 100%);
    animation: cow-aurora-sweep 18s ease-in-out infinite alternate;
    will-change: transform, opacity;
  }
  .fx-aurora-band-1 {
    background: linear-gradient(
      90deg,
      transparent 0%,
      rgba(60, 220, 130, 0.45) 25%,
      rgba(60, 220, 200, 0.50) 50%,
      rgba(120, 100, 230, 0.40) 75%,
      transparent 100%
    );
    animation-duration: 22s;
  }
  .fx-aurora-band-2 {
    top: 5%;
    height: 50%;
    opacity: 0.30;
    background: linear-gradient(
      90deg,
      transparent 0%,
      rgba(160, 100, 230, 0.45) 30%,
      rgba(80, 200, 220, 0.45) 70%,
      transparent 100%
    );
    animation-duration: 27s;
    animation-delay: -9s;
  }
  @keyframes cow-aurora-sweep {
    0%   { transform: translateX(-6%) skewX(-4deg); opacity: 0.35; }
    50%  { transform: translateX( 4%) skewX( 2deg); opacity: 0.65; }
    100% { transform: translateX(-2%) skewX(-2deg); opacity: 0.40; }
  }
`;

/* ────────────────────────────────────────────────────────────────────── */
/*  Pollen specks (airborne particle effect)                               */
/* ────────────────────────────────────────────────────────────────────── */

export const pollenStyles = css`
  .fx-pollen {
    position: absolute;
    inset: 0;
    pointer-events: none;
    /* v1.1.3: was mix-blend-mode screen so specks felt glowy on a
       blue daytime sky, but at sunset/dusk the warm sky gradient
       (orange/pink/violet) eats yellow-green specks alive. Drop the
       blend mode so particle alpha behaves predictably across the
       entire day/night arc. */
  }
  @keyframes cow-pollen-drift {
    from { transform: translate(0, 0);                       opacity: 0; }
    10%  {                                                   opacity: 1; }
    90%  {                                                   opacity: 1; }
    to   { transform: translate(var(--sway, 0), 110vh);      opacity: 0; }
  }
`;

/* ────────────────────────────────────────────────────────────────────── */
/*  Convenience: everything at once                                        */
/* ────────────────────────────────────────────────────────────────────── */

/**
 * The full hero engine stylesheet. Use this in cards that include the
 * whole stack (XL hero, mobile hero); pull individual chunks above if
 * you only need a subset.
 */
export const heroEngineStyles = [
  skyStyles,
  celestialStyles,
  weatherFxStyles,
  pollenStyles,
];
