import { LitElement, html, css } from "lit";
import { customElement, property } from "lit/decorators.js";
import { buttonReset } from "../styles/button-reset.js";
import type { CowSceneConfig } from "../config-xl.js";

/**
 * XL scene shortcuts row — N (typically 4) buttons centered horizontally.
 * Each button: dot accent + icon + label.
 * Emits `cow-scene-tap` { service } on click.
 */
@customElement("cow-xl-scenes")
export class CowXLScenes extends LitElement {
  @property({ type: Array }) scenes: CowSceneConfig[] = [];

  static override styles = [
    buttonReset,
    css`
      :host {
        display: block;
        position: absolute;
        left: 1.5rem;
        right: 1.5rem;
        top: 40.5rem;
      }
      .row {
        display: flex;
        justify-content: center;
        gap: 0.5rem;
      }
      .scene {
        flex: 1;
        min-width: 0;
        max-width: 17.5rem;
        height: 2.75rem;
        background: var(--cow-surface-white);
        border: 0.0625rem solid var(--cow-surface-border);
        border-radius: 0.75rem;
        display: flex;
        align-items: center;
        gap: 0.5rem;
        padding: 0 0.65rem;
        font-weight: 600;
        font-size: 0.8125rem;
        color: var(--cow-text-primary);
      }
      .dot {
        width: 0.5rem;
        height: 0.5rem;
        border-radius: 50%;
        flex: 0 0 0.5rem;
      }
      .icon {
        font-size: 0.95rem;
        flex: 0 0 auto;
      }
      .label {
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
    `,
  ];

  private onTap(s: CowSceneConfig) {
    this.dispatchEvent(
      new CustomEvent("cow-scene-tap", {
        detail: { service: s.service, name: s.name },
        bubbles: true,
        composed: true,
      }),
    );
  }

  override render() {
    return html`
      <div class="row">
        ${this.scenes.map(
          (s) => html`
            <button class="scene" @click=${() => this.onTap(s)}>
              <span
                class="dot"
                style=${`background:${s.accent ?? "var(--cow-text-primary)"}`}
              ></span>
              ${s.icon
                ? html`<span
                    class="icon"
                    style=${`color:${s.accent ?? "var(--cow-text-primary)"}`}
                    >${s.icon}</span
                  >`
                : ""}
              <span class="label">${s.name}</span>
            </button>
          `,
        )}
      </div>
    `;
  }
}
