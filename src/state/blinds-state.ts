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

function variantFor(pos: number, state: string): BlindsVariant {
  if (state === "opening" || state === "closing") return "moving";
  if (pos >= 80) return "open";
  if (pos <= 20) return "closed";
  return "half";
}

function positionOf(cover: HassEntity): number {
  const attrs = cover.attributes as HassCoverAttributes;
  if (typeof attrs.current_position === "number") return attrs.current_position;
  if (cover.state === "open") return 100;
  if (cover.state === "closed") return 0;
  return 50;
}

export function deriveBlindsView(cover: HassEntity | undefined): BlindsView {
  if (!cover) {
    return { variant: "closed", position: 0, raw: "unavailable" };
  }
  const pos = positionOf(cover);
  return { variant: variantFor(pos, cover.state), position: pos, raw: cover.state };
}

/**
 * Aggregated view across N covers: average position, "moving" if any is moving.
 */
export function aggregateBlindsView(
  covers: (HassEntity | undefined)[],
): BlindsView {
  const valid = covers.filter((c): c is HassEntity => c != null);
  if (valid.length === 0) {
    return { variant: "closed", position: 0, raw: "unavailable" };
  }
  const anyMoving = valid.some(
    (c) => c.state === "opening" || c.state === "closing",
  );
  const avg = Math.round(
    valid.reduce((s, c) => s + positionOf(c), 0) / valid.length,
  );
  if (anyMoving) {
    return { variant: "moving", position: avg, raw: "moving" };
  }
  return { variant: variantFor(avg, "open"), position: avg, raw: "on" };
}
