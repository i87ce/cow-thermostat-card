import { LitElement, html, css, svg } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import type { HomeAssistant, HassEntity } from "../../types/hass.js";
import type { DeviceEntry } from "../config.js";
import { panelStyles } from "../styles/shell.js";
import { animKeyframes, animTokens, colorTransition } from "../styles/anim.js";
import { formatTime } from "../../utils/format.js";

import "../components/light-tile.js";

interface AccentSet {
  primary: string;
  light: string;
  active: string;
  surface: string;
}

/** Violet accent when at least one TV is on, neutral grey otherwise. */
const ACCENT: Record<"on" | "off", AccentSet> = {
  on: {
    primary: "#8c6be0",
    light: "#a58cf0",
    active: "#6b4fc0",
    surface: "linear-gradient(180deg,#9a7af0 0%,#6b4fc0 100%)",
  },
  off: {
    primary: "#6b6b73",
    light: "#a5a5ad",
    active: "#5e5e66",
    surface: "linear-gradient(180deg,#4d4d54 0%,#6b6b73 100%)",
  },
};

/** MDI "television-classic" — big left-pane glyph. */
const TV_ICON = svg`<svg
  viewBox="0 0 24 24"
  width="225"
  height="225"
  fill="currentColor"
  aria-hidden="true"
>
  <path
    d="M21,17H3V5H21M21,3H3A2,2 0 0,0 1,5V17A2,2 0 0,0 3,19H8V21H16V19H21A2,2 0 0,0 23,17V5A2,2 0 0,0 21,3Z"
  />
</svg>`;

/** States that count as "the TV is on" for a media_player. */
function tvIsOn(ent: HassEntity | undefined): boolean {
  if (!ent) return false;
  return !["off", "unavailable", "unknown", "standby"].includes(ent.state);
}

type DoorFeedback = "opening" | "done";

/**
 * `cow-extras-panel` — "Comandi" tab: on/off tiles for the room's TVs
 * plus an optional wide door-open button.
 *
 *  +--------------------+--------------------+
 *  |                    | Studio      21:41  |
 *  |     📺 (glyph)     | 3 televisioni      |
 *  |                    | Televisioni        |
 *  |   TELEVISIONI      | +-------+-------+  |
 *  |   2/3              | |Game 1 |Game 2 |  |
 *  |   accese           | +-------+-------+  |
 *  |                    | |Game 3 |       |  |
 *  |  Tap = tutte       | +-------+-------+  |
 *  |   on / off         | [🚪 Apri porta   ] |
 *  +--------------------+--------------------+
 *
 * Interaction model:
 *   - Tap on a tile      → toggle that TV (media_player.turn_on/off)
 *   - Tap on left panel  → any TV on ? all off : all on
 *   - Tap on door button → open the door (domain-aware service call)
 *     with a 3 s "✓ Aperta" feedback state.
 *
 * Unlike the Lights panel there is NO scope concept: tiles act
 * immediately. TVs are momentary-ish devices, an extra selection step
 * would only add friction.
 */
@customElement("cow-extras-panel")
export class CowExtrasPanel extends LitElement {
  @property({ attribute: false }) hass?: HomeAssistant;
  @property({ type: Array }) devices: DeviceEntry[] = [];
  @property({ type: String }) roomName = "";
  /** Lock / cover / script / button / switch that opens the door. */
  @property({ type: String }) doorEntity = "";
  @property({ type: String }) doorLabel = "";

