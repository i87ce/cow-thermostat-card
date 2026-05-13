# Changelog

All notable changes to this project will be documented in this file.
The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and
this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.8.4] — 2026-05-13

### Fixed
- **`cow-thermostat-card` was too small in panel mode** on the Shelly
  Wall Display kiosk. Lovelace's `<hui-panel-view>` adds an 8 px
  padding all around its single child, so on a 480×480 display the
  card painted into a 464×464 box, leaving a visible black border on
  every side. We now detect at `connectedCallback` time whether we
  are inside a panel view (walk the DOM until we hit
  `<hui-panel-view>` or `<ha-panel-lovelace>`) and toggle a `panel`
  attribute on `:host`. The CSS in `globalShell` promotes
  `:host([panel])` to `position: absolute; inset: 0` so the card
  draws edge-to-edge.

## [0.8.4–0.8.14] — 2026-05-13

### Fixed — kiosk full-screen rendering on Shelly Wall Display
Tracking down why the card painted into a tiny 384×384 box in the
middle of a 480×480 (or 720×720 screenshot) Shelly Wall Display
turned into a six-step deep-dive. The series of patches converged on
v0.8.14 which actually renders edge-to-edge:
- **v0.8.4**: detect `<hui-panel-view>` ancestor and promote :host
  to `position: absolute; inset: 0`.
- **v0.8.5**: switch to `position: fixed` to escape every wrapper.
- **v0.8.6**: drop CSS Container Queries (`100cqmin / 24`) — the
  Shelly kiosk browser doesn't support them — and use `100vmin / 24`.
- **v0.8.7**: broaden ancestor detection to also accept `hui-root`,
  `home-assistant-main`, `ha-app-layout`; add `console.warn` so we
  can see the chain at runtime.
- **v0.8.8**: `?kiosk` URL is a strong panel-mode signal even when no
  ancestor matches.
- **v0.8.9**: panel-mode :host gets `z-index: 100` + a background so
  it actually paints above kiosk-mode plugin overlays.
- **v0.8.10**: drop the cqmin attempt entirely.
- **v0.8.11**: hardcode `font-size: 30px` so 24rem = 720px regardless
  of viewport/container.
- **v0.8.12**: panels (`blinds-panel`, `lights-panel`,
  `thermostat-panel`) drop their `width/height: 24rem` cap in favour
  of `width: 100%; height: 100%; position: relative`.
- **v0.8.13**: `device-swiper` slide becomes `align-items: stretch` +
  `::slotted(*) { flex:1 1 auto; width:100%; height:100% }` so the
  slotted panel actually receives full height (flex centering was
  collapsing it).
