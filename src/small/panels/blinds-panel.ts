import { LitElement, html, css, svg } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import type { HomeAssistant, HassEntity } from "../../types/hass.js";
import {
  aggregateBlindsView,
  deriveBlindsView,
  type BlindsVariant,
  type BlindsView,
} from "../state/blinds.js";
import type { DeviceEntry, OpeningKind } from "../config.js";
import { panelStyles } from "../styles/shell.js";
import { animKeyframes, animTokens, colorTransition } from "../styles/anim.js";
import { formatTime } from "../../utils/format.js";

import "../components/action-button.js";
import "../components/scope-row.js";
import "../components/chip-row.js";
import "../visuals/blind-visual.js";

interface AccentSet {
  primary: string;
  light: string;
  active: string;
  surface: string;
}

const ACCENT: Record<BlindsVariant, AccentSet> = {
  open: {
    primary: "#66bfff",
    light: "#99e0ff",
    active: "#4d8cd1",
    surface: "linear-gradient(180deg,#66bfff 0%,#99e0ff 100%)",
  },
  half: {
    primary: "#4d8cd1",
    light: "#7fb0e6",
    active: "#3a6fa8",
    surface: "linear-gradient(180deg,#4d8cd1 0%,#7eb6ec 100%)",
  },
  closed: {
    primary: "#3a3a4a",
    light: "#5a5a6a",
    active: "#1f1f2e",
    surface: "linear-gradient(180deg,#26262f 0%,#4a4a5a 100%)",
  },
  moving: {
    primary: "#e6a626",
    light: "#ffc740",
    active: "#d99a1a",
    surface: "linear-gradient(180deg,#e6a626 0%,#ffc740 100%)",
  },
};

const STATUS: Record<BlindsVariant, string> = {
  open: "FULLY OPEN",
  half: "HALF OPEN",
  closed: "CLOSED",
  moving: "MOVING",
};

const iconSun = svg`<svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
  <circle cx="12" cy="12" r="5"/>
  <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/>
</svg>`;

const iconHalf = svg`<svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="2">
  <circle cx="12" cy="12" r="10"/>
  <path d="M12 2a10 10 0 0 1 0 20" fill="currentColor" stroke="none"/>
</svg>`;

const iconClosed = svg`<svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round">
  <rect x="3" y="3" width="18" height="18" rx="2"/>
  <path d="M3 9h18M3 15h18"/>
</svg>`;

const iconSpin = svg`<svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
  <path d="M1 4v6h6"/>
  <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/>
</svg>`;

const ICON: Record<BlindsVariant, unknown> = {
  open: iconSun,
  half: iconHalf,
  closed: iconClosed,
  moving: iconSpin,
};

const SUB: Record<BlindsVariant, string> = {
  open: "Open",
  half: "Partially open",
  closed: "Closed",
  moving: "Opening...",
};

@customElement("cow-blinds-panel")
export class CowBlindsPanel extends LitElement {
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

  @state() private scope: string = "all";
  @state() private now = new Date();
  private timer?: number;

