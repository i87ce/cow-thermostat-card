/**
 * Pure data extractors for the hero engine.
 *
 * Everything that reads `hass.states` and projects it into a typed
 * snapshot lives here so the engine, the XL wrapper, the mobile
 * wrapper, and any future host can all reuse the same logic without
 * duplication. Each helper is a pure function — no Lit, no DOM.
 *
 * Naming convention: ``get<Subject>(hass, ...entityIds)`` returns
 * either a typed snapshot or `undefined` / a typed empty value when
 * the input is missing. Callers must tolerate `undefined`.
 */
import type { HomeAssistant } from "../../types/hass.js";
import type { MoonPhase } from "./celestial.js";

/* ────────────────────────────────────────────────────────────────────── */
/*  Sun                                                                    */
/* ────────────────────────────────────────────────────────────────────── */

export interface SunSnapshot {
  /** Degrees above horizon. >0 = above horizon, <0 = below. */
  elevation: number;
  /** Compass bearing in degrees. 180 = south. */
  azimuth: number;
  /** True if elevation is increasing (morning). */
  rising: boolean;
  /** Best-effort millisecond timestamp of "today's sunset". */
  sunset?: number;
  /** Millisecond timestamp of the next sunrise. */
  nextRising?: number;
}

/**
 * Project HA's ``sun.sun`` entity into a typed snapshot. When the
 * entity is missing we fall back to a synthetic "noon" so the UI
 * still renders something defensible.
 */
export function getSunState(
  hass: HomeAssistant | undefined,
  sunEntityId: string | undefined,
): SunSnapshot {
  const e = sunEntityId ? hass?.states[sunEntityId] : undefined;
  if (!e) return { elevation: 45, azimuth: 180, rising: false };
  const a = e.attributes as Record<string, unknown>;
  const parseTs = (v: unknown): number | undefined => {
    if (typeof v !== "string") return undefined;
    const t = Date.parse(v);
    return Number.isFinite(t) ? t : undefined;
  };
  const nextSetting = parseTs(a.next_setting);
  const nextRising = parseTs(a.next_rising);
  const aboveHorizon = e.state === "above_horizon";
  // When above horizon, "today's sunset" is next_setting. When below,
  // we don't know yesterday's; approximate from next_rising minus a
  // 12 h night so the moon position synth has something to chew on.
  const sunset = aboveHorizon
    ? nextSetting
    : nextRising != null
      ? nextRising - 12 * 3600_000
      : undefined;
  return {
    elevation: typeof a.elevation === "number" ? a.elevation : 0,
    azimuth: typeof a.azimuth === "number" ? a.azimuth : 180,
    rising: a.rising === true,
    sunset,
    nextRising,
  };
}

/** Convenience: ``true`` when the sun is above the horizon. */
export function isDay(hass: HomeAssistant | undefined, sunEntityId: string | undefined): boolean {
  const e = sunEntityId ? hass?.states[sunEntityId] : undefined;
  if (!e) return true; // optimistic default
  return e.state === "above_horizon";
}

/* ────────────────────────────────────────────────────────────────────── */
/*  Moon                                                                   */
/* ────────────────────────────────────────────────────────────────────── */

const MOON_PHASES: ReadonlySet<MoonPhase> = new Set([
  "new_moon",
  "waxing_crescent",
  "first_quarter",
  "waxing_gibbous",
  "full_moon",
  "waning_gibbous",
  "last_quarter",
  "waning_crescent",
]);

/**
 * Return a typed MoonPhase iff the moon entity exists AND its state
 * is one of the eight canonical phases. Returns ``undefined`` for any
 * other input (missing entity, "unavailable", typo).
 */
export function getMoonPhase(
  hass: HomeAssistant | undefined,
  moonEntityId: string | undefined,
): MoonPhase | undefined {
  const e = moonEntityId ? hass?.states[moonEntityId] : undefined;
  if (!e || typeof e.state !== "string") return undefined;
  return MOON_PHASES.has(e.state as MoonPhase)
    ? (e.state as MoonPhase)
    : undefined;
}

/* ────────────────────────────────────────────────────────────────────── */
/*  Weather                                                                */
/* ────────────────────────────────────────────────────────────────────── */

