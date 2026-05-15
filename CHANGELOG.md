# Changelog

All notable changes to this project will be documented in this file.
The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and
this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.2.10] — 2026-05-15

### Fixed — brightness drag really really really doesn't snap back now
Final root cause of the Shelly-Wall-Display-only flicker: the
Chromium on the MTK6580 touch panel sometimes delivers a
`pointercancel` event where a regular `pointerup` would be expected
at the end of a drag — a known quirk of the touch driver. The
existing `onLeftPointerCancel` handler discarded `dragPct` without
committing the brightness, so on those panels every drag visually
"snapped back" to the pre-drag value at the moment the finger lifted.

Unified `pointerup` and `pointercancel` through a single
`finalizeGesture(cancelled)` path:
- Committed drag (moved + dimmable + dragPct set) → always fire
  `setBrightness`, regardless of whether we got `up` or `cancel`.
  This is the case the user was hitting.
- Tap-shaped gesture (no movement) → toggle ONLY on a clean `up`.
  On a `cancel` we skip the toggle to avoid accidental on/off
  flips when the touch driver bails mid-tap.

Confirmed via HA WS probe in the previous iteration that brightness
echoes round-trip in ~800 ms (218 ms callService + ~600 ms Zigbee),
so the optimistic `dragPct` clears cleanly on the next render once
HA's state lands.

## [1.2.9] — 2026-05-15

### Fixed — brightness drag flicker on the Shelly Wall Display
Confirmed via HA WS probe that the brightness echo arrives in
~800 ms (218 ms callService accept + ~600 ms Zigbee round-trip).
v1.2.8's 3-second safety timer should have been plenty — but on the
Shelly Wall Display kiosk the user still saw the panel snap back to
the pre-drag value. Root cause: the kiosk's WebSocket connection
delivers state pushes less reliably than the admin browser session,
so sometimes the echo never makes it to the panel within the
safety window, the timer fires, `dragPct` clears, and the next
render falls back to the (still-stale) `v.brightnessPct`.

Removed the safety timer entirely. `dragPct` now lives until one
of two events happens: (a) `willUpdate` sees `v.brightnessPct`
catch up to it via a real HA echo, or (b) the next `pointerdown`
starts a fresh drag and discards the orphaned optimistic value.

Trade-off: on a permanently-broken integration the optimistic value
will stay on screen until the next gesture, instead of snapping
back to the old one. Considered safer — the user committed a
specific value, they should see that value reflected, not a phantom
revert to a state they didn't ask for.

## [1.2.8] — 2026-05-15

### Fixed — brightness drag flicker (real fix this time)
The v1.2.7 fix tied `dragPct` cleanup to the `setBrightness` Promise
resolving. That was wrong: the Promise resolves when HA *accepts*
the service call (~100 ms), not when the new state echoes back via
WS (~300-700 ms on Zigbee). Result: the flicker the user reported
still happened — same root cause, slightly later in the timeline.

The actual cleanup now lives in `willUpdate`: every render, if
`dragPct` is set and `v.brightnessPct` has caught up to it (±1 pt
for rounding), we clear `dragPct`. So the optimistic value stays
on screen until HA's echo lands, at which point both values are
equal and there's no visible jump anywhere.

Added a 3-second safety timer on top so a never-arriving echo
(bulb offline, integration unhealthy) doesn't leave a phantom
optimistic value frozen on the panel forever.

## [1.2.7] — 2026-05-15

### Fixed — brightness drag commit appeared to "lose" its value
On the Wall Display, dragging the left panel to set a new brightness
worked optically while the finger was down (the `%` followed the
gesture), but the moment the user lifted the finger the display
briefly flickered back to the *previous* brightness before settling
on the new one. The flicker is enough that the user reads it as
"the value didn't take" — and on a slow MTK6580 the flash can last
the better part of a second.

Root cause: `onLeftPointerUp` was clearing `this.dragPct = null`
immediately after firing the (async) `setBrightness` call. The next
Lit render then fell back to `v.brightnessPct`, which is still the
*old* state until the HA service round-trip + state push completes
(~200-500ms). So the panel briefly painted the old %, then snapped
to the new one once the state pushed in.

