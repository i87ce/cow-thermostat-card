# Changelog

All notable changes to this project will be documented in this file.
The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and
this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.5.0] — 2026-05-12

### Added — Phase 2: Drawer slide-up (XL card)

Tap on a room chip now opens a full slide-up drawer with per-room controls.
Replicates Figma frames "11. Mix — Drawer Open / Blinds / Climate" pixel-by-pixel.

- **`cow-xl-drawer`** — slide-up animation (220 ms ease-out), drag handle,
  room title + auto-built subtitle ("3 luci · 2 tapparelle · termostato"),
  contextual status pill (e.g. "Riscaldando 23°", "2/3 accese") and close ✕.
- **Tab strip** with 4 tabs:
  - 💡 **Lights** — climate-mini tile (always visible on the left so you
    never lose sight of the thermostat), then one tile per light with
    bulb visual, brightness %, − / slider / + and power toggle. Bottom
    "Tutte ON" / "Tutte OFF" master action bar.
  - ▤ **Blinds** — wide tile per cover with blind visual on the left and
    position % + status + ▲ Apri / ■ Stop / ▼ Chiudi + 25/50/75/100 presets
    on the right. Bottom "Apri tutte" / "Chiudi tutte" master bar.
  - 🌡 **Climate** — full-width thermostat with HEATING/COOLING/IDLE
    indicator, current temperature (huge), setpoint + ▼/▲, mode buttons
    (Cool/Heat/Off), fan modes, humidity. Bottom presets:
    🏠 Comfort 22° / 🌿 Eco 19° / ❄ Antigelo 8°.
  - 🔒 **Sicurezza** — placeholder for Phase 3 (alarm, locks, sensors).
- Tabs auto-disable when the room has no entity for that domain (e.g. a
  room without `climate` shows Climate as faded/non-clickable).
- Tap the same chip again, or the ✕ button, or the drag handle → drawer
  closes (180 ms ease-in).
- Tap a different chip while open → instant room switch, drawer stays open.

### Token additions
- `--cow-thermostat-orange[-dark]`, `--cow-blinds-blue[-dark]`,
  `--cow-lights-yellow`, `--cow-lights-glow-bg` — semantic aliases for
  the new XL drawer tiles.

## [0.4.1] — 2026-05-12

### Fixed (XL card UI polish)
- Hero card now stretches edge-to-edge in the available width (was 77rem
  fixed → now 100% of `.hero-wrap`). Looks correctly proportioned on a
  full-width Wall Display XL.
- Sun glow + sun core resized & repositioned so the central temperature
  text no longer sits on top of the sun.
- Clock pushed up 1.5rem to leave more room for the date underneath.
- Room chips: bigger (5rem instead of 4rem), bigger icon (1.375rem),
  bigger label font (0.875rem), and a coloured pill badge for the active-
  device count (orange when > 0, gray when 0, white-on-dark when chip is
  active). Icon now sits center-left under the badge.
- Drawer peek: switched from a 2-line vertical layout (handle + hint
  underneath, often clipped by the parent container's bottom edge) to a
  single-line horizontal layout (handle ‖ hint side-by-side), height
  reduced from 3rem to 2.5rem so it always fits.
- Layout y-offsets readjusted so chip-row → divider → hero → scenes →
  drawer-peek stack visually with consistent spacing.

## [0.4.0] — 2026-05-12

### Added
- **New custom element `cow-room-dashboard-card`** for the Wall Display XL
  (10.1", landscape 1280×800). Bundled into the same JS file — installing
  the HACS plugin gives you both cards.
- XL Phase 1 (Idle state): chip-row room navigator (header) with active-
  device count per room, weather + media-player pills (top right), hero
  gradient card (sky→peach with sun glow) with localized clock + date and
  weather hero (current temp + condition + apparent + wind + humidity),
  scene shortcuts row (4 customizable buttons), drawer peek with handle.
- Config schema: `rooms[]`, `weather_entity`, `media_player`, `scenes[]`,
  `locale`. Each room has `name`, `icon`, `light`, `cover`, `climate`.
- Container-query scaling on `inline-size`: 1rem == 1280-design-px / 80,
  so the design scales horizontally to any viewport while preserving the
  1280:800 aspect ratio.
- Defaults: 4 built-in scenes (Tutto OFF / Apri tutto / Notte / Cinema)
  if `scenes` is omitted.

### Internal
- `src/styles/global-xl.ts`, `src/config-xl.ts`,
  `src/devices-xl/{header-row,hero-card,scene-shortcuts}.ts`,
  `src/cow-room-dashboard-card.ts`.
- `examples/preview-xl.html` for local sanity checks.

### Pending (Phase 2)
- Drawer slide-up on chip tap, with per-room Lights / Blinds / Climate
  tabs reusing the existing molecules and state machines.

## [0.3.0] — 2026-05-11

### Added
- Multi-entity support: `light` and `cover` config keys now accept either
  a single entity_id (string) or an array of entity_ids. The Lights and
  Blinds panels gain a horizontal chip selector at the bottom right
  showing one chip per entity plus an "All" chip.
- New `light_labels` and `cover_labels` optional arrays for friendly chip
  names. If omitted, labels are auto-derived from each entity_id by
  stripping common prefixes (`led_`, `luce_`, `light_`, `cover_`,
  `tapparella_`) and the room slug.
- Aggregated views: when "All" is selected, the master controls act on
  every entity at once — bulb and slider show the AVERAGE brightness of
  ON lights, blinds visual shows the AVERAGE position of all covers
  ("MOVING" if any one is moving). Service calls (turn_on/off,
  set_brightness, open/close/stop, set_position) are batched to all
  selected entity_ids in a single call.
- New `cow-entity-selector` molecule (chip row, hidden when only 1 entity).

### Internal
- `CowConfig` now has `lights: string[]`, `lightLabels: string[]`,
  `covers: string[]`, `coverLabels: string[]` (always normalized arrays).
  Old single-string YAML still works (auto-wrapped to a 1-item array).
- `aggregateLightsView` and `aggregateBlindsView` in the state machines.

## [0.2.4] — 2026-05-11

### Fixed
- HACS download failed silently with "Could not download" since v0.2.2.
  Root cause: HACS only downloads from a release when `hacs.json.filename`
  ends with `.zip`. v0.2.1 (filename: `*.zip`) did download, but HACS
  then registered the `.zip` itself as the Lovelace JS module — broken.
  v0.2.2/v0.2.3 (filename: `*.js`) made HACS skip the release entirely.

  Fix: switch to single-file distribution. The 5 Inter woff2 fonts are
  inlined as base64 `data:` URLs at build time
  (`scripts/embed-fonts.mjs` → `src/styles/font-data.ts` →
  `src/styles/typography.ts`), so the bundle ships as a single
  `cow-thermostat-card.js` (~820KB). HACS now downloads that one file
  cleanly and registers it as the Lovelace module. Trade-off: bigger
  bundle, but cached by the browser after first load.
- Repo is now public. The `make_public` switch was the trigger for this
  investigation (HACS error persisted after going public, surfacing the
  real bug above).

### Internal
- `hacs.json`: removed `zip_release: true`.
- `release.yml`: workflow now ships a single `cow-thermostat-card.js` asset.
- `rollup.config.mjs`: removed the woff2 copy plugin and dropped the
  source map from the release bundle.
- `.gitignore`: ignore the generated `src/styles/font-data.ts`.

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
