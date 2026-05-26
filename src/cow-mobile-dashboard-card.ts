/**
 * cow-mobile-dashboard-card — single-card mobile home dashboard.
 *
 * Designed for the HA companion app on a phone (target viewport
 * ~390 px wide). Single column layout, light/dark mode aware, no live
 * sky FX (we use a gradient driven by sun elevation, not the full
 * canvas-based wallpaper of the XL card — see the user decision
 * "2 simple" recorded in the Cave of Wonders changelog).
 *
 *   ┌────────────────────────────┐
 *   │ gradient hero              │  Big clock, date, outdoor temp,
 *   │  09:47                     │  presence chips (in casa / fuori)
 *   │  Dom 17 Mag · 🌞 21°       │  and alarm status pill. Gradient
 *   │  🏠 Alessio · 🚶 Koma      │  picks day / sunset / night based
 *   │  🔒 Inserita totalmente    │  on sun.sun elevation.
 *   ├────────────────────────────┤
 *   │ Summary chip + 4 actions   │  "N luci accese · M tapparelle"
 *   │ [Spegni/Accendi luci]      │  with whole-house quick actions
 *   │ [Chiudi/Apri tapparelle]   │  — sits up here so it stays in
 *   ├────────────────────────────┤  thumb reach above the long room
 *   │ 2-col grid of room tiles   │  grid.
 *   │  (icon + name + temp +     │  Tap a tile = open the modal
 *   │   humid + active badge)    │  Quick Control drawer for that
 *   └────────────────────────────┘  room.
 *
 * Config schema (Lovelace YAML):
 *
 *   type: custom:cow-mobile-dashboard-card
 *   weather: weather.pirateweather
 *   sun: sun.sun
 *   alarm: alarm_control_panel.casa
 *   persons:
 *     - person.alessio_vigilante
 *     - { entity: person.koma, label: "Koma" }
 *   rooms:
 *     - name: "Sala & Cucina"
 *       icon: "🛋"
 *       temp: sensor.display_sala_temperature
 *       humidity: sensor.display_sala_humidity
 *       climate: climate.koolnova_sala
 *       lights:
 *         - { entity: light.luce_sala, label: "Sala" }
 *       covers:
 *         - { entity: cover.tapparella_sala, label: "Sala" }
 *     - …
 */
import { LitElement, html, css, nothing } from "lit";
import { customElement, property, query, state } from "lit/decorators.js";

import type {
  HomeAssistant,
  HassEntity,
  LovelaceCard,
  LovelaceCardConfig,
} from "./types/hass.js";
import { fontFaces, typography } from "./styles/typography.js";
import {
  applyKindOverrides,
  findAjaxOpenings,
  findAjaxOpeningsInArea,
  openingIconSvg,
  type AjaxOpening,
  type OpeningKind,
  type OpeningKindOverrides,
} from "./util/ajax-openings.js";
import {
  bumpTarget,
  deriveThermostatView,
  THERMOSTAT_ACCENT,
  THERMOSTAT_STATUS_LABEL,
  THERMOSTAT_SUB_LABEL,
  type ThermostatVariant,
} from "./small/state/thermostat.js";
import "./shared/hero/mobile-hero.js";

// ─────────────────────────────────────────────────────────────────────
// Config
// ─────────────────────────────────────────────────────────────────────

export interface CowMobileDeviceEntry {
  entity: string;
  label?: string;
}

export interface CowMobileRoom {
  name: string;
  icon?: string;
  url?: string;
  temp?: string;
  humidity?: string;
  climate?: string;
  lights?: Array<string | CowMobileDeviceEntry>;
  covers?: Array<string | CowMobileDeviceEntry>;
  /**
   * HA areas this room maps to (display names OR area_ids — both
   * resolved by the openings discovery util). When set, the openings
   * pill aggregates Ajax sensors from every listed area. When unset,
   * the util falls back to a fuzzy match on ``name`` (works for
   * simple 1:1 rooms but fails on multi-area composites like
   * ``"Sala & Cucina"`` — that's exactly the case this field solves).
   */
  areas?: string[];
}

export interface CowMobilePersonEntry {
  entity: string;
  label?: string;
}

export interface CowMobileDashboardConfig extends LovelaceCardConfig {
  type: "custom:cow-mobile-dashboard-card";
  title?: string;
  weather?: string;
  sun?: string;
  /** Optional sensor.moon — passed to the hero engine for moon phase. */
  moon?: string;
  outdoor_temp?: string;
  alarm?: string;
  /**
   * `person.*` entities shown as presence chips in the hero. Strings
   * are accepted as a shorthand; pass `{ entity, label }` to override
   * the short name (default uses the friendly_name's first word).
   */
  persons?: Array<string | CowMobilePersonEntry>;
  /* ─── Hero engine — pollen + aurora opt-in ────────────────────── */
  /** Aggregate pollen sensor (Polleninformation / similar). */
  pollen_overall?: string;
  /** Per-allergen pollen sensors. */
  pollen_allergens?: string[];
  /** Min level to surface an allergen inline. Defaults to 1. */
  pollen_min_level?: number;
  /** Allergens always listed regardless of level. */
  pollen_pinned?: string[];
  /** Max allergens listed inline. Defaults to 3. */
  pollen_max_items?: number;
  /** Opt-in aurora overlay. Off by default. */
  aurora?: boolean;
  /* ─── Ajax openings overrides ─────────────────────────────────── */
  /**
   * Default opening kind when no per-device rule matches. Most consumer
   * Ajax installs are windows, so the recommended default is "window"
   * — flip via ``opening_defaults.kind: door`` if your install is
   * mostly doors.
   */
  opening_defaults?: { kind?: OpeningKind };
  /** Device names (case-insensitive) that are doors. */
  opening_doors?: string[];
  /** Device names (case-insensitive) that are windows. */
  opening_windows?: string[];
  /** Device names (case-insensitive) that are garage doors. */
  opening_garages?: string[];
  rooms: CowMobileRoom[];
}

interface NormalizedRoom {
  name: string;
  icon: string;
  url?: string;
  temp?: string;
  humidity?: string;
  climate?: string;
  lights: CowMobileDeviceEntry[];
  covers: CowMobileDeviceEntry[];
  areas: string[];
}

function normaliseDevices(
  raw: Array<string | CowMobileDeviceEntry> | undefined,
): CowMobileDeviceEntry[] {
  if (!raw) return [];
  return raw.map((d) =>
    typeof d === "string" ? { entity: d } : { entity: d.entity, label: d.label },
  );
}

function normaliseRoom(r: CowMobileRoom): NormalizedRoom {
  return {
    name: r.name,
    icon: r.icon ?? "🏠",
    url: r.url,
    temp: r.temp,
    humidity: r.humidity,
    climate: r.climate,
    lights: normaliseDevices(r.lights),
    covers: normaliseDevices(r.covers),
    areas: Array.isArray(r.areas)
      ? r.areas.filter((a): a is string => typeof a === "string" && a.length > 0)
      : [],
  };
}

// ─────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────
// Hero-only helpers (heroGradient, DAY/SUNSET/NIGHT palettes,
// formatDate/formatClock, WEATHER_ICONS) were removed when the hero
// was delegated to <cow-mobile-hero> — that component owns its own
// clock/date/weather rendering via the shared hero engine.

