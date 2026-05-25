/**
 * Pollen visual effects for the XL hero card.
 *
 * Layered like {@link weatherFx}: a small SVG sheet that floats soft
 * yellow-green specks across the sky to evoke airborne pollen when at
 * least one tracked allergen is at "bassa" (1) or above. Density and
 * opacity scale with the overall level so a "molto alta" day feels
 * visibly hazier than a "bassa" one.
 *
 * Implementation rules mirror weather-fx:
 *  - Pure `transform` + `opacity` keyframes (GPU-friendly on the
 *    MTK6580 in the Shelly Wall Display — no `filter: blur`).
 *  - Particle positions / delays / durations are derived from the
 *    particle index so the field is deterministic and re-renders
 *    never reshuffle the layout.
 */
import { svg, nothing, type TemplateResult } from "lit";

export interface PollenFxOpts {
  /** Darken specks slightly for use over a night sky. */
  night?: boolean;
}

/**
 * Render a drifting pollen field for the given overall numeric level
 * (0 = nessuna … 4 = molto alta). Returns `nothing` when level <= 0.
 */
export function pollenFx(
  level: number,
  opts: PollenFxOpts = {},
): TemplateResult | typeof nothing {
  if (level <= 0) return nothing;
  const clamped = Math.max(1, Math.min(4, Math.round(level)));
  // Particle count tuned so even level 4 stays under ~70 nodes (cheap).
  const count = clamped === 1 ? 14 : clamped === 2 ? 28 : clamped === 3 ? 46 : 68;
  // Base opacity per level — visible at "bassa", hazy at "molto alta".
  const baseOpacity =
    clamped === 1 ? 0.45 : clamped === 2 ? 0.6 : clamped === 3 ? 0.75 : 0.9;
  // Slight color shift with intensity: yellow-green at low, amber at high.
  const hue = clamped <= 2 ? 62 : clamped === 3 ? 48 : 38;
  const sat = 78;
  const light = opts.night ? 70 : 62;

  const dots: TemplateResult[] = [];
  for (let i = 0; i < count; i++) {
    // Deterministic pseudo-random distribution.
    const x = (i * 17.397) % 100;
    const yOffset = ((i * 31.13) % 40) - 5; // start above viewport at random heights
    const delay = -((i * 0.1373) % 8).toFixed(2);
    const dur = (9 + ((i * 0.7919) % 12)).toFixed(2); // slow float
    const r = (0.55 + ((i * 0.117) % 0.85)).toFixed(2);
    const sway = ((i % 2 === 0 ? 1 : -1) * (3 + (i % 5))).toString();
    const op = (baseOpacity * (0.55 + ((i * 0.211) % 0.45))).toFixed(2);
    dots.push(svg`
      <circle
        cx=${x.toFixed(2)}
        cy=${yOffset.toFixed(2)}
        r=${r}
        fill=${`hsla(${hue}, ${sat}%, ${light}%, ${op})`}
        style=${`animation: cow-pollen-drift ${dur}s linear infinite ${delay}s;
                 --sway: ${sway}px;`}
      />
    `);
  }

  // Wrapping class hint allows the host card to add a soft pulse at
  // "molto alta" via CSS scoped to `[data-pollen-level="4"]`.
  return svg`
    <svg
      class="fx-pollen"
      data-pollen-level=${String(clamped)}
      viewBox="0 0 100 100"
      preserveAspectRatio="none"
    >
      ${dots}
    </svg>
  `;
}
