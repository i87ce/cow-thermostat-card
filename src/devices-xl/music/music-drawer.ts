/**
 * Music browse drawer — slide-up panel with three tabs:
 *   - Spotify : search box + user library (playlists by default)
 *   - Radio   : configured radio quick-presets
 *   - Coda    : current playback queue
 *
 * Talks to a Music Assistant client passed in from the parent. Each
 * tile tap emits `cow-music-play-item` { detail: { uri, mediaType } }
 * (Spotify / library / queue items) or `cow-music-radio-play`
 * { detail: { url, name } } for radio presets — both routed to MA or
 * direct media_player by the parent.
 */
import { LitElement, html, css, nothing } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import type { MaClient } from "./ma-client.js";
import type { MaItem, DrawerTab } from "./types.js";
import type { CowRadioPreset } from "../../config-xl.js";

@customElement("cow-xl-music-drawer")
export class CowXLMusicDrawer extends LitElement {
  @property({ type: Boolean, reflect: true }) open = false;
  @property({ attribute: false }) ma?: MaClient;
  @property({ attribute: false }) radios: CowRadioPreset[] = [];
  @property({ type: String }) deviceLabel = "";

  @state() private tab: DrawerTab = "spotify";
  @state() private query = "";
  @state() private results: MaItem[] = [];
  @state() private playlists: MaItem[] = [];
  @state() private queue: MaItem[] = [];
  @state() private loading = false;
  @state() private error = "";

  private searchTimer?: number;

  static override styles = css`
    :host {
      position: absolute;
      left: 0;
      right: 0;
      bottom: 0;
      pointer-events: none;
      z-index: 10;
    }

    .scrim {
      position: fixed;
      inset: 0;
      background: rgba(31, 31, 46, 0.32);
      opacity: 0;
      pointer-events: none;
      transition: opacity 280ms ease;
    }
    :host([open]) .scrim {
      opacity: 1;
      pointer-events: auto;
    }

    .drawer {
      position: absolute;
      left: 0;
      right: 0;
      bottom: 0;
      height: 30rem;
      background: var(--cow-surface-white);
      color: var(--cow-text-primary);
      border-top-left-radius: 1.5rem;
      border-top-right-radius: 1.5rem;
      box-shadow: 0 -0.5rem 2rem rgba(31, 31, 46, 0.18);
      transform: translateY(100%);
      transition: transform 320ms cubic-bezier(0.2, 0.7, 0.2, 1);
      pointer-events: none;
      padding: 1rem 1.5rem 1.5rem;
      display: flex;
      flex-direction: column;
      gap: 0.875rem;
    }
    :host([open]) .drawer {
      transform: translateY(0);
      pointer-events: auto;
    }

    .handle {
      width: 3rem;
      height: 0.25rem;
      border-radius: 0.125rem;
      background: var(--cow-text-disabled);
      align-self: center;
    }

    .header-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 1rem;
    }
    .device-chip {
      background: var(--cow-surface-button-bg);
      border-radius: 1rem;
      padding: 0.25rem 0.75rem;
      font-size: 0.75rem;
      font-weight: 600;
    }

    .tabs {
      display: flex;
      gap: 0.5rem;
    }
    .tab {
      padding: 0.5rem 1rem;
      border-radius: 1rem;
      font-weight: 600;
      font-size: 0.875rem;
      background: var(--cow-surface-button-bg);
      color: var(--cow-text-primary);
      cursor: pointer;
      border: 0;
      font: inherit;
      -webkit-appearance: none;
      appearance: none;
    }
    .tab[data-active] {
      background: var(--cow-text-primary);
      color: white;
    }

    .search {
      display: flex;
      gap: 0.5rem;
      align-items: center;
    }
    .search-box {
      flex: 1;
      height: 2.25rem;
      border-radius: 1.125rem;
      border: 0.0625rem solid var(--cow-surface-border);
      padding: 0 1rem;
      font-size: 0.875rem;
      background: var(--cow-surface-background);
      color: var(--cow-text-primary);
      font: inherit;
    }
    .search-box:focus {
      outline: none;
      border-color: var(--cow-text-primary);
    }

    .content {
      flex: 1;
      overflow-y: auto;
      display: flex;
      flex-direction: column;
      gap: 0.75rem;
      padding-right: 0.25rem;
    }
    .content::-webkit-scrollbar { width: 0.375rem; }
    .content::-webkit-scrollbar-thumb {
      background: var(--cow-surface-button-bg);
      border-radius: 0.1875rem;
    }

    .section-h {
      font-size: 0.75rem;
      font-weight: 700;
      letter-spacing: 0.0625rem;
      text-transform: uppercase;
      color: var(--cow-text-secondary);
    }

    .grid {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 0.625rem;
    }
    .item {
      background: var(--cow-surface-background);
      border: 0.0625rem solid var(--cow-surface-border);
      border-radius: 0.75rem;
      padding: 0.625rem 0.875rem;
      cursor: pointer;
      display: flex;
      align-items: center;
      gap: 0.625rem;
      min-width: 0;
      text-align: left;
      font: inherit;
      color: var(--cow-text-primary);
      -webkit-appearance: none;
      appearance: none;
      transition: background-color 120ms ease;
    }
    .item:hover { background: white; }
    .item .icon-sq {
      width: 2.25rem;
      height: 2.25rem;
      border-radius: 0.375rem;
      display: flex;
      align-items: center;
      justify-content: center;
      color: white;
      font-size: 1rem;
      background-color: var(--cow-text-primary);
      background-size: cover;
      background-position: center;
      flex: 0 0 auto;
    }
    .item .text {
      display: flex;
      flex-direction: column;
      min-width: 0;
      flex: 1;
    }
    .item .name {
      font-weight: 600;
      font-size: 0.875rem;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .item .sub {
      font-size: 0.6875rem;
      color: var(--cow-text-secondary);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .empty {
      color: var(--cow-text-secondary);
      font-size: 0.875rem;
      text-align: center;
      padding: 2rem;
    }
    .error {
      color: var(--cow-stop, #e74c3c);
      font-size: 0.8125rem;
      padding: 0.5rem;
    }
  `;

