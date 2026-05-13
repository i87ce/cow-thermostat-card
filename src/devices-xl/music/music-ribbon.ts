/**
 * Music ribbon — the slim strip that appears below the room-group tiles
 * when something is playing. Has everything the user needs without
 * opening anything: cover art, title/artist, progress bar, transport
 * (⏮ ⏯ ⏭), volume slider, and two right-side triggers: 📋 to open the
 * browse drawer and ⛶ (also tap on the art) to enter the cinema mode
 * full-screen player.
 *
 * Events emitted:
 * - `cow-music-cinema`  → request enter cinema mode
 * - `cow-music-browse`  → request open browse drawer
 * - `cow-music-prev` / `cow-music-next` / `cow-music-toggle`
 * - `cow-music-volume` { detail: 0..1 }
 *
 * No service calls happen here — the parent (cow-room-dashboard-card)
 * owns the `MaClient` and translates events into HA service calls.
 * This keeps the ribbon trivially testable in the local preview.
 */
import { LitElement, html, css, nothing } from "lit";
import { customElement, property } from "lit/decorators.js";
import type { NowPlaying } from "./types.js";

@customElement("cow-xl-music-ribbon")
export class CowXLMusicRibbon extends LitElement {
  @property({ attribute: false }) nowPlaying?: NowPlaying;

  static override styles = css`
    :host {
      display: block;
      position: absolute;
      left: 1.5rem;
      right: 1.5rem;
      top: 19.5rem;
    }

    .ribbon {
      box-sizing: border-box;
      width: 100%;
      height: 5rem;
      background: var(--cow-surface-white);
      border: 0.0625rem solid var(--cow-surface-border);
      border-radius: 1.25rem;
      display: grid;
      grid-template-columns: 5rem 1fr auto auto auto;
      gap: 0.875rem;
      align-items: center;
      padding: 0 1rem 0 0;
      color: var(--cow-text-primary);
      font: inherit;
    }

    .art {
      width: 5rem;
      height: 5rem;
      border-radius: 1.25rem 0 0 1.25rem;
      background-color: var(--cow-surface-button-bg);
      background-size: cover;
      background-position: center;
      cursor: pointer;
      position: relative;
      overflow: hidden;
    }
    .art::after {
      content: "⛶";
      position: absolute;
      inset: 0;
      display: flex;
      align-items: center;
      justify-content: center;
      color: white;
      font-size: 1.5rem;
      opacity: 0;
      background: rgba(0, 0, 0, 0.4);
      transition: opacity 160ms ease;
    }
    .art:hover::after { opacity: 1; }
    .art-fallback {
      position: absolute;
      inset: 0;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 2rem;
      color: var(--cow-text-secondary);
    }

    .info {
      min-width: 0;
      cursor: pointer;
    }
    .title {
      font-size: 1.0625rem;
      font-weight: 700;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .artist {
      font-size: 0.8125rem;
      color: var(--cow-text-secondary);
      margin-top: 0.125rem;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .progress {
      margin-top: 0.5rem;
      display: flex;
      align-items: center;
      gap: 0.5rem;
    }
    .progress .bar {
      width: 16rem;
      max-width: 100%;
      height: 0.1875rem;
      background: var(--cow-surface-button-bg);
      border-radius: 0.09375rem;
      position: relative;
    }
    .progress .bar::before {
      content: "";
      position: absolute;
      left: 0;
      top: 0;
      bottom: 0;
      width: var(--p, 0%);
      background: var(--cow-text-primary);
      border-radius: 0.09375rem;
    }
    .progress .time {
      font-size: 0.6875rem;
      color: var(--cow-text-secondary);
      font-variant-numeric: tabular-nums;
    }

    .controls {
      display: flex;
      align-items: center;
      gap: 0.25rem;
    }

    button.btn {
      border: 0;
      background: transparent;
      color: var(--cow-text-primary);
      width: 2.5rem;
      height: 2.5rem;
      border-radius: 50%;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      font-size: 1.125rem;
      cursor: pointer;
      font: inherit;
      -webkit-appearance: none;
      appearance: none;
      transition: background-color 120ms ease;
    }
    button.btn:hover { background: var(--cow-surface-button-bg); }
    button.btn.primary {
      background: var(--cow-text-primary);
      color: white;
      width: 2.75rem;
      height: 2.75rem;
      font-size: 1.25rem;
    }
    button.btn.primary:hover { background: #000; }

    .vol {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      padding-left: 0.75rem;
      border-left: 0.0625rem solid var(--cow-surface-border);
    }
    .vol-icon {
      font-size: 0.875rem;
      opacity: 0.75;
    }
    .vol-slider {
      width: 5rem;
      height: 0.5rem;
      position: relative;
      cursor: pointer;
    }
    .vol-slider::before {
      content: "";
      position: absolute;
      left: 0;
      right: 0;
      top: 50%;
      height: 0.1875rem;
      background: var(--cow-surface-button-bg);
      border-radius: 0.09375rem;
      transform: translateY(-50%);
    }
    .vol-slider::after {
      content: "";
      position: absolute;
      left: 0;
      top: 50%;
      width: var(--v, 50%);
      height: 0.1875rem;
      background: var(--cow-text-primary);
      border-radius: 0.09375rem;
      transform: translateY(-50%);
    }

    .extras {
      display: flex;
      align-items: center;
      gap: 0.25rem;
      padding-left: 0.75rem;
      padding-right: 0.25rem;
      border-left: 0.0625rem solid var(--cow-surface-border);
    }
  `;

