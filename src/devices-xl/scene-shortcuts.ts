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
        cursor: pointer;
        touch-action: manipulation;
        transition: transform 120ms ease;
      }
      .scene:active {
        transform: scale(0.97);
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
      .scene.icon-only {
        width: 4rem;
        justify-content: center;
        gap: 0;
        padding: 0;
      }
      .scene.icon-only .icon {
        font-size: 1.5rem;
      }
    `,
  ];

  private renderIcon(s: CowSceneConfig, size: string) {
    if (!s.icon) return "";
    const color = s.accent ?? "var(--cow-text-primary)";
    if (s.icon.startsWith("mdi:")) {
      return html`<ha-icon
        class="icon"
        .icon=${s.icon}
        style=${`color:${color};--mdc-icon-size:${size}`}
      ></ha-icon>`;
    }
    return html`<span class="icon" style=${`color:${color}`}>${s.icon}</span>`;
  }

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
        ${this.scenes.map((s) =>
          s.icon_only
            ? html`
                <button
                  class="scene icon-only"
                  title=${s.name}
                  aria-label=${s.name}
                  @click=${() => this.onTap(s)}
                >
                  ${this.renderIcon(s, "1.5rem")}
                </button>
              `
            : html`
                <button class="scene" @click=${() => this.onTap(s)}>
                  <span
                    class="dot"
                    style=${`background:${s.accent ?? "var(--cow-text-primary)"}`}
                  ></span>
                  ${this.renderIcon(s, "1.375rem")}
                  <span>${s.name}</span>
                </button>
              `,
        )}
      </div>
    `;
  }
}
