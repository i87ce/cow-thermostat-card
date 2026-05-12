import { css } from "lit";

/**
 * Cave of Wonders design tokens — extracted 1:1 from Figma file
 * "Thermostat Component — 10+ Variants" (fileKey o61NCf1Pdc2ErT26eH2PHX), page "1. Atoms".
 *
 * Naming follows Figma layer names verbatim so a designer can locate any token
 * by searching the source file.
 */
export const tokens = css`
  :host {
    /* Heating */
    --cow-heating-primary: #fa6b2e;
    --cow-heating-light: #ff9a4d;
    --cow-heating-active: #f2612c;

    /* Cooling */
    --cow-cooling-primary: #2673eb;
    --cow-cooling-light: #59a6ff;
    --cow-cooling-active: #3380f2;

    /* Off / Neutral */
    --cow-off-primary: #808088;
    --cow-off-light: #a5a5ad;
    --cow-off-medium: #8c8c96;

    /* Idle / Success */
    --cow-idle-primary: #26a673;
    --cow-idle-light: #40c78c;
    --cow-idle-active: #33b37a;

    /* Blinds — Open */
    --cow-blinds-sky: #66bfff;
    --cow-blinds-light: #99e0ff;
    --cow-blinds-medium: #4d8cd1;

    /* Blinds — Moving */
    --cow-blinds-amber: #e6a626;
    --cow-blinds-amber-light: #ffc740;
    --cow-blinds-amber-dark: #d99a1a;

    /* Lights — Warm */
    --cow-lights-bright: #ffc72e;
    --cow-lights-dim: #b3801f;
    --cow-lights-night: #332610;

    /* UI — Surface */
    --cow-surface-white: #ffffff;
    --cow-surface-background: #f7f7fa;
    --cow-surface-border: #ebebed;
    --cow-surface-button-bg: #f0f0f2;
    --cow-surface-button-border: #e5e5eb;

    /* UI — Text */
    --cow-text-primary: #1f1f2e;
    --cow-text-secondary: #8c8c99;
    --cow-text-disabled: #b3b3bd;
    --cow-text-room-name: #262633;
    --cow-text-time: #666673;
    --cow-text-button: #595966;
    --cow-text-button-muted: #737380;

    /* Stop / Alert (from "4. Design System" page) */
    --cow-stop: #e74c3c;

    /* Corner radii (from "Atoms / Corner Radii") */
    --cow-radius-small: 0.4375rem; /* 7px  - small buttons (fan) */
    --cow-radius-medium: 0.5rem; /* 8px  - pills (mode) */
    --cow-radius-default: 0.625rem; /* 10px - controls (arrow) */
    --cow-radius-large: 0.75rem; /* 12px - swatches */
    --cow-radius-xl: 1rem; /* 16px - cards (split panel) */

    /* Shadows / depth (subtle, no blur filters for MTK6580) */
    --cow-shadow-card: 0 0.125rem 0.5rem rgba(31, 31, 46, 0.08);

    /* Per-device current accent (set by panels at runtime) */
    --cow-accent: var(--cow-heating-primary);
    --cow-accent-light: var(--cow-heating-light);
    --cow-accent-active: var(--cow-heating-active);

    /* Aliases used by the XL drawer tabs (clearer naming for new code) */
    --cow-thermostat-orange: var(--cow-heating-primary);
    --cow-thermostat-orange-dark: #e55a1f;
    --cow-blinds-blue: var(--cow-blinds-medium);
    --cow-blinds-blue-dark: #2f6cb5;
    --cow-lights-yellow: var(--cow-lights-bright);
    --cow-lights-glow-bg: #fff8e0;
  }
`;

/**
 * Variant -> token map. Returns the three accent vars (primary/light/active)
 * to bind on the panel root for that state.
 */
export type AccentVars = {
  primary: string;
  light: string;
  active: string;
};

export const accentForThermostat = (
  v: "heating" | "cooling" | "off" | "idle",
): AccentVars => {
  switch (v) {
    case "heating":
      return {
        primary: "var(--cow-heating-primary)",
        light: "var(--cow-heating-light)",
        active: "var(--cow-heating-active)",
      };
    case "cooling":
      return {
        primary: "var(--cow-cooling-primary)",
        light: "var(--cow-cooling-light)",
        active: "var(--cow-cooling-active)",
      };
    case "off":
      return {
        primary: "var(--cow-off-primary)",
        light: "var(--cow-off-light)",
        active: "var(--cow-off-medium)",
      };
    case "idle":
      return {
        primary: "var(--cow-idle-primary)",
        light: "var(--cow-idle-light)",
        active: "var(--cow-idle-active)",
      };
  }
};

export const accentForBlinds = (
  v: "open" | "half" | "closed" | "moving",
): AccentVars => {
  switch (v) {
    case "open":
      return {
        primary: "var(--cow-blinds-sky)",
        light: "var(--cow-blinds-light)",
        active: "var(--cow-blinds-medium)",
      };
    case "half":
      return {
        primary: "var(--cow-blinds-medium)",
        light: "var(--cow-blinds-sky)",
        active: "var(--cow-blinds-medium)",
      };
    case "closed":
      return {
        primary: "#1f1f2e",
        light: "#3a3a4a",
        active: "#0f0f1a",
      };
    case "moving":
      return {
        primary: "var(--cow-blinds-amber)",
        light: "var(--cow-blinds-amber-light)",
        active: "var(--cow-blinds-amber-dark)",
      };
  }
};

export const accentForLights = (
  v: "bright" | "dim" | "off" | "night",
): AccentVars => {
  switch (v) {
    case "bright":
      return {
        primary: "var(--cow-lights-bright)",
        light: "#ffd966",
        active: "#e6b329",
      };
    case "dim":
      return {
        primary: "var(--cow-lights-dim)",
        light: "#cc9933",
        active: "#996b1a",
      };
    case "off":
      return {
        primary: "var(--cow-off-primary)",
        light: "var(--cow-off-light)",
        active: "var(--cow-off-medium)",
      };
    case "night":
      return {
        primary: "var(--cow-lights-night)",
        light: "#4d3a18",
        active: "#1a1308",
      };
  }
};