Fix: hold `dragPct` as the optimistic UI value until the
`setBrightness` Promise resolves, then clear it. While in-flight,
the render keeps showing the drag-committed value, so the panel
never flickers backwards. A second drag started during the
round-trip safely re-takes ownership (the cleanup only resets
`dragPct` if it's still the same reference we committed).

## [1.2.6] — 2026-05-15

### Fixed — tile tap was silently dropped (CSS specificity bug)
Tapping a light tile in the right-hand grid did nothing — the tap
bubbled to the underlying `.right` base layer instead of triggering
the tile's `@click` handler. Confirmed by opening the kiosk URL
through the browser MCP: the tool reported the tile div had
`pointer-events: none` and could not receive clicks.

Root cause: a CSS specificity miscount in `lights-panel.ts`:

```css
:host > :not(.left):not(.right)        /* specificity 0,3,0 */
  { pointer-events: none }
:host > .grid                          /* specificity 0,2,0 — LOSES */
  { pointer-events: auto }
```

The negation chain has higher specificity than the single class
selector, so `.grid` (and by propagation every tile inside it)
ended up with `pointer-events: none`. The intended `auto` override
was silently dropped by the cascade.

Fix: explicit exclusion in the disabler — `:not(.grid):not(.master)`
keeps `.grid` and `.master` out of the negation set entirely. Tile
taps now reach `onPick` → `cow-tile-select` event → scope update.

### Changed — tile grid sits 18 px higher
The `Apparecchi`/`TUTTE` header was at `top: 145px` and the first
tile row at `top: 180px`, leaving ~18 px of empty space between
the header and the grid. On a wall display it looked like the whole
"appliances" block was floating in the middle of the right pane.
Pulled both up: header at `top: 133px`, grid at `top: 162px` —
header-to-grid gap reduced to ~12 px. The master button position
is computed dynamically from `grid.top + rows * 80 + ...` so it
stays correctly aligned for any light count (2..10).

## [1.2.5] — 2026-05-15

### Fixed — dimmer ring not centered on the on/off dot
The dimmer indicator ring inside `cow-light-tile` was offset 2px
down-right of the on/off dot it was supposed to surround. Visible
in the screenshot of Camera Padronale on the "Letto" tile: the
yellow ring sat below-right of the grey dot instead of being
concentric.

Root cause: the ring used `width: 22px` + `border: 2px` with the
default `box-sizing: content-box`, so the *real* size of the ring
element was 22+4 = 26×26 px, and the `left/top: -4px` offset
(designed for a 22×22 outer box) only compensated for the top-left
edge — leaving the bottom-right protruding by 2px.

Added `box-sizing: border-box` to `.ring` so the 22×22 declaration
is now the *outer* size of the ring, perfectly concentric with the
14×14 dot. One-line CSS fix.

## [1.2.4] — 2026-05-15

### Fixed — bulb visual overshot the glow disc
The new incandescent SVG bulb (v1.2.2-1.2.3) was sized at
`.bulb { height: 60%; max-height: 165px }`. With a portrait
viewBox (659.8×1124.2, aspect ~1.7) the metal socket extended
~30 px below the 225 px glow disc — visually the bulb escaped its
halo on every variant. Capped to `48% / 110px max` so the whole
bulb (glass + socket) sits inside the glow circle on bright, dim,
off and night equally.

## [1.2.3] — 2026-05-15

### Fixed — bulb-on / bulb-off SVGs were swapped
In v1.2.2 the clker.com clipart was inlined with the two filenames
mapped to the wrong variants:
- `webmichl_light_bulb.svg` is actually the **clear/unlit** version
  (filament visible through transparent glass), not the yellow lit one
- `light-bulb-60-lit.svg` is the **warm yellow lit** one with the
  inner-glass glow

v1.2.2 ended up rendering the clear/unlit bulb on the bright yellow
panel ("ON" state) and the warm lit one on the grey off panel —
confusing. Swapped: `bulbOnSvg` now points to the lit yellow bulb,
`bulbOffSvg` to the clear/unlit one. No file content changed (the
two strings are unchanged, only their export names were rotated).

### Internal
- Side-by-side preview rendered through a local HTTP server + browser
  MCP screenshot — confirmed the visual identity of each file before
  swapping.

## [1.2.2] — 2026-05-15

### Changed — incandescent-style bulb icon
The bulb icon in `cow-bulb-visual` was a 24×24 line-art SVG (just an
outline + base hint). Replaced by two photo-realistic incandescent
bulbs sourced from clker.com public-domain clipart:

- **`bulbOnSvg`** — yellow-tinted lit glass with visible filament,
  metallic socket (used for variant=bright/dim/night)
- **`bulbOffSvg`** — same anatomy, clear/unlit glass (used for
  variant=off)

The bulb visual now reads at a glance — the warm yellow glass on the
yellow panel + glow gives the small Lights card a real "this light is
ON" signal that the line-art outline never quite managed.

### Internal
- New asset module `src/small/visuals/bulb-svg-assets.ts` exports the
  two SVG strings, kept verbatim so future re-optimisations are a
  one-shot SVGO pass instead of a manual rewrite.
- SVGO multipass + `floatPrecision=1` + per-file `prefixIds` (`b1-` /
  `b2-`) so the two `<defs>` blocks coexist in the same shadow root
  without `url(#linearGradient3587)` collisions. 143 KiB → 53 KiB
  combined (63% reduction).
- `bulb-visual.ts` injects the SVG body via `unsafeSVG()` from
  `lit/directives/unsafe-svg.js` (avoids re-implementing every
  `<linearGradient>` stop manually).
- The bulb element auto-scales to 60% of its wrap height with
  `preserveAspectRatio` keeping the portrait viewBox intact — sits
  centered in the 225×225 glow disc on every variant.

### Notes
- The two SVGs include `<feGaussianBlur>` filters for inner-glass glow
  and micro-shadows. Native SVG filters are GPU-cached on Chromium
  after the first paint and measurably cheaper than the CSS
  `filter: blur` we explicitly avoid on the MTK6580 Wall Display.
- Bundle grew from ~992 KB to ~1.05 MB (+53 KB, ~5%). Caching is
  unchanged — HACS still serves a single immutable file.

## [1.2.1] — 2026-05-15

### Fixed
- **Room name truncated** on rooms with names longer than ~14 chars
  (`Camera Padronale`, `Soggiorno Cucina`, `Studio Chiara`…). The
  `.room` label had `max-width: 200px` and the `.time` next to it was
  pinned at `left: 622.5px`, wasting ~35px of right-side gutter. Two
  changes:
  - `.room { max-width: 235px }` — stretches the room name into all
    the space available before the time text starts.
  - `.time { right: 30px; left: auto }` — right-anchored instead of
    left-positioned, so 12h locale strings (`11:30 PM`) and 24h
    strings (`14:32`) both align to the same right edge without
    shifting the room name.
- Applied identically across all three small panels: lights, blinds,
  thermostat. Room names up to ~18 chars now render fully without
  ellipsis. Cases above that (rare in real-world room naming) still
  truncate cleanly.

## [1.2.0] — 2026-05-14

### Changed — small Lights card completely redesigned (Proposta B)
The small Lights panel switches from a left-pane visual + right-pane
vertical slider + chip-row scope picker to a **gesture-driven left
half + tile grid scope picker on the right**. Resolves two long-running
issues with the previous design:

1. `brightness:` was being fanned out to every entity in the scope,
   including pure on/off bulbs that either reject it or treat it as a
   plain `turn_on`. The new `isDimmable()` helper reads
   `supported_color_modes` and filters service calls so brightness is
   sent only to dimmer bulbs, while `turn_on` / `turn_off` keep
   targeting the whole scope.
2. The old chip-row wrapped to two rows once a room had 4+ lights,
   making chips visually overlap on the small Wall Display LCD.
   Replaced by a 2-column tile grid that scales cleanly up to 10
   lights without wrapping or scrolling.

### Added
- **Tap on the left panel** → toggles the current scope on/off
- **Swipe ↕ on the left panel** → brightness, with optimistic preview
  (the `%` updates live during the gesture, the actual service call
  fires on `pointerup`). Inert and visually muted when the scope can't
  be dimmed.
- **Tile grid** on the right — each tile shows a dot (on/off colour),
  a ring (only when the light is dimmable), the name, and the live
  state (`80% · dim` / `ON` / `OFF`). Tap a tile to set it as scope.
- **Master "Tutte" button** under the grid — tap to control the whole
  group. Dark fill when active.
- **Mid-drag feedback** — an extra 300×300 halo behind the bulb, a
  white fingertip indicator + ↕ arrow that follow the touch, the hint
  pill recedes to 55% opacity, the sub label becomes "Drag in corso".
- **Non-dimmer scope state** — the big `%` is replaced by a `ON`/`OFF`
  rendered at the same `font-size: 105` weight, the swipe gesture is
  disabled, and the hint switches to "Swipe ↕ non attivo" at 0.45
  opacity. Visually unambiguous on a touch panel.
- **`docs/screenshots/`** — 8 reference renders (lights master, mid-drag,
  non-dimmer off, many lights, thermostat heating/cooling, blinds
  open/half) exported 1:1 from the Figma source and embedded in the
  README.

### Internal
- New Lit component `cow-light-tile` (`src/small/components/light-tile.ts`)
  used by the Lights panel. Single source of truth for the dot/ring/
  selected-bg visual conventions; the `selected` state uses
  `color-mix(in srgb, var(--cow-accent) 22%, white)` so it tints
  automatically when the panel variant changes (bright/dim/off/night).
- `state/lights.ts` adds `isDimmable(entity)` and a `dimmable: boolean`
  field on `LightsView`. The aggregate brightness % now averages **only
  dimmers that are on**, never the whole group.
- `cow-bulb-visual` accepts a `dragging` boolean prop and renders an
  extra `inset: -16.5%` halo at 0.45 opacity when set, matching the
  Figma "Glow Halo" node in the Mid-Drag mock.
- `HassLightAttributes.supported_color_modes?: string[]` typed.
- Production code is 1:1 with the new Figma section "Proposta B —
  Lights States" (11 reference frames covering Bright / Dim / Off /
  Night variants + scope=single dimmer/non-dimmer × on/off + edge
  cases: 1 light only, 6 lights grid, mid-drag interaction).

