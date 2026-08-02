import { LitElement, html, css } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import type { HomeAssistant, HassEntity } from "../../types/hass.js";
import {
  aggregateLightsView,
  brightnessFromPct,
  deriveLightsView,
  isDimmable,
  type LightsVariant,
  type LightsView,
} from "../state/lights.js";
import type { DeviceEntry, OpeningKind } from "../config.js";
import { panelStyles } from "../styles/shell.js";
import { animKeyframes, animTokens, colorTransition } from "../styles/anim.js";
import { formatTime } from "../../utils/format.js";

import "../components/light-tile.js";
import "../visuals/bulb-visual.js";

interface AccentSet {
  primary: string;
  light: string;
  active: string;
  surface: string;
}

const ACCENT: Record<LightsVariant, AccentSet> = {
  bright: {
    primary: "#ffc72e",
    light: "#ffd966",
    active: "#e6b329",
    surface: "linear-gradient(180deg,#ffe066 0%,#ffc72e 100%)",
  },
  dim: {
    primary: "#cc9933",
    light: "#e6b34d",
    active: "#996b1a",
    surface: "linear-gradient(180deg,#d19c2e 0%,#a87e23 100%)",
  },
  off: {
    primary: "#6b6b73",
    light: "#a5a5ad",
    active: "#5e5e66",
    surface: "linear-gradient(180deg,#4d4d54 0%,#6b6b73 100%)",
  },
  night: {
    primary: "#5b6bc5",
    light: "#7b8fe0",
    active: "#3d4a99",
    surface: "linear-gradient(180deg,#3a2f54 0%,#1f1633 100%)",
  },
};

const STATUS: Record<LightsVariant, string> = {
  bright: "ON",
  dim: "ON",
  off: "OFF",
  night: "ON",
};

/** Tap-vs-drag threshold in real (post-scale) pixels. */
const TAP_THRESHOLD_PX = 8;
/**
 * Fraction of the visible left-panel height that maps to a full 0→100
 * brightness sweep. 0.6 means dragging across ~60% of the panel covers
 * the entire range — comfortable for a thumb-sized swipe, leaves slack
 * at the edges so users can't accidentally lock to 0 or 100.
 */
const DRAG_RANGE_RATIO = 0.6;

/**
 * `cow-lights-panel` — Figma "Proposta B" small Lights card.
 *
 *  +--------------------+--------------------+
 *  |                    | Soggiorno   14:32  |
 *  |     💡 (glow)      | 4 luci · 1 dimmer  |
 *  |                    | Apparecchi  TUTTE  |
 *  |   ON               | +-------+-------+  |
 *  |   72 %             | |Soff.  |Tavolo |  |
 *  |   Tutte (media)    | +-------+-------+  |
 *  |                    | |LED    |Lamp.  |  |
 *  |  Tap = on/off      | +-------+-------+  |
 *  |  Swipe ↕ = dimmer  | [Tutte (master)]   |
 *  +--------------------+--------------------+
 *
 * Interaction model:
 *   - Tap on the yellow left panel → toggle on/off on the current scope
 *   - Swipe ↕ on the left panel    → brightness (only if scope dimmable)
 *   - Tap on a tile                → set that light as the scope
 *   - Tap on the master button     → set scope = whole group
 *
 * Dimmer-awareness:
 *   - `setBrightness` only fans out `brightness:` to dimmable entities;
 *     pure on/off bulbs in the same scope are turned on/off without it.
 *   - When the scope contains zero dimmers, the swipe gesture is inert
 *     and the big number is replaced by `ON`/`OFF`.
 */
@customElement("cow-lights-panel")
export class CowLightsPanel extends LitElement {
  @property({ attribute: false }) hass?: HomeAssistant;
  @property({ type: Array }) devices: DeviceEntry[] = [];
  @property({ type: String }) roomName = "";

