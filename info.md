# Cave of Wonders Room Card

A pixel-perfect, single-card Lovelace replacement for small square Home Assistant kiosks (Shelly Wall Display SAWD1 and similar). One card per room — controls **thermostat**, **lights**, and **blinds** with a horizontal swipe between them.

## Why

Built for the **Shelly Wall Display SAWD1** (4" square touch). The card scales itself to any square viewport using container queries, so the same build works on 480×480 and on a desktop window equally well.

## Features

- **12 visual states** matching the Figma source (4 thermostat / 4 blinds / 4 lights)
- **Horizontal swipe** between the three devices, with state-coloured dot indicators
- **Inter font embedded** — no external font CDN required (works on a LAN-only display)
- **Built for ES2017** WebView (Shelly's MTK6580 SoC) — no `filter: blur`, no heavy JS
- **One YAML block per room** — easily replicated across Wall Displays

## Configure

```yaml
type: custom:cow-thermostat-card
room: "Living Room"
climate: climate.living_thermostat
light: light.living_main
cover: cover.living_blinds
outdoor_temp: sensor.weather_temperature
local_temp: sensor.shelly_walldisplay_living_temperature
local_humidity: sensor.shelly_walldisplay_living_humidity
initial_view: thermostat
```

See [README](README.md) for the full setup guide and Wall Display configuration.
