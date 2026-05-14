import type { HassCoverAttributes, HassEntity } from "../../types/hass.js";

export type BlindsVariant = "open" | "half" | "closed" | "moving";

export interface BlindsView {
  variant: BlindsVariant;
  position: number;
  raw: string;
  /** "opening" | "closing" | undefined — direction when moving. */
  movingDir?: "opening" | "closing";
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
  if (!cover) return { variant: "closed", position: 0, raw: "unavailable" };
  const pos = positionOf(cover);
  const variant = variantFor(pos, cover.state);
  return {
    variant,
    position: pos,
    raw: cover.state,
    movingDir:
      cover.state === "opening"
        ? "opening"
        : cover.state === "closing"
          ? "closing"
          : undefined,
  };
}

export function aggregateBlindsView(
  covers: (HassEntity | undefined)[],
): BlindsView {
  const valid = covers.filter((c): c is HassEntity => c != null);
  if (valid.length === 0) {
    return { variant: "closed", position: 0, raw: "unavailable" };
  }
  const opening = valid.some((c) => c.state === "opening");
  const closing = valid.some((c) => c.state === "closing");
  const avg = Math.round(
    valid.reduce((s, c) => s + positionOf(c), 0) / valid.length,
  );
  if (opening || closing) {
    return {
      variant: "moving",
      position: avg,
      raw: "moving",
      movingDir: opening ? "opening" : "closing",
    };
  }
  return { variant: variantFor(avg, "open"), position: avg, raw: "on" };
}