  override updated(changed: Map<string, unknown>) {
    if (changed.has("open") && this.open) {
      // Refresh on each open
      this.refresh();
    }
  }

  private async refresh() {
    if (!this.ma) return;
    this.error = "";
    try {
      if (this.tab === "spotify") {
        if (!this.playlists.length) {
          this.loading = true;
          this.playlists = await this.ma.getLibrary("playlist", { limit: 24 });
        }
      } else if (this.tab === "queue") {
        this.loading = true;
        this.queue = await this.ma.getQueue();
      }
    } catch (e) {
      this.error = String((e as Error)?.message ?? e);
    } finally {
      this.loading = false;
    }
  }

  private switchTab = (t: DrawerTab) => {
    this.tab = t;
    this.refresh();
  };

  private close = () => {
    this.dispatchEvent(
      new CustomEvent("cow-music-drawer-close", {
        bubbles: true,
        composed: true,
      }),
    );
  };

  private onSearchInput = (e: Event) => {
    const v = (e.target as HTMLInputElement).value;
    this.query = v;
    if (this.searchTimer) window.clearTimeout(this.searchTimer);
    if (!v.trim()) {
      this.results = [];
      return;
    }
    this.searchTimer = window.setTimeout(() => this.runSearch(), 380);
  };

  private async runSearch() {
    if (!this.ma) return;
    if (!this.query.trim()) return;
    this.loading = true;
    this.error = "";
    try {
      this.results = await this.ma.search(this.query, ["track", "album", "playlist"], 18);
    } catch (e) {
      this.error = String((e as Error)?.message ?? e);
      this.results = [];
    } finally {
      this.loading = false;
    }
  }

  private playItem(item: MaItem) {
    this.dispatchEvent(
      new CustomEvent("cow-music-play-item", {
        detail: item,
        bubbles: true,
        composed: true,
      }),
    );
  }

  private playRadio(r: CowRadioPreset) {
    this.dispatchEvent(
      new CustomEvent("cow-music-radio-play", {
        detail: { url: r.stream, name: r.name },
        bubbles: true,
        composed: true,
      }),
    );
  }

