/**
 * Celestial body rendering — sun and moon — for the XL hero card.
 *
 * The sun is a two-layer SVG (radial-gradient glow + bright core) with a
 * subtle "breathing" animation driven by CSS.
 *
 * The moon uses the classic two-overlapping-circles technique:
 *   - a base disc rendered with a radial gradient (lit side + craters)
 *   - a "shadow" disc of the night-sky color, offset horizontally,
 *     clipped to the moon's outline, that carves out the dark side.
 * The shadow offset (and clip side) is derived from the `sensor.moon`
 * 8-state phase string returned by HA's built-in moon integration.
 *
 * Position math: given the live `sun.sun` elevation+azimuth, the sun
 * arcs across the hero from left (sunrise, az=90) through top-center
 * (noon, az=180) to right (sunset, az=270). Elevation maps to vertical
 * position with a non-linear ease so the body lingers near the top.
 *
 * The moon doesn't carry azimuth in HA (no built-in moon-azimuth
 * sensor), so we synthesize a position from the night progress
 * (now vs. sunset/next_rising) — close enough for a wallpaper.
 */
import { svg, type TemplateResult } from "lit";

export type MoonPhase =
  | "new_moon"
  | "waxing_crescent"
  | "first_quarter"
  | "waxing_gibbous"
  | "full_moon"
  | "waning_gibbous"
  | "last_quarter"
  | "waning_crescent";

/** Map each phase to (illumination 0..1, waxing flag). */
const MOON_PHASE_INFO: Record<MoonPhase, { illum: number; waxing: boolean }> = {
  new_moon: { illum: 0, waxing: true },
  waxing_crescent: { illum: 0.25, waxing: true },
  first_quarter: { illum: 0.5, waxing: true },
  waxing_gibbous: { illum: 0.78, waxing: true },
  full_moon: { illum: 1, waxing: true },
  waning_gibbous: { illum: 0.78, waxing: false },
  last_quarter: { illum: 0.5, waxing: false },
  waning_crescent: { illum: 0.25, waxing: false },
};

/* ──────────────────────────────────────────────────────────────────
 * SUN
 * ────────────────────────────────────────────────────────────────── */

export function sunSvg(): TemplateResult {
  return svg`
    <svg viewBox="-1.6 -1.6 3.2 3.2" class="celestial-svg" aria-hidden="true">
      <defs>
        <radialGradient id="cowSunGlow" cx="0.5" cy="0.5" r="0.5">
          <stop offset="0%"  stop-color="rgba(255, 232, 145, 0.95)" />
          <stop offset="45%" stop-color="rgba(255, 200, 70, 0.45)"  />
          <stop offset="100%" stop-color="rgba(255, 200, 70, 0)"    />
        </radialGradient>
        <radialGradient id="cowSunCore" cx="0.4" cy="0.38" r="0.65">
          <stop offset="0%"  stop-color="#fff7c4" />
          <stop offset="55%" stop-color="#ffd35a" />
          <stop offset="100%" stop-color="#ffaa30" />
        </radialGradient>
      </defs>
      <circle class="sun-glow" cx="0" cy="0" r="1.5" fill="url(#cowSunGlow)" />
      <circle class="sun-rays" cx="0" cy="0" r="1.05" fill="url(#cowSunGlow)" opacity="0.55" />
      <circle class="sun-core" cx="0" cy="0" r="0.7"  fill="url(#cowSunCore)" />
    </svg>
  `;
}

/* ──────────────────────────────────────────────────────────────────
 * MOON
 * ────────────────────────────────────────────────────────────────── */

/**
 * Render the moon at the given phase.
 *
 * The "dark side" is its own dark slate body — it does NOT inherit the
 * sky color, so even on a deep-night gradient the shadowed portion of
 * the moon reads as a 3D sphere rather than a hole punched in the
 * disc. The shadow uses an internal radial gradient (slightly lighter
 * at the disc edge to suggest earthshine catching the moon's limb,
 * deeper in the center).
 *
 * `idSuffix` makes the SVG defs unique so multiple moons could be
 * rendered on one page without `<clipPath>` id collisions.
 */
