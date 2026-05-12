/**
 * Sky palette computation for the XL hero card.
 *
 * Drives the hero background from a single input — `sun.sun` elevation
 * (degrees above/below the horizon) — through a piecewise-linear
 * interpolation across six keyframes, from astronomical-night through
 * full-day. Output is three RGB tuples to be slotted into a 3-stop
 * vertical CSS gradient (top → mid → horizon).
 *
 * Also exposes a deterministic star field generator (seeded LCG) so the
 * stars don't twinkle in/out of existence on every re-render.
 */

export type RGB = readonly [number, number, number];

export interface SkyPalette {
  top: RGB;
  mid: RGB;
  horizon: RGB;
}

/**
 * Sky keyframes, sorted by sun elevation. Each entry is the palette to
 * paint when the sun is at exactly that elevation; in-between values
 * are interpolated linearly.
 *
 * Colors are hand-tuned for a warm, "wallpaper-like" feel rather than
 * physically accurate Rayleigh scattering — we want WOW, not realism.
 */
const SKY_KEYFRAMES: ReadonlyArray<{ elevation: number; palette: SkyPalette }> = [
  // Deep night: sun far below horizon (post-midnight clear sky)
  {
    elevation: -90,
    palette: {
      top: [8, 12, 38],
      mid: [14, 18, 50],
      horizon: [22, 26, 64],
    },
  },
  // Astronomical twilight (sun ~12° below): hint of indigo at horizon
  {
    elevation: -12,
    palette: {
      top: [20, 24, 60],
      mid: [42, 36, 90],
      horizon: [98, 56, 110],
    },
  },
  // Civil twilight (sun ~6° below): the famous purple-orange band
  {
    elevation: -6,
    palette: {
      top: [54, 62, 120],
      mid: [149, 92, 132],
      horizon: [232, 130, 92],
    },
  },
  // Sunrise/sunset (sun on the horizon): peach + orange + pink
  {
    elevation: 0,
    palette: {
      top: [120, 158, 210],
      mid: [253, 178, 124],
      horizon: [255, 140, 82],
    },
  },
  // Golden hour (sun low but up): warm pastels, the hour photographers love
  {
    elevation: 12,
    palette: {
      top: [145, 200, 232],
      mid: [255, 218, 174],
      horizon: [255, 178, 124],
    },
  },
  // Bright day (sun high): clean blue with a peach horizon
  {
    elevation: 60,
    palette: {
      top: [108, 184, 226],
      mid: [188, 226, 246],
      horizon: [255, 240, 208],
    },
  },
];

const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

const lerpRgb = (a: RGB, b: RGB, t: number): RGB => [
  Math.round(lerp(a[0], b[0], t)),
  Math.round(lerp(a[1], b[1], t)),
  Math.round(lerp(a[2], b[2], t)),
];

/** Interpolate the sky palette for a given sun elevation in degrees. */
export function skyPaletteFor(elevation: number): SkyPalette {
  const e = Math.max(-90, Math.min(90, elevation));
  for (let i = 0; i < SKY_KEYFRAMES.length - 1; i++) {
    const a = SKY_KEYFRAMES[i];
    const b = SKY_KEYFRAMES[i + 1];
    if (e >= a.elevation && e <= b.elevation) {
      const t = (e - a.elevation) / (b.elevation - a.elevation);
      return {
        top: lerpRgb(a.palette.top, b.palette.top, t),
        mid: lerpRgb(a.palette.mid, b.palette.mid, t),
        horizon: lerpRgb(a.palette.horizon, b.palette.horizon, t),
      };
    }
  }
  return SKY_KEYFRAMES[SKY_KEYFRAMES.length - 1].palette;
}

export const rgb = (c: RGB): string => `rgb(${c[0]}, ${c[1]}, ${c[2]})`;

/** A vertical 3-stop CSS gradient string ready for `background:` */
export function skyGradient(p: SkyPalette): string {
  return `linear-gradient(180deg, ${rgb(p.top)} 0%, ${rgb(p.mid)} 55%, ${rgb(p.horizon)} 100%)`;
}

/**
 * "How dark is it?" — 0 = full day, 1 = full night. Used to fade the
 * star field in (and the sun out) without sharp on/off transitions.
 */
export function nightOpacity(elevation: number): number {
  // Fully day at elevation > 3°, fully night at elevation < -9° (mid-civil-twilight)
  if (elevation >= 3) return 0;
  if (elevation <= -9) return 1;
  return (3 - elevation) / 12;
}

/* ──────────────────────────────────────────────────────────────────
 * Star field
 * ────────────────────────────────────────────────────────────────── */

export interface Star {
  /** Horizontal position, 0..100 (% of hero width) */
  x: number;
  /** Vertical position, 0..100 (% of hero height) — biased toward the top */
  y: number;
  /** Apparent radius, in CSS pixels (after scaling) */
  size: number;
  /** Twinkle animation delay, 0..6 seconds */
  delay: number;
  /** Per-star brightness multiplier, 0.5..1 */
  brightness: number;
}

/** Linear congruential generator — deterministic, dependency-free. */
function lcg(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}

/** Generate `count` stars with stable positions across renders. */
export function generateStars(count: number, seed = 0xC0BE_17): Star[] {
  const rand = lcg(seed);
  const stars: Star[] = [];
  for (let i = 0; i < count; i++) {
    stars.push({
      x: rand() * 100,
      y: rand() * 65, // keep stars in the upper 65% of the sky
      size: 0.5 + rand() * 1.6,
      delay: rand() * 6,
      brightness: 0.5 + rand() * 0.5,
    });
  }
  return stars;
}
