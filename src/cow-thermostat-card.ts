import { LitElement, html, css } from "lit";
import { customElement, property, state } from "lit/decorators.js";

import type {
  HomeAssistant,
  LovelaceCard,
  LovelaceCardConfig,
} from "./types/hass.js";
import {
  validateConfig,
  type CowConfig,
  type InitialView,
} from "./config.js";

import {
  tokens,
  accentForThermostat,
  accentForBlinds,
  accentForLights,
} from "./styles/tokens.js";
import { fontFaces, typography } from "./styles/typography.js";
import { globalShell } from "./styles/global.js";

import "./components/device-swiper.js";
import "./devices/thermostat-panel.js";
import "./devices/blinds-panel.js";
import "./devices/lights-panel.js";

// Bundle the XL room-dashboard card too (registers `cow-room-dashboard-card`)
import "./cow-room-dashboard-card.js";
// Bundle the per-user redirect card (registers `cow-redirect-card`)
import "./cow-redirect-card.js";
// Bundle the dedicated kiosk card (registers `cow-kiosk-card`)
import "./cow-kiosk-card.js";
import { deriveThermostatView } from "./state/thermostat-state.js";
import { deriveBlindsView } from "./state/blinds-state.js";
import { deriveLightsView } from "./state/lights-state.js";

type DeviceKind = "thermostat" | "blinds" | "lights";

const VERSION = "0.9.1";

@customElement("cow-thermostat-card")
export class CowThermostatCard extends LitElement implements LovelaceCard {
  @property({ attribute: false }) hass?: HomeAssistant;
  @state() private config?: CowConfig;
  @state() private index = 0;

  static override styles = [
    fontFaces,
    tokens,
    typography,
    globalShell,
    css`
      .frame {
        width: 100%;
        height: 100%;
        display: flex;
        align-items: stretch;
        justify-content: stretch;
        padding: 0;
      }
      .error {
        padding: 1rem;
        font-family: var(--cow-font-family);
        font-size: 0.875rem;
        color: var(--cow-stop, #e74c3c);
        background: var(--cow-surface-white);
        border: 0.0625rem solid currentColor;
        border-radius: var(--cow-radius-default);
        white-space: pre-wrap;
      }
    `,
  ];

  setConfig(input: LovelaceCardConfig): void {
    try {
      this.config = validateConfig(input);
      this.index = this.indexForView(this.config.initial_view);
    } catch (e) {
      this.config = undefined;
      throw e;
    }
  }

  /**
   * After the first paint, walk up the DOM until we hit either a
   * `<hui-panel-view>` (panel mode = should fill the screen) or the
   * document. Toggle a `panel` attribute accordingly so the CSS in
   * `globalShell` can promote :host to `position: absolute; inset: 0`.
   *
   * In panel/kiosk mode we also bump the root <html> font-size to
   * 40px. This is the only reliable way to scale `rem`-positioned
   * elements that live inside nested shadow roots — `rem` always
   * resolves against `html`, not the host element, so a `:host
   * { font-size }` rule never propagates into child custom elements.
   */
  override connectedCallback(): void {
    super.connectedCallback();
    queueMicrotask(() => this.applyPanelAttr());
  }

  override updated(): void {
    this.applyPanelAttr();
  }

  private applyPanelAttr(): void {
    // Walk the parent chain (across shadow boundaries) looking for
    // any HA wrapper that signals panel/full-screen mode. We accept a
    // broad list because the exact element name varies between HA
    // versions and is sometimes rewritten by community plugins like
    // kiosk-mode.
    const panelTags = new Set([
      "hui-panel-view",
      "ha-panel-lovelace",
      "hui-root",
      "home-assistant-main",
      "ha-app-layout",
    ]);
    const tagChain: string[] = [];
    let node: Node | null = this.parentNode ?? null;
    let found = false;
    let depth = 0;
    while (node && depth++ < 50) {
      if (node instanceof HTMLElement) {
        const tag = node.tagName.toLowerCase();
        tagChain.push(tag);
        if (panelTags.has(tag)) found = true;
      }
      const root = (node as Node & { getRootNode?: () => Node }).getRootNode?.();
      node =
        node.parentNode ??
        (root instanceof ShadowRoot ? root.host : null);
    }
    // Debug log first time we run
    if (!this.hasAttribute("data-debug-logged")) {
      this.setAttribute("data-debug-logged", "");
      console.warn(
        "[cow-thermostat-card] ancestor chain:",
        tagChain.slice(0, 15).join(" > "),
        "panel-mode:",
        found,
        "vw/vh:",
        window.innerWidth + "x" + window.innerHeight,
      );
    }
    // Final escape hatch: if the URL contains ?kiosk (the standard
    // marker for a Wall Display kiosk page) treat that as a strong
    // signal that we want to fill the viewport, even if we couldn't
    // identify the wrapper.
    const isKioskUrl =
      typeof window !== "undefined" && /[?&]kiosk(=|&|$)/.test(window.location.search);
    const isPanel = found || isKioskUrl;
    if (isPanel) {
      this.setAttribute("panel", "");
      // Bump the document root font-size so `rem` units (which always
      // resolve to `html`'s computed size, regardless of shadow DOM
      // boundaries) scale up by 40/16 = 2.5x. This is what makes
      // every panel position/size in the card's rem-based design
      // grid actually fill a 720x720 kiosk.
      if (
        typeof document !== "undefined" &&
        document.documentElement &&
        !document.documentElement.dataset.cowKioskFs
      ) {
        // 24rem (design grid) × 26px = 624px painted area inside a
        // 720px-wide screenshot. We deliberately leave a small (~5%)
        // gutter so intrinsic widths inside split panels (e.g. the
        // Open/Stop/Close control row, which sums to ~14rem of pure
        // content) don't overflow the section. 30px → 720px was a
        // tight fit and caused "Close" to clip on the right and the
        // room title to overlap the clock.
        document.documentElement.style.fontSize = "26px";
        document.documentElement.dataset.cowKioskFs = "1";
      }
    } else {
      this.removeAttribute("panel");
    }
  }