export function moonSvg(phase: MoonPhase, idSuffix = "m"): TemplateResult {
  const info = MOON_PHASE_INFO[phase];
  // shadow disc offset, in moon-radius units; waxing = shadow on left
  const shadowX = info.waxing ? -2 * info.illum : 2 * info.illum;
  const clipId = `cowMoonClip-${idSuffix}`;
  const litGradId = `cowMoonLit-${idSuffix}`;
  const shadowGradId = `cowMoonShadow-${idSuffix}`;

  return svg`
    <svg viewBox="-1.15 -1.15 2.3 2.3" class="celestial-svg" aria-hidden="true">
      <defs>
        <clipPath id=${clipId}>
          <circle cx="0" cy="0" r="1" />
        </clipPath>
        <radialGradient id=${litGradId} cx="0.42" cy="0.40" r="0.85">
          <stop offset="0%"  stop-color="#fbf7e8" />
          <stop offset="55%" stop-color="#e8e2cf" />
          <stop offset="100%" stop-color="#a89f86" />
        </radialGradient>
        <!--
          Dark side: deeper toward the disc center, lifting slightly at
          the perimeter so a hint of earthshine catches the moon's limb
          before fading into the night sky.
        -->
        <radialGradient id=${shadowGradId} cx="0.5" cy="0.5" r="0.55">
          <stop offset="0%"  stop-color="#0e1020" />
          <stop offset="70%" stop-color="#1c1f33" />
          <stop offset="100%" stop-color="#2a2d44" />
        </radialGradient>
        <radialGradient id="cowMoonGlow" cx="0.5" cy="0.5" r="0.5">
          <stop offset="0%"  stop-color="rgba(232, 226, 207, 0.55)" />
          <stop offset="60%" stop-color="rgba(232, 226, 207, 0.12)" />
          <stop offset="100%" stop-color="rgba(232, 226, 207, 0)"    />
        </radialGradient>
      </defs>
      <!-- Soft halo -->
      <circle cx="0" cy="0" r="1.1" fill="url(#cowMoonGlow)" class="moon-halo" />
      <!-- Lit disc -->
      <circle cx="0" cy="0" r="1" fill=${`url(#${litGradId})`} />
      <!-- Craters, clipped to the moon's outline. Only the lit half
           shows them because the shadow disc paints over the other. -->
      <g clip-path=${`url(#${clipId})`} opacity="0.22">
        <circle cx="-0.32" cy="-0.18" r="0.13" fill="#5b5040" />
        <circle cx="0.28"  cy="0.12"  r="0.10" fill="#5b5040" />
        <circle cx="0.42"  cy="-0.38" r="0.07" fill="#5b5040" />
        <circle cx="-0.10" cy="0.48"  r="0.11" fill="#5b5040" />
        <circle cx="-0.55" cy="0.28"  r="0.06" fill="#5b5040" />
        <circle cx="0.08"  cy="-0.55" r="0.05" fill="#5b5040" />
      </g>
      <!-- Shadow disc (the terminator), clipped to the moon outline.
           Painted with the dark-slate radial gradient above so the
           unlit side reads as a 3D sphere, not a sky-colored hole. -->
      <circle
        cx=${shadowX}
        cy="0"
        r="1"
        fill=${`url(#${shadowGradId})`}
        clip-path=${`url(#${clipId})`}
      />
    </svg>
  `;
}

/* ──────────────────────────────────────────────────────────────────
 * POSITION MATH
 * ────────────────────────────────────────────────────────────────── */

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/**
 * Convert sun elevation+azimuth (deg) → screen position (% of hero).
 *
 * - x: maps azimuth 90 (east, sunrise) → 8%, 180 (south, noon) → 50%,
 *   270 (west, sunset) → 92%. Outside this range we clamp to the edges.
 * - y: maps elevation 0° → 78% (just above horizon), 60° → 12% (high
 *   in the sky). Below the horizon the sun is hidden by `visible`.
 */
export function sunPosition(elevation: number, azimuth: number): {
  x: number;
  y: number;
  visible: boolean;
} {
  const x = clamp(((azimuth - 90) / 180) * 80 + 10, 0, 100);
  // Keep the body away from the very top so its glow doesn't get
  // clipped by the hero's rounded top corners.
  const y = clamp(80 - (Math.max(0, elevation) / 60) * 50, 30, 90);
  return { x, y, visible: elevation > -2 };
}

/**
 * Synthetic moon position. We don't have moon azimuth in HA without an
 * extra integration, so we approximate: the moon arcs the night sky
 * from east (after sunset) to west (before sunrise), peaking at "moon
 * midnight" (midway between sunset and the next sunrise).
 *
 * `now`, `sunset` and `nextRising` are unix millis. If we're outside
 * the night window, the moon is positioned somewhere off-screen but
 * the caller is expected to hide it anyway.
 */
export function moonPosition(
  now: number,
  sunset: number,
  nextRising: number,
): { x: number; y: number; visible: boolean } {
  if (nextRising <= sunset) {
    // sanity: rising before setting → polar / data issue. Park moon high-center.
    return { x: 78, y: 22, visible: true };
  }
  const t = clamp((now - sunset) / (nextRising - sunset), 0, 1);
  const x = clamp(10 + t * 80, 0, 100);
  // Parabolic arc: 0 at edges, peak at t=0.5
  const arc = 4 * t * (1 - t); // 0..1, peaks at t=.5
  const y = clamp(80 - arc * 48, 32, 82);
  return { x, y, visible: true };
}