export interface WeatherSnapshot {
  /** Current temperature in the user's native unit (HA decides). */
  temp?: number;
  /** Translated condition label ("Sereno", "Pioggia", …). */
  desc?: string;
  /** Raw HA state string — pass this to ``weatherFx()`` / ``cloudCoverageFor``. */
  raw?: string;
  /** Apparent / "feels like" temperature. */
  apparent?: number;
  /** Wind speed (km/h, rounded). */
  wind?: number;
  /** Relative humidity %, rounded. */
  humidity?: number;
}

/**
 * Project a HA ``weather.*`` entity into a typed snapshot.
 *
 * ``raw`` is kept separate from ``desc`` because the FX layer needs
 * the canonical HA state string ("partlycloudy") while the UI wants
 * the localized label ("Parzialmente nuvoloso").
 */
export function getWeather(
  hass: HomeAssistant | undefined,
  weatherEntityId: string | undefined,
): WeatherSnapshot {
  if (!hass || !weatherEntityId) return {};
  const e = hass.states[weatherEntityId];
  if (!e) return {};
  const a = e.attributes as Record<string, unknown>;
  return {
    temp: typeof a.temperature === "number" ? a.temperature : undefined,
    desc: typeof e.state === "string" ? e.state : undefined,
    raw: typeof e.state === "string" ? e.state : undefined,
    apparent:
      typeof a.apparent_temperature === "number"
        ? a.apparent_temperature
        : undefined,
    wind:
      typeof a.wind_speed === "number" ? Math.round(a.wind_speed) : undefined,
    humidity:
      typeof a.humidity === "number" ? Math.round(a.humidity) : undefined,
  };
}

const CONDITION_IT: Record<string, string> = {
  sunny: "Sereno",
  clear: "Sereno",
  "clear-night": "Notte serena",
  cloudy: "Nuvoloso",
  partlycloudy: "Parzialmente nuvoloso",
  fog: "Nebbia",
  rainy: "Pioggia",
  pouring: "Pioggia battente",
  snowy: "Neve",
  "snowy-rainy": "Pioggia mista a neve",
  windy: "Ventoso",
  "windy-variant": "Ventoso",
  hail: "Grandine",
  lightning: "Temporale",
  "lightning-rainy": "Temporale",
  exceptional: "Eccezionale",
};

/** IT label for a HA weather state. Falls back to the raw state. */
export function translateCondition(state: string): string {
  return CONDITION_IT[state] ?? state;
}

/* ────────────────────────────────────────────────────────────────────── */
/*  Pollen                                                                 */
/* ────────────────────────────────────────────────────────────────────── */

export interface PollenSnapshot {
  /** 0..4 numeric level (max of overall sensor + allergens). */
  level: number;
  /** Localized level name ("bassa", "alta", …). */
  levelName: string;
  /** Pre-filtered + sorted list of allergens to surface inline. */
  items: Array<{ name: string; level: number }>;
}

export interface PollenInputs {
  /** Aggregate sensor (e.g. ``sensor.polleninformation_*_allergy_risk``). */
  pollenOverall?: string;
  /** Per-allergen sensors. */
  pollenAllergens?: string[];
  /** Minimum level for an allergen to surface (defaults to 1). */
  pollenMinLevel?: number;
  /** Allergens always shown regardless of level. */
  pollenPinned?: string[];
  /** Hard cap on listed allergens (defaults to 3). */
  pollenMaxItems?: number;
  /** Locale for the sorted-by-name tiebreak. */
  locale?: string;
}

const POLLEN_LABEL_TO_LEVEL: Record<string, number> = {
  nessuna: 0,
  none: 0,
  bassa: 1,
  low: 1,
  moderata: 2,
  moderate: 2,
  alta: 3,
  high: 3,
  "molto alta": 4,
  "very high": 4,
};

const POLLEN_LABELS_IT = ["nessuna", "bassa", "moderata", "alta", "molto alta"];

function parsePollenLevel(state: string): number {
  const s = state.trim().toLowerCase();
  if (s in POLLEN_LABEL_TO_LEVEL) return POLLEN_LABEL_TO_LEVEL[s]!;
  const n = Number(s);
  return Number.isFinite(n) ? Math.max(0, Math.min(4, Math.round(n))) : 0;
}

/** Italian label for a numeric pollen level (clamped 0..4). */
export function pollenLevelLabel(level: number): string {
  return POLLEN_LABELS_IT[Math.max(0, Math.min(4, Math.round(level)))]!;
}