## [1.1.5] — 2026-05-14

### Added — evening dim scrim on the hero
The hand-tuned sky palette is great as a *color* reference, but on an
emissive screen the "golden hour" RGB values blast a dimly-lit living
room at 8 PM. Added an `eveningDim(elevation)` helper in `sky.ts`
that returns a 0..0.4 black-scrim opacity peaking at sunset
(elevation 0°) and fading to zero at both bright noon (≥30°) and
civil twilight (≤-12°, where the deep-night palette + stars take
over on their own).

The scrim sits between the FX layers (clouds / rain / pollen /
celestial body / haze) and the foreground text, so the entire sky
composition darkens uniformly while the clock and weather text stay
bright and readable. Triangular curve, 4 s ease transition with the
existing day/night transitions.

At the user's testing time (≈20:12 in May, sun elevation ≈ +5°) the
scrim sits at ~0.33 opacity — visibly dimmer without going to "looks
broken".

## [1.1.4] — 2026-05-14

### Fixed
- **Rain still too thin at viewing distance.** v1.1.2 used a 1.4 px
  stroke which, on the 10.1" Shelly Wall Display at DPR 1, rendered
  as just 1–2 physical pixels per drop and disappeared at the typical
  ~1 m viewing distance. Tripled the stroke to 3 px (still backed by
  `vector-effect: non-scaling-stroke` so aspect-ratio stretch doesn't
  crush it), bumped the count again (75→110 rainy, 130→180 pouring),
  lifted the opacity floor (0.55→0.74) and swapped to a more
  saturated rgba(110, 155, 215) so drops contrast against both
  daytime blue and sunset orange skies. Streaks lengthened from 46
  to 55 viewBox units for extra "this is rain" clarity.

