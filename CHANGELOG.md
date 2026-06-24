# Changelog

All notable changes to this project will be documented in this file.
The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and
this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.4.22] — 2026-06-13

### Added
- **XL Buongiorno / Buonanotte shortcuts** on the idle dashboard under
  the clima row (`script.buongiorno`, `script.buonanotte`), matching
  mobile.

## [1.4.21] — 2026-06-13

### Changed
- **XL whole-house climate controls moved to the idle dashboard.** The
  Spegni / Accendi freddo row now sits under the scene shortcuts (Tutto
  OFF, Apri tutto, …) instead of inside the per-room Climate drawer tab,
  matching the mobile summary layout.

## [1.4.20] — 2026-06-13

### Added
- **Whole-house climate controls (temporary).** Mobile dashboard home
  summary and XL Climate tab now expose on/off cooling and ±0.5° setpoint
  for `climate.clima_casa_auto` (generic thermostat keep-alive). Mobile
  also restores Buongiorno / Buonanotte script buttons when those
  entities exist.

## [1.4.19] — 2026-06-14

### Added
- **`studio_door_lights` — auto-illuminate on studio unlock.** Optional
  list of `light.*` entities turned on at 100% brightness after a
  successful hidden triple-tap unlock. Wired on Ingresso PT for
  `light.luce_calda_studio` and `light.luce_fredda_studio`.

## [1.4.18] — 2026-06-14

### Added
- **Visual feedback for the hidden studio-door triple-tap.** On the
  third tap the left-pane temperature is replaced by a door icon while
  Home Assistant is called; when the service succeeds, an open-padlock
  icon shows for three seconds, then the temperature returns.

## [1.4.17] — 2026-06-13

### Added
- **Hidden triple-tap studio door unlock on the small thermostat panel.**
  When `hidden_studio_door: true` is set in the card YAML, three quick
  taps on the left-pane current temperature call `studio_door_entity`
  (lock unlock, cover open, script turn_on, or `button.press`). Intended
  for the Ingresso PT wall display only — leave the flag off everywhere
  else.

## [1.4.16] — 2026-05-27