  @state() private now = new Date();
  @state() private doorFeedback?: DoorFeedback;
  private timer?: number;
  private doorFeedbackTimer?: number;

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
        -webkit-user-select: none;
        user-select: none;
      }
      .right {
        z-index: 0;
      }
      :host > :not(.left):not(.right):not(.grid):not(.door) {
        z-index: 1;
        pointer-events: none;
      }
      :host > .grid,
      :host > .door {
        z-index: 1;
        pointer-events: auto;
      }

      /* Left pane — same coordinate system as the Lights panel */
      .glyph {
        position: absolute;
        left: 67.5px;
        top: 95px;
        width: 225px;
        height: 225px;
        color: var(--cow-on-accent, #fff);
        opacity: 0.92;
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
      .count {
        position: absolute;
        left: 37.5px;
        top: 350px;
        font-weight: 300;
        font-size: 105px;
        line-height: 1;
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
      }
      .hint-tap {
        font-weight: 600;
        font-size: 19px;
        line-height: 1.4;
      }
      .hint-sub {
        font-weight: 400;
        font-size: 16px;
        line-height: 1.4;
        opacity: 0.85;
      }

      /* Right pane — header identical to the sibling panels */
      .room {
        position: absolute;
        left: 397.5px;
        top: 52.5px;
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
      .section {
        position: absolute;
        left: 397.5px;
        top: 133px;
        font-weight: 400;
        font-size: 14px;
        color: var(--cow-text-secondary, #737380);
      }
      .grid {
        position: absolute;
        left: 383px;
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

      .door {
        position: absolute;
        left: 383px;
        top: var(--cow-door-top, 470px);
        width: 320px;
        height: 64px;
        border: 0;
        margin: 0;
        padding: 0;
        font: inherit;
        font-family: inherit;
        font-weight: 700;
        font-size: 19px;
        border-radius: 18px;
        background: var(--cow-master-active-bg, #2e2e38);
        color: #fff;
        cursor: pointer;
        ${colorTransition}
      }
      .door:active {
        transform: scale(0.985);
      }
      .door.done {
        background: #26a673;
      }
      .door[disabled] {
        opacity: 0.75;
        cursor: default;
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
    if (this.doorFeedbackTimer) window.clearTimeout(this.doorFeedbackTimer);
  }

  private getEntity(id?: string): HassEntity | undefined {
    if (!id || !this.hass) return undefined;
    return this.hass.states[id];
  }

  private onCount(): number {
    return this.devices.filter((d) => tvIsOn(this.getEntity(d.entity))).length;
  }

  override willUpdate(): void {
    const a = ACCENT[this.onCount() > 0 ? "on" : "off"];
    this.style.setProperty("--cow-accent", a.primary);
    this.style.setProperty("--cow-accent-light", a.light);
    this.style.setProperty("--cow-accent-active", a.active);
    this.style.setProperty("--cow-accent-surface", a.surface);
    // Door button sits right below the tile grid (origin 162 must match
    // the `.grid { top }` rule above — same convention as lights-panel).
    const rows = Math.max(1, Math.ceil(this.devices.length / 2));
    const gridBottom = 162 + rows * 80 + (rows - 1) * 10;
    this.style.setProperty("--cow-door-top", `${gridBottom + 24}px`);
  }

  private async toggleTv(entityId: string): Promise<void> {
    if (!this.hass) return;
    const on = tvIsOn(this.getEntity(entityId));
    await this.hass.callService(
      "media_player",
      on ? "turn_off" : "turn_on",
      {},
      { entity_id: entityId },
    );
  }

  private onTileSelect = (e: CustomEvent<{ id: string }>): void => {
    void this.toggleTv(e.detail.id);
  };

  private onLeftTap = (): void => {
    if (!this.hass || this.devices.length === 0) return;
    const anyOn = this.onCount() > 0;
    void this.hass.callService(
      "media_player",
      anyOn ? "turn_off" : "turn_on",
      {},
      { entity_id: this.devices.map((d) => d.entity) },
    );
  };

  /** Domain-aware "open the door" — same dispatch as the thermostat
   *  panel's hidden studio-door affordance. */
  private async openDoor(): Promise<void> {
    if (!this.hass || !this.doorEntity) return;
    const domain = this.doorEntity.split(".")[0];
    const call = (d: string, s: string): Promise<unknown> =>
      this.hass!.callService(d, s, {}, { entity_id: this.doorEntity });
    if (domain === "lock") return void (await call("lock", "unlock"));
    if (domain === "cover") return void (await call("cover", "open_cover"));
    if (domain === "script") return void (await call("script", "turn_on"));
    if (domain === "button") return void (await call("button", "press"));
    await call(domain, "turn_on");
  }

  private onDoorTap = async (): Promise<void> => {
    if (this.doorFeedback) return;
    this.doorFeedback = "opening";
    try {
      await this.openDoor();
      this.doorFeedback = "done";
      this.doorFeedbackTimer = window.setTimeout(() => {
        this.doorFeedback = undefined;
        this.doorFeedbackTimer = undefined;
      }, 3000);
    } catch {
      this.doorFeedback = undefined;
    }
  };

  private tileState(ent: HassEntity | undefined): string {
    if (!ent || ent.state === "unavailable" || ent.state === "unknown") {
      return "N.D.";
    }
    return tvIsOn(ent) ? "ON" : "OFF";
  }

  override render() {
    const total = this.devices.length;
    const on = this.onCount();
    const countDisplay = total === 0 ? "—" : on > 0 ? `${on}/${total}` : "OFF";
    const sub = on > 0 ? (on === 1 ? "accesa" : "accese") : "tutte spente";
    const doorText =
      this.doorFeedback === "done"
        ? "✓ Aperta"
        : this.doorFeedback === "opening"
          ? "Apertura…"
          : `🚪 ${this.doorLabel || "Apri porta"}`;

    return html`
      <div class="left" @click=${this.onLeftTap}></div>
      <div class="right"></div>

      <div class="glyph">${TV_ICON}</div>
      <div class="status">TELEVISIONI</div>
      <div class="count">${countDisplay}</div>
      <div class="sub">${sub}</div>
      <div class="hint">
        <div class="hint-tap">Tap = tutte on / off</div>
        <div class="hint-sub">${total} televisioni</div>
      </div>

      <div class="room">${this.roomName}</div>
      <div class="time">${formatTime(this.now, this.hass?.locale?.language)}</div>
      <div class="device-sub">${total} televisioni</div>

      <div class="section">Televisioni</div>
      <div class="grid">
        ${this.devices.map((d) => {
          const ent = this.getEntity(d.entity);
          return html`
            <cow-light-tile
              .tileId=${d.entity}
              .label=${d.label}
              .state=${this.tileState(ent)}
              ?isOn=${tvIsOn(ent)}
              @cow-tile-select=${this.onTileSelect}
            ></cow-light-tile>
          `;
        })}
      </div>

      ${this.doorEntity
        ? html`
            <button
              class="door ${this.doorFeedback === "done" ? "done" : ""}"
              ?disabled=${this.doorFeedback === "opening"}
              @click=${this.onDoorTap}
            >
              ${doorText}
            </button>
          `
        : ""}
    `;
  }
}
