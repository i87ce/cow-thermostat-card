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
 *   │ 2-col grid of room tiles   │  Tap a tile = open the modal
 *   │  (icon + name + temp +     │  Quick Control drawer for that
 *   │   humid + active badge)    │  room.
 *   ├────────────────────────────┤
 *   │ Summary chip + 4 actions   │  "N luci accese · M tapparelle"
 *   │ [Spegni/Accendi luci]      │  with whole-house quick actions.
 *   │ [Chiudi/Apri tapparelle]   │
 *   └────────────────────────────┘
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
  outdoor_temp?: string;
  alarm?: string;
  /**
   * `person.*` entities shown as presence chips in the hero. Strings
   * are accepted as a shorthand; pass `{ entity, label }` to override
   * the short name (default uses the friendly_name's first word).
   */
  persons?: Array<string | CowMobilePersonEntry>;
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
  };
}

// ─────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────

/**
 * Pick a hero gradient by sun elevation. The thresholds mirror the
 * civil-twilight angles used in the XL `cow-xl-hero`: above +6° is
 * full day, +6° → −6° is golden hour / dusk, below −6° is night.
 */
function heroGradient(elevation: number | null): { from: string; to: string; text: string } {
  if (elevation == null) return DAY;
  if (elevation > 6) return DAY;
  if (elevation > -6) return SUNSET;
  return NIGHT;
}
const DAY = { from: "#4cb8ff", to: "#a3dfff", text: "#0c2b4a" } as const;
const SUNSET = { from: "#ff8a4c", to: "#ffd166", text: "#3d1f0a" } as const;
const NIGHT = { from: "#0f1640", to: "#2a2a55", text: "#e8ecff" } as const;

const DOW_IT = ["Dom", "Lun", "Mar", "Mer", "Gio", "Ven", "Sab"];
const MONTH_IT = ["Gen", "Feb", "Mar", "Apr", "Mag", "Giu", "Lug", "Ago", "Set", "Ott", "Nov", "Dic"];
function formatDate(d: Date): string {
  return `${DOW_IT[d.getDay()]} ${d.getDate()} ${MONTH_IT[d.getMonth()]}`;
}
function formatClock(d: Date): string {
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

const WEATHER_ICONS: Record<string, string> = {
  "clear-night": "🌙",
  cloudy: "☁",
  exceptional: "⚠",
  fog: "🌫",
  hail: "🌨",
  lightning: "⚡",
  "lightning-rainy": "⛈",
  partlycloudy: "⛅",
  pouring: "🌧",
  rainy: "🌦",
  snowy: "❄",
  "snowy-rainy": "🌨",
  sunny: "🌞",
  windy: "🌬",
  "windy-variant": "🌬",
} as const;

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
  @state() private now = new Date();
  private clockTimer?: number;
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

  override connectedCallback(): void {
    super.connectedCallback();
    // Re-render the clock every 20 s. Cheap, keeps the hero accurate.
    this.clockTimer = window.setInterval(() => {
      this.now = new Date();
    }, 20_000);
  }
  override disconnectedCallback(): void {
    super.disconnectedCallback();
    if (this.clockTimer) window.clearInterval(this.clockTimer);
  }

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
      .hero {
        position: relative;
        padding: 28px 22px 26px;
        border-radius: 24px;
        background: linear-gradient(160deg, var(--hero-from), var(--hero-to));
        color: var(--hero-text, #1f1f2e);
        overflow: hidden;
        margin: 0 8px;
        box-shadow: 0 4px 16px rgba(31, 31, 46, 0.08);
      }
      .hero-clock {
        font-weight: 200;
        font-size: 64px;
        line-height: 1;
        letter-spacing: -2px;
        margin: 0;
      }
      .hero-row {
        display: flex;
        align-items: baseline;
        gap: 10px;
        margin-top: 10px;
        font-size: 15px;
        font-weight: 500;
        opacity: 0.85;
      }
      .hero-row .dot {
        opacity: 0.5;
      }
      .hero-weather {
        font-size: 18px;
      }

      /* ── Hero: people & alarm chips ──────────────────────────── */
      .hero-persons {
        display: flex;
        flex-wrap: wrap;
        gap: 6px;
        margin-top: 16px;
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
        margin-top: 10px;
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
        gap: 6px;
        min-height: 18px;
      }
      .badge {
        display: inline-flex;
        align-items: center;
        gap: 4px;
        font-size: 11px;
        font-weight: 600;
        padding: 2px 7px;
        border-radius: 999px;
        background: var(--cow-mobile-badge-bg, rgba(31, 31, 46, 0.08));
        color: var(--cow-mobile-badge-fg, #1f1f2e);
      }
      .badge.on {
        background: rgba(255, 199, 46, 0.18);
        color: #b87b0a;
      }
      .badge.cov {
        background: rgba(76, 184, 255, 0.18);
        color: #0a6699;
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
      .qc-row-label {
        flex: 1;
        font-size: 14px;
        font-weight: 500;
      }
      .qc-row-sub {
        font-size: 12px;
        opacity: 0.6;
        font-weight: 400;
      }
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
    return html`
      <div class="card">
        ${this.renderHero()} ${this.renderRooms()} ${this.renderSummary()}
      </div>
      ${this.renderDrawer()}
    `;
  }

  // ── Hero ─────────────────────────────────────────────────────────

  private renderHero() {
    const sun = this.getEnt(this.config?.sun);
    const elevation = (sun?.attributes?.elevation as number | undefined) ?? null;
    const grad = heroGradient(elevation);

    const weather = this.getEnt(this.config?.weather);
    const wIcon = weather ? WEATHER_ICONS[weather.state] ?? "" : "";
    const wTempRaw = weather?.attributes?.temperature as number | undefined;
    const wTemp = typeof wTempRaw === "number" ? `${Math.round(wTempRaw)}°` : "";

    return html`
      <div
        class="hero"
        style="--hero-from:${grad.from}; --hero-to:${grad.to}; --hero-text:${grad.text}"
      >
        <div class="hero-clock">${formatClock(this.now)}</div>
        <div class="hero-row">
          <span>${formatDate(this.now)}</span>
          ${wTemp
            ? html`<span class="dot">·</span>
                <span class="hero-weather">${wIcon} ${wTemp}</span>`
            : nothing}
        </div>
        ${this.renderHeroPersons()} ${this.renderHeroAlarm()}
      </div>
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
          ${lOn > 0 ? html`<span class="badge on">💡 ${lOn}</span>` : nothing}
          ${cOpen > 0
            ? html`<span class="badge cov">▤ ${cOpen}</span>`
            : nothing}
        </div>
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
                ${room.lights.length === 0 && room.covers.length === 0
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

  private renderLightRow(d: CowMobileDeviceEntry) {
    const ent = this.getEnt(d.entity);
    const label = d.label ?? ent?.attributes?.friendly_name ?? d.entity;
    const on = isOn(ent);
    const dimmable = isDimmable(ent);
    const pct = brightnessPct(ent);
    return html`
      <div class="qc-row">
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

  // ── Summary ──────────────────────────────────────────────────────

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