  /* ─── Ajax openings (forwarded from card config) ──────────────── */
  @property({ type: Array }) areas: string[] = [];
  @property({ type: String }) openingDefaultKind?: OpeningKind;
  @property({ type: Array }) openingDoors: string[] = [];
  @property({ type: Array }) openingWindows: string[] = [];
  @property({ type: Array }) openingGarages: string[] = [];
  @property({ type: Array }) openingEntities: string[] = [];
  @property({ type: Array }) openingExcludeDevices: string[] = [];
  @property({ type: Boolean }) openingsEnabled = true;
  /** "all" | entity_id of a single light */
  @state() private scope: string = "all";
  @state() private now = new Date();
  /** Optimistic value while dragging the left-panel surface. */
  @state() private dragPct: number | null = null;
  /**
   * Y position of the touch in internal (720×720) panel coordinates,
   * tracked only while a drag is in progress. Drives the fingertip
   * indicator overlay so the user gets feedback that the gesture is
   * being captured even when their finger covers the dot itself.
   */
  @state() private dragTouchY: number | null = null;
  private timer?: number;

  private dragStartY: number | null = null;
  private dragStartPct = 0;
  private dragMoved = false;

  static override styles = [
    animTokens,
    animKeyframes,
    panelStyles,
    css`
      .left {
        background: var(--cow-accent-surface);
        ${colorTransition}
        z-index: 0;
        cursor: pointer;
        /* Prevent the browser from claiming vertical pan gestures so
           our pointermove handler can drive the brightness slider. */
        touch-action: none;
        -webkit-user-select: none;
        user-select: none;
      }
      .right {
        z-index: 0;
      }
      /* IMPORTANT: do NOT include .grid / .master in this disabler.
         A previous version was ":not(.left):not(.right)" and that
         disabled pointer events on .grid too — because the negation
         chain has higher specificity (0,3,0) than ":host > .grid"
         (0,2,0), the later auto-override silently lost the cascade.
         Result: tap on a tile bubbled to the underlying .right base,
         not to the tile click handler. */
      :host > :not(.left):not(.right):not(.grid):not(.master) {
        z-index: 1;
        pointer-events: none;
      }
      :host > .grid,
      :host > .master {
        z-index: 1;
        pointer-events: auto;
      }
      .bulb-wrap {
        position: absolute;
        left: 67.5px;
        top: 95px;
        width: 225px;
        height: 225px;
      }
      .status {
        position: absolute;
        left: 45px;
        top: 320px;
        font-weight: 500;
        font-size: 20.625px;
        letter-spacing: 4.6875px;
        color: var(--cow-on-accent, #fff);
        opacity: 0.7;
      }
      .pct {
        position: absolute;
        left: 37.5px;
        top: 350px;
        font-weight: 300;
        font-size: 105px;
        line-height: 1;
        letter-spacing: 0;
        color: var(--cow-on-accent, #fff);
      }
      .sub {
        position: absolute;
        left: 45px;
        top: 474px;
        font-weight: 400;
        font-size: 22.5px;
        color: var(--cow-on-accent, #fff);
        opacity: 0.6;
      }

      .hint {
        position: absolute;
        left: 40px;
        top: 557px;
        width: 272px;
        height: 71px;
        background: rgba(0, 0, 0, 0.18);
        border-radius: 24px;
        padding: 10px 20px;
        box-sizing: border-box;
        color: var(--cow-on-accent, #fff);
        transition: opacity var(--cow-dur-base) var(--cow-ease-out);
      }
      .hint.dragging {
        /* Recede into the background while the user is performing the
           gesture — keeps the hint readable as context but stops it
           competing with the live % and fingertip indicator. */
        opacity: 0.55;
      }
      .hint-tap {
        font-weight: 600;
        font-size: 19px;
        line-height: 1.4;
      }
      .hint-swipe {
        font-weight: 400;
        font-size: 16px;
        line-height: 1.4;
        opacity: 0.85;
      }
      .hint-swipe.inactive {
        opacity: 0.45;
      }

      .fingertip {
        position: absolute;
        left: 150px;
        width: 60px;
        height: 60px;
        border-radius: 50%;
        background: rgba(255, 255, 255, 0.35);
        pointer-events: none;
        /* Smoothly trail the finger as it moves; 80ms is short enough
           to feel responsive but long enough to avoid jitter from
           noisy pointer events on cheap touch panels. */
        transition: top 80ms linear, opacity var(--cow-dur-base) var(--cow-ease-out);
      }
      .fingertip-arrow {
        position: absolute;
        left: 220px;
        font-weight: 400;
        font-size: 28px;
        line-height: 1;
        color: rgba(255, 255, 255, 0.6);
        pointer-events: none;
        transition: top 80ms linear, opacity var(--cow-dur-base) var(--cow-ease-out);
      }

      .room {
        position: absolute;
        left: 397.5px;
        top: 52.5px;
        /* Stretched from 200 → 235 to fit "Camera Padronale" without
           ellipsis. The right edge now butts up against the time text,
           which is right-anchored so the layout stays locale-safe
           (12h vs 24h time strings don't shift the room name). */
        max-width: 235px;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        font-weight: 600;
        font-size: 26.25px;
        color: var(--cow-text-room-name, #262633);
      }
      .time {
        position: absolute;
        right: 30px;
        top: 56.25px;
        font-weight: 600;
        font-size: 24.375px;
        color: var(--cow-text-time, #666673);
      }
      .device-sub {
        position: absolute;
        left: 397.5px;
        top: 90px;
        font-weight: 400;
        font-size: 22px;
        color: var(--cow-text-secondary, #8c8c99);
      }

      .apparecchi {
        position: absolute;
        left: 397.5px;
        /* Pulled 12 px up from the previous 145px so the grid sits
           closer to the room-name block and there's less dead space
           visually concentrating the controls in the upper half. */
        top: 133px;
        font-weight: 400;
        font-size: 14px;
        color: var(--cow-text-secondary, #737380);
      }
      .scope-active {
        position: absolute;
        right: 17px;
        top: 133px;
        font-weight: 700;
        font-size: 14px;
        letter-spacing: 1.5px;
        text-transform: uppercase;
        color: var(--cow-accent, #1f1f2e);
        text-align: right;
        ${colorTransition}
      }

      .grid {
        position: absolute;
        left: 383px;
        /* Moved up from 180 → 162 so the first tile row sits ~12 px
           below the "Apparecchi" header (was ~18 px gap, felt floaty). */
        top: 162px;
        width: 320px;
        display: grid;
        grid-template-columns: 154px 154px;
        column-gap: 12px;
        row-gap: 10px;
      }
      .grid > cow-light-tile {
        height: 80px;
      }

      .master {
        position: absolute;
        left: 383px;
        top: var(--cow-master-top, 470px);
        width: 320px;
        height: 56px;
        border: 0;
        margin: 0;
        padding: 0;
        font: inherit;
        font-family: inherit;
        font-weight: 700;
        font-size: 18px;
        border-radius: 18px;
        background: var(--cow-surface-button-bg, #f5f5f7);
        color: var(--cow-text-button-muted, #595966);
        cursor: pointer;
        ${colorTransition}
      }
      .master.active {
        background: var(--cow-master-active-bg, #2e2e38);
        color: #fff;
      }
      .master:active {
        transform: scale(0.985);
      }
    `,
  ];