/** Foreground CSS color for a pollen line, scaled with level. */
export function pollenLevelColor(level: number): string {
  switch (Math.max(0, Math.min(4, Math.round(level)))) {
    case 0: return "rgba(180, 180, 180, 0.85)";
    case 1: return "#F2C94C"; // giallo
    case 2: return "#F2994A"; // arancione
    case 3: return "#EB5757"; // rosso
    case 4: return "#C92A2A"; // rosso scuro
    default: return "#F2C94C";
  }
}

/** Strip the "Polleninformation (<Location>) " prefix from a friendly_name. */
function prettyAllergenName(entityId: string, friendlyName?: string): string {
  if (friendlyName) {
    const stripped = friendlyName.replace(
      /^Polleninformation\s*\([^)]+\)\s*/i,
      "",
    );
    if (stripped.length > 0) return stripped;
  }
  const tail = entityId.split(".").pop() ?? entityId;
  const last = tail.split("_").pop() ?? tail;
  return last.charAt(0).toUpperCase() + last.slice(1);
}

interface PollenSensorRead {
  entity: string;
  name: string;
  level: number;
  levelName: string;
}

function readPollenSensor(
  hass: HomeAssistant,
  entityId: string,
): PollenSensorRead | undefined {
  const e = hass.states[entityId];
  if (!e) return undefined;
  const a = e.attributes as Record<string, unknown>;
  const numericRaw = a.numeric_state;
  const level =
    typeof numericRaw === "number"
      ? Math.max(0, Math.min(4, Math.round(numericRaw)))
      : typeof e.state === "string"
        ? parsePollenLevel(e.state)
        : 0;
  const levelName =
    typeof a.named_state === "string"
      ? a.named_state
      : typeof e.state === "string"
        ? e.state
        : pollenLevelLabel(level);
  const name = prettyAllergenName(
    entityId,
    typeof a.friendly_name === "string" ? a.friendly_name : undefined,
  );
  return { entity: entityId, name, level, levelName };
}

/**
 * Compute the inline pollen display: overall level (driven by the
 * optional aggregate sensor or by the max of ``allergens``) plus a
 * short, sorted list of "interesting" allergens.
 *
 * Returns ``null`` when the host gave us neither an overall sensor
 * nor allergens, OR when everything is at level 0 with nothing pinned.
 */
export function getPollen(
  hass: HomeAssistant | undefined,
  inputs: PollenInputs,
): PollenSnapshot | null {
  if (!hass) return null;
  const allergenIds = inputs.pollenAllergens ?? [];
  if (!inputs.pollenOverall && allergenIds.length === 0) return null;

  const allergens = allergenIds
    .map((id) => readPollenSensor(hass, id))
    .filter((r): r is PollenSensorRead => r != null);

  let level = 0;
  let levelName = "";
  if (inputs.pollenOverall) {
    const overall = readPollenSensor(hass, inputs.pollenOverall);
    if (overall) {
      level = overall.level;
      levelName = overall.levelName;
    }
  }
  if (level === 0 && allergens.length > 0) {
    const maxA = allergens.reduce((m, a) => (a.level > m.level ? a : m), {
      level: 0,
      levelName: "nessuna",
    } as { level: number; levelName: string });
    level = maxA.level;
    levelName = maxA.levelName;
  }
  if (!levelName) levelName = pollenLevelLabel(level);

  const pinnedSet = new Set(inputs.pollenPinned ?? []);
  const minLevel = inputs.pollenMinLevel ?? 1;
  const maxItems = inputs.pollenMaxItems ?? 3;

  const filtered = allergens.filter(
    (a) => pinnedSet.has(a.entity) || a.level >= minLevel,
  );
  filtered.sort((a, b) => {
    if (b.level !== a.level) return b.level - a.level;
    const ap = pinnedSet.has(a.entity) ? 0 : 1;
    const bp = pinnedSet.has(b.entity) ? 0 : 1;
    if (ap !== bp) return ap - bp;
    return a.name.localeCompare(b.name, inputs.locale ?? "it-IT");
  });
  const items = filtered
    .slice(0, Math.max(0, maxItems))
    .map((a) => ({ name: a.name, level: a.level }));

  if (level === 0 && items.length === 0) return null;
  return { level, levelName, items };
}
