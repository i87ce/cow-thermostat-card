/**
 * Cinema mode — the full-screen player that replaces the hero card
 * when the user taps the album art on the ribbon (or ⛶).
 *
 * Layout (1280px wide design):
 *   ┌────────────┬──────────────────────────────────────┐
 *   │            │ 07:04                          [✕]   │
 *   │  album     │ wed 13 may 2026                       │
 *   │   art      │                                       │
 *   │   18rem    │ Title (3rem)                          │
 *   │            │ Artist · Album                        │
 *   │            │ ━━●━━━━━━━━━                          │
 *   │            │  1:23                    3:45          │
 *   │            │  🔀 ⏮ ⏯ ⏭ 🔁  🔊●━━━ 60%               │
 *   │            │  [Sfoglia Spotify…]  [📻 …]            │
 *   └────────────┴──────────────────────────────────────┘
 *
 * Events: same as the ribbon plus `cow-music-close` and
 * `cow-music-radio-play` { detail: <stream-url> } for the inline radio
 * quick-buttons.
 */
import { LitElement, html, css, nothing } from "lit";
import { customElement, property } from "lit/decorators.js";
import type { MaItem, NowPlaying } from "./types.js";

@customElement("cow-xl-music-cinema")
export class CowXLMusicCinema extends LitElement {
  @property({ attribute: false }) nowPlaying?: NowPlaying;
  /** Up to N favorited radios from MA's library (heart icon in MA). */
  @property({ attribute: false }) favoriteRadios?: MaItem[];
  @property({ type: String }) clockText?: string;
  @property({ type: String }) dateText?: string;
  @property({ type: String }) deviceLabel?: string;

  static override styles = css`
    :host {
      display: block;
      position: absolute;
      left: 1.5rem;
      right: 1.5rem;
      top: 19.25rem;
      height: 23rem;
    }

    .cinema {
      box-sizing: border-box;
      width: 100%;
      height: 100%;
      background: linear-gradient(
        135deg,
        #0f1b3a 0%,
        #1f2f5e 40%,
        #3d2b54 75%,
        #6b3f6b 100%
      );
      color: white;
      border-radius: 1.5rem;
      overflow: hidden;
      display: grid;
      grid-template-columns: 18rem 1fr;
      gap: 2.5rem;
      padding: 2rem 2.25rem;
      font: inherit;
    }

    .album-big {
      width: 18rem;
      height: 18rem;
      border-radius: 1rem;
      background-color: rgba(255, 255, 255, 0.08);
      background-size: cover;
      background-position: center;
      box-shadow: 0 1rem 3rem rgba(0, 0, 0, 0.4);
      position: relative;
    }
    .album-big.fallback::after {
      content: "♪";
      position: absolute;
      inset: 0;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 8rem;
      color: white;
      opacity: 0.85;
    }

    .player-info {
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      min-width: 0;
    }

    .top-row {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
    }
    .clock-mini {
      font-size: 1.375rem;
      font-weight: 500;
      opacity: 0.85;
    }
    .clock-mini .date-mini {
      font-size: 0.8125rem;
      opacity: 0.7;
      font-weight: 400;
    }
    .close-btn {
      width: 2.75rem;
      height: 2.75rem;
      border-radius: 50%;
      background: rgba(255, 255, 255, 0.15);
      color: white;
      border: 0;
      font-size: 1.25rem;
      cursor: pointer;
      transition: background-color 160ms ease;
      font: inherit;
      -webkit-appearance: none;
      appearance: none;
    }
    .close-btn:hover { background: rgba(255, 255, 255, 0.28); }

    .meta .track-title {
      font-size: 3rem;
      font-weight: 300;
      line-height: 1.05;
      letter-spacing: -0.03125rem;
      max-width: 100%;
      overflow-wrap: break-word;
    }
    .meta .track-meta {
      font-size: 1.0625rem;
      opacity: 0.78;
      margin-top: 0.375rem;
    }

    .progress {
      margin-top: 1.125rem;
    }
    .bar {
      height: 0.25rem;
      background: rgba(255, 255, 255, 0.18);
      border-radius: 0.125rem;
      position: relative;
    }
    .bar::before {
      content: "";
      position: absolute;
      left: 0;
      top: 0;
      bottom: 0;
      width: var(--p, 0%);
      background: white;
      border-radius: 0.125rem;
    }
    .time-row {
      display: flex;
      justify-content: space-between;
      font-size: 0.75rem;
      opacity: 0.65;
      margin-top: 0.5rem;
      font-variant-numeric: tabular-nums;
    }

    .controls-row {
      display: flex;
      align-items: center;
      gap: 0.625rem;
      margin-top: 1rem;
    }
    button.ctrl {
      width: 2.75rem;
      height: 2.75rem;
      border-radius: 50%;
      border: 0;
      background: rgba(255, 255, 255, 0.1);
      color: white;
      font-size: 1.25rem;
      cursor: pointer;
      transition: background-color 120ms ease;
      font: inherit;
      -webkit-appearance: none;
      appearance: none;
    }
    button.ctrl:hover { background: rgba(255, 255, 255, 0.22); }
    button.ctrl.primary {
      background: white;
      color: var(--cow-text-primary);
      width: 3.25rem;
      height: 3.25rem;
      font-size: 1.5rem;
    }
    button.ctrl.primary:hover { background: #eee; }

    .vol-cinema {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      padding-left: 0.75rem;
      opacity: 0.85;
      font-size: 0.8125rem;
    }
    .vol-slider {
      width: 8rem;
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
      background: rgba(255, 255, 255, 0.18);
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
      background: white;
      border-radius: 0.09375rem;
      transform: translateY(-50%);
    }

    .browse-row {
      display: flex;
      gap: 0.5rem;
      margin-top: 0.75rem;
      align-items: center;
      flex-wrap: wrap;
    }
    button.chip {
      padding: 0.5rem 1rem;
      border-radius: 1rem;
      background: rgba(255, 255, 255, 0.14);
      color: white;
      font-weight: 600;
      font-size: 0.8125rem;
      cursor: pointer;
      border: 0;
      font: inherit;
      -webkit-appearance: none;
      appearance: none;
      transition: background-color 120ms ease;
    }
    button.chip:hover { background: rgba(255, 255, 255, 0.24); }
    button.chip.primary {
      background: rgba(255, 255, 255, 0.95);
      color: var(--cow-text-primary);
    }
    button.chip.primary:hover { background: white; }
    .device-tag {
      margin-left: auto;
      opacity: 0.6;
      font-size: 0.8125rem;
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
    const hasArt = !!np?.artUrl;

    return html`
      <div class="cinema">
        <div
          class="album-big ${hasArt ? "" : "fallback"}"
          style=${hasArt ? `background-image: url("${np?.artUrl}")` : ""}
        ></div>

