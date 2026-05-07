# cow-thermostat-card

> **Cave of Wonders** room card for Home Assistant — Thermostat, Lights, Blinds in one pixel-perfect Lovelace card built for the Shelly Wall Display.

A single Lovelace card per room, with a horizontal swipe between three device views (thermostat, blinds, lights), each rendering one of 12 visual states 1:1 with the source Figma. Built specifically for the **Shelly Wall Display SAWD1** (4" square touch) but scales to any square viewport via container queries.

## Why

Shelly Wall Display ships with a generic firmware UI; the only good way to drive a richer experience is to host an HA Lovelace dashboard. Existing custom cards either don't fit the 4" square form factor or look like generic HA tiles. This card replaces the entire dashboard with one pixel-perfect view per room.

## Features

| | |
|---|---|
| Pixel-perfect | All offsets in `rem` derived from the Figma `o61NCf1Pdc2ErT26eH2PHX` source — 1 rem == 16 design-px |
| Scales | Container query maps the 384-px design canvas to 100% of any square viewport |
| Self-contained fonts | Inter Light / Regular / Medium / SemiBold / Bold ship inside the HACS plugin folder — no external CDN |
| Lightweight | ~70 KB minified bundle, no animation libraries, no `filter: blur` (MTK6580-friendly) |
| Real HA controls | Calls `climate.set_temperature/set_hvac_mode/set_fan_mode`, `cover.open/close/stop/set_position`, `light.turn_on/off` directly |
| Swipe between devices | Pointer-events based, snaps to nearest, with state-coloured dot indicators |

## The 12 variants

Each maps to one Figma frame in page **"Split Panel — All States"**:

```
Thermostat:  Heating  / Cooling  / Off    / Idle
Blinds:      Open     / Half     / Closed / Moving
Lights:      Bright   / Dim      / Off    / Night
```

## Install

### Via HACS (Custom Repository)

1. HACS → Integrations → ⋮ → **Custom repositories**
2. Repository: `https://github.com/<your-account>/cow-thermostat-card` — Category: **Lovelace**
3. **Install**, then refresh
4. If you're in YAML mode, add to `configuration.yaml`:
   ```yaml
   frontend:
     extra_module_url:
       - /hacsfiles/cow-thermostat-card/cow-thermostat-card.js
   ```

### Manual

1. `npm install && npm run build` — outputs `dist/cow-thermostat-card.js` and the 5 woff2 fonts
2. Copy `dist/*` to `<ha-config>/www/cow-thermostat-card/`
3. Settings → Dashboards → Resources → add `/local/cow-thermostat-card/cow-thermostat-card.js` (JavaScript Module)

## Configure

Per-room YAML:

```yaml
type: custom:cow-thermostat-card
room: "Living Room"
climate: climate.living_thermostat        # required
light: light.living_main                  # required
cover: cover.living_blinds                # required
outdoor_temp: sensor.weather_temperature  # optional
local_temp: sensor.shelly_walldisplay_living_temperature   # optional
local_humidity: sensor.shelly_walldisplay_living_humidity  # optional
initial_view: thermostat                  # thermostat | lights | blinds (default: thermostat)
```

Full per-room dashboards examples are in [`examples/dashboards/`](./examples/dashboards/).

## Setup guide

Full step-by-step:

1. [HA Model Context Protocol Server + Cursor](./docs/01-ha-mcp-setup.md)
2. [Lovelace dashboard + kiosk-mode](./docs/02-lovelace-dashboard.md)
3. [Shelly Wall Display configuration](./docs/03-shelly-wall-display.md)
4. [Visual verification of the 12 variants](./docs/04-visual-verification.md)

## Develop

```bash
npm install
npm run lint    # tsc --noEmit
npm run build   # rollup -> dist/cow-thermostat-card.js (+ 5 woff2)
npm run watch   # rollup --watch
```

Then open `examples/preview.html` in a browser to cycle through all 12 variants without HA.

## Source files

```
src/
  cow-thermostat-card.ts    Card root + customCards registration
  config.ts                 Validated YAML config schema
  styles/
    tokens.ts               27 colors + 5 radii + accent helpers (Figma "Atoms")
    typography.ts           @font-face Inter + 11-step type scale
    global.ts               Container-query rem scaling (1cqmin -> 1/24)
  state/
    thermostat-state.ts     4 variants from climate.* attrs
    blinds-state.ts         4 variants from cover.current_position
    lights-state.ts         4 variants from light.brightness
  devices/
    thermostat-panel.ts     Pixel-perfect replica of Figma 50:5/7/9/11
    blinds-panel.ts         Pixel-perfect replica of Figma 50:14/16/18/20
    lights-panel.ts         Pixel-perfect replica of Figma 50:23/25/27/29
  components/
    split-panel.ts          12 + 12 = 24 rem split, 16-rem radius (Figma 67:51)
    device-swiper.ts        Pointer-events horizontal snap swiper
  molecules/                8 reusable Figma molecules
  visuals/                  blind-visual.ts, bulb-visual.ts (SVG)
  utils/format.ts           formatTemp / formatTime
  types/hass.ts             Minimal HA types (no @types deps)
assets/                     5 Inter woff2 (rsms.me/inter v4.0)
examples/                   preview.html, dashboards/, configuration-snippet.yaml
docs/                       4 setup docs
```

## License

MIT — see [LICENSE](./LICENSE).
