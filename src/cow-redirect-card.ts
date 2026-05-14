/**
 * cow-redirect-card — per-user dashboard redirector.
 *
 * The Shelly Wall Display kiosk always opens `/lovelace` (the Overview
 * dashboard) and silently ignores HA's per-user `default_panel`.
 *
 * Workaround: put a single card of this type in the Overview dashboard.
 * It reads the currently logged-in HA user's name (`hass.user.name`)
 * and rewrites `window.location` to the matching room dashboard kiosk
 * URL — e.g. `c1` → `/walldisplay-camera-1/0?kiosk`. Admin/unmapped
 * users see a small navigation grid with every room dashboard.
 *
 * The map below is the same one used by `ha-fix-displays.mjs` and
 * `ha-merge-lovelace.mjs`. Update all three together if a new display
 * lands or a username/url-path changes.
 */
import { LitElement, html, css } from "lit";
import { customElement, property } from "lit/decorators.js";
import type { HomeAssistant, LovelaceCard, LovelaceCardConfig } from "./types/hass.js";

interface RedirectEntry {
  url: string;
  label: string;
  icon: string;
}

/** username → kiosk URL + tile label/icon */
const USER_ROUTES: Record<string, RedirectEntry> = {
  sala: { url: "/walldisplay-sala-cucina/0?kiosk", label: "Sala & Cucina", icon: "🛋" },
  c1:   { url: "/walldisplay-camera-1/0?kiosk",     label: "Camera 1", icon: "🛌" },
  c2:   { url: "/walldisplay-camera-2/0?kiosk",     label: "Camera 2", icon: "🛌" },
  cp:   { url: "/walldisplay-camera-padronale/0?kiosk", label: "Camera Padronale", icon: "🛏" },
  bo:   { url: "/walldisplay-bagno-ospiti/0?kiosk", label: "Bagno Ospiti", icon: "🚿" },
  sc:   { url: "/walldisplay-scala/0?kiosk",        label: "Ingresso PT", icon: "🚪" },
  bp:   { url: "/walldisplay-bagno-camera/0?kiosk", label: "Bagno Padronale", icon: "🚿" },
};

@customElement("cow-redirect-card")
export class CowRedirectCard extends LitElement implements LovelaceCard {
  @property({ attribute: false }) hass?: HomeAssistant;

  static override styles = css`
    :host {
      display: block;
      min-height: 12rem;
      padding: 2rem;
      font-family: system-ui, -apple-system, sans-serif;
      color: var(--primary-text-color, #1f1f2e);
    }
    .center {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 1rem;
      padding: 4rem 1rem;
    }
    .spinner {
      width: 3rem;
      height: 3rem;
      border: 0.25rem solid var(--divider-color, #ccc);
      border-top-color: var(--primary-color, #03a9f4);
      border-radius: 50%;
      animation: spin 1s linear infinite;
    }
    @keyframes spin { to { transform: rotate(360deg); } }
    .title { font-size: 1.125rem; font-weight: 600; }
    .grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(11rem, 1fr));
      gap: 0.75rem;
      max-width: 56rem;
      margin: 0 auto;
    }
    a.tile {
      display: flex;
      align-items: center;
      gap: 0.75rem;
      padding: 1rem 1.25rem;
      background: var(--card-background-color, #fff);
      border: 0.0625rem solid var(--divider-color, #ddd);
      border-radius: 0.75rem;
      color: inherit;
      text-decoration: none;
      font-weight: 600;
      transition: transform 120ms ease, box-shadow 120ms ease;
    }
    a.tile:hover {
      transform: translateY(-0.0625rem);
      box-shadow: 0 0.25rem 0.875rem rgba(0,0,0,0.08);
    }
    a.tile .ico { font-size: 1.5rem; }
    .label-row { font-size: 0.875rem; opacity: 0.7; margin-bottom: 0.75rem; }
  `;

  setConfig(_: LovelaceCardConfig): void {
    /* this card has no config */
  }

  override updated(changed: Map<string, unknown>): void {
    if (!changed.has("hass")) return;
    this.maybeRedirect();
  }

  override firstUpdated(): void {
    this.maybeRedirect();
  }

  /**
   * If the current user has a matching kiosk URL and we're not already
   * on it, redirect once. Guarded against infinite loops by checking
   * the current pathname before navigating.
   */
  private maybeRedirect(): void {
    const name = this.hass?.user?.name;
    if (!name) return;
    const route = USER_ROUTES[name];
    if (!route) return;
    const desired = route.url.split("?")[0];
    if (window.location.pathname === desired) return;
    // Replace so the kiosk's history doesn't bounce back here.
    window.location.replace(route.url);
  }

  override render() {
    const name = this.hass?.user?.name ?? "";
    const route = USER_ROUTES[name];
    if (route) {
      // While the redirect kicks in we show a small spinner card.
      return html`
        <div class="center">
          <div class="spinner"></div>
          <div class="title">Apro ${route.label}…</div>
        </div>
      `;
    }
    // Admin / non-mapped user: show a navigation grid.
    return html`
      <div class="label-row">Apri una dashboard di stanza</div>
      <div class="grid">
        ${Object.entries(USER_ROUTES).map(
          ([, r]) => html`
            <a class="tile" href=${r.url}>
              <span class="ico">${r.icon}</span>
              <span>${r.label}</span>
            </a>
          `,
        )}
      </div>
    `;
  }

  getCardSize(): number {
    return 3;
  }
}

window.customCards = window.customCards ?? [];
if (!window.customCards.some((c) => c.type === "cow-redirect-card")) {
  window.customCards.push({
    type: "cow-redirect-card",
    name: "Cave of Wonders Redirect",
    description:
      "Redirects each user to their room dashboard. Drop one of these in the Overview dashboard for Shelly Wall Display kiosks.",
    preview: false,
  });
}