        <div class="player-info">
          <div class="top-row">
            <div class="clock-mini">
              ${this.clockText ?? ""}
              ${this.dateText
                ? html`<div class="date-mini">${this.dateText}</div>`
                : nothing}
            </div>
            <button
              class="close-btn"
              @click=${() => this.emit("cow-music-close")}
              aria-label="Riduci a ribbon"
            >✕</button>
          </div>

          <div>
            <div class="meta">
              <div class="track-title">${title}</div>
              ${artistAlbum
                ? html`<div class="track-meta">${artistAlbum}</div>`
                : nothing}
            </div>

            ${np?.duration
              ? html`
                  <div class="progress">
                    <div class="bar" style="--p:${progressPct}%"></div>
                    <div class="time-row">
                      <span>${formatMmSs(np.position ?? 0)}</span>
                      <span>${formatMmSs(np.duration)}</span>
                    </div>
                  </div>
                `
              : nothing}

            <div class="controls-row">
              <button class="ctrl" @click=${() => this.emit("cow-music-shuffle")} aria-label="Shuffle">🔀</button>
              <button class="ctrl" @click=${() => this.emit("cow-music-prev")} aria-label="Precedente">⏮</button>
              <button
                class="ctrl primary"
                @click=${() => this.emit("cow-music-toggle")}
                aria-label=${isPlaying ? "Pausa" : "Riproduci"}
              >${isPlaying ? "⏸" : "▶"}</button>
              <button class="ctrl" @click=${() => this.emit("cow-music-next")} aria-label="Successivo">⏭</button>
              <button class="ctrl" @click=${() => this.emit("cow-music-repeat")} aria-label="Repeat">🔁</button>
              <div class="vol-cinema">
                <span>🔊</span>
                <div
                  class="vol-slider"
                  style="--v:${volPct}%"
                  @click=${this.onVolumeClick}
                  role="slider"
                  aria-label="Volume"
                  aria-valuenow=${volPct}
                ></div>
                <span>${volPct}%</span>
              </div>
            </div>

            <div class="browse-row">
              <button
                class="chip primary"
                @click=${() => this.emit("cow-music-browse")}
              >Sfoglia Spotify…</button>
              ${(this.favoriteRadios ?? []).map(
                (r) => html`
                  <button
                    class="chip"
                    @click=${() =>
                      this.emit("cow-music-play-item", r)}
                  >📻 ${r.name}</button>
                `,
              )}
              ${this.deviceLabel
                ? html`<span class="device-tag">📡 ${this.deviceLabel}</span>`
                : nothing}
            </div>
          </div>
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
