# Cave of Wonders Room Card

One pixel-perfect Lovelace card per room — thermostat, lights and blinds in a single tile, designed for small square touch displays like the **Shelly Wall Display SAWD1** (4" 720×720).

## Highlights

- **Gesture-driven lights** *(v1.2.0)* — tap to toggle, swipe ↕ to dim. Brightness routes only to dimmable bulbs, so mixed dimmer + on/off groups stop misbehaving.
- **Tile grid scope picker** — scales cleanly from 1 to ~10 lights per room without wrapping.
- **Pixel-perfect** — every offset and color derived 1:1 from the Figma source.
- **Offline** — Inter font embedded in the bundle, no CDN calls, works on LAN-only kiosks.
- **Lightweight** — single ~1 MB JS file, no `filter: blur`, no canvas, runs smoothly on cheap MTK6580 touch SoCs.
- **Real HA services** — `climate.set_temperature` / `set_hvac_mode`, `cover.open/close/stop/set_position`, `light.turn_on/off` direct.

## Configure

```yaml
type: custom:cow-thermostat-card
room: "Soggiorno"
climate: climate.living_thermostat
lights:
  - { entity: light.living_ceiling, label: "Soffitto" }
  - { entity: light.living_lamp,    label: "Lampada" }
covers:
  - { entity: cover.living_blind, label: "Tapparella" }
outdoor_temp:   sensor.weather_temperature
local_temp:     sensor.shelly_walldisplay_living_temperature
local_humidity: sensor.shelly_walldisplay_living_humidity
initial_view: thermostat   # thermostat | lights | blinds
```

At least one of `climate`, `lights` or `covers` must be configured.

See [README](README.md) for screenshots, setup guide, Wall Display configuration, and the full per-room dashboard examples.