  override connectedCallback(): void {
    super.connectedCallback();
    this.timer = window.setInterval(() => (this.now = new Date()), 30_000);
  }
  override disconnectedCallback(): void {
    super.disconnectedCallback();
    if (this.timer) window.clearInterval(this.timer);
  }

  private getEntity(id?: string): HassEntity | undefined {
    if (!id || !this.hass) return undefined;
    return this.hass.states[id];
  }

  private targets(): string[] {
    if (this.scope === "all") return this.devices.map((d) => d.entity);
    return [this.scope];
  }

  /** Return the subset of `targets()` that can accept `brightness:`. */
  private dimmerTargets(): string[] {
    return this.targets().filter((id) => isDimmable(this.getEntity(id)));
  }

  private view(): LightsView {
    if (this.devices.length === 0) {
      return { variant: "off", brightnessPct: 0, raw: "unavailable", dimmable: false };
    }
    if (this.scope === "all") {
      return aggregateLightsView(
        this.devices.map((d) => this.getEntity(d.entity)),
      );
    }
    return deriveLightsView(this.getEntity(this.scope));
  }

  /** Number of dimmable entities in the full group (used in device-sub). */
  private groupDimmerCount(): number {
    let n = 0;
    for (const d of this.devices) {
      if (isDimmable(this.getEntity(d.entity))) n++;
    }
    return n;
  }