  override render() {
    return html`
      <div class="scrim" @click=${this.close}></div>
      <div class="drawer" role="dialog" aria-label="Sfoglia musica">
        <div class="handle"></div>
        <div class="header-row">
          <div class="tabs">
            <button
              class="tab"
              ?data-active=${this.tab === "spotify"}
              @click=${() => this.switchTab("spotify")}
            >Spotify</button>
            <button
              class="tab"
              ?data-active=${this.tab === "radio"}
              @click=${() => this.switchTab("radio")}
            >Radio</button>
            <button
              class="tab"
              ?data-active=${this.tab === "queue"}
              @click=${() => this.switchTab("queue")}
            >Coda</button>
          </div>
          ${this.deviceLabel
            ? html`<div class="device-chip">📻 ${this.deviceLabel}</div>`
            : nothing}
        </div>

        ${this.tab === "spotify" ? this.renderSpotify() : nothing}
        ${this.tab === "radio" ? this.renderRadio() : nothing}
        ${this.tab === "queue" ? this.renderQueue() : nothing}
      </div>
    `;
  }

  private renderSpotify() {
    const showResults = this.query.trim().length > 0;
    return html`
      <div class="search">
        <input
          class="search-box"
          placeholder=${this.ma?.isMaAvailable
            ? "Cerca su Spotify: brano, artista, album…"
            : "Music Assistant non configurato"}
          .value=${this.query}
          @input=${this.onSearchInput}
          ?disabled=${!this.ma?.isMaAvailable}
        />
      </div>
      <div class="content">
        ${this.error ? html`<div class="error">${this.error}</div>` : nothing}
        ${showResults
          ? this.renderResultGrid("Risultati", this.results)
          : this.renderResultGrid("Le tue playlist", this.playlists)}
      </div>
    `;
  }

  private renderRadio() {
    return html`
      <div class="content">
        ${this.radios.length === 0
          ? html`<div class="empty">Nessuna radio configurata.</div>`
          : html`
              <div class="section-h">Radio preset</div>
              <div class="grid">
                ${this.radios.map(
                  (r) => html`
                    <button class="item" @click=${() => this.playRadio(r)}>
                      <span
                        class="icon-sq"
                        style=${`background:${r.color ?? "#1f1f2e"}${
                          r.image ? `; background-image:url("${r.image}")` : ""
                        }`}
                      >📻</span>
                      <div class="text">
                        <div class="name">${r.name}</div>
                        <div class="sub">In diretta</div>
                      </div>
                    </button>
                  `,
                )}
              </div>
            `}
      </div>
    `;
  }

  private renderQueue() {
    return html`
      <div class="content">
        ${this.loading
          ? html`<div class="empty">Caricamento…</div>`
          : this.queue.length === 0
            ? html`<div class="empty">La coda è vuota.</div>`
            : html`
                <div class="section-h">Coda</div>
                <div class="grid">
                  ${this.queue.map((q) => this.renderItem(q))}
                </div>
              `}
      </div>
    `;
  }

  private renderResultGrid(title: string, items: MaItem[]) {
    if (this.loading && items.length === 0) {
      return html`<div class="empty">Caricamento…</div>`;
    }
    if (items.length === 0) {
      return html`<div class="empty">Nessun risultato.</div>`;
    }
    return html`
      <div class="section-h">${title}</div>
      <div class="grid">${items.map((it) => this.renderItem(it))}</div>
    `;
  }

  private renderItem(item: MaItem) {
    const bg = item.image
      ? `background-image:url("${item.image}")`
      : `background:linear-gradient(135deg,#1ed760,#0e7c3a)`;
    return html`
      <button class="item" @click=${() => this.playItem(item)}>
        <span class="icon-sq" style=${bg}>${item.image ? "" : "♪"}</span>
        <div class="text">
          <div class="name">${item.name}</div>
          <div class="sub">
            ${item.subtitle ?? item.artist ?? item.mediaType}
          </div>
        </div>
      </button>
    `;
  }
}