  /** Ordered list of panels actually rendered, given the current config. */
  private activeKinds(): DeviceKind[] {
    const kinds: DeviceKind[] = [];
    if (this.config?.climate) kinds.push("thermostat");
    if (this.config && this.config.covers.length > 0) kinds.push("blinds");
    if (this.config && this.config.lights.length > 0) kinds.push("lights");
    return kinds;
  }

  private indexForView(view: InitialView | undefined): number {
    const kinds = this.activeKinds();
    if (kinds.length === 0) return 0;
    const target: DeviceKind =
      view === "thermostat"
        ? "thermostat"
        : view === "blinds"
          ? "blinds"
          : view === "lights"
            ? "lights"
            : kinds[0];
    const i = kinds.indexOf(target);
    return i >= 0 ? i : 0;
  }

  /** HA needs this to size the card in masonry view */
  getCardSize(): number {
    return 8; // ≈ 384/50
  }

  /** Accent colour for each active kind, in the same order as activeKinds() */
  private accents(): string[] {
    const kinds = this.activeKinds();
    if (!this.config || !this.hass) {
      return kinds.map((k) =>
        k === "thermostat"
          ? "var(--cow-heating-primary)"
          : k === "blinds"
            ? "var(--cow-blinds-sky)"
            : "var(--cow-lights-bright)",
      );
    }
    const cfg = this.config;
    const hass = this.hass;
    return kinds.map((k) => {
      if (k === "thermostat" && cfg.climate) {
        return accentForThermostat(
          deriveThermostatView(hass.states[cfg.climate]).variant,
        ).primary;
      }
      if (k === "blinds") {
        // Use first cover for the dot; aggregated visuals live inside the panel.
        return accentForBlinds(
          deriveBlindsView(hass.states[cfg.covers[0]]).variant,
        ).primary;
      }
      return accentForLights(
        deriveLightsView(hass.states[cfg.lights[0]]).variant,
      ).primary;
    });
  }

  override render() {
    if (!this.config) {
      return html`<div class="error">cow-thermostat-card: invalid config</div>`;
    }
    const cfg = this.config;
    const kinds = this.activeKinds();

    if (kinds.length === 0) {
      return html`<div class="error">
        cow-thermostat-card: at least one of climate, light, cover must be configured
      </div>`;
    }

    return html`
      <div class="frame">
        <cow-device-swiper
          .index=${this.index}
          .count=${kinds.length}
          .accents=${this.accents()}
          @cow-index-change=${(e: CustomEvent<{ index: number }>) =>
            (this.index = e.detail.index)}
        >
          ${kinds.map((kind, i) => {
            if (kind === "thermostat") {
              return html`<cow-thermostat-panel
                slot="slide-${i}"
                .hass=${this.hass}
                entity=${cfg.climate!}
                roomName=${cfg.room}
                outdoorEntity=${cfg.outdoor_temp ?? ""}
                localHumidityEntity=${cfg.local_humidity ?? ""}
              ></cow-thermostat-panel>`;
            }
            if (kind === "blinds") {
              return html`<cow-blinds-panel
                slot="slide-${i}"
                .hass=${this.hass}
                .entities=${cfg.covers}
                .labels=${cfg.coverLabels}
                roomName=${cfg.room}
              ></cow-blinds-panel>`;
            }
            return html`<cow-lights-panel
              slot="slide-${i}"
              .hass=${this.hass}
              .entities=${cfg.lights}
              .labels=${cfg.lightLabels}
              roomName=${cfg.room}
            ></cow-lights-panel>`;
          })}
        </cow-device-swiper>
      </div>
    `;
  }
}

/* Lovelace card picker registration */
window.customCards = window.customCards ?? [];
const alreadyRegistered = window.customCards.some(
  (c) => c.type === "cow-thermostat-card",
);
if (!alreadyRegistered) {
  window.customCards.push({
    type: "cow-thermostat-card",
    name: "Cave of Wonders Room Card",
    description:
      "Thermostat + Lights + Blinds for Home Assistant on Shelly Wall Display",
    preview: false,
  });
}

/* Console banner so installs can confirm the version loaded */
// eslint-disable-next-line no-console
console.info(
  `%c COW-THERMOSTAT-CARD %c v${VERSION} `,
  "color: white; background: #fa6b2e; font-weight: 700",
  "color: #fa6b2e; background: #f7f7fa; font-weight: 700",
);
