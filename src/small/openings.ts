/**
 * Ajax openings strip helper for the small cow-thermostat-card panels.
 *
 * Each of the three swiper panels (thermostat / lights / blinds) can
 * call this from its render() to draw the bottom-right opening icons
 * row with the same look & feel. Centralising the data + DOM avoids a
 * 3× copy of the same code and guarantees behaviour stays consistent
 * across panels.
 *
 * Discovery rules:
 *   1. If ``opts.areas`` is non-empty, aggregate Ajax openings from
 *      every listed area (multi-area room support — Sala-Cucina open
 *      plan, room renamed in HA, etc.).
 *   2. Else fall back to fuzzy-matching ``opts.fallbackArea`` against
 *      the area registry — the simple 1:1 room name case ("Camera 1"
 *      → area "Camera 1" or close variant).
 *   3. ``applyKindOverrides`` then flips per-device icon kind according
 *      to the user's ``opening_doors`` / ``opening_windows`` /
 *      ``opening_garages`` lists with ``opening_default_kind`` as
 *      fallback.
 */
import { css, html, nothing, type TemplateResult } from "lit";

import type { HomeAssistant } from "../types/hass.js";
import {
  applyKindOverrides,
  findAjaxOpeningsInArea,
  openingIconSvg,
  type AjaxOpening,
  type OpeningKind,
} from "../util/ajax-openings.js";

/**
 * CSS for the openings strip. Mix this into every panel's
 * ``static styles`` array so the strip looks identical across
 * thermostat / lights / blinds. Coordinates target the small card's
 * 720x720 internal stage (the same grid the rest of the panel uses).
 */
export const openingsStripStyles = css`
  .ajax-openings {
    position: absolute;
    left: 397.5px;
    right: 30px;
    bottom: 22.5px;
    display: flex;
    flex-direction: row;
    align-items: center;
    gap: 16.875px;
    pointer-events: none;
  }
  .ajax-opening {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 45px;
    height: 45px;
    color: var(--cow-text-disabled, #b3b3bd);
    transition: color 200ms ease;
  }
  .ajax-opening[data-open] {
    color: var(--cow-stop, #e74c3c);
  }
  .ajax-opening svg {
    width: 100%;
    height: 100%;
    display: block;
  }
  .ajax-openings-more {
    font-weight: 600;
    font-size: 22.5px;
    color: var(--cow-text-secondary, #8c8c99);
    margin-left: 4px;
  }
`;

export interface OpeningsOpts {
  /** HA areas this card owns (explicit). Wins over ``fallbackArea``. */
  areas: string[];
  /** Display name used to fuzzy-match an area when ``areas`` is empty. */
  fallbackArea?: string;
  /** Default kind for devices not in the per-list overrides. */
  defaultKind?: OpeningKind;
  doors?: string[];
  windows?: string[];
  garages?: string[];
  /** When false, return no openings (tilt-only garage, etc.). */
  enabled?: boolean;
}

/**
 * Build the deduped, kind-overridden list of openings for one card.
 *
 * Pure function: takes ``hass`` and a config snapshot, returns the
 * shaped list. Safe to call from inside render() loops.
 */
export function findRoomOpenings(
  hass: HomeAssistant | undefined,
  opts: OpeningsOpts,
): AjaxOpening[] {
  if (opts.enabled === false) return [];
  const areas = opts.areas.length > 0
    ? opts.areas
    : opts.fallbackArea
      ? [opts.fallbackArea]
      : [];
  if (areas.length === 0) return [];
  const seen = new Set<string>();
  const out: AjaxOpening[] = [];
  for (const a of areas) {
    for (const o of findAjaxOpeningsInArea(hass, a)) {
      if (seen.has(o.entityId)) continue;
      seen.add(o.entityId);
      out.push(o);
    }
  }
  return applyKindOverrides(out, {
    default: opts.defaultKind,
    doors: opts.doors,
    windows: opts.windows,
    garages: opts.garages,
  });
}

/**
 * Render the standard 4-icon openings strip. Returns ``nothing`` when
 * the list is empty so the caller can drop it straight into a Lit
 * template without an extra guard.
 *
 * Layout / colours / overflow rules are tied to the CSS already in
 * each panel's ``.ajax-openings`` block — see ``thermostat-panel.ts``.
 */
export function renderOpeningsStrip(
  openings: AjaxOpening[],
): TemplateResult | typeof nothing {
  if (openings.length === 0) return nothing;
  const MAX_VISIBLE = 4;
  const visible = openings.slice(0, MAX_VISIBLE);
  const overflow = openings.length - visible.length;
  return html`
    <div class="ajax-openings" aria-label="Ajax openings">
      ${visible.map(
        (o) => html`
          <span
            class="ajax-opening"
            ?data-open=${o.isOpen}
            title=${`${o.deviceName} — ${o.isOpen ? "aperta" : "chiusa"}`}
          >
            ${openingIconSvg(o.kind, o.isOpen)}
          </span>
        `,
      )}
      ${overflow > 0
        ? html`<span class="ajax-openings-more">+${overflow}</span>`
        : nothing}
    </div>
  `;
}
