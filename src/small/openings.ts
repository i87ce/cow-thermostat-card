/**
 * Ajax openings strip helper for the small cow-thermostat-card panels.
 *
 * Rendered ONLY on the thermostat (clima) tab since v1.6.1 — on the
 * lights/blinds tabs the bottom-right strip kept colliding with the
 * fan chips / scope rows (e.g. it overlapped the "Riscaldamento
 * pavimento" On/Off chips on the Ingresso PT display). The strip now
 * lives in the top-right corner of the LEFT accent pane, an area
 * that is empty in every thermostat variant, drawn as translucent
 * white glyphs that blend with the gradient plus a red badge dot
 * when a contact is open.
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
  excludeDevicesByName,
  findAjaxOpeningsInArea,
  openingFromConfiguredEntity,
  openingIconSvg,
  type AjaxOpening,
  type OpeningKind,
} from "../util/ajax-openings.js";

/**
 * CSS for the openings strip. Coordinates target the small card's
 * 720x720 internal stage. The strip sits in the top-right corner of
 * the LEFT accent pane (pane spans x 0–360): right edge at 337.5
 * mirrors the 22.5px margin the pane uses elsewhere, top 45 aligns
 * with the thermostat icon row. Glyphs are translucent white so they
 * sink into the accent gradient when closed; an open contact goes
 * full white with a red badge dot — readable on every variant
 * (orange heat, blue cool, grey off) without fighting the accent.
 */
export const openingsStripStyles = css`
  .ajax-openings {
    position: absolute;
    left: 157.5px;
    width: 180px;
    top: 45px;
    display: flex;
    flex-direction: row;
    align-items: center;
    justify-content: flex-end;
    gap: 12px;
    pointer-events: none;
  }
  .ajax-opening {
    position: relative;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 36px;
    height: 36px;
    color: rgba(255, 255, 255, 0.38);
    transition: color 200ms ease;
  }
  .ajax-opening[data-open] {
    color: #ffffff;
  }
  .ajax-opening svg {
    width: 100%;
    height: 100%;
    display: block;
  }
  .ajax-opening .ajax-opening-badge {
    position: absolute;
    top: -4px;
    right: -4px;
    width: 13px;
    height: 13px;
    border-radius: 50%;
    background: var(--cow-stop, #e74c3c);
    border: 2.5px solid rgba(255, 255, 255, 0.95);
    box-sizing: border-box;
  }
  .ajax-openings-more {
    font-weight: 600;
    font-size: 20px;
    color: rgba(255, 255, 255, 0.7);
    margin-left: 2px;
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
  /** Extra opening entity_ids — ``binary_sensor.*`` contact or ``sensor.*`` tilt (P100). */
  entities?: string[];
  /** Ajax device names to omit from auto-discovery (e.g. tilt sensor). */
  excludeDevices?: string[];
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
  if (areas.length === 0 && (opts.entities?.length ?? 0) === 0) return [];
  const seen = new Set<string>();
  const out: AjaxOpening[] = [];
  for (const a of areas) {
    for (const o of findAjaxOpeningsInArea(hass, a)) {
      if (seen.has(o.entityId)) continue;
      seen.add(o.entityId);
      out.push(o);
    }
  }
  let merged = excludeDevicesByName(out, opts.excludeDevices);
  const entityOpts = (i: number) => ({
    kind: opts.garages?.[i] || opts.garages?.[0] ? ("garage" as const) : undefined,
    deviceName: opts.garages?.[i] ?? opts.garages?.[0],
  });
  for (let i = 0; i < (opts.entities ?? []).length; i++) {
    const eid = opts.entities![i];
    if (seen.has(eid)) continue;
    const o = openingFromConfiguredEntity(hass, eid, entityOpts(i));
    if (!o) continue;
    seen.add(eid);
    merged.push(o);
  }
  return applyKindOverrides(merged, {
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
            ${o.isOpen
              ? html`<span class="ajax-opening-badge"></span>`
              : nothing}
          </span>
        `,
      )}
      ${overflow > 0
        ? html`<span class="ajax-openings-more">+${overflow}</span>`
        : nothing}
    </div>
  `;
}
