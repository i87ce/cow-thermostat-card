# Changelog

All notable changes to this project will be documented in this file.
The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and
this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.2.3] — 2026-05-08

### Fixed
- Black focus rectangle around buttons (most visible on the power toggle on
  the Shelly Wall Display webview) caused by the user-agent default
  `outline` on focused `<button>` inside each molecule's shadow root.
  The reset in `global.ts` only scoped to the card's shadow, not the
  molecules. New shared `styles/button-reset.ts` is now imported by
  mode-button, fan-button, arrow-button, control-button, preset-chip and
  power-toggle. Keyboard a11y preserved via `:focus-visible`.

## [0.2.2] — 2026-05-08

### Fixed
- v0.2.1 used `filename: "cow-thermostat-card.zip"` in `hacs.json`, which
  caused HACS to register `/hacsfiles/.../cow-thermostat-card.zip` as the
  Lovelace module resource. The browser then tried to load the zip as a
  JavaScript module and failed silently with "Custom element doesn't exist".
  `filename` must point to the entry JS *within* the unzipped folder, not
  at the zip itself; HACS still downloads the zip (any `.zip` asset on the
  release works) and unpacks it.

## [0.2.1] — 2026-05-08

### Fixed
- HACS install was missing the Inter woff2 fonts because v0.2.0 release only
  shipped `cow-thermostat-card.js`. Switched `hacs.json` to `zip_release: true`
  and the release workflow now packages js + 5 woff2 into
  `cow-thermostat-card.zip` so HACS unpacks all assets into
  `/hacsfiles/cow-thermostat-card/`.

## [0.2.0] — 2026-05-08

### Changed
- `climate`, `light` and `cover` are now **all optional** (was: all required).
  At least one must be configured. The swiper renders only the panels you
  configure: drop `climate` and you get a 2-panel card (lights + blinds);
  drop two of them and you get a single-panel card with no swipe.
- `initial_view` defaults to the first available panel in order
  thermostat → lights → blinds (was: always thermostat).
- `initial_view` now validates against the actually configured entities
  (e.g. `initial_view: thermostat` without `climate` errors clearly).

### Added
- Per-room dashboard examples for Sala, Cucina, Camera Padronale, Camera 1, Studio.
- Preview harness gains a "Panels" selector to test 1/2/3-panel configurations.

## [0.1.0] — 2026-05-08

### Added
- Initial release.
- 12 pixel-perfect variants (4 thermostat / 4 blinds / 4 lights) from Figma `o61NCf1Pdc2ErT26eH2PHX`.
- Container-query scaling for any square viewport (Shelly Wall Display SAWD1, X2i, XL).
- Pointer-events horizontal swiper between Thermostat / Blinds / Lights.
- Embedded Inter font (Light / Regular / Medium / SemiBold / Bold).
- Validated YAML config schema (`climate`, `light`, `cover`, optional sensors).
- Preview harness in `examples/preview.html` with mocked `hass`.
- Setup docs for HA `mcp_server`, kiosk-mode, Wall Display, and visual verification.
- HACS-compatible repo layout + GitHub Actions release workflow.
