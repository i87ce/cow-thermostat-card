import type { HomeAssistant } from "../types/hass.js";
import {
  findRoomOpenings,
  type OpeningsOpts,
} from "../small/openings.js";
import type { AjaxOpening } from "../util/ajax-openings.js";

interface CacheEntry {
  entitiesRef: unknown;
  optsKey: string;
  result: AjaxOpening[];
}

const cache = new Map<string, CacheEntry>();

function optsKey(opts: OpeningsOpts): string {
  return JSON.stringify({
    areas: opts.areas,
    fallback: opts.fallbackArea,
    defaultKind: opts.defaultKind,
    doors: opts.doors,
    windows: opts.windows,
    garages: opts.garages,
    enabled: opts.enabled,
    entities: opts.entities,
    exclude: opts.excludeDevices,
  });
}

/**
 * Cached wrapper around `findRoomOpenings`. Invalidates when
 * `hass.entities` identity changes (registry reload) or opts change.
 */
export function findRoomOpeningsCached(
  hass: HomeAssistant | undefined,
  cacheId: string,
  opts: OpeningsOpts,
): AjaxOpening[] {
  const key = optsKey(opts);
  const entitiesRef = hass?.entities;
  const hit = cache.get(cacheId);
  if (hit && hit.entitiesRef === entitiesRef && hit.optsKey === key) {
    return hit.result;
  }
  const result = findRoomOpenings(hass, opts);
  cache.set(cacheId, { entitiesRef, optsKey: key, result });
  return result;
}

/** Invalidate all cached openings (e.g. after HA registry reload). */
export function clearOpeningsCache(): void {
  cache.clear();
}
