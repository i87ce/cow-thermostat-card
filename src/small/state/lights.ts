import type { HassEntity, HassLightAttributes } from "../../types/hass.js";

export type LightsVariant = "bright" | "dim" | "off" | "night";

export interface LightsView {
  variant: LightsVariant;
  brightnessPct: number;
  raw: string;
  /** Number of lights currently on (only meaningful when aggregated). */
  onCount?: number;
  /** Total lights in the group (only meaningful when aggregated). */
  totalCount?: number;
}

function variantFor(pct: number): LightsVariant {
  if (pct <= 5) return "night";
  if (pct <= 50) return "dim";
  return "bright";
}

export function deriveLightsView(light: HassEntity | undefined): LightsView {
  if (!light) return { variant: "off", brightnessPct: 0, raw: "unavailable" };
  if (light.state !== "on") {
    return { variant: "off", brightnessPct: 0, raw: light.state };
  }
  const attrs = light.attributes as HassLightAttributes;
  const b = typeof attrs.brightness === "number" ? attrs.brightness : 255;
  const pct = Math.round((b / 255) * 100);
  return { variant: variantFor(pct), brightnessPct: pct, raw: light.state };
}

export function aggregateLightsView(
  lights: (HassEntity | undefined)[],
): LightsView {
  const total = lights.length;
  const ons = lights
    .filter((l): l is HassEntity => l != null && l.state === "on")
    .map((l) => {
      const attrs = l.attributes as HassLightAttributes;
      const b = typeof attrs.brightness === "number" ? attrs.brightness : 255;
      return Math.round((b / 255) * 100);
    });
  if (ons.length === 0) {
    return {
      variant: "off",
      brightnessPct: 0,
      raw: "off",
      onCount: 0,
      totalCount: total,
    };
  }
  const avg = Math.round(ons.reduce((a, b) => a + b, 0) / ons.length);
  return {
    variant: variantFor(avg),
    brightnessPct: avg,
    raw: "on",
    onCount: ons.length,
    totalCount: total,
  };
}

export function brightnessFromPct(pct: number): number {
  return Math.max(0, Math.min(255, Math.round((pct / 100) * 255)));
}