  private deviceSubText(): string {
    if (this.devices.length === 0) return "";
    if (this.devices.length === 1) return this.devices[0].label;
    const dimmers = this.groupDimmerCount();
    return dimmers > 0
      ? `${this.devices.length} luci · ${dimmers} dimmer`
      : `${this.devices.length} luci`;
  }

  private subText(v: LightsView): string {
    if (v.variant === "off") return "Light is off";
    if (!v.dimmable) return "On / off only";
    if (this.scope === "all") return "Tutte (media dimmer)";
    const dev = this.devices.find((d) => d.entity === this.scope);
    return dev ? `${dev.label} attiva` : "";
  }

  private activeScopeLabel(): string {
    if (this.scope === "all") return "Tutte";
    const dev = this.devices.find((d) => d.entity === this.scope);
    return dev ? dev.label : "—";
  }

  override willUpdate(): void {
    const v = this.view();
    const a = ACCENT[v.variant];
    this.style.setProperty("--cow-accent", a.primary);
    this.style.setProperty("--cow-accent-light", a.light);
    this.style.setProperty("--cow-accent-active", a.active);
    this.style.setProperty("--cow-accent-surface", a.surface);
    // Compute master button top position so it always sits below the grid.
    // Origin (162) must match the `.grid { top: ... }` CSS rule above.
    const n = this.devices.length;
    const rows = Math.max(1, Math.ceil(n / 2));
    const gridBottom = 162 + rows * 80 + (rows - 1) * 10;
    this.style.setProperty("--cow-master-top", `${gridBottom + 20}px`);

    // ── Optimistic dragPct cleanup ────────────────────────────────────
    // When `dragPct` is non-null we're holding an optimistic value
    // committed by the last drag gesture. HA accepts the service call
    // in ~100 ms but the *state* echo via WS comes only after the
    // bulb has physically confirmed (~300-700 ms on Zigbee). If we
    // clear dragPct when the service Promise resolves, the panel
    // briefly snaps back to v.brightnessPct (still the OLD value) and
    // the user reads that as "my value wasn't taken". So instead we
    // wait here, every render, until v.brightnessPct catches up to
    // our committed value (±1 pt for rounding), then clear dragPct
    // — at which point there's no visible jump because the two are
    // already equal.
    if (this.dragPct != null && Math.abs(v.brightnessPct - this.dragPct) <= 1) {
      this.dragPct = null;
    }
  }

  private async setBrightness(pct: number): Promise<void> {
    if (!this.hass) return;
    const all = this.targets();
    if (all.length === 0) return;
    // Drag to zero = turn the whole scope off (both dimmers and on/off).
    if (pct === 0) {
      await this.hass.callService("light", "turn_off", {}, { entity_id: all });
      return;
    }
    const dimmable = this.dimmerTargets();
    if (dimmable.length === 0) {
      // Scope has no dimmer entities — fall back to a plain turn_on so
      // the gesture isn't completely inert (rare: would mean the user
      // managed to drag on a non-dimmer scope, which the UI normally
      // prevents, but we still want a safe fallback).
      await this.hass.callService("light", "turn_on", {}, { entity_id: all });
      return;
    }
    await this.hass.callService(
      "light",
      "turn_on",
      { brightness: brightnessFromPct(pct) },
      { entity_id: dimmable },
    );
  }

  private async toggle(): Promise<void> {
    if (!this.hass) return;
    const t = this.targets();
    if (t.length === 0) return;
    const v = this.view();
    const turnOn = v.variant === "off";
    await this.hass.callService(
      "light",
      turnOn ? "turn_on" : "turn_off",
      {},
      { entity_id: t },
    );
  }