  static override styles = [
    animTokens,
    animKeyframes,
    panelStyles,
    css`
      .left {
        background: var(--cow-accent-surface);
        ${colorTransition}
        z-index: 0;
      }
      .right {
        z-index: 0;
      }
      :host > :not(.left):not(.right) {
        z-index: 1;
      }
      .icon {
        position: absolute;
        left: 45px;
        top: 45px;
        font-size: 52.5px;
        line-height: 1;
        color: #1f1f2e;
        ${colorTransition}
      }
      .icon.spin {
        animation: cow-spin 1.8s linear infinite;
        transform-origin: 50% 50%;
        display: inline-block;
      }
      .status {
        position: absolute;
        left: 45px;
        top: 262.5px;
        font-weight: 500;
        font-size: 20.625px;
        letter-spacing: 4.6875px;
        opacity: 0.7;
        color: #fff;
      }
      .pct {
        position: absolute;
        left: 37.5px;
        top: 296.25px;
        font-weight: 300;
        font-size: 120px;
        line-height: 1;
        letter-spacing: -3px;
        color: #fff;
      }
      .sub {
        position: absolute;
        left: 45px;
        top: 435px;
        font-weight: 400;
        font-size: 24.375px;
        opacity: 0.6;
        color: #fff;
      }
      .blind-wrap {
        position: absolute;
        left: 45px;
        top: 570px;
        width: 150px;
        height: 112.5px;
      }

      .room {
        position: absolute;
        left: 397.5px;
        top: 52.5px;
        /* Stretched from 200 → 235 to fit "Camera Padronale" without
           ellipsis. The right edge now butts up against the time text,
           which is right-anchored so the layout stays locale-safe
           (12h vs 24h time strings don't shift the room name).
           Font sizes (26.25 + 24.375) match the thermostat-panel so
           "Camera Padronale 07:20" fits without colliding — the
           previous 30/28 px combo was too big for the 280 px slot
           and the time was painted over the room-name ellipsis. */
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
      .open,
      .stop,
      .close {
        position: absolute;
        left: 397.5px;
        width: 277.5px;
        height: 82.5px;
      }
      .open {
        top: 159px;
      }
      .stop {
        top: 264px;
      }
      .close {
        top: 369px;
      }
      .moving-row {
        position: absolute;
        left: 472px;
        top: 477px;
        font-weight: 500;
        font-size: 22px;
        color: var(--cow-blinds-amber, #e6a626);
        animation: cow-pulse 1.6s ease-in-out infinite;
      }
      /* Touch-target audit (v1.9): presets grew to 72-px stretched
         chips and the scope chips to 52 px, so both rows moved up to
         keep clear of the swiper dots at the bottom edge. */
      .preset-row {
        position: absolute;
        left: 397.5px;
        top: 508px;
        right: 30px;
      }
      .scope-wrap {
        position: absolute;
        left: 391px;
        right: 31px;
        top: 606px;
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

  private view(): BlindsView {
    if (this.devices.length === 0) {
      return { variant: "closed", position: 0, raw: "unavailable" };
    }
    if (this.scope === "all") {
      return aggregateBlindsView(
        this.devices.map((d) => this.getEntity(d.entity)),
      );
    }
    return deriveBlindsView(this.getEntity(this.scope));
  }

  override willUpdate(): void {
    const v = this.view();
    const a = ACCENT[v.variant];
    this.style.setProperty("--cow-accent", a.primary);
    this.style.setProperty("--cow-accent-light", a.light);
    this.style.setProperty("--cow-accent-active", a.active);
    this.style.setProperty("--cow-accent-surface", a.surface);
    this.toggleAttribute("data-multi-cover", this.devices.length > 1);
  }

  private async open(): Promise<void> {
    await this.svc("open_cover");
  }
  private async close(): Promise<void> {
    await this.svc("close_cover");
  }
  private async stop(): Promise<void> {
    await this.svc("stop_cover");
  }
  private async setPos(pct: number): Promise<void> {
    if (!this.hass) return;
    const t = this.targets();
    if (t.length === 0) return;
    await this.hass.callService(
      "cover",
      "set_cover_position",
      { position: pct },
      { entity_id: t },
    );
  }
  private async svc(name: string) {
    if (!this.hass) return;
    const t = this.targets();
    if (t.length === 0) return;
    await this.hass.callService("cover", name, {}, { entity_id: t });
  }

  private onScopePick = (e: CustomEvent<{ id: string }>) => {
    this.scope = e.detail.id;
  };
  private onPresetPick = (e: CustomEvent<{ id: string }>) => {
    void this.setPos(Number(e.detail.id));
  };

  private movingText(v: BlindsView): string {
    if (v.movingDir === "closing") return "Closing...";
    return "Moving...";
  }

  override render() {
    const v = this.view();
    const items =
      this.devices.length > 1
        ? [
            { id: "all", label: "Tutte" },
            ...this.devices.map((d) => ({ id: d.entity, label: d.label })),
          ]
        : [];
    const presets = [
      { id: "0", label: "0%" },
      { id: "50", label: "50%" },
      { id: "100", label: "100%" },
    ];
    const presetActive = presets.reduce(
      (best, p) =>
        Math.abs(v.position - Number(p.id)) <
        Math.abs(v.position - Number(best.id))
          ? p
          : best,
      presets[0],
    ).id;

    return html`
      <div class="left"></div>
      <div class="right"></div>
      <div class="icon ${v.variant === "moving" ? "spin" : ""}">
        ${ICON[v.variant]}
      </div>
      <div class="status">${STATUS[v.variant]}</div>
      <div class="pct">${v.position}%</div>
      <div class="sub">${v.variant === "moving" ? this.subForMoving(v) : SUB[v.variant]}</div>
      <div class="blind-wrap">
        <cow-blind-visual
          .variant=${v.variant}
          .position=${v.position}
        ></cow-blind-visual>
      </div>

      <div class="room">${this.roomName}</div>
      <div class="time">${formatTime(this.now, this.hass?.locale?.language)}</div>
      <div class="device-sub">
        ${this.devices.length > 1
          ? `${this.devices.length} tapparelle`
          : "Roller blind"}
      </div>
      <cow-action-button
        class="open"
        variant="control"
        label="▲ Open"
        @click=${() => this.open()}
      ></cow-action-button>
      <cow-action-button
        class="stop"
        variant="stop"
        label="■ Stop"
        @click=${() => this.stop()}
      ></cow-action-button>
      <cow-action-button
        class="close"
        variant="control"
        label="▼ Close"
        @click=${() => this.close()}
      ></cow-action-button>
      ${v.variant === "moving"
        ? html`<div class="moving-row">${this.movingText(v)}</div>`
        : ""}
      <div class="preset-row">
        <cow-chip-row
          size="large"
          stretch
          .gap=${12}
          .items=${presets}
          .activeId=${presetActive}
          .accent=${ACCENT[v.variant].primary}
          @cow-chip-select=${this.onPresetPick}
        ></cow-chip-row>
      </div>
      ${items.length > 0
        ? html`
            <div class="scope-wrap">
              <cow-scope-row
                .items=${items}
                .activeId=${this.scope}
                .accent=${ACCENT[v.variant].primary}
                @cow-chip-select=${this.onScopePick}
              ></cow-scope-row>
            </div>
          `
        : ""}
    `;
  }

  private subForMoving(v: BlindsView): string {
    return v.movingDir === "closing" ? "Closing..." : "Opening...";
  }
}