## [1.1.3] — 2026-05-14

### Fixed — info hidden in compact hero mode
When the music ribbon is visible the hero shrinks to compact mode
(23rem → 17.5rem), and previously the CSS hid:
- the humidity row (`.meteo-desc-2`, with `💧 78%`),
- the allergen names of the pollen line (`graminacee, betulla,
  quercia`),
leaving only the temperature, condition and a bare `🌿 Alta` —
the actually-useful pollen info disappeared every time you were
playing music. Both are now kept visible in compact mode, just
slightly smaller (`0.8125rem` for humidity, `0.75rem` for allergens).

### Changed — pollen specks visible across the whole day/night arc
Dropped `mix-blend-mode: screen` on `.fx-pollen`. The blend mode
gave specks a nice glow against a blue daytime sky but the warm
sunset/dusk gradients (orange / pink / violet) were eating the
yellow-green particles alive — exactly when the user is most likely
to be looking at the wall display. Particles now use plain alpha
compositing so they read consistently against any sky color.

## [1.1.2] — 2026-05-14

### Fixed
- **Rain animation barely visible** on the XL hero. The drop count
  (35 / 70 for `rainy` / `pouring`) was tuned for a phone-sized
  canvas; on a wall-display-wide hero it read as "a few stray dots"
  instead of actual rain. Four changes:
  - Drop count doubled: 35 → 75 (`rainy`), 70 → 130 (`pouring`).
  - Opacity floor lifted: 0.35 minimum → 0.55 minimum, so even the
    faintest streaks are readable against a bright sky.
  - Streaks lengthened from 27 to 46 viewBox units so each drop
    looks like rain and not a stray pixel.
  - Added `vector-effect: non-scaling-stroke` at 1.4 CSS px so the
    stroke width stays consistent regardless of aspect ratio
    (`preserveAspectRatio="none"` was crushing the original 0.45
    viewBox-unit stroke).
  - Color shifted from `rgba(190, 220, 255)` to `rgba(150, 190, 235)`
    so drops have more contrast against a bright daytime sky.