  /**
   * Map a real-pixel `clientY` to the panel's 0..720 internal Y axis.
   * The host applies a `transform: scale(--cow-scale)` from the shell;
   * `getBoundingClientRect().height` already reflects that scale, so we
   * can derive the internal Y from a simple ratio.
   */
  private toInternalY(clientY: number, rect: DOMRect): number {
    if (rect.height <= 0) return 0;
    const ratio = (clientY - rect.top) / rect.height;
    return Math.max(30, Math.min(690, ratio * 720));
  }

  private onLeftPointerDown = (e: PointerEvent): void => {
    const target = e.currentTarget as HTMLElement;
    target.setPointerCapture(e.pointerId);
    // A fresh gesture starts from the current *real* HA state. Any
    // leftover optimistic dragPct from a previous commit that never
    // got echoed back (e.g. on a degraded kiosk WebSocket) gets
    // discarded here — otherwise we'd anchor the new gesture to a
    // stale optimistic baseline and the user would feel the panel
    // "jumping" between values.
    this.dragPct = null;
    this.dragStartY = e.clientY;
    this.dragStartPct = this.view().brightnessPct;
    this.dragMoved = false;
    // We don't set dragTouchY yet — only once the gesture crosses the
    // tap threshold and becomes an actual drag. Otherwise every tap
    // would briefly flash the fingertip indicator.
  };

  private onLeftPointerMove = (e: PointerEvent): void => {
    if (this.dragStartY == null) return;
    const dy = this.dragStartY - e.clientY; // up = positive (brighter)
    if (!this.dragMoved && Math.abs(dy) > TAP_THRESHOLD_PX) {
      this.dragMoved = true;
    }
    if (!this.dragMoved) return;
    if (!this.view().dimmable) return; // swipe inert on non-dimmer scope
    const target = e.currentTarget as HTMLElement;
    const rect = target.getBoundingClientRect();
    const range = Math.max(60, rect.height * DRAG_RANGE_RATIO);
    const deltaP = Math.round((dy / range) * 100);
    const next = Math.max(0, Math.min(100, this.dragStartPct + deltaP));
    this.dragPct = next;
    this.dragTouchY = this.toInternalY(e.clientY, rect);
  };

  private finalizeGesture(e: PointerEvent, cancelled: boolean): void {
    if (this.dragStartY == null) return;
    const target = e.currentTarget as HTMLElement;
    try {
      target.releasePointerCapture(e.pointerId);
    } catch {
      /* pointer may already have been released by the browser */
    }

    const wasMoved = this.dragMoved;
    const pendingPct = this.dragPct;
    const wasDimmable = this.view().dimmable;

    this.dragTouchY = null;
    this.dragStartY = null;
    this.dragMoved = false;

    if (wasMoved && wasDimmable && pendingPct != null) {
      // Commit the drag — keep `dragPct` set as the optimistic UI
      // value forever until either (a) `willUpdate` sees
      // `v.brightnessPct` catch up to it (HA state echo via WS), or
      // (b) the next pointerdown starts a new gesture and clears it.
      // NO safety timer: on a kiosk Wall Display the WebSocket can be
      // slow or temporarily silent, and we'd rather show the user's
      // committed value indefinitely than snap back to the pre-drag
      // state because of a missed echo.
      void this.setBrightness(pendingPct);
    } else {
      this.dragPct = null;
      // Only toggle on a clean release (not on system-level cancel).
      // A `pointercancel` for a tap-shaped gesture is usually a
      // touch-driver quirk; we don't want it to flip the light by
      // accident.
      if (!wasMoved && !cancelled) {
        void this.toggle();
      }
    }
  }

  private onLeftPointerUp = (e: PointerEvent): void => {
    this.finalizeGesture(e, false);
  };