### Fixed
- **Climate cards now reflect heating / cooling state.** Every UI
  surface — the small wall-display `cow-thermostat-panel`, the XL
  drawer Climate tab, and the mobile dashboard's room drawer climate
  row — used to stay locked on the green `idle` variant ("Target
  raggiunto") even when the underlying floor relay was actively
  heating. Root cause was on the Home Assistant side: the 7
  `climate.casa_*` MQTT proxies declared in
  `examples/ha-cow-climate-orchestration.yaml` had no `action_topic`,
  so their `hvac_action` attribute was permanently `null` and the
  card's `deriveThermostatView` fell through to the `idle` branch.
  Fixed by adding `action_topic: "cow/casa/<room>/action/state"` to
  every proxy and a new `cow_climate_publish_action` automation that
  watches the 7 `switch.display_<room>` floor relays + the 6
  `climate.koolnova_*` zones and publishes one of
  `off | heating | cooling | fan | idle` to each proxy with
  `retain: true`. No TypeScript change — the proxy stays the single
  source of truth per `docs/06-house-hvac-architecture.md` §F-bis;
  `deriveThermostatView` now just sees a real `hvac_action` value
  through the same code path it has used since v1.3.x. Verified
  end-to-end on `climate.casa_bagno_ospiti`: forcing the Shelly
  relay on with the proxy in `heat` flips `hvac_action` to
  `"heating"` within ~1 s, and all card surfaces switch to the
  orange "Sta scaldando" variant.
- **Climate proxies reset to off / 21° / auto after every HA restart.**
  Root cause: `mqtt: climate:` declares the 7 `climate.casa_*` proxies
  with `optimistic: true` (snappy local UI updates) plus `retain: true`
  (intended to persist the last setpoint / mode / fan across HA
  restarts). The combo doesn't work: with `optimistic: true` HA flips
  the proxy's local state on every command and publishes to the
  `*/set` topic, but never publishes back to `*/state` — so
  `retain: true` keeps the retained command on the broker while the
  state topic stays empty, and on restart HA's MQTT integration
  re-subscribes to `*/state` and finds nothing. The broker side was
  fine — the core-mosquitto add-on already ships with
  `persistence true` and a persistent `/data/` volume out of the
  box. Fix is a new `cow_climate_publish_state_echo` automation in
  `examples/ha-cow-climate-orchestration.yaml` that mirrors every
  `cow/casa/+/{mode,setpoint,fan}/set` to the matching `/state`
  topic with retain=true. End-to-end persistence (HA restart, full
  HAOS reboot) now works. See `docs/06-house-hvac-architecture.md`
  §F-bis "Persistence requirement" for the full mechanism and why
  we kept `optimistic: true` rather than dropping it.

- **Setpoint number rendered tiny on the wall display panel after
  v1.4.15.** Turning `<div class="target">` into `<button class=
  "target">` brought along a button reset that wrote `font: inherit`
  AFTER the `font-weight: 700; font-size: 60px;` declarations. `font`
  is a shorthand — it wipes weight, size, line-height, the lot —
  and the cascade rule "last declaration wins" promoted it past the
  Figma-spec typography, so the giant "Set to 37°C" rendered at the
  ambient 16px (visible in the screenshot the user reported: the
  number was about a third of the size of the room temperature
  display next to it). Replaced the shorthand with the longhand
  `font-family: inherit` and reordered the rule so the reset
  declarations sit BEFORE the typography ones, which makes the bug
  un-reproduceable even if someone later swaps `font-family` for
  the shorthand again. Applied the same ordering preventatively to
  `.setpoint-big` in the XL drawer and `.qc-climate-target` in the
  mobile drawer; both already rendered correctly (they used the
  longhand from the start) but the new order documents the
  invariant.

## [1.4.15] — 2026-05-27

### Added — tap-to-type setpoint on every climate card
The only way to change a setpoint used to be the ▼ ▲ bumpers, which
nudge by `target_temp_step` (0.5° on the casa_<room> proxies). Going
from 19° to 24° took ten taps. Now the setpoint number itself is
tappable on all three climate surfaces:

- **Small wall display panel** (`cow-thermostat-panel`, the 720×720
  Shelly Wall Display card) — the big "Set to 21.5°C" number.
- **XL drawer Climate tab** (`cow-xl-climate-tab`) — the 7rem
  "IMPOSTATO A" number in the middle column.
- **Mobile dashboard climate row** (`cow-mobile-dashboard-card`'s
  `renderClimateRow`) — the white target chip between the ▼ ▲
  bumpers in the room drawer.

Tapping any of those opens a shared `<cow-setpoint-modal>` —
implemented in `src/shared/setpoint-modal.ts` — with a native
`<input type="text" inputmode="decimal">`. The `inputmode` attribute
is what makes mobile Safari / Chrome / WebView surface the numeric
keypad without dragging in the `<input type="number">` baggage
(spinner UI, comma-vs-period rejection on Italian locales). The
parser accepts both `,` and `.` as decimal separators because
Italian users will type `21,5` and the locale-aware keypad gives
them a comma key.

The modal validates against the climate's own `min_temp` / `max_temp`
and snaps to `target_temp_step` before firing `set_temperature`, so
out-of-range entries get a clear error message instead of silently
clamping. OFF climates leave the setpoint number rendered as `—` and
the tap target disabled — same rule the ▼ ▲ bumpers already use,
because `set_temperature` against an off proxy gets queued without
taking effect.

iOS Safari quirk: we open the dialog imperatively (`modal.show()`)
from inside the click handler instead of relying on Lit's async
re-render after flipping a state flag — otherwise the input.focus()
call lands outside the user-gesture window and the on-screen
keyboard stays hidden until the user taps the input a second time.
The reactive `open` prop also opens the dialog (kept as a fallback
for non-touch callers), but the imperative call is what makes the
keyboard pop on first tap.

The modal renders into the browser top layer via `<dialog>` +
`showModal()`, so it stacks above the mobile room drawer's own
`<dialog>` without z-index gymnastics — same trick the room drawer
itself uses to escape HA Lovelace's nested `contain: layout`
wrappers.

## [1.4.14] — 2026-05-26

### Fixed
- **Mobile drawer climate block missing its CSS.** The CSS edit
  that paired with `renderClimateRow` in v1.4.12 had also
  silently no-op'd (third missing edit in the v1.4.12 commit).
  Result was a flat unstyled column: 28° on one line, 💧 47% on
  the next, ▼ on the next, 21° on the next, ▲ on the next, no
  accent gradient, no flex layout, every element falling on a
  separate row because the parent had no `display: flex`. Added
  the full `.qc-climate*` rule set: row layout for current /
  setpoint, rounded chips for modes + fan, accent gradient driven
  by `--cow-accent-surface`, transparent-white ▼ ▲ bumpers, and
  the disabled state for OFF.

## [1.4.13] — 2026-05-26

### Fixed
- **v1.4.12 mobile drawer was DOA.** Two `StrReplace` edits had
  silently no-op'd on the source, so the build of v1.4.12 shipped
  `renderClimateRow` referencing `THERMOSTAT_ACCENT`,
  `THERMOSTAT_STATUS_LABEL`, `THERMOSTAT_SUB_LABEL`, `bumpTarget`,
  `setClimateMode`, `setClimateTarget`, `setClimateFan` without
  having actually imported the constants or declared the service
  callers. Result: a `ReferenceError: THERMOSTAT_ACCENT is not
  defined` fired the moment any room tile was tapped, which blew
  up the dialog open and made the whole drawer feel dead. Re-ran
  the edits, `tsc --noEmit` is clean, smoke-tested in the browser.

## [1.4.12] — 2026-05-26

### Added — climate control in the mobile room drawer
The mobile dashboard's room drawer used to show openings + lights +
covers but had no climate controls — the only way to change a
setpoint from the phone was the HA standard more-info popup, which
broke the "one card, every control" feel of the rest of the
dashboard.

Added a compact climate block at the top of the drawer body for
every room that has a `room.climate` entity. It reads everything
(current temp, humidity, mode, fan, setpoint range) from the
climate proxy via `deriveThermostatView`, so the mobile, the wall
display, and the XL drawer all see exactly the same value.

Visual contract:

- Header line with 🌡 icon + STATUS_LABEL / SUB_LABEL ("HEATING ·
  Sta scaldando", etc.) — same wording as the wall-display panel.
- Big current temperature in `.toFixed(1)` (no `Math.round`
  surprises), inline humidity tag, big target on the right with
  ▼ ▲ bumpers.
- Mode chip-row driven by `view.hvacModes`: casa_<room> proxies
  get heat/cool/fan_only/off, the two bathroom floor-only proxies
  get heat/off.
- Fan chip-row only when the climate advertises more than one fan
  mode (so the Generic Thermostat-wrapped bathroom proxies don't
  show a useless "auto" chip alone).
- ▼ ▲ bumpers and chips both push the variant accent via the
  shared `THERMOSTAT_ACCENT` palette (`--cow-accent-surface` /
  `--cow-accent-primary`) — the block tints orange in heating,
  blue in cooling, green in idle, grey in off, with a 320 ms
  ease transition. Identical to the small wall card and the XL
  drawer.
- ▼ ▲ are disabled in OFF (no point queueing setpoint writes the
  orchestrator can't act on), mirroring the same behaviour on
  the other surfaces.

## [1.4.11] — 2026-05-26

### Fixed
- **Thermostat fan-row no longer overlaps the openings strip.** A
  regression introduced in the v1.4.5–v1.4.9 climate refactor
  stream dropped the `host[data-has-openings]` CSS override that
  lifted `.fan-label` / `.fan-row` away from the bottom-right
  openings strip. On Camera Padronale the Auto chip was painted
  behind the window glyph again. Restored: openingsStripStyles is
  re-imported into the panel's `static styles`, the inline
  `.ajax-openings` CSS block (200+ duplicated lines) is back to
  pulling from the shared helper, and willUpdate() toggles
  `data-has-openings` so the fan-row sits at y=605 instead of
  y=637.5 whenever the room has Ajax contacts.

## [1.4.10] — 2026-05-26

### Fixed
- **Blinds-panel room title no longer collides with the clock.** On
  the wall-display blinds slide for rooms with long names ("Camera
  Padronale"), the 30 px room font + 28 px time font exceeded the
  280 px header slot and the "07:20" string was painted over the
  ellipsis ("Camera Padron.07:20" → unreadable). Both fonts are now
  aligned to the thermostat-panel values (26.25 px / 24.375 px),
  matching the design system across the three small-card slides
  and giving "Camera Padronale" + "23:59" a clean 4 px gap.

## [1.4.9] — 2026-05-26

### Changed — XL Climate tab adopts the small panel's accent + behaviour
The XL drawer's Climate tab was visually disconnected from the small
wall-display thermostat panel: same `view.variant`, completely
different paint. Heating always orange (regardless of cool / idle /
off), selected mode chip always white, setpoint arrows tappable
even when the system was OFF, status label `view.variant.toUpperCase()`
(English raw) and the sub line was a hardcoded
"Temperatura attuale · <room>".

Now both surfaces share the same single source of truth in
`small/state/thermostat.ts`:

- New exports `THERMOSTAT_ACCENT`, `THERMOSTAT_STATUS_LABEL`,
  `THERMOSTAT_SUB_LABEL`. The small panel imports them (no behaviour
  change there) and the XL Climate tab now reads from the same
  tables, so any future palette tweak lands on both surfaces.
- The body gradient is now driven by `--cow-accent-surface` set on
  the host from `THERMOSTAT_ACCENT[view.variant].surface`, with a
  320 ms ease transition. Heating → orange, cooling → blue, idle →
  green, off → grey.
- Selected mode chip background uses `--cow-accent-primary` (same
  shade family) with a subtle inset white outline. Same visual
  language as the small chip-row.
- Setpoint ▼ / ▲ arrows are `disabled` when `view.variant === "off"`
  (greyed out, no click), mirroring the small panel's action-button
  behaviour. Avoids queueing setpoint changes the proxy can't act on
  while the system is parked.
- `.col-label` now reads `THERMOSTAT_STATUS_LABEL[variant]`
  (HEATING/COOLING/OFF/IDLE) and `.col-sub` reads
  `THERMOSTAT_SUB_LABEL[variant]` ("Sta scaldando", "Sta
  raffreddando", "Sistema spento", "Target raggiunto") instead of
  the old hardcoded strings.

## [1.4.8] — 2026-05-26

### Changed — XL surfaces read temperature & humidity from the proxy only
Up to now the XL surfaces were inconsistent about where the ambient
reading came from. The header info pill read `room.temperature` /
`room.humidity` (the raw display sensors, with one decimal) and
only fell back to the climate entity. The Climate tab's drawer body
read `view.current` and rounded it with `Math.round()`. Net result:
the same room showed "24.5°C" in the chip pill and "25°" in the
drawer for any half-degree reading. Confusing.

Now every XL surface reads through the climate proxy:

- `header-row.getInfoPill` flips its lookup order: proxy
  `current_temperature` + `current_humidity` first, sensor
  fallback only for rooms with no climate entity (Lavanderia,
  Studio, Garage, Esterno).
- `climate-tab.renderClimate` formats temp + setpoint with
  `.toFixed(1)` (strip the trailing ".0") so "24.5°C" stays
  "24.5°C" and "21°C" stays "21°C" — never "25°" again.
- `climate-tab.roomHumidityText` drops the `room.humidity`
  fallback entirely. If the proxy doesn't publish humidity, we
  show "—" rather than reaching past the proxy to the sensor.
  The companion change in `cow_climate.yaml` (v1.4.8 of this
  package) wires up the missing `current_humidity_topic` on
  every casa_<room> proxy so this never happens in practice
  for a healthy room.

Pair this release with the updated `examples/ha-cow-climate-
orchestration.yaml` (which also adds `casa_bagno_padronale` and
`casa_bagno_ospiti` MQTT proxies). With both deployed the entire
heated/cooled UI in the house reads ambient values from one
canonical place per room.

## [1.4.7] — 2026-05-26

### Fixed — Climate tab humidity always showed "—"
The XL Climate tab read humidity from `view.humidity`, which is just
`climate.<entity>.attributes.current_humidity`. Neither the
`climate.casa_*` MQTT proxies nor the `climate.pavimento_*`
Generic Thermostats publish that attribute — only the
`sensor.display_<room>_humidity` does. As a result every room with
a proxy showed "—" even though the wall display sensor was
streaming a perfectly good reading.

Added `roomHumidityText()` helper with a three-step priority
lookup: `room.humidity` sensor first (the actual in-room reading
that every walldisplay-* dashboard already configures), then
`view.humidity` (for climate entities that publish their own
humidity, e.g. some smart TRVs), then "—". Same fallback pattern
the small thermostat-panel already uses for humidity.

## [1.4.6] — 2026-05-26

### Removed — climate mini tile from Lights tab + preset bar from Climate tab
Two pieces of the XL drawer were duplicating information without
adding value, so we cut them:

- **Lights tab** had a 280×320 orange "climate-mini" tile sitting on
  the left of the light tile row. Same data (variant + current temp
  + target + fan + humidity) was already in the drawer header pill
  ("Spento 21°") *and* in the dedicated Climate tab one click away.
  Three readouts of the same info, plus a chunky tile stealing
  horizontal scroll space from the actual lights — gone. The
  `renderClimateMini` method, its CSS, and the `deriveThermostatView`
  import in lights-tab.ts go with it.
- **Climate tab** had three hardcoded preset buttons at the bottom
  (🏠 Comfort 22° / 🌿 Eco 19° / ❄ Antigelo 8°). The casa_<room>
  proxies already expose the standard HA preset list via
  `preset_modes`, and the team-brain orchestration decides what to
  do with them — having a separate flat 3-button bar that bypassed
  the orchestrator (raw `set_hvac_mode: heat`) was a duplicate
  control surface that could fight the proxy. The `.actions`
  section, the `private preset()` method, and its associated CSS
  are gone.

The Climate tab's footer is now just the mode + fan chips. If you
want preset chips back in a future iteration, hook them into the
existing `view.presetModes` (which the proxies already advertise)
instead of hardcoding three values.

## [1.4.5] — 2026-05-26

### Fixed — climate-tab on the XL room dashboard
The XL drawer's Climate tab hardcoded three mode buttons (Cool /
Heat / Off) and rendered them unconditionally. Two consequences:

- `climate.casa_*` (MQTT proxy) entities expose `fan_only` for the
  team-brain's "ventola sola" mode, but the XL drawer offered no
  way to pick it.
- `climate.pavimento_*` (Generic Thermostat) entities only support
  `[off, heat]`, but the XL drawer showed a "Cool" button that
  did nothing useful when tapped.

Mode chips are now derived from `view.hvacModes`: each chip
renders only when the underlying climate advertises that mode.
Casa proxies pick up `Fan` automatically, pavimento entities drop
`Cool`. Off is always present.

(Note: v1.3.9 was tagged on the same code by mistake while the main
branch was already at v1.4.4 — HACS picked 1.4.4 as latest under
semver. v1.4.5 supersedes both.)

## [1.3.8] — 2026-05-25

### Added — `fan_only` mode on the wall-display thermostat panel
The `cow-thermostat-panel` mode chip-row used to filter HVAC modes
down to off/heat/cool/heat_cool/auto and silently drop everything
else — fine when the climate entity was a raw Koolnova zone, but
the new `climate.casa_<room>` MQTT proxies advertise
`["off","heat","cool","fan_only"]`. With the old filter the
"Fan" chip never rendered and the team-brain's fan_only branch
(Koolnova=fan_only, pavimento=off) was unreachable from the
wall display.

- `ThermostatView.mode` union widened to include `"fan_only"`.
- `deriveThermostatView` recognises `state === "fan_only"` and
  returns it as the mode instead of collapsing it to `auto`.
- The chip-row whitelist now includes `fan_only` with label "Fan".
- `dry` is intentionally still excluded — the proxies don't expose
  it and we don't want a chip that calls a service the proxy
  rejects.

No state migration needed — the existing 6 `walldisplay-*`
dashboards already use the right entities, and the next data
migration repoints their `climate:` field at the new proxies in
the same release window.

## [1.3.7] — 2026-05-18

### Changed — cover row icon: 🪟 → ▤
Swapped the cover-row glyph introduced in v1.3.6. 🪟 (Emoji 13.0,
2020) renders as a thin pale outline on Chrome / Edge desktop and
shows up as tofu on the older Chromium build the Shelly Wall
Displays ship — exactly the device this card targets, so the
"give people at-a-glance type info" UX win evaporated. ▤ (U+25A4
SQUARED HORIZONTAL FILL) is a plain Unicode glyph supported
everywhere, looks like roller-shutter slats, and is the same
character already used on the room-tile "open covers" badge — so
the drawer and the tile now tell the same story with the same
mark.

Bumped to 20 px in CSS (`.qc-row-icon.is-cover`) so its visual
weight matches the 16 px 💡 emoji; emojis render larger than
plain glyphs at the same font size.

## [1.3.6] — 2026-05-18

### Added — type icons in the mobile drawer rows
Rooms with both lights and rollers (e.g. Sala & Cucina, Studio
Alessio, Servizi) crammed two device types into the same drawer
list, and a label like "Sala" or "Lavanderia" gave no hint about
whether the row was a light toggle or a cover with open/stop/close.
Added a leading 💡 / 🪟 emoji as a type marker on every `qc-row`,
in a fixed-width 22 px slot so the labels still line up regardless
of platform emoji width.

(Note: v1.3.7 swaps 🪟 for ▤ on cover rows to fix rendering on
older Chromium builds — see that entry for details.)

## [1.3.5] — 2026-05-18

### Changed — mobile dashboard summary moved above the room grid
The four whole-house quick actions (Spegni/Accendi tutte le luci,
Chiudi/Apri tutte le tapparelle) used to live at the very bottom of
the card, below seven room tiles. With more rooms wired in (Studio,
Terrazza, Servizi — see the dashboard config patch below) the user
had to scroll past ~10 tiles just to reach the "go-to-bed" button,
which defeats the whole point of a single-tap good-night control.

Moved the summary chip to sit directly under the hero, so the four
action buttons stay in thumb reach on any phone. The room grid now
follows, scrolling as a single uninterrupted list.

### Added — mobile dashboard config now covers the rest of the house
Migrated the stored `dashboard-mobile` config in HA to wire up the
entities that were sitting in the entity registry without a tile.
No card-side changes; this is a data migration:

- **Sala & Cucina** now also exposes `light.luce_tavolo_sala`,
  `light.led_calda_sala`, `light.led_sala_fredda`, and
  `light.led_cucina` as accent rows in the quick-control drawer.
- **Bagno Padronale** now lists `cover.tapparella_bagno_padronale`,
  which was missing despite being one of the most-used rollers.
- **Studio** (💻) — new room. Three lights (warm, cool, outdoor) +
  one cover (roller shutter). No climate or temp/humid sensor in
  this room, so the tile shows just the name and the active badge.
- **Terrazza** (🌳) — new room. `light.led_terrazzo` and
  `light.led_esterno_p1` as accent outdoor LEDs, plus the two
  terrace-facing rollers `cover.tapparella_sala_terrazza` and
  `cover.tapparella_cucina_terrazza`.
- **Servizi** (🧰) — new room. Catch-all for lights that don't
  belong to any "real" room: `light.luce_box` (garage / box) and
  `light.led_corridoio_p1` (corridor LED). No covers, no climate.

## [1.3.4] — 2026-05-18

### Fixed — mobile drawer left a sliver visible when closed
A thin rounded strip of the quick-control drawer was painting at the
bottom of the card even with no room selected. Cause: the dialog's
base styles included `display: flex` (plus `position: fixed`,
`background`, `box-shadow`) on the unconditional `dialog.drawer`
selector. The UA stylesheet's `dialog:not([open]) { display: none }`
rule has equal specificity to that, but the cascade prefers author
origin over UA origin, so our rule silently won and the dialog
remained laid out (and painted) even without the `[open]` attribute.

Fix: move every layout-affecting property onto `dialog.drawer[open]`
and add an explicit `dialog.drawer:not([open]) { display: none }`
belt-and-braces rule. The dark-mode background override is now also
scoped to `[open]`. Visually identical when open; truly invisible
when closed.

## [1.3.3] — 2026-05-17

### Changed — mobile dashboard hero, no more bottom ribbons
The hero used to be just a clock + date + outdoor temp, with two
independent ribbons stacked below the summary chip: a purple "Music
Assistant" transport bar (`media_player`) and a separate "Casa:
inserita / disinserita" alarm row. They duplicated information you
already glance at elsewhere (the music transport is one tap away in
the HA app, and the alarm chip didn't need its own block). The hero
also told you nothing about *who's home*, which is the single most
useful piece of "at a glance" information on a phone dashboard.

New layout, all inside the gradient hero so it stays the
one-screen-no-scroll glance card:

- A row of two presence chips: `🏠 Alessio` (everyone currently
  `state === "home"`) and `🚶 Koma, Chiara` (everyone tracked but
  not at home). `unknown` / `unavailable` persons are silently
  dropped — no fake "fuori" badge for an unconfigured phone.
- Below it, the alarm pill: a small rounded chip with a 🔒/🔓
  icon and the human-readable state. The pill is tinted orange
  when armed (any `armed_*` variant), pulsing yellow during
  `arming`/`disarming`/`pending`, and pulsing red when
  `triggered`. Tapping it still routes to `/lovelace/alarm`.
- Music ribbon: removed.
- Bottom alarm row: removed.

New config field: `persons: Array<string | { entity, label }>`.
Strings are the shorthand; pass the object form to override the
short name displayed in the chip (default uses the friendly_name's
first word so "Alessio Vigilante" becomes "Alessio"). `media_player`
is gone from the config schema.

The mobile dashboard's stored Lovelace config in HA was migrated
in-place to add the `persons` array and drop `media_player`, so
you don't need to touch the YAML manually.

## [1.3.2] — 2026-05-17

### Fixed — modal drawer was invisible (shadow-DOM stacking trap)
v1.3.1's drawer used `position: fixed; bottom: 0` on a regular div
inside the card's shadow root. That fails inside HA Lovelace: each
card is wrapped by `<hui-view>` / `<ha-card>` / etc. which apply
`contain: layout` and `transform`s of their own, and any of those
creates a containing block that *traps* `position: fixed` — the
drawer was rendered, but pinned to the wrapper's bottom and clipped
out of view. Visually it just looked like a black flash.

Rewrote the drawer on top of the native HTML `<dialog>` element
with `showModal()`: that element renders into the browser's *top
layer*, which sits above every stacking context and every
containing block in the page. Inside the dialog we just override
the user-agent centering and pin the sheet to `bottom: 0` with
`max-height: 82vh`. The native `::backdrop` pseudo-element handles
the dimming, ESC handles close, and we restore a click-outside-to-
dismiss behaviour by checking whether the click hit the dialog
node itself versus its inner content rect.

Bonus: in dark mode the drawer now gets an elevated background
(`--ha-card-background` rather than the page's near-black) so the
sheet stands apart from the 0.45-opacity backdrop. Previously the
two were the same colour and the user couldn't see the drawer at
all even though it was technically painted.

## [1.3.1] — 2026-05-17

### Changed — mobile dashboard quick-control is now a modal drawer
The inline accordion that opened below the room grid forced the user
to scroll all the way down to reach the controls — easy to "lose"
the panel and forget which room you tapped. Replaced with a real
bottom-sheet drawer:

- Slides up from the bottom (240 ms ease), full-width, max 82vh.
- Translucent backdrop above the rest of the page; tap-anywhere or ✕
  to dismiss.
- Pill-shaped drag handle at the top.
- Drawer body is scrollable on its own when the room has many
  devices, so the rest of the dashboard doesn't shift around.
- `env(safe-area-inset-bottom)` padding so the drawer clears the
  iPhone home-indicator gesture bar.

The selected-tile highlight on the grid was removed — the drawer
itself signals which room you're operating on now, so the tile
doesn't need to keep state.

### Added — four summary actions instead of two
Per user feedback, exposing only "Spegni tutte" / "Chiudi tutte"
made the inverse actions (turn everything on, open every cover)
unreachable from the summary. The chip now shows all four:

```
[ Spegni tutte ]   [ Accendi tutte ]      ← lights pair
[ Chiudi tutte ]   [ Apri tutte ]         ← covers pair
```

Visual hierarchy is solid (primary, on a tinted background) for the
default action of each row and outlined (secondary) for the inverse.
Each button is `disabled` when it would be a no-op (e.g. "Accendi
tutte" is faded when every configured light is already on).

## [1.3.0] — 2026-05-17

### Added — `cow-mobile-dashboard-card`
Brand-new single-card mobile home dashboard for the HA companion app
on a phone. Single column layout, target viewport ~390 px. Sits at
the top of the `dashboard-mobile` Lovelace dashboard.

Anatomy:
- **Hero**: big clock + Italian day/date + outdoor temperature, on a
  gradient that picks day / sunset / night by `sun.sun` elevation
  (no live sky FX — kept lightweight, per user decision).
- **Room grid** (2 columns): icon + name + temp/humidity + badges
  for active lights and open covers. Tap to expand.
- **Quick control panel** (inline, opens below the grid): toggle
  each light, drag the bar to set brightness (only for dimmable
  bulbs), ▲/■/▼ each cover.
- **Summary chip**: counts of lights on + covers open, plus quick
  "Spegni tutto" / "Chiudi tutte" buttons. Collapses to "Tutto
  spento e chiuso 🌙" when nothing is on.
- **Music ribbon** (conditional): only shown when the configured
  `media_player` is `playing` or `paused`. Title + artist + ⏮ ⏸/▶ ⏭.
- **Alarm row** (optional): one-line status of the configured
  `alarm_control_panel`, linked through to `/lovelace/alarm`.

Config schema (Lovelace YAML):

```yaml
type: custom:cow-mobile-dashboard-card
weather: weather.pirateweather
sun: sun.sun
alarm: alarm_control_panel.casa
media_player: media_player.music_assistant
rooms:
  - name: "Sala & Cucina"
    icon: "🛋"
    temp: sensor.display_sala_temperature
    humidity: sensor.display_sala_humidity
    climate: climate.koolnova_sala
    lights:
      - { entity: light.luce_sala, label: "Sala" }
    covers:
      - { entity: cover.tapparella_sala, label: "Sala" }
```

The card is registered in `window.customCards` (visible in HA's
"Add card" picker) and ships in the same bundle as the small
thermostat card, so HACS installs it automatically.

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
