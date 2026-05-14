import type { HassEntity, HassLightAttributes } from "../../types/hass.js";

export type LightsVariant = "bright" | "dim" | "off" | "night";

export interface LightsView {
  variant: LightsVariant;
  brightnessPct: number;
  raw: string;
  /**
   * True when the active scope can accept a `brightness` parameter. When
   * false (single on/off light, or aggregate of pure on/off lights only)
   * the UI must replace the `%` display with `ON`/`OFF` and disable the
   * vertical swipe gesture — sending `brightness:` would either be silently
   * ignored or rejected by the integration.
   */
  dimmable: boolean;
  /** Number of lights currently on (only meaningful when aggregated). */
  onCount?: number;
  /** Total lights in the group (only meaningful when aggregated). */
  totalCount?: number;
  /** Number of dimmable lights in the group (only meaningful when aggregated). */
  dimmerCount?: number;
}

function variantFor(pct: number): LightsVariant {
  if (pct <= 5) return "night";
  if (pct <= 50) return "dim";
  return "bright";
}

/**
 * Detect whether a light entity supports `brightness:` service calls.
 *
 * Home Assistant exposes the full set of capabilities through
 * `supported_color_modes`. A pure on/off bulb reports `["onoff"]`;
 * anything else (`brightness`, `color_temp`, `hs`, `xy`, `rgb`, `rgbw`,
 * `rgbww`, `white`) implies the light is dimmable.
 *
 * We intentionally don't fall back to `supported_features` (legacy
 * bitfield, deprecated in 2021.4) because most modern integrations
 * report it as `0` even for fully dimmable lights. If the entity is
 * missing, unavailable, or hasn't yet reported its modes, we err on the
 * side of "not dimmable" — sending `brightness:` to an unknown entity
 * is more disruptive than missing a fade animation once.
 */
export function isDimmable(entity: HassEntity | undefined): boolean {
  if (!entity) return false;
  const attrs = entity.attributes as HassLightAttributes;
  const modes = attrs.supported_color_modes;
  if (!Array.isArray(modes) || modes.length === 0) return false;
  return modes.some((m) => m !== "onoff" && m !== "unknown");
}

function brightnessPctOf(entity: HassEntity): number {
  const attrs = entity.attributes as HassLightAttributes;
  const b = typeof attrs.brightness === "number" ? attrs.brightness : 255;
  return Math.round((b / 255) * 100);
}

export function deriveLightsView(light: HassEntity | undefined): LightsView {
  if (!light) {
    return { variant: "off", brightnessPct: 0, raw: "unavailable", dimmable: false };
  }
  const dimmable = isDimmable(light);
  if (light.state !== "on") {
    return { variant: "off", brightnessPct: 0, raw: light.state, dimmable };
  }
  // Non-dimmer ON: we keep brightnessPct at 100 for the glow visual,
  // but the UI will render "ON" (not "100%") since dimmable=false.
  const pct = dimmable ? brightnessPctOf(light) : 100;
  return { variant: variantFor(pct), brightnessPct: pct, raw: light.state, dimmable };
}

/**
 * Aggregate a group of lights into one view for the "Tutte" master scope.
 *
 * Key invariants:
 *   - `brightnessPct` is the mean over **dimmers that are on**. On/off
 *     bulbs are intentionally excluded from the mean so the slider value
 *     isn't dragged toward 100% by every non-dimmable bulb in the group.
 *   - `dimmable` is true if the group contains at least one dimmer.
 *     When false, the UI replaces the `%` with `ON`/`OFF` based on
 *     whether any light is on.
 *   - When `dimmable` is true but no dimmer is currently on, we still
 *     report the group as on (variant ≠ off) if any non-dimmer is on —
 *     otherwise the panel would say "OFF" while a bulb is visibly lit.
 */
export function aggregateLightsView(
  lights: (HassEntity | undefined)[],
): LightsView {
  const total = lights.length;
  const present = lights.filter((l): l is HassEntity => l != null);
  const ons = present.filter((l) => l.state === "on");
  const dimmers = present.filter(isDimmable);
  const dimmersOn = dimmers.filter((l) => l.state === "on");
  const groupDimmable = dimmers.length > 0;

  if (ons.length === 0) {
    return {
      variant: "off",
      brightnessPct: 0,
      raw: "off",
      dimmable: groupDimmable,
      onCount: 0,
      totalCount: total,
      dimmerCount: dimmers.length,
    };
  }

  // Mean of dimmer brightness when we have them, otherwise pin to 100
  // so the glow keeps visualizing an "on" group.
  let pct: number;
  if (dimmersOn.length > 0) {
    const sum = dimmersOn.reduce((acc, l) => acc + brightnessPctOf(l), 0);
    pct = Math.round(sum / dimmersOn.length);
  } else {
    pct = 100;
  }

  return {
    variant: variantFor(pct),
    brightnessPct: pct,
    raw: "on",
    dimmable: groupDimmable,
    onCount: ons.length,
    totalCount: total,
    dimmerCount: dimmers.length,
  };
}

export function brightnessFromPct(pct: number): number {
  return Math.max(0, Math.min(255, Math.round((pct / 100) * 255)));
}