  // Some touch panels (notably the MTK6580 Chromium on the Shelly Wall
  // Display) deliver a `pointercancel` where a regular `pointerup`
  // would be expected at the end of a drag. Previously we discarded
  // `dragPct` on cancel, so every drag on those panels looked like it
  // "snapped back" to the pre-drag value. Treat cancel as up for
  // committed drags — for tap-shaped cancels we still skip the toggle
  // (see `finalizeGesture`).
  private onLeftPointerCancel = (e: PointerEvent): void => {
    this.finalizeGesture(e, true);
  };

  private onTileSelect = (e: CustomEvent<{ id: string }>): void => {
    this.scope = e.detail.id;
  };

  private onMasterSelect = (): void => {
    this.scope = "all";
  };

  private tileState(ent: HassEntity | undefined, dimmer: boolean): string {
    if (!ent || ent.state !== "on") return "OFF";
    if (!dimmer) return "ON";
    const view = deriveLightsView(ent);
    return `${view.brightnessPct}% · dim`;
  }

  override render() {
    const v = this.view();
    const pct = this.dragPct != null ? this.dragPct : v.brightnessPct;
    const showAsToggle = !v.dimmable;
    const pctDisplay = showAsToggle
      ? v.variant === "off"
        ? "OFF"
        : "ON"
      : `${pct}%`;
    // While a drag is in progress, replace the contextual sub with an
    // explicit progress label so the user understands the % they see
    // is provisional. The actual commit happens on pointerup.
    const dragging = this.dragPct != null;
    const sub = dragging ? "Drag in corso" : this.subText(v);
    const swipeLabel = v.dimmable ? "Swipe ↕ = dimmer" : "Swipe ↕ non attivo";

    const hasGrid = this.devices.length > 1;

    return html`
      <div
        class="left"
        @pointerdown=${this.onLeftPointerDown}
        @pointermove=${this.onLeftPointerMove}
        @pointerup=${this.onLeftPointerUp}
        @pointercancel=${this.onLeftPointerCancel}
      ></div>
      <div class="right"></div>

      <div class="bulb-wrap">
        <cow-bulb-visual
          .variant=${v.variant}
          .brightnessPct=${pct}
          ?dragging=${dragging}
        ></cow-bulb-visual>
      </div>
      <div class="status">${STATUS[v.variant]}</div>
      <div class="pct">${pctDisplay}</div>
      <div class="sub">${sub}</div>

      <div class="hint ${dragging ? "dragging" : ""}">
        <div class="hint-tap">Tap = on / off</div>
        <div class="hint-swipe ${showAsToggle ? "inactive" : ""}">${swipeLabel}</div>
      </div>

      ${dragging && this.dragTouchY != null
        ? html`
            <div
              class="fingertip"
              style="top: ${this.dragTouchY - 30}px"
            ></div>
            <div
              class="fingertip-arrow"
              style="top: ${this.dragTouchY - 17}px"
            >
              ↕
            </div>
          `
        : ""}

      <div class="room">${this.roomName}</div>
      <div class="time">${formatTime(this.now, this.hass?.locale?.language)}</div>
      <div class="device-sub">${this.deviceSubText()}</div>

      ${hasGrid
        ? html`
            <div class="apparecchi">Apparecchi</div>
            <div class="scope-active">${this.activeScopeLabel()}</div>
            <div class="grid">
              ${this.devices.map((d) => {
                const ent = this.getEntity(d.entity);
                const dimmer = isDimmable(ent);
                const isOn = ent?.state === "on";
                return html`
                  <cow-light-tile
                    .tileId=${d.entity}
                    .label=${d.label}
                    .state=${this.tileState(ent, dimmer)}
                    ?isOn=${isOn}
                    ?isDimmer=${dimmer}
                    ?selected=${this.scope === d.entity}
                    @cow-tile-select=${this.onTileSelect}
                  ></cow-light-tile>
                `;
              })}
            </div>
            <button
              class="master ${this.scope === "all" ? "active" : ""}"
              @click=${this.onMasterSelect}
            >
              ${this.scope === "all"
                ? "Tutte (master) — ATTIVO"
                : "Tutte (master)"}
            </button>
          `
        : ""}
    `;
  }
}
