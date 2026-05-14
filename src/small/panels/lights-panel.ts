import { LitElement, html, css } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import type { HomeAssistant, HassEntity } from "../../types/hass.js";
import {
  aggregateLightsView,
  brightnessFromPct,
  deriveLightsView,
  type LightsVariant,
  type LightsView,
} from "../state/lights.js";
import type { DeviceEntry } from "../config.js";
import { panelStyles } from "../styles/shell.js";
import { animKeyframes, animTokens, colorTransition } from "../styles/anim.js";
import { formatTime } from "../../utils/format.js";

import "../components/action-button.js";
import "../components/scope-row.js";
import "../components/vertical-slider.js";
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

const SUB: Record<LightsVariant, string> = {
  bright: "Full brightness",
  dim: "Dimmed",
  off: "Light is off",
  night: "Night mode",
};

@customElement("cow-lights-panel")
export class CowLightsPanel extends LitElement {
  @property({ attribute: false }) hass?: HomeAssistant;
  @property({ type: Array }) devices: DeviceEntry[] = [];
  @property({ type: String }) roomName = "";
  /** "all" | entity_id of a single light */
  @state() private scope: string = "all";
  @state() private now = new Date();
  /** Local optimistic value while dragging the slider. */
  @state() private dragPct: number | null = null;
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
      .bulb-wrap {
        position: absolute;
        left: 67.5px;
        top: 112.5px;
        width: 225px;
        height: 225px;
      }
      .status {
        position: absolute;
        left: 45px;
        top: 337.5px;
        font-weight: 500;
        font-size: 20.625px;
        letter-spacing: 4.6875px;
        opacity: 0.7;
      }
      .pct {
        position: absolute;
        left: 37.5px;
        top: 367.5px;
        font-weight: 300;
        font-size: 105px;
        line-height: 1;
        letter-spacing: 0;
      }
      .sub {
        position: absolute;
        left: 45px;
        top: 491.25px;
        font-weight: 400;
        font-size: 22.5px;
        opacity: 0.6;
      }

      .room {
        position: absolute;
        left: 397.5px;
        top: 52.5px;
        max-width: 200px;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        font-weight: 600;
        font-size: 26.25px;
        color: var(--cow-text-room-name, #262633);
      }
      .time {
        position: absolute;
        left: 622.5px;
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
      .b-label {
        position: absolute;
        left: 397.5px;
        top: 153.75px;
        font-weight: 500;
        font-size: 22.5px;
        color: var(--cow-text-secondary, #80808c);
      }

      .slider {
        position: absolute;
        left: 416px;
        top: 187.5px;
        width: 67.5px;
        height: 262.5px;
      }
      .plus,
      .minus {
        position: absolute;
        left: 510px;
        width: 183.75px;
        height: 71.25px;
      }
      .plus {
        top: 187.5px;
      }
      .minus {
        top: 379px;
      }
      .turn {
        position: absolute;
        left: 397.5px;
        top: 507px;
        width: 277.5px;
        height: 75px;
        --cow-action-font-size: 24.375px;
        --cow-action-font-weight: 700;
        --cow-action-color: #666673;
        --cow-action-bg: #ebebed;
      }
      .scope-wrap {
        position: absolute;
        left: 391px;
        right: 31px;
        top: 635px;
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

  private view(): LightsView {
    if (this.devices.length === 0) {
      return { variant: "off", brightnessPct: 0, raw: "unavailable" };
    }
    if (this.scope === "all") {
      return aggregateLightsView(
        this.devices.map((d) => this.getEntity(d.entity)),
      );
    }
    return deriveLightsView(this.getEntity(this.scope));
  }

  override willUpdate(): void {
    const v = this.view();
    const a = ACCENT[v.variant];
    this.style.setProperty("--cow-accent", a.primary);
    this.style.setProperty("--cow-accent-light", a.light);
    this.style.setProperty("--cow-accent-active", a.active);
    this.style.setProperty("--cow-accent-surface", a.surface);
  }

  private async setBrightness(pct: number): Promise<void> {
    if (!this.hass) return;
    const t = this.targets();
    if (t.length === 0) return;
    if (pct === 0) {
      await this.hass.callService("light", "turn_off", {}, { entity_id: t });
    } else {
      await this.hass.callService(
        "light",
        "turn_on",
        { brightness: brightnessFromPct(pct) },
        { entity_id: t },
      );
    }
  }

  private async toggle(): Promise<void> {
    if (!this.hass) return;
    const t = this.targets();
    if (t.length === 0) return;
    const v = this.view();
    const on = v.variant === "off";
    await this.hass.callService(
      "light",
      on ? "turn_on" : "turn_off",
      {},
      { entity_id: t },
    );
  }

  private bump(delta: number) {
    const v = this.view();
    const next = Math.max(0, Math.min(100, v.brightnessPct + delta));
    void this.setBrightness(next);
  }

  private onSliderInput = (e: CustomEvent<{ value: number }>) => {
    this.dragPct = e.detail.value;
  };
  private onSliderChange = (e: CustomEvent<{ value: number }>) => {
    this.dragPct = null;
    void this.setBrightness(e.detail.value);
  };

  private onScopePick = (e: CustomEvent<{ id: string }>) => {
    this.scope = e.detail.id;
  };

  override render() {
    const v = this.view();
    const pct = this.dragPct != null ? this.dragPct : v.brightnessPct;
    const isOff = v.variant === "off";
    const items =
      this.devices.length > 1
        ? [
            { id: "all", label: "Tutte" },
            ...this.devices.map((d) => ({ id: d.entity, label: d.label })),
          ]
        : [];

    return html`
      <div class="left"></div>
      <div class="right"></div>
      <div class="bulb-wrap">
        <cow-bulb-visual
          .variant=${v.variant}
          .brightnessPct=${pct}
        ></cow-bulb-visual>
      </div>
      <div class="status">${STATUS[v.variant]}</div>
      <div class="pct">${pct}%</div>
      <div class="sub">${SUB[v.variant]}</div>

      <div class="room">${this.roomName}</div>
      <div class="time">${formatTime(this.now, this.hass?.locale?.language)}</div>
      <div class="device-sub">
        ${this.devices.length > 1 ? `${this.devices.length} luci` : "Lampada"}
      </div>
      <div class="b-label">Brightness</div>
      <div class="slider">
        <cow-vertical-slider
          .value=${pct}
          @cow-slider-input=${this.onSliderInput}
          @cow-slider-change=${this.onSliderChange}
        ></cow-vertical-slider>
      </div>
      <cow-action-button
        class="plus"
        variant="control"
        label="+"
        @click=${() => this.bump(10)}
      ></cow-action-button>
      <cow-action-button
        class="minus"
        variant="control"
        label="−"
        @click=${() => this.bump(-10)}
      ></cow-action-button>
      <cow-action-button
        class="turn"
        variant=${isOff ? "control" : "filled"}
        label=${isOff ? "Turn On" : "Turn Off"}
        @click=${() => this.toggle()}
      ></cow-action-button>
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
}
