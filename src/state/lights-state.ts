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

export function deriveLightsView(light: HassEntity | undefined): LightsView {
  if (!light) {
    return { variant: "off", brightnessPct: 0, raw: "unavailable" };
  }
  if (light.state === "off") {
    return { variant: "off", brightnessPct: 0, raw: light.state };
  }
  const attrs = light.attributes as HassLightAttributes;
  const b = typeof attrs.brightness === "number" ? attrs.brightness : 255;
  const pct = Math.round((b / 255) * 100);

  let variant: LightsVariant;
  if (pct <= 5) variant = "night";
  else if (pct <= 50) variant = "dim";
  else variant = "bright";

  return { variant, brightnessPct: pct, raw: light.state };
}

export function brightnessFromPct(pct: number): number {
  return Math.max(0, Math.min(255, Math.round((pct / 100) * 255)));
}
