/**
 * Weather visual effects for the XL hero card.
 *
 * Each function returns a `TemplateResult` (or `nothing`) keyed on the
 * Home Assistant `weather.*` state string. All animation is pure
 * `transform`/`opacity` so it stays GPU-accelerated on the MTK6580
 * SoC the Shelly Wall Display ships with — no `filter: blur`, no
 * backdrop filters, no canvas.
 *
 * The SVG shapes are intentionally simple and hand-drawn (no icon
 * library): clouds are clusters of ellipses, rain/snow are looping
 * particle streams, fog is a translucent wash near the horizon,
 * lightning is a jagged path that flashes briefly at random intervals.
 */
import { html, svg, nothing, type TemplateResult } from "lit";

export type WeatherCondition =
  | "sunny"
  | "clear-night"
  | "cloudy"
  | "partlycloudy"
  | "fog"
  | "rainy"
  | "pouring"
  | "snowy"
  | "snowy-rainy"
  | "windy"
  | "windy-variant"
  | "hail"
  | "lightning"
  | "lightning-rainy"
  | "exceptional"
  | "unknown";

/**
 * Cloud coverage (0..1) for a given HA weather state. Exported so the
 * hero card can dim the sun and moon proportionally — otherwise the
 * sun shines through a "pouring" sky which looks broken.
 */
export function cloudCoverageFor(c: string): number {
  return bucket(c).clouds;
}

/** Group raw HA states into the FX bucket we know how to draw. */
function bucket(c: string): {
  clouds: number; // 0..1 coverage
  rain: 0 | 1 | 2; // 0 none, 1 drizzle, 2 pouring
  snow: 0 | 1 | 2;
  fog: boolean;
  lightning: boolean;
} {
  switch (c) {
    case "sunny":
    case "clear-night":
      return { clouds: 0, rain: 0, snow: 0, fog: false, lightning: false };
    case "partlycloudy":
      return { clouds: 0.45, rain: 0, snow: 0, fog: false, lightning: false };
    case "cloudy":
      return { clouds: 0.85, rain: 0, snow: 0, fog: false, lightning: false };
    case "rainy":
      return { clouds: 0.8, rain: 1, snow: 0, fog: false, lightning: false };
    case "pouring":
      return { clouds: 1, rain: 2, snow: 0, fog: false, lightning: false };
    case "snowy":
      return { clouds: 0.7, rain: 0, snow: 2, fog: false, lightning: false };
    case "snowy-rainy":
      return { clouds: 0.8, rain: 1, snow: 1, fog: false, lightning: false };
    case "fog":
      return { clouds: 0.6, rain: 0, snow: 0, fog: true, lightning: false };
    case "lightning":
      return { clouds: 0.9, rain: 0, snow: 0, fog: false, lightning: true };
    case "lightning-rainy":
      return { clouds: 1, rain: 2, snow: 0, fog: false, lightning: true };
    case "hail":
      return { clouds: 1, rain: 2, snow: 1, fog: false, lightning: false };
    case "windy":
    case "windy-variant":
      return { clouds: 0.3, rain: 0, snow: 0, fog: false, lightning: false };
    default:
      return { clouds: 0.2, rain: 0, snow: 0, fog: false, lightning: false };
  }
}

/* ──────────────────────────────────────────────────────────────────
 * CLOUDS
 * ────────────────────────────────────────────────────────────────── */

/**
 * Drifting clouds. We render 2–4 cloud silhouettes depending on the
 * coverage value (0..1) and let CSS slide them across the sky. Each
 * cloud is a horizontally-stretched ellipse cluster.
 */
function cloudsLayer(coverage: number): TemplateResult | typeof nothing {
  if (coverage <= 0.05) return nothing;
  const clouds = [
    { top: 12, dur: 95, delay: 0,   scale: 1.0, opacity: 0.92 },
    { top: 26, dur: 130, delay: -30, scale: 0.7, opacity: 0.78 },
    { top: 8,  dur: 110, delay: -65, scale: 0.85, opacity: 0.85 },
    { top: 34, dur: 150, delay: -15, scale: 0.55, opacity: 0.65 },
  ];
  // Pick how many clouds based on coverage
  const count = Math.max(1, Math.min(4, Math.round(coverage * 4)));
  const layer = clouds.slice(0, count);
  return html`
    <div class="fx-clouds" style="--coverage: ${coverage};">
      ${layer.map(
        (c) => html`
          <div
            class="fx-cloud"
            style=${`top: ${c.top}%;
                     --cloud-dur: ${c.dur}s;
                     --cloud-delay: ${c.delay}s;
                     --cloud-scale: ${c.scale};
                     --cloud-opacity: ${c.opacity};`}
          >
            ${cloudShape()}
          </div>
        `,
      )}
    </div>
  `;
}

function cloudShape(): TemplateResult {
  return svg`
    <svg viewBox="0 0 200 80" class="fx-cloud-svg" preserveAspectRatio="xMidYMid meet">
      <g fill="white">
        <ellipse cx="35"  cy="55" rx="32" ry="20" />
        <ellipse cx="80"  cy="38" rx="38" ry="26" />
        <ellipse cx="125" cy="48" rx="33" ry="22" />
        <ellipse cx="160" cy="58" rx="26" ry="18" />
        <ellipse cx="100" cy="60" rx="55" ry="14" />
      </g>
    </svg>
  `;
}