  private emit(name: string, detail?: unknown) {
    this.dispatchEvent(
      new CustomEvent(name, { detail, bubbles: true, composed: true }),
    );
  }

  private onVolumeClick = (e: MouseEvent) => {
    const slider = e.currentTarget as HTMLElement;
    const rect = slider.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    this.emit("cow-music-volume", ratio);
  };

  override render() {
    const np = this.nowPlaying;
    const isPlaying = np?.status === "playing";
    const title = np?.title ?? "—";
    const artistAlbum =
      [np?.artist, np?.album].filter(Boolean).join(" · ") || "";
    const progressPct =
      np?.duration && np?.position != null
        ? Math.min(100, (np.position / np.duration) * 100)
        : 0;
    const volPct = Math.round((np?.volume ?? 0.5) * 100);

    return html`
      <div class="ribbon" role="region" aria-label="Lettore musica">
        <div
          class="art"
          style=${np?.artUrl
            ? `background-image: url("${np.artUrl}")`
            : ""}
          @click=${() => this.emit("cow-music-cinema")}
          role="button"
          aria-label="Apri vista completa"
        >
          ${np?.artUrl ? nothing : html`<span class="art-fallback">♪</span>`}
        </div>

        <div
          class="info"
          @click=${() => this.emit("cow-music-cinema")}
          role="button"
        >
          <div class="title">${title}</div>
          ${artistAlbum
            ? html`<div class="artist">${artistAlbum}</div>`
            : nothing}
          ${np?.duration
            ? html`
                <div class="progress">
                  <span class="time">${formatMmSs(np.position ?? 0)}</span>
                  <div class="bar" style="--p:${progressPct}%"></div>
                  <span class="time">${formatMmSs(np.duration)}</span>
                </div>
              `
            : nothing}
        </div>

        <div class="controls">
          <button
            class="btn"
            @click=${() => this.emit("cow-music-prev")}
            aria-label="Brano precedente"
          >⏮</button>
          <button
            class="btn primary"
            @click=${() => this.emit("cow-music-toggle")}
            aria-label=${isPlaying ? "Pausa" : "Riproduci"}
          >${isPlaying ? "⏸" : "▶"}</button>
          <button
            class="btn"
            @click=${() => this.emit("cow-music-next")}
            aria-label="Brano successivo"
          >⏭</button>
        </div>

        <div class="vol">
          <span class="vol-icon">🔊</span>
          <div
            class="vol-slider"
            style="--v:${volPct}%"
            @click=${this.onVolumeClick}
            role="slider"
            aria-label="Volume"
            aria-valuemin="0"
            aria-valuemax="100"
            aria-valuenow=${volPct}
          ></div>
        </div>

        <div class="extras">
          <button
            class="btn"
            @click=${() => this.emit("cow-music-browse")}
            aria-label="Sfoglia musica"
          >📋</button>
          <button
            class="btn"
            @click=${() => this.emit("cow-music-cinema")}
            aria-label="Vista completa"
          >⛶</button>
        </div>
      </div>
    `;
  }
}

function formatMmSs(s: number): string {
  if (!Number.isFinite(s) || s < 0) return "—";
  const m = Math.floor(s / 60);
  const ss = Math.floor(s % 60).toString().padStart(2, "0");
  return `${m}:${ss}`;
}