## [1.1.1] — 2026-05-14

### Fixed
- **Sun visible during pouring rain.** The hero card was dimming the
  sun and moon based on the day/night cycle only, ignoring the cloud
  coverage implied by the weather state. A `rainy` or `pouring` sky
  would therefore happily display a giant glowing sun behind drifting
  clouds — visibly inconsistent with the "Pioggia" text and the rain
  particle FX. We now multiply both sun and moon opacity by
  `(1 - coverage * 0.95)` so the celestial body fades to (near-) zero
  on overcast / rainy / pouring / lightning conditions and stays
  bright on `sunny` / `clear-night`. Cloud coverage values come from
  the existing `bucket()` in `weather-fx.ts`, now re-exported as
  `cloudCoverageFor(condition)`.

## [1.1.0] — 2026-05-14

### Added — pollen block in the XL hero (previously labeled 0.10.0)
- **`pollen:` config sub-block** (`overall`, `allergens`, `min_level`,
  `pinned`, `max_items`) on `cow-room-dashboard-card`. Designed
  against the Polleninformation EU HACS integration (Austrian Pollen
  Information Service — supports Italy and most of central Europe)
  but works with any sensor exposing a 0–4 `numeric_state` and/or an
  Italian/English level label as `state` (`nessuna`/`bassa`/
  `moderata`/`alta`/`molto alta`).
- **Pollen text line in the hero** below the humidity row: shows the
  overall allergy risk level + up to 3 active allergens, color-coded
  by level (giallo → arancio → rosso → rosso-pulsante at "molto
  alta"). `pinned` allergens stay visible at level 0 — useful when
  you're particularly sensitive to a specific one and want to see it
  even on a quiet day.
- **Pollen FX overlay** in the hero — soft yellow-green specks drift
  across the sky, density and color shift with the overall level
  (14 specks at "bassa" → 68 at "molto alta", hue moves from
  yellow-green to amber). Pure transform/opacity keyframes, same
  GPU-friendly rules as the existing weather FX (rain, snow, clouds).

### Changed — header pill now shows the active room, not the weather
- The right-side pill in the XL header has been repurposed: instead
  of repeating the outdoor weather (which is right below in the hero
  panel) it now shows the **active room's** ambient temperature and
  humidity, with the room name as a small label. Sources, in priority
  order: `temperature` + `humidity` sensors on the room, then the
  `current_temperature`/`current_humidity` attributes on the room's
  `climate` entity, then (legacy fallback) the global `weather_entity`
  attributes.

### Changed — Pirate Weather as the recommended weather provider
- Example dashboard `walldisplay-sala-cucina.yaml` switched from
  `weather.forecast_home` (Met.no) to `weather.pirateweather`. Met.no
  doesn't expose `apparent_temperature`, Pirate Weather does — and
  with `Units = si` configured it returns native km/h wind speeds,
  matching the hero's hardcoded units.

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

## [0.9.0] — 2026-05-14

### Added — dedicated kiosk card
- **`cow-kiosk-card`** — a brand-new single-room card sized natively
  for the Shelly Wall Display 720×720 kiosk. Same YAML schema as
  `cow-thermostat-card` (room/climate/light/cover/labels/sensors) so
  dashboards can swap `type:` without touching anything else. Layout
  is rebuilt against the Figma 480 design grid scaled 1.5× to 720 —
  control buttons use arrow-only glyphs (▲ ■ ▼) to fit the half-card
  width cleanly, the value/icon area is bigger, and the right pane
  is properly distributed top-to-bottom (header, controls, presets,
  entity selector). Reverted all of the 0.8.4–0.8.20 hacks on the
  legacy `cow-thermostat-card`; that card stays at the 384-design
  baseline so existing installs aren't broken.
- Card uses the same `position: fixed; inset: 0` + `<html>
  font-size: 30px` trick to fill the kiosk viewport — but it's
  scoped to `cow-kiosk-card` only and won't fight other cards on the
  same dashboard.

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