/* ──────────────────────────────────────────────────────────────────
 * RAIN
 * ────────────────────────────────────────────────────────────────── */

function rainLayer(intensity: 1 | 2): TemplateResult {
  // Drop count + stroke tuned for a 10.1" Shelly Wall Display
  // (1280×800, DPR 1) where the hero ends up roughly 1100×300 in CSS
  // pixels. v1.1.2 used 1.4 px strokes which rendered as 1–2 physical
  // pixels and were invisible at viewing distance. v1.1.4 bumps the
  // stroke to 3 px and uses a darker, more saturated color so each
  // drop reads against both daytime blue and sunset orange skies.
  const count = intensity === 2 ? 180 : 110;
  const baseOpacity = intensity === 2 ? 1.0 : 0.95;
  const drops: TemplateResult[] = [];
  for (let i = 0; i < count; i++) {
    const x = (i * 13.371) % 100;
    const delay = -((i * 0.0917) % 1).toFixed(3);
    const dur = (0.6 + ((i * 0.0731) % 0.45)).toFixed(2);
    const op = (baseOpacity * (0.78 + ((i * 0.181) % 0.22))).toFixed(2);
    // Streaks now span 55 viewBox units (was 46) so each drop is
    // clearly a falling line, not a dot. stroke-width 3 + non-scaling
    // keeps a constant 3 CSS-pixel line regardless of aspect.
    drops.push(svg`
      <line
        x1=${x.toFixed(2)} y1="-10"
        x2=${(x - 3.5).toFixed(2)} y2="45"
        stroke="rgba(110, 155, 215, ${op})"
        stroke-width="3"
        stroke-linecap="round"
        vector-effect="non-scaling-stroke"
        style=${`animation: cow-rain-fall ${dur}s linear infinite ${delay}s`}
      />
    `);
  }
  return svg`
    <svg class="fx-rain" viewBox="0 0 100 100" preserveAspectRatio="none">${drops}</svg>
  `;
}

/* ──────────────────────────────────────────────────────────────────
 * SNOW
 * ────────────────────────────────────────────────────────────────── */

function snowLayer(intensity: 1 | 2): TemplateResult {
  const count = intensity === 2 ? 60 : 30;
  const flakes: TemplateResult[] = [];
  for (let i = 0; i < count; i++) {
    const x = (i * 17.43) % 100;
    const delay = -((i * 0.1217) % 1).toFixed(3);
    const dur = (3.5 + ((i * 0.21) % 3)).toFixed(2);
    const r = (0.4 + ((i * 0.073) % 0.7)).toFixed(2);
    const sway = ((i % 2) === 0 ? 4 : -4) + ((i % 7) - 3);
    flakes.push(svg`
      <circle
        cx=${x.toFixed(2)} cy="-3"
        r=${r}
        fill="rgba(255, 255, 255, 0.88)"
        style=${`animation: cow-snow-fall ${dur}s linear infinite ${delay}s;
                 --sway: ${sway}px`}
      />
    `);
  }
  return svg`
    <svg class="fx-snow" viewBox="0 0 100 100" preserveAspectRatio="none">${flakes}</svg>
  `;
}

/* ──────────────────────────────────────────────────────────────────
 * FOG
 * ────────────────────────────────────────────────────────────────── */

function fogLayer(): TemplateResult {
  return html`
    <div class="fx-fog">
      <div class="fx-fog-band fx-fog-band-1"></div>
      <div class="fx-fog-band fx-fog-band-2"></div>
      <div class="fx-fog-band fx-fog-band-3"></div>
    </div>
  `;
}

/* ──────────────────────────────────────────────────────────────────
 * LIGHTNING
 * ────────────────────────────────────────────────────────────────── */

function lightningLayer(): TemplateResult {
  return html`
    <div class="fx-lightning">
      <div class="fx-lightning-flash"></div>
      ${svg`
        <svg class="fx-lightning-bolt" viewBox="0 0 100 200" preserveAspectRatio="xMidYMid meet">
          <path
            d="M 56 0 L 38 88 L 52 88 L 30 200 L 70 78 L 54 78 L 72 0 Z"
            fill="#fff9d6"
            stroke="#ffe680"
            stroke-width="1"
          />
        </svg>
      `}
    </div>
  `;
}

/* ──────────────────────────────────────────────────────────────────
 * PUBLIC ENTRY
 * ────────────────────────────────────────────────────────────────── */

export interface WeatherFxOpts {
  /** Force "night" cloud color so they read as silhouettes against a dark sky */
  night?: boolean;
}

export function weatherFx(
  condition: string,
  _opts: WeatherFxOpts = {},
): TemplateResult | typeof nothing {
  const b = bucket(condition);
  return html`
    ${cloudsLayer(b.clouds)}
    ${b.rain ? rainLayer(b.rain) : nothing}
    ${b.snow ? snowLayer(b.snow) : nothing}
    ${b.fog ? fogLayer() : nothing}
    ${b.lightning ? lightningLayer() : nothing}
  `;
}