- **v0.8.14**: ROOT CAUSE — `cow-split-panel`'s `:host { width:24rem;
  height:24rem }` was still capping every panel that goes through
  the split layout (blinds, lights, thermostat). Switched to
  `width: 100%; height: 100%` + grid `1fr 1fr` columns. The card
  finally fills the screen edge-to-edge.

## [0.8.3] — 2026-05-13

### Added
- **`cow-redirect-card`** — a tiny new card that solves the Shelly
  Wall Display kiosk's habit of always opening `/lovelace` (ignoring
  HA's per-user `default_panel`). Drop one of these in the Overview
  dashboard and on mount it reads `hass.user.name` and `replace()`s
  the URL to the matching room kiosk page (e.g. user `c1` →
  `/walldisplay-camera-1/0?kiosk`). Admins / unmapped users get a
  small navigation grid with every room dashboard.
- Username → URL map embedded in the card mirrors the
  `ha-fix-displays.mjs` / `ha-merge-lovelace.mjs` scripts. Update all
  three together when a new display lands.

### Internals
- `HomeAssistant` type gained an optional `user` field
  (`{id, name, is_admin?}`) that the HA frontend already injects but
  wasn't declared in our subset.

## [0.8.2] — 2026-05-13

### Fixed
- **Cinema mode no longer overflows.** The full-screen player had
  `width: 100%` + `padding: 2.25rem 2.5rem` with the default
  `box-sizing: content-box`, so padding was added *on top of* the
  100% width — pushing the ✕ close button past the right edge and
  growing the host by 4.5 rem vertically, which made the scene
  shortcuts row visually overlap the cinema panel. Switched both
  `.cinema` and `.ribbon` to `box-sizing: border-box`, and trimmed
  cinema padding from 2.25/2.5 → 2.0/2.25 rem for a touch more room.

## [0.8.1] — 2026-05-13

### Changed
- **Radios are now MA-driven, not hardcoded.** The drawer's Radio tab
  is a live search box that hits `music_assistant.search` with
  `media_type: ["radio"]` (Radio Browser provider, ~50k stations) and
  falls back to the user's MA favorites
  (`music_assistant.get_library` with `favorite: true`) when the box
  is empty. Cinema mode shows the top N (default 6) favorited radios
  as quick-chips instead of YAML-configured presets.
- **Removed** `music.radios[]` from the card config schema. The only
  optional knob left is `music.favorite_radios_limit` (cinema chips).
- Cinema "📻 RDS / Deejay / Italia" chips now dispatch
  `cow-music-play-item` with the real `MaItem` from MA — so MA
  resolves the stream URL through its proxy and routes audio to the
  speaker. Plain-HTTP `playUrl()` path is still available in the
  client for ad-hoc URL playback.

### Internals
- `MaClient.searchRadios(query, limit)` and
  `MaClient.getFavoriteRadios(limit)` helpers.
- `cow-room-dashboard-card` lazily fetches favorite radios on first
  cinema/drawer open and caches them for the session.

## [0.8.0] — 2026-05-13

### Added
- **Music block** — the tiny now-playing pill in the header is replaced
  by a real music player wired to Home Assistant + Music Assistant.
  Three UI modes driven by `media_player.<target>.state`:
  - **idle** → a "▶ Riprendi" pill in the header top-right next to the
    weather pill. Tap = resume last track on the speaker.
  - **playing / paused** → a full-width `cow-xl-music-ribbon` appears
    between the chip tiles and the hero. Shows album art, title +
    artist + album, progress bar, transport (⏮ ⏸/▶ ⏭), volume slider,
    a 📋 button that opens the browse drawer, and a ⛶ button (or tap
    on the album art) that expands into…
  - **cinema** → the live-sky hero is replaced by `cow-xl-music-cinema`:
    a wallpaper-sized player with a 18 rem album cover on the left and
    title + transport + volume + radio quick-chips on the right. A
    small clock + date stays in the top-right of the cinema panel. ✕
    returns to the ribbon.
- **Music drawer** — slide-up panel with three tabs:
  - **Spotify** — search box (debounced 380 ms) hitting the
    `music_assistant.search` service across track/album/playlist; when
    empty, falls back to the user's Spotify playlists via
    `music_assistant.get_library`.
  - **Radio** — quick-tap chips for configured radio presets. Plays
    via `media_player.play_media` directly with the raw HTTP/HLS URL
    so MA isn't in the loop for plain radio streams.
  - **Coda** — current Music Assistant queue.
- **Hero compact mode** — the `cow-xl-hero` element now reflects a
  `compact` attribute that shrinks the host to 17.5 rem, scales the
  clock to 7 rem, and tightens the celestial body / weather pill. The
  parent passes `compact` when the music ribbon is visible so both fit
  inside the 50 rem card height without overlapping the scene
  shortcuts.
- **New config keys** on `custom:cow-room-dashboard-card`:
  - `media_player`: the speaker entity (e.g. `media_player.display_sala`).
  - `music_assistant_id`: the MA config entry id (a ULID string from
    `config_entries/get?domain=music_assistant`). Required for search
    & browse, optional for plain transport.
  - `music.radios[]`: list of `{name, stream, image?, color?}` quick
    presets shown in the drawer Radio tab + as inline chips in cinema
    mode.

### Internals
- New `src/devices-xl/music/` package with 4 Lit components
  (`music-pill`, `music-ribbon`, `music-cinema`, `music-drawer`) plus
  a `MaClient` wrapper around `hass.callService` that normalizes MA
  responses (`{response: {tracks/albums/playlists/items: [...]}}`
  shapes) into a single `MaItem` interface.
- `HomeAssistant.callService` type updated to accept the HA ≥ 2024.4
  `notifyOnError + returnResponse` overload so we can `await` typed
  responses from MA.
- `cow-xl-header` now accepts a `musicPillSlot: TemplateResult` so
  the parent owns what's rendered alongside the weather pill (idle
  pill, nothing during ribbon/cinema, future overlays, etc.). The
  legacy `mediaPlayer` prop is kept for backwards compatibility but
  is overridden when `musicPillSlot` is present.

## [0.7.3] — 2026-05-12

### Changed
- **Chip activity badges split by device type** — the single orange
  badge per chip is replaced by up to three category-tinted badges:
  blue (`--cow-blinds-medium`) for open blinds, yellow
  (`--cow-lights-bright`) for lights on, orange (`--cow-heating-primary`)
  for an active climate. A badge is rendered only when its count > 0,
  so rooms with everything off look clean (no badges at all). On the
  active (dark) chip background the badges invert to white-on-text.
- New helper `countActiveByCategory(room, states)` in `config-xl.ts`
  returns the per-class breakdown. The original `countActiveDevices`
  remains as a thin sum-wrapper for any external callers.

## [0.7.2] — 2026-05-12

### Fixed
- **Room names invisible inside chip tiles on HA** — `header-row.ts`
  was the only file in the XL pipeline that did NOT pull in
  `globalShellXL` (where the `button { color: inherit }` reset lives),
  so the `<button>` chips inherited HA's theme default button color
  (white-ish on most light themes) instead of `--cow-text-primary`.
  Result on the actual Wall Display: emoji icon + count badge visible,
  room name rendered in white-on-white. Added explicit
  `color: var(--cow-text-primary)` + `font: inherit` + `appearance: none`
  on `.chip` and the `.pill button.play` reset so this never bites again,
  no matter which theme HA is serving.

## [0.7.1] — 2026-05-12

### Changed
- **Group tile labels readable** — the small uppercase group name above
  each tile (LIVING, ZONA NOTTE, SERVIZI, ALTRO) was 10 px and rendered
  in `--cow-text-secondary` (light grey on light grey); essentially
  invisible at arm's length on the Wall Display. Bumped to 14 px,
  primary-text color, slightly more breathing room above the chips.
  Header section grew by ~1.5 rem; divider/hero/scenes y-positions
  nudged down to compensate while keeping the bottom drawer-peek
  pinned to the same place.

## [0.7.0] — 2026-05-12

### Added
- **Live sky hero** — the big hero card behind the clock is now a
  living wallpaper driven by three Home Assistant entities:
  - `sun.sun` (built-in) → sky gradient interpolated across six
    keyframes from deep-night through astronomical and civil twilight
    to full daylight; animated sun arcs across the sky following live
    `elevation` + `azimuth`.
  - `sensor.moon` (requires the `moon:` integration — one line in
    `configuration.yaml`) → moon rendered at night using the classic
    two-overlapping-circles clip technique; all 8 phases supported
    (`new_moon`, `waxing_crescent`, `first_quarter`, `waxing_gibbous`,
    `full_moon`, `waning_gibbous`, `last_quarter`, `waning_crescent`).
    The dark side has its own deep-slate radial gradient (slightly
    brighter at the limb to suggest earthshine) so the unlit portion
    of the disc reads as a 3D sphere in shadow rather than a hole
    punched through to the sky.
  - `weather.*` → weather visual effects layered over the sky: drifting
    clouds, falling rain, drifting snow, low fog wash, brief lightning
    flashes (driven off the standard HA condition states).
- **Stars + foreground contrast** — ~60 deterministic stars (seeded LCG,
  positions stay put across re-renders) fade in as the sun drops below
  3° and twinkle on staggered delays. Clock + date + weather text auto-
  shift to a soft off-white with a subtle drop-shadow on dark skies so
  the panel stays readable at midnight.
- **New optional config keys**:
  - `sun_entity` — defaults to `sun.sun`
  - `moon_entity` — defaults to `sensor.moon`
  Both can be set to `null`/omitted to disable; the card falls back to
  a static day palette and skips the moon if either is missing.
- **Preview controls** — `examples/preview-xl.html` now has sliders for
  sun elevation/azimuth and dropdowns for the weather condition and the
  moon phase so the whole sky engine can be exercised live in the
  browser without waiting for actual sunset.

### Notes
- All animation is pure `transform`/`opacity` on GPU-accelerated layers
  — zero `filter: blur()`, zero `backdrop-filter`, no canvas. Tested on
  the MTK6580 SoC in the Shelly Wall Display: the live sky doesn't
  measurably increase render time vs. the previous static hero.
- Re-evaluation cadence: the hero re-renders every 30 s (the existing
  clock tick) plus on any `hass` state change. Cloud drift, rain, snow,
  twinkle and lightning flashes run continuously as pure CSS keyframes.

## [0.6.0] — 2026-05-12

### Added
- **Room-group tiles in XL header** — rooms can now be clustered into
  visually distinct "tiles" via the new optional `group: <label>` field
  on each room. The XL header lays the tiles side-by-side with width
  proportional to the number of chips inside each, giving order to
  layouts with many rooms (e.g. *Living / Zona notte / Servizi / Altro*).
  Rooms without `group` fall into a trailing "Altro" tile. Fully
  backward-compatible: configs that omit `group` render the previous
  single-row layout.

### Changed
- **`walldisplay-sala-cucina.yaml` example** — reorganized the 11 rooms
  into the 4 tiles described above. *Padronale* now includes the cabina
  armadio LED plus the two `light.comodino_0[12]` helpers and the LED
  soffitto (`light.led_camera_3`). *Sala & Cucina* picks up the two
  new lights `light.led_corridoio_p1` and `light.led_cucina` (HA area
  reshuffle). New chips: *Garage*, *Ingresso PT* (luce_scala +
  sgabuzzino_pt — the HA area was renamed from "Scala" to "Ingresso
  PT"), *Esterno* (terrazzo + esterno P1 + esterna studio),
  *Lavanderia*. The *Cabina armadio* no longer has its own chip — its
  controls live inside Padronale. Removed the dead
  `sensor.shellywalldisplay_000822d2d2c5_*` ambient-sensor references
  from Sala & Cucina (the Display Sala has no temperature/humidity
  sensor; one will be wired in a future hardware change).

## [0.5.3] — 2026-05-12

### Added
- **Ambient sensor chip in drawer header** — when a room has
  `temperature` / `humidity` sensors but no `climate` entity, a small
  sky-blue chip (`🌡 22° · 💧 49%`) sits inline with the room name in
  the drawer header. Live values pulled from the configured sensors.
- **Tap-to-toggle on light tile** — the entire light tile is now a
  button: tap anywhere on it to flip on/off. The brightness slider,
  +/− buttons and inline power switch keep working independently
  (clicks are stopped at the controls level so they don't double-fire).
  Includes proper keyboard support (Enter/Space) and ARIA pressed
  state.

### Changed
- **Lights tab — climate-mini removed for sensors-only rooms** — the
  blue ambient mini tile no longer shows up in the Lights tab when
  there's no climate entity. Temperature/humidity now live in the
  drawer-header chip; the dedicated Climate tab keeps the full
  monitoring view. When a room DOES have a climate entity, the orange
  thermostat-mini still shows up unchanged.
- **Blinds tab — compact card grid** — fixed-height (8.75rem) cards in
  a 2-column auto-fill grid. Smaller blind visual (4.5rem wide), label
  and percentage on the same head row, action buttons at the bottom.
  Position presets row removed (low signal, lots of vertical cost) —
  use Apri/Stop/Chiudi or the Lovelace details for fine control.
- **Climate sensors-only — cleaner monitoring card** — dedicated
  3-column layout (Temperature · Humidity · Suggerimento). Removed the
  raw `sensor.*` entity_id that was being shown verbatim. Removed the
  big dashed footer warning; "aggiungi un `climate.*` alla stanza"
  is now a subtle hint inside the suggestion column.

## [0.5.2] — 2026-05-12

### Fixed
- **XL drawer — internal item heights**: light-tile, climate-mini and
  blind-card content was sized for the design canvas only and could
  overflow or get clipped when the drawer body was shorter than expected
  (e.g. narrow viewport, or Lovelace panel forcing a non-1280:800
  ratio). Power switch on light tiles was being hidden behind the
  master action bar.

### Changed
- **Light tile** (XL drawer Lights tab): smaller bulb (5.5rem instead
  of 7.5rem), smaller value text (2rem instead of 3rem), and the power
  toggle is now in the same row as the brightness slider/buttons —
  visually compact and always inside the tile bounds.
- **Climate-mini tile** (Lights tab, sensors-only and full-thermostat
  variants): rebuilt as a 3-row grid (top: icon + AMBIENTE/state label;
  middle: big temperature centered with optional setpoint chip; bottom:
  fan/humidity badge). No more huge empty spacer.
- **Blind card** (Blinds tab): more compact — single-card-per-row grid
  with min-width 28rem, smaller blind visual (7.5×8.5rem instead of
  10×12.5rem), tighter typography, smaller preset chips (1.75rem high).
- **Drawer body row** uses `bottom: 5rem` instead of fixed `height:
  20rem` so the tile area adapts when the drawer height shrinks.

## [0.5.1] — 2026-05-12

### Added
- **Ambient sensors per room** — new optional `temperature` and `humidity`
  config fields (sensor.* entity_ids). Used as a fallback when no
  `climate.*` entity is configured for the room (typical for open-plan
  Sala & Cucina with no thermostat).
- **Climate tab "Sensors-only" mode** — when a room has no climate but
  has temperature/humidity sensors, the Climate tab renders a sky-blue
  card with big temp + humidity + comfort-level hint + actionable
  advisory ("Apri le tapparelle…", "Aria secca…").
- **Climate-mini tile in Lights tab** also falls back to a sky-blue
  ambient sensor mini when no climate is configured.
- Drawer status pill now shows `23° · 49%` when on Climate tab in
  sensors-only mode.
- Drawer subtitle ("3 luci · 2 tapparelle · sensori ambiente") when no
  thermostat is wired but sensors are.

### Changed
- Default tab when opening the drawer is now **Lights** (most common),
  then Blinds, then Climate (was Climate-first).

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
