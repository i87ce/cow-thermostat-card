import type { HassCoverAttributes, HassEntity } from "../types/hass.js";

/**
 * Blinds variants — Figma "Split Panel — All States / Blinds" frames 50:14, 50:16, 50:18, 50:20.
 *
 *  position 100         -> open
 *  20 < position < 80   -> half
 *  position 0           -> closed
 *  state opening|closing -> moving
 */
export type BlindsVariant = "open" | "half" | "closed" | "moving";

export interface BlindsView {
  variant: BlindsVariant;
  position: number; // 0..100, fallback 50 if unknown
  raw: string;
}

export function deriveBlindsView(cover: HassEntity | undefined): BlindsView {
  if (!cover) {
    return { variant: "closed", position: 0, raw: "unavailable" };
  }
  const attrs = cover.attributes as HassCoverAttributes;
  const pos = typeof attrs.current_position === "number"
    ? attrs.current_position
    : cover.state === "open"
      ? 100
      : cover.state === "closed"
        ? 0
        : 50;

  let variant: BlindsVariant;
  if (cover.state === "opening" || cover.state === "closing") {
    variant = "moving";
  } else if (pos >= 80) {
    variant = "open";
  } else if (pos <= 20) {
    variant = "closed";
  } else {
    variant = "half";
  }

  return { variant, position: pos, raw: cover.state };
}
