import type { HassEntity, HassLightAttributes } from "../types/hass.js";

/**
 * Lights variants — Figma "Split Panel — All States / Lights" frames
 * 50:23 (Bright), 50:25 (Dim), 50:27 (Off), 50:29 (Night 5%).
 *
 *  state off            -> off
 *  brightness <= 13     -> night   (~5% of 255)
 *  brightness <= 127    -> dim     (~50%)
 *  brightness > 127     -> bright
 */
export type LightsVariant = "bright" | "dim" | "off" | "night";

export interface LightsView {
  variant: LightsVariant;
  brightnessPct: number; // 0..100
  raw: string;
}

function variantFor(pct: number): LightsVariant {
  if (pct <= 5) return "night";
  if (pct <= 50) return "dim";
  return "bright";
}

export function deriveLightsView(light: HassEntity | undefined): LightsView {
  if (!light) {
    return { variant: "off", brightnessPct: 0, raw: "unavailable" };
  }
  if (light.state !== "on") {
    return { variant: "off", brightnessPct: 0, raw: light.state };
  }
  const attrs = light.attributes as HassLightAttributes;
  const b = typeof attrs.brightness === "number" ? attrs.brightness : 255;
  const pct = Math.round((b / 255) * 100);
  return { variant: variantFor(pct), brightnessPct: pct, raw: light.state };
}

/**
 * Aggregated view across N lights:
 *  - off if no light is on
 *  - brightnessPct = average brightness of ON lights only
 *  - variant follows that average
 */
export function aggregateLightsView(
  lights: (HassEntity | undefined)[],
): LightsView {
  const ons = lights
    .filter((l): l is HassEntity => l != null && l.state === "on")
    .map((l) => {
      const attrs = l.attributes as HassLightAttributes;
      const b = typeof attrs.brightness === "number" ? attrs.brightness : 255;
      return Math.round((b / 255) * 100);
    });
  if (ons.length === 0) {
    return { variant: "off", brightnessPct: 0, raw: "off" };
  }
  const avg = Math.round(ons.reduce((a, b) => a + b, 0) / ons.length);
  return { variant: variantFor(avg), brightnessPct: avg, raw: "on" };
}

export function brightnessFromPct(pct: number): number {
  return Math.max(0, Math.min(255, Math.round((pct / 100) * 255)));
}
