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
      }
      .row {
        display: flex;
        justify-content: center;
        gap: 1rem;
      }
      .scene {
        width: 17.5rem;
        height: 4rem;
        background: var(--cow-surface-white);
        border: 0.0625rem solid var(--cow-surface-border);
        border-radius: 1rem;
        display: flex;
        align-items: center;
        gap: 0.75rem;
        padding: 0 1rem;
        font-weight: 600;
        font-size: 1rem;
        color: var(--cow-text-primary);
      }
      .dot {
        width: 0.625rem;
        height: 0.625rem;
        border-radius: 50%;
        flex: 0 0 0.625rem;
      }
      .icon {
        font-size: 1.125rem;
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
              <span>${s.name}</span>
            </button>
          `,
        )}
      </div>
    `;
  }
}
