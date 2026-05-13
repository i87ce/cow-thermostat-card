/**
 * "Resume last" pill — visible in the header top-right when the speaker
 * is idle. Shows the last-played title and triggers a play resume on tap.
 *
 * Designed to slot in next to the weather pill so the header stays
 * symmetric. When nothing has ever been played the pill renders a
 * compact "Musica" placeholder that opens the browse drawer directly.
 */
import { LitElement, html, css, nothing } from "lit";
import { customElement, property } from "lit/decorators.js";
import type { NowPlaying } from "./types.js";

@customElement("cow-xl-music-pill")
export class CowXLMusicPill extends LitElement {
  @property({ attribute: false }) nowPlaying?: NowPlaying;

  static override styles = css`
    :host {
      display: inline-flex;
    }
    .pill {
      display: inline-flex;
      align-items: center;
      gap: 0.5rem;
      height: 2.25rem;
      padding: 0 1rem 0 0.375rem;
      background: var(--cow-surface-white);
      border: 0.0625rem solid var(--cow-surface-border);
      border-radius: 1.125rem;
      font-size: 0.8125rem;
      font-weight: 500;
      color: var(--cow-text-primary);
      cursor: pointer;
      transition: box-shadow 160ms ease;
      max-width: 18rem;
      font: inherit;
    }
    .pill:hover { box-shadow: 0 0.125rem 0.5rem rgba(31,31,46,0.06); }
    .art {
      width: 1.5rem;
      height: 1.5rem;
      border-radius: 0.375rem;
      background-color: var(--cow-surface-button-bg);
      background-size: cover;
      background-position: center;
      flex: 0 0 auto;
    }
    .play { font-size: 0.875rem; opacity: 0.7; }
    .title {
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      max-width: 11rem;
    }
  `;

  private onTap = () => {
    this.dispatchEvent(
      new CustomEvent("cow-music-resume", { bubbles: true, composed: true }),
    );
  };

  override render() {
    const np = this.nowPlaying;
    const title = np?.title ?? "Musica";
    const art = np?.artUrl;
    return html`
      <button class="pill" @click=${this.onTap}>
        <span
          class="art"
          style=${art ? `background-image: url("${art}")` : ""}
        ></span>
        <span class="play">▶</span>
        <span class="title">${title}</span>
        ${nothing}
      </button>
    `;
  }
}