function isOn(s: HassEntity | undefined): boolean {
  return !!s && s.state === "on";
}
function isOpenish(s: HassEntity | undefined): boolean {
  if (!s) return false;
  if (s.state === "closed") return false;
  if (s.state === "unavailable" || s.state === "unknown") return false;
  return true;
}
function brightnessPct(s: HassEntity | undefined): number {
  const b = s?.attributes?.brightness as number | undefined;
  if (typeof b !== "number") return s?.state === "on" ? 100 : 0;
  return Math.round((b / 255) * 100);
}
function isDimmable(s: HassEntity | undefined): boolean {
  const modes = s?.attributes?.supported_color_modes as string[] | undefined;
  if (!Array.isArray(modes)) return false;
  return modes.some((m) => m !== "onoff" && m !== "unknown");
}
function coverPos(s: HassEntity | undefined): number {
  const p = s?.attributes?.current_position as number | undefined;
  if (typeof p === "number") return p;
  return s?.state === "open" ? 100 : 0;
}

// ─────────────────────────────────────────────────────────────────────
// Card
// ─────────────────────────────────────────────────────────────────────

@customElement("cow-mobile-dashboard-card")
export class CowMobileDashboardCard
  extends LitElement
  implements LovelaceCard
{
  @property({ attribute: false }) hass?: HomeAssistant;
  @state() private config?: CowMobileDashboardConfig;
  @state() private rooms: NormalizedRoom[] = [];
  /**
   * Index of the room whose drawer is currently open, or `null` when no
   * drawer is showing. Inline expansion was replaced with a real
   * bottom-sheet drawer per user feedback — scrolling down through the
   * whole grid to reach an inline panel felt like getting lost.
   */
  @state() private drawerRoom: number | null = null;
  /**
   * Live reference to the `<dialog>` element used as the modal drawer.
   * We control it imperatively via `showModal()` / `close()` because
   * a plain `position: fixed` div is trapped inside Lovelace's
   * containing-block stack (HA wraps each card in elements with
   * `contain: layout` and friends, which neutralize CSS `fixed`).
   * `<dialog>` renders into the browser's top layer instead, which is
   * the only way to draw above the rest of the page reliably.
   */
  @query("dialog.drawer") private drawerEl?: HTMLDialogElement;

  setConfig(cfg: LovelaceCardConfig): void {
    if (!cfg || typeof cfg !== "object") throw new Error("config required");
    const c = cfg as CowMobileDashboardConfig;
    if (!Array.isArray(c.rooms) || c.rooms.length === 0) {
      throw new Error("`rooms` is required and must have at least one entry");
    }
    this.config = c;
    this.rooms = c.rooms.map(normaliseRoom);
  }

  // The clock no longer lives in this card — the hero (cow-mobile-hero,
  // wrapping cow-hero-engine) owns its own 30 s tick. We keep the
  // lifecycle hooks for the drawer reference handling below.

  override updated(changed: Map<string, unknown>): void {
    if (changed.has("drawerRoom")) {
      const d = this.drawerEl;
      if (d) {
        if (this.drawerRoom != null && !d.open) d.showModal();
        if (this.drawerRoom == null && d.open) d.close();
      }
    }
  }

  getCardSize(): number {
    return 6 + Math.ceil(this.rooms.length / 2) * 2;
  }

  // ── State helpers ────────────────────────────────────────────────

  private getEnt(id?: string): HassEntity | undefined {
    if (!id || !this.hass) return undefined;
    return this.hass.states[id];
  }

  private roomLightsOn(room: NormalizedRoom): number {
    return room.lights.filter((l) => isOn(this.getEnt(l.entity))).length;
  }
  private roomCoversOpen(room: NormalizedRoom): number {
    return room.covers.filter((c) => isOpenish(this.getEnt(c.entity))).length;
  }
  private totalLightsOn(): number {
    let n = 0;
    for (const r of this.rooms) n += this.roomLightsOn(r);
    return n;
  }
  private totalLightsTotal(): number {
    let n = 0;
    for (const r of this.rooms) n += r.lights.length;
    return n;
  }
  private totalCoversOpen(): number {
    let n = 0;
    for (const r of this.rooms) n += this.roomCoversOpen(r);
    return n;
  }
  private totalCoversTotal(): number {
    let n = 0;
    for (const r of this.rooms) n += r.covers.length;
    return n;
  }

  // ── Ajax openings helpers ────────────────────────────────────────
  //
  // Discovery is registry-driven: we never ask the user to list opening
  // entities in card config. ``findAjaxOpeningsInArea`` matches the
  // HA area whose name fuzzy-matches the room's display name; ``Sala &
  // Cucina`` will hit the ``Sala`` area, ``Studio Chiara`` hits ``Studio``,
  // etc. (See src/util/ajax-openings.ts for the matcher.)

  /**
   * Card-level kind overrides loaded from YAML. Computed each call so
   * a hot-reload of the card config takes effect without a restart.
   */
  private kindOverrides(): OpeningKindOverrides | undefined {
    const c = this.config;
    if (!c) return undefined;
    if (
      !c.opening_doors?.length &&
      !c.opening_windows?.length &&
      !c.opening_garages?.length &&
      !c.opening_defaults?.kind
    ) {
      return undefined;
    }
    return {
      default: c.opening_defaults?.kind,
      doors: c.opening_doors,
      windows: c.opening_windows,
      garages: c.opening_garages,
    };
  }

  private roomOpenings(room: NormalizedRoom): AjaxOpening[] {
    // Prefer the explicit ``areas: [...]`` list when the user
    // configured it (handles multi-area rooms like ``"Sala & Cucina"``
    // and disambiguates short names like ``"Camera"`` vs ``"Camera 1"``
    // / ``"Camera 2"``). Fall back to fuzzy-matching the room display
    // name when ``areas`` is absent — preserves backward compat.
    let raw: AjaxOpening[];
    if (room.areas.length > 0) {
      const seen = new Set<string>();
      const out: AjaxOpening[] = [];
      for (const a of room.areas) {
        for (const o of findAjaxOpeningsInArea(this.hass, a)) {
          if (seen.has(o.entityId)) continue;
          seen.add(o.entityId);
          out.push(o);
        }
      }
      raw = out;
    } else {
      raw = findAjaxOpeningsInArea(this.hass, room.name);
    }
    return applyKindOverrides(raw, this.kindOverrides());
  }
  private houseOpenings(): AjaxOpening[] {
    return applyKindOverrides(
      findAjaxOpenings(this.hass),
      this.kindOverrides(),
    );
  }

  // ── Setpoint helpers (room.climate) ─────────────────────────────

  private roomClimateView(room: NormalizedRoom): {
    variant: ThermostatVariant;
    target: number | null;
  } | null {
    if (!room.climate || !this.hass) return null;
    const ent = this.hass.states[room.climate];
    if (!ent) return null;
    const view = deriveThermostatView(ent);
    return {
      variant: view.variant,
      target: view.target ?? null,
    };
  }
  private allLightEntities(): string[] {
    const r: string[] = [];
    for (const room of this.rooms) for (const l of room.lights) r.push(l.entity);
    return r;
  }
  private allCoverEntities(): string[] {
    const r: string[] = [];
    for (const room of this.rooms) for (const c of room.covers) r.push(c.entity);
    return r;
  }

  // ── Service calls ────────────────────────────────────────────────

  private callLight(entity: string, on: boolean): void {
    void this.hass?.callService(
      "light",
      on ? "turn_on" : "turn_off",
      {},
      { entity_id: entity },
    );
  }
  private setBrightness(entity: string, pct: number): void {
    if (pct === 0) {
      this.callLight(entity, false);
      return;
    }
    void this.hass?.callService(
      "light",
      "turn_on",
      { brightness: Math.round((pct / 100) * 255) },
      { entity_id: entity },
    );
  }
  private cover(entity: string, action: "open" | "close" | "stop"): void {
    const svc =
      action === "open"
        ? "open_cover"
        : action === "close"
          ? "close_cover"
          : "stop_cover";
    void this.hass?.callService("cover", svc, {}, { entity_id: entity });
  }
  private allLights(on: boolean): void {
    const ents = this.allLightEntities();
    if (ents.length === 0) return;
    void this.hass?.callService(
      "light",
      on ? "turn_on" : "turn_off",
      {},
      { entity_id: ents },
    );
  }
  private allCovers(open: boolean): void {
    const ents = this.allCoverEntities();
    if (ents.length === 0) return;
    void this.hass?.callService(
      "cover",
      open ? "open_cover" : "close_cover",
      {},
      { entity_id: ents },
    );
  }

  // ── Climate service callers ──────────────────────────────────────
  // Thin wrappers around climate.set_* services. Used by the in-drawer
  // climate row so the user can change mode / setpoint / fan on the
  // climate.casa_<room> proxy directly from the phone, just like the
  // wall display.
  private setClimateMode(entity: string, mode: string): void {
    void this.hass?.callService(
      "climate",
      "set_hvac_mode",
      { hvac_mode: mode },
      { entity_id: entity },
    );
  }
  private setClimateTarget(entity: string, temperature: number): void {
    void this.hass?.callService(
      "climate",
      "set_temperature",
      { temperature },
      { entity_id: entity },
    );
  }
  private setClimateFan(entity: string, fan_mode: string): void {
    void this.hass?.callService(
      "climate",
      "set_fan_mode",
      { fan_mode },
      { entity_id: entity },
    );
  }

  // ── Render ───────────────────────────────────────────────────────

  static override styles = [
    fontFaces,
    typography,
    css`
      :host {
        display: block;
        font-family: "Inter", system-ui, -apple-system, sans-serif;
        color: var(--primary-text-color, #1f1f2e);
        -webkit-tap-highlight-color: transparent;
      }
      .card {
        display: flex;
        flex-direction: column;
        gap: 12px;
        padding: 0 0 16px;
      }

      /* ── Hero ─────────────────────────────────────────────────── */
      /* The hero is delegated to <cow-mobile-hero> (which wraps the
         shared <cow-hero-engine>). We only set the host card's slot
         position and box shadow here; clock + meteo + pollen are
         owned by the hero element itself. */
      cow-mobile-hero.hero {
        display: block;
        margin: 0 8px;
        border-radius: 24px;
        box-shadow: 0 4px 16px rgba(31, 31, 46, 0.08);
        overflow: hidden;
      }

      /* Mobile-hero footer slot — alarm pill on the left, presence
         chips on the right. Wraps to a 2nd line on narrow screens. */
      .hero-footer-row {
        display: flex;
        flex-direction: row;
        align-items: center;
        gap: 8px;
        flex-wrap: wrap;
        width: 100%;
      }

      /* ── Hero: people & alarm chips ──────────────────────────── */
      .hero-persons {
        display: flex;
        flex-wrap: wrap;
        gap: 6px;
      }
      .person-chip {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        padding: 5px 10px 5px 8px;
        border-radius: 999px;
        font-size: 13px;
        font-weight: 600;
        line-height: 1.2;
        background: rgba(255, 255, 255, 0.18);
        backdrop-filter: blur(6px);
        -webkit-backdrop-filter: blur(6px);
      }
      .person-chip.is-away {
        background: rgba(0, 0, 0, 0.22);
        opacity: 0.85;
      }
      .person-ico {
        font-size: 14px;
        line-height: 1;
      }
      .hero-alarm {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        padding: 8px 14px 8px 10px;
        border-radius: 999px;
        font-size: 13px;
        font-weight: 600;
        text-decoration: none;
        color: inherit;
        background: rgba(255, 255, 255, 0.16);
        backdrop-filter: blur(6px);
        -webkit-backdrop-filter: blur(6px);
        align-self: flex-start;
        transition: background 0.18s ease;
      }
      .hero-alarm[data-armed] {
        background: rgba(255, 180, 80, 0.32);
      }
      .hero-alarm[data-transitioning] {
        background: rgba(255, 220, 90, 0.32);
        animation: alarmPulse 1.4s ease-in-out infinite;
      }
      .hero-alarm[data-triggered] {
        background: rgba(255, 90, 90, 0.55);
        animation: alarmPulse 0.8s ease-in-out infinite;
      }
      @keyframes alarmPulse {
        0%,
        100% {
          filter: brightness(1);
        }
        50% {
          filter: brightness(1.25);
        }
      }
      .alarm-ico {
        font-size: 15px;
        line-height: 1;
      }

      /* ── Section header ──────────────────────────────────────── */
      .section-head {
        margin: 6px 16px 2px;
        display: flex;
        align-items: baseline;
        justify-content: space-between;
        font-weight: 600;
        font-size: 11px;
        letter-spacing: 1px;
        text-transform: uppercase;
        color: var(--secondary-text-color, #8c8c99);
      }

      /* ── Room grid ──────────────────────────────────────────── */
      .rooms {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 10px;
        padding: 0 8px;
      }
      .room-tile {
        position: relative;
        background: var(--card-background-color, #fff);
        border-radius: 18px;
        padding: 14px 14px 12px;
        cursor: pointer;
        user-select: none;
        box-shadow: 0 1px 4px rgba(31, 31, 46, 0.06);
        transition:
          transform 160ms cubic-bezier(0.22, 1, 0.36, 1),
          box-shadow 160ms ease,
          background 160ms ease;
      }
      .room-tile:active {
        transform: scale(0.985);
      }
      /* room-tile no longer carries a "selected" state — opening a tile
         always pops up the modal drawer, so the tile itself stays the
         same and there's nothing to highlight. */
      .room-tile-head {
        display: flex;
        align-items: center;
        gap: 8px;
      }
      .room-icon {
        font-size: 22px;
        line-height: 1;
      }
      .room-name {
        font-weight: 600;
        font-size: 15px;
        line-height: 1.2;
        flex: 1;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      .room-th {
        margin-top: 8px;
        font-size: 12px;
        opacity: 0.7;
        display: flex;
        gap: 8px;
      }
      .room-th .sep {
        opacity: 0.4;
      }
      .room-badges {
        margin-top: 10px;
        display: flex;
        flex-direction: column;
        gap: 6px;
      }
      .room-badge-row {
        display: flex;
        flex-direction: row;
        gap: 6px;
        align-items: center;
        flex-wrap: wrap;
        min-height: 22px;
      }
      .badge {
        display: inline-flex;
        align-items: center;
        gap: 4px;
        font-size: 11px;
        font-weight: 600;
        padding: 3px 8px;
        border-radius: 999px;
        background: var(--cow-mobile-badge-bg, rgba(31, 31, 46, 0.08));
        color: var(--cow-mobile-badge-fg, #1f1f2e);
        line-height: 1;
      }
      .badge svg {
        width: 14px;
        height: 14px;
        display: block;
      }
      .badge.on {
        background: rgba(255, 199, 46, 0.18);
        color: #b87b0a;
      }
      .badge.cov {
        background: rgba(76, 184, 255, 0.18);
        color: #0a6699;
      }
      /* Setpoint variants mirror the small thermostat panel tokens. */
      .badge.set-heating { background: #ffeae0; color: #b85100; }
      .badge.set-cooling { background: #dfedfe; color: #2659bb; }
      .badge.set-idle    { background: #d5f1e1; color: #077348; }
      .badge.set-off     { background: #ededef; color: #73737d; }
      /* Openings pill — sits on its own row so every glyph is visible
         (no truncation). Pink-tinted when any contact is open, neutral
         grey otherwise; glyphs are coloured by themselves via inline
         fill so the pill background stays low-contrast. */
      .openings-pill {
        display: inline-flex;
        align-items: center;
        gap: 4px;
        padding: 3px 8px;
        border-radius: 999px;
        background: #f3f3f5;
        line-height: 1;
      }
      .openings-pill.has-open {
        background: #ffeae8;
      }
      .openings-pill svg {
        width: 16px;
        height: 16px;
        display: block;
      }
      .openings-pill .open  { color: var(--cow-stop, #e74c3c); }
      .openings-pill .closed { color: #b3b3bd; }

      /* Summary card — new openings row (between headline and buttons) */
      .summary-openings {
        display: flex;
        align-items: center;
        gap: 8px;
        margin: 6px 0 2px;
        font-size: 13px;
        font-weight: 500;
        color: var(--cow-stop, #e74c3c);
      }
      .summary-openings svg {
        width: 18px;
        height: 18px;
        display: block;
        color: var(--cow-stop, #e74c3c);
      }
      .summary-openings .icons {
        display: inline-flex;
        align-items: center;
        gap: 2px;
      }

      /* ── Drawer (modal bottom sheet, native <dialog>) ────────── */
      /* The browser renders <dialog> in the top layer with showModal,
         which escapes every stacking context — the only reliable way
         to draw above HA Lovelace's nested "contain: layout" wrappers.
         We override the user-agent centering and pin it to the bottom.
         IMPORTANT: all layout-affecting styles (display, position,
         padding, background, shadow…) live on 'dialog.drawer[open]',
         NOT on the bare 'dialog.drawer' selector. The UA stylesheet's
         'dialog:not([open]) { display: none }' rule has the same
         specificity as ours, but author origin beats UA origin, so a
         plain 'dialog.drawer { display: flex }' would force the sheet
         to render even when closed — visible as a thin strip pinned
         to the bottom of the card. Scoping styles to '[open]' keeps
         the UA hide-when-closed default intact. */
      dialog.drawer[open] {
        position: fixed;
        left: 0;
        right: 0;
        bottom: 0;
        top: auto;
        margin: 0;
        width: 100%;
        max-width: 100vw;
        max-height: 82vh;
        padding: 6px 16px max(20px, env(safe-area-inset-bottom, 0px));
        border: 0;
        border-radius: 24px 24px 0 0;
        background: var(--card-background-color, #fff);
        color: var(--primary-text-color, inherit);
        box-shadow: 0 -8px 32px rgba(0, 0, 0, 0.35);
        display: flex;
        flex-direction: column;
        box-sizing: border-box;
        animation: drawer-up 260ms cubic-bezier(0.22, 1, 0.36, 1);
      }
      dialog.drawer:not([open]) {
        display: none;
      }
      dialog.drawer::backdrop {
        background: rgba(0, 0, 0, 0.45);
        animation: backdrop-in 220ms ease;
      }
      @keyframes backdrop-in {
        from { opacity: 0; }
        to   { opacity: 1; }
      }
      @keyframes drawer-up {
        from { transform: translateY(100%); opacity: 0.8; }
        to   { transform: translateY(0); opacity: 1; }
      }
      /* Dark-mode tile elevation so the sheet stands out from the
         dimmed backdrop. Without this the drawer painted the same
         near-black as the backdrop and looked invisible. Scoped to
         [open] for the same reason as the base styles above. */
      @media (prefers-color-scheme: dark) {
        dialog.drawer[open] {
          background: var(--ha-card-background, #1f1f2a);
          border-top: 1px solid rgba(255, 255, 255, 0.06);
        }
      }
      .drawer-handle {
        width: 38px;
        height: 4px;
        background: var(--divider-color, rgba(31, 31, 46, 0.18));
        border-radius: 2px;
        margin: 8px auto 12px;
        flex-shrink: 0;
      }
      .drawer-head {
        display: flex;
        align-items: center;
        gap: 10px;
        padding: 0 4px 12px;
        font-weight: 600;
        font-size: 16px;
        flex-shrink: 0;
      }
      .drawer-title {
        flex: 1;
      }
      .drawer-close {
        appearance: none;
        margin-left: auto;
        border: 0;
        background: var(--divider-color, rgba(31, 31, 46, 0.08));
        font-size: 16px;
        line-height: 1;
        color: inherit;
        cursor: pointer;
        width: 32px;
        height: 32px;
        border-radius: 50%;
        display: inline-flex;
        align-items: center;
        justify-content: center;
      }
      .drawer-close:active {
        transform: scale(0.92);
      }
      .drawer-body {
        flex: 1 1 auto;
        overflow-y: auto;
        padding: 0 4px;
        /* Smooth scroll for the inner list, e.g. rooms with 5+ devices. */
        -webkit-overflow-scrolling: touch;
      }
      .qc-row {
        display: flex;
        align-items: center;
        gap: 10px;
        padding: 8px 0;
      }
      .qc-row + .qc-row {
        border-top: 1px solid var(--divider-color, rgba(31, 31, 46, 0.06));
      }
      /* Leading icon: 💡 for lights, ▤ for covers. Fixed width so the
         labels line up across emoji widths. The 🪟 window emoji is
         Emoji 13.0 (2020) and renders as a thin glyph or tofu on
         the older Chromium kiosks the Shelly Wall Displays ship
         with, so for covers we use ▤ (U+25A4 SQUARED HORIZONTAL
         FILL) — a plain Unicode glyph supported everywhere, which
         also matches the badge already used on the room tiles for
         "open covers" so the two surfaces tell the same story. */
      .qc-row-icon {
        flex: 0 0 22px;
        font-size: 16px;
        line-height: 1;
        text-align: center;
        opacity: 0.72;
      }
      .qc-row-icon.is-cover {
        /* Plain glyphs render smaller than emoji at the same font
           size; bump it so the visual weight matches 💡. */
        font-size: 20px;
        color: var(--primary-text-color, inherit);
      }
      .qc-row-label {
        flex: 1;
        font-size: 14px;
        font-weight: 500;
        min-width: 0;
      }
      .qc-row-sub {
        font-size: 12px;
        opacity: 0.6;
        font-weight: 400;
      }
      /* ── Climate card in the room drawer ───────────────────────────
         Compact thermostat block at the top of the drawer body when
         the room has a climate entity. Tinted by THERMOSTAT_ACCENT
         (--cow-accent-* CSS vars) so heating/cooling/idle/off all
         look identical to the small panel + XL drawer. */
      .qc-climate {
        border-radius: 16px;
        padding: 14px;
        margin: 0 0 10px;
        color: #fff;
        background: var(--cow-accent-surface,
          linear-gradient(180deg, #80858c 0%, #a6abb2 100%));
        transition: background 320ms ease;
        display: flex;
        flex-direction: column;
        gap: 10px;
      }
      .qc-climate-head {
        display: flex;
        align-items: center;
        gap: 8px;
        font-weight: 600;
        font-size: 13px;
        line-height: 1.2;
        text-transform: uppercase;
        letter-spacing: 0.6px;
      }
      .qc-climate-head .status {
        opacity: 0.9;
        font-weight: 500;
        text-transform: none;
        letter-spacing: normal;
      }
      .qc-climate-body {
        display: flex;
        align-items: flex-end;
        justify-content: space-between;
        gap: 8px;
        flex-wrap: nowrap;
      }
      .qc-climate-cur {
        font-size: 32px;
        font-weight: 200;
        line-height: 1;
        font-variant-numeric: tabular-nums;
      }
      .qc-climate-cur .hum {
        margin-left: 8px;
        font-size: 12px;
        font-weight: 500;
        opacity: 0.85;
        vertical-align: 4px;
      }
      .qc-climate-set {
        display: flex;
        align-items: center;
        gap: 8px;
      }
      .qc-climate-target {
        font-size: 22px;
        font-weight: 600;
        line-height: 1;
        min-width: 44px;
        text-align: center;
        font-variant-numeric: tabular-nums;
      }
      .qc-climate-bump {
        appearance: none;
        border: 0;
        width: 32px;
        height: 32px;
        border-radius: 50%;
        background: rgba(255, 255, 255, 0.22);
        color: #fff;
        font-size: 13px;
        font-weight: 600;
        cursor: pointer;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        transition: background 160ms ease, opacity 160ms ease;
        flex-shrink: 0;
      }
      .qc-climate-bump:active {
        background: rgba(255, 255, 255, 0.4);
      }
      /* Arrows stop responding (and grey out) when the proxy is OFF
         — same behaviour as the small wall card / XL drawer. */
      .qc-climate-bump[disabled] {
        opacity: 0.45;
        cursor: not-allowed;
      }
      .qc-climate-bump[disabled]:active {
        background: rgba(255, 255, 255, 0.22);
      }
      .qc-climate-chiprow {
        display: flex;
        flex-wrap: wrap;
        gap: 4px;
      }
      .qc-climate-chip {
        appearance: none;
        border: 0;
        flex: 1 1 0;
        min-width: 48px;
        padding: 7px 4px;
        border-radius: 8px;
        background: rgba(255, 255, 255, 0.2);
        color: #fff;
        font-size: 12px;
        font-weight: 600;
        cursor: pointer;
        transition: background 160ms ease;
      }
      .qc-climate-chip[data-active] {
        background: rgba(255, 255, 255, 0.95);
        color: var(--primary-text-color, #1f1f2e);
        box-shadow: inset 0 0 0 1px rgba(0, 0, 0, 0.06);
      }

      /* Drawer Aperture section — read-only list of Ajax openings for
         the room currently in focus. Mirrors the qc-row visual rhythm
         so it slots above lights/covers without a visual break. */
      .qc-section-title {
        font-size: 11px;
        font-weight: 600;
        letter-spacing: 1.5px;
        color: var(--secondary-text-color, #8c8c99);
        margin: 4px 0 6px;
        text-transform: uppercase;
      }
      .qc-row .opening-state {
        font-size: 12px;
        font-weight: 600;
        padding: 3px 9px;
        border-radius: 999px;
      }
      .qc-row .opening-state.is-open {
        background: rgba(231, 76, 60, 0.12);
        color: var(--cow-stop, #e74c3c);
      }
      .qc-row .opening-state.is-closed {
        background: rgba(31, 31, 46, 0.06);
        color: var(--secondary-text-color, #8c8c99);
      }
      .qc-row .qc-row-icon.is-opening svg {
        width: 22px;
        height: 22px;
        display: block;
      }
      .qc-row .qc-row-icon.is-opening.open  { color: var(--cow-stop, #e74c3c); }
      .qc-row .qc-row-icon.is-opening.closed { color: var(--secondary-text-color, #8c8c99); }
      .toggle {
        appearance: none;
        border: 0;
        width: 50px;
        height: 28px;
        background: var(--divider-color, #d4d4dc);
        border-radius: 14px;
        position: relative;
        cursor: pointer;
        transition: background 200ms ease;
        flex-shrink: 0;
      }
      .toggle[data-on] {
        background: var(--primary-color, #03a9f4);
      }
      .toggle::after {
        content: "";
        position: absolute;
        top: 3px;
        left: 3px;
        width: 22px;
        height: 22px;
        border-radius: 50%;
        background: #fff;
        transition: transform 200ms cubic-bezier(0.22, 1, 0.36, 1);
        box-shadow: 0 1px 3px rgba(0, 0, 0, 0.15);
      }
      .toggle[data-on]::after {
        transform: translateX(22px);
      }
      .slider {
        flex: 1;
        height: 36px;
        position: relative;
        background: var(--divider-color, rgba(31, 31, 46, 0.08));
        border-radius: 12px;
        overflow: hidden;
        cursor: pointer;
      }
      .slider-fill {
        position: absolute;
        left: 0;
        top: 0;
        bottom: 0;
        background: var(--primary-color, #03a9f4);
        border-radius: 12px;
        transition: width 120ms linear;
      }
      .slider-label {
        position: absolute;
        inset: 0;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 13px;
        font-weight: 600;
        color: #fff;
        text-shadow: 0 1px 2px rgba(0, 0, 0, 0.25);
        pointer-events: none;
      }
      .cov-buttons {
        display: flex;
        gap: 6px;
      }
      .cov-buttons button {
        appearance: none;
        border: 0;
        background: var(--divider-color, rgba(31, 31, 46, 0.08));
        color: inherit;
        font: inherit;
        font-size: 16px;
        width: 36px;
        height: 36px;
        border-radius: 10px;
        cursor: pointer;
      }
      .cov-buttons button:active {
        transform: scale(0.92);
      }
      .cov-pos {
        font-size: 12px;
        font-weight: 600;
        opacity: 0.6;
        min-width: 32px;
        text-align: right;
      }

      /* ── Summary + actions ───────────────────────────────────── */
      .summary {
        margin: 0 8px;
        padding: 14px 16px;
        background: var(--card-background-color, #fff);
        border-radius: 18px;
        box-shadow: 0 1px 4px rgba(31, 31, 46, 0.06);
        display: flex;
        flex-direction: column;
        gap: 10px;
      }
      .summary-text {
        font-size: 14px;
        font-weight: 500;
      }
      .summary-actions {
        display: flex;
        gap: 8px;
      }
      .summary-actions button {
        flex: 1;
        appearance: none;
        border: 0;
        font: inherit;
        font-size: 13px;
        font-weight: 600;
        padding: 10px 12px;
        border-radius: 12px;
        background: var(--divider-color, rgba(31, 31, 46, 0.08));
        color: inherit;
        cursor: pointer;
        transition: opacity 160ms ease, transform 160ms ease;
      }
      .summary-actions button:active:not(:disabled) {
        transform: scale(0.98);
      }
      .summary-actions button:disabled {
        opacity: 0.35;
        cursor: not-allowed;
      }
      /* Solid yellow / outlined yellow for the lights pair. The "soft"
         variant uses the same hue at a lower saturation so it reads as
         the secondary/inverse action. */
      .summary-actions button[data-accent] {
        background: rgba(255, 199, 46, 0.2);
        color: #b87b0a;
      }
      .summary-actions button[data-accent-soft] {
        background: transparent;
        color: #b87b0a;
        box-shadow: inset 0 0 0 1.5px rgba(255, 199, 46, 0.45);
      }
      /* Same pattern for the covers pair, in blue. */
      .summary-actions button[data-cov] {
        background: rgba(76, 184, 255, 0.18);
        color: #0a6699;
      }
      .summary-actions button[data-cov-soft] {
        background: transparent;
        color: #0a6699;
        box-shadow: inset 0 0 0 1.5px rgba(76, 184, 255, 0.42);
      }

      /* ── Dark mode tweaks ────────────────────────────────────── */
      @media (prefers-color-scheme: dark) {
        .room-tile,
        .qc,
        .summary {
          background: var(--card-background-color, #1c1c24);
          box-shadow: 0 1px 4px rgba(0, 0, 0, 0.3);
        }
      }
    `,
  ];

  override render() {
    if (!this.config) return html`<div>Loading…</div>`;
    // Order: hero → whole-house quick actions (summary) → per-room
    // tiles. The summary now sits directly under the hero so the
    // four big buttons (Spegni/Accendi tutte luci, Chiudi/Apri tutte
    // tapparelle) are reachable with a thumb without scrolling past
    // the room grid.
    return html`
      <div class="card">
        ${this.renderHero()} ${this.renderSummary()} ${this.renderRooms()}
      </div>
      ${this.renderDrawer()}
    `;
  }

  // ── Hero ─────────────────────────────────────────────────────────

  /**
   * Hero is delegated to ``<cow-mobile-hero>`` which itself wraps the
   * shared ``<cow-hero-engine>`` — so we get the same live sky / sun
   * arc / weather FX / pollen line that the XL dashboard renders.
   * Mobile-only chrome (alarm pill + presence chips) goes into the
   * hero's ``footer`` slot so the engine can position the footer row
   * along the bottom of the hero panel.
   */
  private renderHero() {
    return html`
      <cow-mobile-hero
        class="hero"
        .hass=${this.hass}
        .weatherEntity=${this.config?.weather}
        .sunEntity=${this.config?.sun}
        .moonEntity=${this.config?.moon}
        .locale=${this.hass?.locale?.language}
        .pollenOverall=${this.config?.pollen_overall}
        .pollenAllergens=${this.config?.pollen_allergens}
        .pollenMinLevel=${this.config?.pollen_min_level ?? 1}
        .pollenPinned=${this.config?.pollen_pinned}
        .pollenMaxItems=${this.config?.pollen_max_items ?? 3}
        .aurora=${!!this.config?.aurora}
      >
        <div slot="footer" class="hero-footer-row">
          ${this.renderHeroAlarm()}
          ${this.renderHeroPersons()}
        </div>
      </cow-mobile-hero>
    `;
  }

  private personEntries(): CowMobilePersonEntry[] {
    const raw = this.config?.persons;
    if (!Array.isArray(raw)) return [];
    return raw.map((p) =>
      typeof p === "string" ? { entity: p } : { entity: p.entity, label: p.label },
    );
  }

  /**
   * Use the configured label first; otherwise derive a short, friendly
   * label from the `person.*` entity attributes — first name only when
   * the friendly_name is "Firstname Lastname", to keep the chips tight
   * on a phone-sized screen.
   */
  private personLabel(p: CowMobilePersonEntry, e?: HassEntity): string {
    if (p.label) return p.label;
    const fn = (e?.attributes?.friendly_name as string | undefined) ?? p.entity;
    const first = fn.split(/\s+/, 1)[0] ?? fn;
    return first.charAt(0).toUpperCase() + first.slice(1);
  }

  private renderHeroPersons() {
    const entries = this.personEntries();
    if (entries.length === 0) return nothing;
    const home: string[] = [];
    const away: string[] = [];
    for (const p of entries) {
      const e = this.getEnt(p.entity);
      const label = this.personLabel(p, e);
      if (!e || e.state === "unknown" || e.state === "unavailable") continue;
      // Treat any `home` (or zone="home") as "in casa"; everything else
      // (not_home, work, school, geofenced zone names…) ends up in the
      // "fuori" group. This intentionally collapses multi-zone tracking
      // because the hero is a one-glance overview, not a presence map.
      if (e.state === "home") home.push(label);
      else away.push(label);
    }
    if (home.length === 0 && away.length === 0) return nothing;
    return html`
      <div class="hero-persons">
        ${home.length > 0
          ? html`
              <span class="person-chip is-home">
                <span class="person-ico" aria-hidden="true">🏠</span>
                <span>${home.join(", ")}</span>
              </span>
            `
          : nothing}
        ${away.length > 0
          ? html`
              <span class="person-chip is-away">
                <span class="person-ico" aria-hidden="true">🚶</span>
                <span>${away.join(", ")}</span>
              </span>
            `
          : nothing}
      </div>
    `;
  }

  private renderHeroAlarm() {
    if (!this.config?.alarm) return nothing;
    const a = this.getEnt(this.config.alarm);
    if (!a) return nothing;
    const armed = a.state.startsWith("armed");
    const triggered = a.state === "triggered";
    const transitioning = ["arming", "disarming", "pending"].includes(a.state);
    const label = ALARM_STATE_LABEL[a.state] ?? a.state;
    return html`
      <a
        class="hero-alarm"
        href="/lovelace/alarm"
        ?data-armed=${armed}
        ?data-triggered=${triggered}
        ?data-transitioning=${transitioning}
      >
        <span class="alarm-ico" aria-hidden="true"
          >${triggered ? "⚠" : armed ? "🔒" : "🔓"}</span
        >
        <span>${label}</span>
      </a>
    `;
  }

  // ── Rooms grid ───────────────────────────────────────────────────

  private renderRooms() {
    return html`
      <div class="section-head"><span>Stanze</span></div>
      <div class="rooms">
        ${this.rooms.map((r, i) => this.renderRoomTile(r, i))}
      </div>
    `;
  }

  private renderRoomTile(room: NormalizedRoom, idx: number) {
    const tempEnt = this.getEnt(room.temp);
    const humEnt = this.getEnt(room.humidity);
    const temp =
      tempEnt && tempEnt.state !== "unavailable"
        ? `${Math.round(parseFloat(tempEnt.state))}°`
        : null;
    const hum =
      humEnt && humEnt.state !== "unavailable"
        ? `${Math.round(parseFloat(humEnt.state))}%`
        : null;
    const lOn = this.roomLightsOn(room);
    const cOpen = this.roomCoversOpen(room);
    const openings = this.roomOpenings(room);
    const climate = this.roomClimateView(room);
    return html`
      <div
        class="room-tile"
        role="button"
        tabindex="0"
        @click=${() => this.openDrawer(idx)}
        @keydown=${(e: KeyboardEvent) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            this.openDrawer(idx);
          }
        }}
      >
        <div class="room-tile-head">
          <span class="room-icon">${room.icon}</span>
          <span class="room-name">${room.name}</span>
        </div>
        <div class="room-th">
          ${temp ? html`<span>${temp}</span>` : nothing}
          ${temp && hum ? html`<span class="sep">·</span>` : nothing}
          ${hum ? html`<span>${hum}</span>` : nothing}
        </div>
        <div class="room-badges">
          ${this.renderOpeningsBadgeRow(openings)}
          ${this.renderControlBadgeRow(climate, lOn, cOpen)}
        </div>
      </div>
    `;
  }

  /**
   * Row 1 of the badges stack — Ajax openings strip. Collapses to
   * ``nothing`` when the room has zero Ajax sensors in its area, so
   * the existing tile height stays the same on rooms without Ajax.
   * Every opening glyph is visible (no "+N" overflow — they live on a
   * dedicated row).
   */
  private renderOpeningsBadgeRow(openings: AjaxOpening[]) {
    if (openings.length === 0) return nothing;
    const hasOpen = openings.some((o) => o.isOpen);
    return html`
      <div class="room-badge-row">
        <span class="openings-pill ${hasOpen ? "has-open" : ""}">
          ${openings.map(
            (o) => html`
              <span
                class=${o.isOpen ? "open" : "closed"}
                title=${`${o.deviceName} — ${o.isOpen ? "aperta" : "chiusa"}`}
              >
                ${openingIconSvg(o.kind, o.isOpen, 16)}
              </span>
            `,
          )}
        </span>
      </div>
    `;
  }

  /**
   * Row 2 — left-to-right: setpoint (variant-coloured), lights count,
   * covers count. Each badge is shown only when its data exists, so
   * rooms with neither climate nor lights collapse to just the covers
   * pill (or to an empty row, which still reserves the slot height so
   * the tile geometry is stable while you scroll).
   */
  private renderControlBadgeRow(
    climate: { variant: ThermostatVariant; target: number | null } | null,
    lOn: number,
    cOpen: number,
  ) {
    if (climate == null && lOn === 0 && cOpen === 0) return nothing;
    // Label rules:
    //   * variant=off (HVAC off entirely)         → "Off"
    //   * variant=idle + target available         → target °C (it's the
    //     setpoint the system will chase next time it kicks in)
    //   * variant=idle + target null (heat_cool   → "Auto" — the system
    //     mode reads target_temp_high/low instead   is in dual-setpoint
    //     of `temperature`)                         mode, no single target
    //   * heating/cooling                          → target °C
    const setpointLabel = climate
      ? climate.variant === "off"
        ? "Off"
        : climate.target == null
          ? "Auto"
          : `${Math.round(climate.target)}°`
      : null;
    return html`
      <div class="room-badge-row">
        ${climate
          ? html`
              <span class="badge set-${climate.variant}">
                🌡 ${setpointLabel}
              </span>
            `
          : nothing}
        ${lOn > 0 ? html`<span class="badge on">💡 ${lOn}</span>` : nothing}
        ${cOpen > 0
          ? html`<span class="badge cov">▤ ${cOpen}</span>`
          : nothing}
      </div>
    `;
  }

  private openDrawer(idx: number): void {
    this.drawerRoom = idx;
  }
  private closeDrawer = (): void => {
    this.drawerRoom = null;
  };

  // ── Drawer (modal bottom sheet, native <dialog>) ─────────────────

  private renderDrawer() {
    // Render the <dialog> unconditionally so its DOM reference is
    // always available for showModal()/close() imperatively. The
    // body is only populated when a room is selected, to avoid
    // re-running per-light/cover rendering when nothing's open.
    const idx = this.drawerRoom;
    const room = idx != null ? this.rooms[idx] : undefined;
    return html`
      <dialog
        class="drawer"
        @close=${this.closeDrawer}
        @click=${this.onDialogClick}
      >
        ${room
          ? html`
              <div class="drawer-handle"></div>
              <div class="drawer-head">
                <span class="room-icon">${room.icon}</span>
                <span class="drawer-title">${room.name}</span>
                <button
                  class="drawer-close"
                  @click=${this.closeDrawer}
                  aria-label="Chiudi"
                >
                  ✕
                </button>
              </div>
              <div class="drawer-body">
                ${this.renderClimateRow(room)}
                ${this.renderDrawerOpenings(room)}
                ${!room.climate &&
                room.lights.length === 0 &&
                room.covers.length === 0
                  ? html`<div class="qc-row-sub">
                      Nessun dispositivo configurato.
                    </div>`
                  : nothing}
                ${room.lights.map((l) => this.renderLightRow(l))}
                ${room.covers.map((c) => this.renderCoverRow(c))}
              </div>
            `
          : nothing}
      </dialog>
    `;
  }

  /**
   * Native `<dialog>` doesn't fire a "backdrop click" event of its own.
   * We mimic it: when the click target IS the dialog (i.e. the user hit
   * the area outside the dialog's content rect — that area belongs to
   * the dialog node itself in modal mode), close.
   */
  private onDialogClick = (e: MouseEvent): void => {
    const d = this.drawerEl;
    if (!d) return;
    if (e.target !== d) return; // a click inside the inner content
    const rect = d.getBoundingClientRect();
    const inside =
      e.clientX >= rect.left &&
      e.clientX <= rect.right &&
      e.clientY >= rect.top &&
      e.clientY <= rect.bottom;
    if (!inside) this.closeDrawer();
  };

  /**
   * Compact thermostat block rendered at the top of the room drawer
   * when the room has a `climate` entity. Reads everything (current
   * temp, humidity, mode, fan, setpoint range) from the climate
   * proxy via `deriveThermostatView` — single source of truth, same
   * as the wall display and the XL drawer.
   *
   * The whole block is tinted by the variant accent (heating →
   * orange, cooling → blue, idle → green, off → grey) via the
   * `--cow-accent-surface` and `--cow-accent-primary` CSS variables
   * pushed onto the element's inline style.
   *
   * Returns `nothing` when the room has no climate entity (Studio
   * Alessio, Esterno, Servizi…) — the drawer falls back to the
   * lights + covers layout alone.
   */
  private renderClimateRow(room: NormalizedRoom) {
    if (!room.climate) return nothing;
    const entity = room.climate;
    const ent = this.getEnt(entity);
    if (!ent) return nothing;
    const view = deriveThermostatView(ent);
    const accent = THERMOSTAT_ACCENT[view.variant];
    const fmt = (n: number, unit: string) =>
      `${n.toFixed(1).replace(/\.0$/, "")}${unit}`;
    const cur = view.current != null ? fmt(view.current, "°") : "—";
    const tgt = view.target != null ? fmt(view.target, "°") : "—";
    const arrowsDisabled = view.variant === "off";
    const upT = bumpTarget(view, 1);
    const downT = bumpTarget(view, -1);
    // Sit the variant accent on the host of THIS element. The style
    // bind in template strings can't push to the host directly, so
    // we wrap the block in a <div> that owns the CSS vars.
    const accentVars = `--cow-accent-surface:${accent.surface};--cow-accent-primary:${accent.primary};`;
    return html`
      <div class="qc-climate" style=${accentVars}>
        <div class="qc-climate-head">
          <span aria-hidden="true">🌡</span>
          <span class="status">
            ${THERMOSTAT_STATUS_LABEL[view.variant]} · ${THERMOSTAT_SUB_LABEL[view.variant]}
          </span>
        </div>
        <div class="qc-climate-body">
          <div class="qc-climate-cur">
            ${cur}
            ${view.humidity != null
              ? html`<span class="hum">💧 ${Math.round(view.humidity)}%</span>`
              : nothing}
          </div>
          <div class="qc-climate-set">
            <button
              class="qc-climate-bump"
              ?disabled=${arrowsDisabled}
              @click=${() =>
                !arrowsDisabled && downT != null && this.setClimateTarget(entity, downT)}
              aria-label="Diminuisci setpoint"
            >
              ▼
            </button>
            <div class="qc-climate-target">${tgt}</div>
            <button
              class="qc-climate-bump"
              ?disabled=${arrowsDisabled}
              @click=${() =>
                !arrowsDisabled && upT != null && this.setClimateTarget(entity, upT)}
              aria-label="Aumenta setpoint"
            >
              ▲
            </button>
          </div>
        </div>
        ${this.renderClimateModeChips(entity, view)}
        ${view.fanModes.length > 1
          ? this.renderClimateFanChips(entity, view)
          : nothing}
      </div>
    `;
  }

  private renderClimateModeChips(
    entity: string,
    view: ReturnType<typeof deriveThermostatView>,
  ) {
    // Modes are drawn from view.hvacModes so casa_<room> shows
    // off/heat/cool/fan_only, pavimento-only proxies (i.e. the two
    // bathrooms wrapped as floor-only) just heat/off. Order them
    // for consistent visual rhythm: off last so it sits to the right
    // like a "stop" button.
    const order: ThermostatVariant extends never ? never : string[] = [
      "heat",
      "cool",
      "fan_only",
      "off",
    ];
    const labels: Record<string, string> = {
      heat: "Heat",
      cool: "Cool",
      fan_only: "Fan",
      off: "Off",
    };
    const chips = order.filter((m) => view.hvacModes.includes(m as never));
    if (!chips.includes("off")) chips.push("off");
    return html`
      <div class="qc-climate-chiprow">
        ${chips.map(
          (m) => html`
            <button
              class="qc-climate-chip"
              ?data-active=${view.mode === m}
              @click=${() => this.setClimateMode(entity, m)}
            >
              ${labels[m] ?? m}
            </button>
          `,
        )}
      </div>
    `;
  }

  private renderClimateFanChips(
    entity: string,
    view: ReturnType<typeof deriveThermostatView>,
  ) {
    return html`
      <div class="qc-climate-chiprow">
        ${view.fanModes.map(
          (f) => html`
            <button
              class="qc-climate-chip"
              ?data-active=${view.fan === f}
              @click=${() => this.setClimateFan(entity, f)}
            >
              ${f}
            </button>
          `,
        )}
      </div>
    `;
  }

  private renderLightRow(d: CowMobileDeviceEntry) {
    const ent = this.getEnt(d.entity);
    const label = d.label ?? ent?.attributes?.friendly_name ?? d.entity;
    const on = isOn(ent);
    const dimmable = isDimmable(ent);
    const pct = brightnessPct(ent);
    return html`
      <div class="qc-row">
        <span class="qc-row-icon" aria-hidden="true">💡</span>
        <div class="qc-row-label">
          <div>${label}</div>
          <div class="qc-row-sub">
            ${on ? (dimmable ? `${pct}% accesa` : "Accesa") : "Spenta"}
          </div>
        </div>
        ${on && dimmable
          ? html`
              <div
                class="slider"
                @click=${(e: MouseEvent) => this.onSliderTap(e, d.entity)}
              >
                <div class="slider-fill" style="width:${pct}%"></div>
                <div class="slider-label">${pct}%</div>
              </div>
            `
          : nothing}
        <button
          class="toggle"
          ?data-on=${on}
          @click=${() => this.callLight(d.entity, !on)}
          aria-label=${on ? "Spegni" : "Accendi"}
        ></button>
      </div>
    `;
  }

  private onSliderTap = (e: MouseEvent, entity: string): void => {
    const target = e.currentTarget as HTMLElement;
    const rect = target.getBoundingClientRect();
    const pct = Math.max(
      0,
      Math.min(100, Math.round(((e.clientX - rect.left) / rect.width) * 100)),
    );
    this.setBrightness(entity, pct);
  };

  private renderCoverRow(d: CowMobileDeviceEntry) {
    const ent = this.getEnt(d.entity);
    const label = d.label ?? ent?.attributes?.friendly_name ?? d.entity;
    const pos = coverPos(ent);
    const state = ent?.state ?? "unknown";
    const sub =
      state === "opening"
        ? "Si sta aprendo…"
        : state === "closing"
          ? "Si sta chiudendo…"
          : pos >= 95
            ? "Aperta"
            : pos <= 5
              ? "Chiusa"
              : `${pos}% aperta`;
    return html`
      <div class="qc-row">
        <span class="qc-row-icon is-cover" aria-hidden="true">▤</span>
        <div class="qc-row-label">
          <div>${label}</div>
          <div class="qc-row-sub">${sub}</div>
        </div>
        <span class="cov-pos">${pos}%</span>
        <div class="cov-buttons">
          <button
            @click=${() => this.cover(d.entity, "open")}
            aria-label="Apri"
          >
            ▲
          </button>
          <button
            @click=${() => this.cover(d.entity, "stop")}
            aria-label="Stop"
          >
            ■
          </button>
          <button
            @click=${() => this.cover(d.entity, "close")}
            aria-label="Chiudi"
          >
            ▼
          </button>
        </div>
      </div>
    `;
  }

  /**
   * Drawer section — full list of Ajax openings for the selected room,
   * one row per device. Read-only (Ajax contacts are sensors, not
   * actuators). Hidden entirely when the room has zero openings.
   */
  private renderDrawerOpenings(room: NormalizedRoom) {
    const openings = this.roomOpenings(room);
    if (openings.length === 0) return nothing;
    return html`
      <div class="qc-section-title">Aperture</div>
      ${openings.map(
        (o) => html`
          <div class="qc-row">
            <span
              class="qc-row-icon is-opening ${o.isOpen ? "open" : "closed"}"
              aria-hidden="true"
            >
              ${openingIconSvg(o.kind, o.isOpen, 22)}
            </span>
            <div class="qc-row-label">
              <div>${o.deviceName}${o.isExtraContact ? " (extra)" : ""}</div>
              <div class="qc-row-sub">
                ${o.kind === "window"
                  ? "Finestra"
                  : o.kind === "garage"
                    ? "Porta garage"
                    : "Porta"}
              </div>
            </div>
            <span
              class="opening-state ${o.isOpen ? "is-open" : "is-closed"}"
            >
              ${o.isOpen ? "aperta" : "chiusa"}
            </span>
          </div>
        `,
      )}
    `;
  }

  // ── Summary ──────────────────────────────────────────────────────

  /**
   * Compact "N aperture — Room A, Room B" row that sits between the
   * summary headline and the action buttons. Only renders when at
   * least one Ajax opening is currently open in the house. Up to 4
   * MDI glyphs precede the text; rooms list truncates to 2 then "+M
   * altre" so it never wraps.
   */
  private renderSummaryOpenings() {
    const all = this.houseOpenings();
    const open = all.filter((o) => o.isOpen);
    if (open.length === 0) return nothing;
    const glyphs = open.slice(0, 4);
    const rooms = Array.from(
      new Set(open.map((o) => o.areaName ?? o.ajaxRoomName).filter((n): n is string => !!n)),
    );
    const headRooms = rooms.slice(0, 2).join(", ");
    const extra = rooms.length - 2;
    const roomText = headRooms + (extra > 0 ? ` +${extra} altre` : "");
    const word = open.length === 1 ? "apertura" : "aperture";
    return html`
      <div class="summary-openings">
        <span class="icons">
          ${glyphs.map((o) => openingIconSvg(o.kind, true, 18))}
        </span>
        <span>${open.length} ${word}${roomText ? ` — ${roomText}` : ""}</span>
      </div>
    `;
  }

  private renderSummary() {
    const lTotal = this.totalLightsTotal();
    const lOn = this.totalLightsOn();
    const lOff = lTotal - lOn;
    const cTotal = this.totalCoversTotal();
    const cOpen = this.totalCoversOpen();
    const cClosed = cTotal - cOpen;

    // Headline reflecting current state. When everything is at rest we
    // still show the action buttons (disabled where appropriate) so the
    // "Apri" / "Accendi" verbs are reachable without first changing
    // something else.
    let headline: string;
    if (lOn === 0 && cOpen === 0) {
      headline = "Tutto spento e chiuso 🌙";
    } else {
      const parts: string[] = [];
      if (lOn > 0)
        parts.push(`${lOn} ${lOn === 1 ? "luce accesa" : "luci accese"}`);
      if (cOpen > 0)
        parts.push(
          `${cOpen} ${cOpen === 1 ? "tapparella aperta" : "tapparelle aperte"}`,
        );
      headline = parts.join(" · ");
    }

    const hasLights = lTotal > 0;
    const hasCovers = cTotal > 0;

    return html`
      <div class="summary">
        <div class="summary-text">${headline}</div>
        ${this.renderSummaryOpenings()}
        ${hasLights
          ? html`
              <div class="summary-actions">
                <button
                  data-accent
                  ?disabled=${lOn === 0}
                  @click=${() => this.allLights(false)}
                >
                  Spegni tutte
                </button>
                <button
                  data-accent-soft
                  ?disabled=${lOff === 0}
                  @click=${() => this.allLights(true)}
                >
                  Accendi tutte
                </button>
              </div>
            `
          : nothing}
        ${hasCovers
          ? html`
              <div class="summary-actions">
                <button
                  data-cov
                  ?disabled=${cOpen === 0}
                  @click=${() => this.allCovers(false)}
                >
                  Chiudi tutte
                </button>
                <button
                  data-cov-soft
                  ?disabled=${cClosed === 0}
                  @click=${() => this.allCovers(true)}
                >
                  Apri tutte
                </button>
              </div>
            `
          : nothing}
      </div>
    `;
  }

}

const ALARM_STATE_LABEL: Record<string, string> = {
  disarmed: "Disinserito",
  armed_home: "In casa",
  armed_away: "Fuori casa",
  armed_night: "Notte",
  armed_vacation: "Vacanza",
  armed_custom_bypass: "Personalizzato",
  pending: "In attesa…",
  triggered: "ALLARME",
  arming: "Inserimento…",
  disarming: "Disinserimento…",
} as const;

window.customCards = window.customCards ?? [];
if (!window.customCards.some((c) => c.type === "cow-mobile-dashboard-card")) {
  window.customCards.push({
    type: "cow-mobile-dashboard-card",
    name: "Cave of Wonders Mobile Dashboard",
    description:
      "Single-card home dashboard for the HA companion app — clock, room grid with inline quick-control, summary chip, music ribbon, alarm.",
    preview: false,
  });
}
