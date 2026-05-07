# Step 12 — Visual verification of the 12 variants

## Local preview (no HA needed)

After building (`npm run build`), open [`examples/preview.html`](../examples/preview.html) in any modern browser:

```bash
npm run build
python3 -m http.server 8000  # or any static server
# then visit http://localhost:8000/examples/preview.html
```

The preview UI lets you:
- pick any of the **12 variants** from the dropdown
- swap the **viewport size** (384 / 480 / 600 / 720) — same card, different square
- toggle the **initial view** (Thermostat / Blinds / Lights)
- click "Show 12-grid" to see all 12 states side-by-side

The `hass` object is mocked locally, so `callService()` calls just log to the console — no risk of moving real blinds.

## Compare against Figma (via the Figma MCP)

For each variant, fetch the corresponding Figma frame and compare to the rendered card:

| Variant | Figma node-id | Frame name |
|---|---|---|
| `thermostat-heating` | `50:5`  | Thermostat — Heating |
| `thermostat-cooling` | `50:7`  | Thermostat — Cooling |
| `thermostat-off`     | `50:9`  | Thermostat — Off |
| `thermostat-idle`    | `50:11` | Thermostat — Idle (target reached) |
| `blinds-open`        | `50:14` | Blinds — Fully Open |
| `blinds-half`        | `50:16` | Blinds — Half Open |
| `blinds-closed`      | `50:18` | Blinds — Closed |
| `blinds-moving`      | `50:20` | Blinds — Moving |
| `lights-bright`      | `50:23` | Lights — On — Bright |
| `lights-dim`         | `50:25` | Lights — On — Dim |
| `lights-off`         | `50:27` | Lights — Off |
| `lights-night`       | `50:29` | Lights — Night (5%) |

In Cursor, with the Figma plugin connected, ask:

> Use the Figma MCP `get_design_context` for fileKey `o61NCf1Pdc2ErT26eH2PHX` node `50:5` and compare the screenshot to the local preview.

For diffs, adjust the relevant `top:` / `left:` rem in the device panel and re-run. All offsets in the panels are in `rem` and 1rem === 16 design-px Figma — so a 4 px Figma adjustment is `0.25rem`.

## Drive real entities via HA MCP

Once the card is installed in HA via HACS, force each thermostat / blinds / lights state from Cursor:

```text
# heating
service climate.set_temperature {entity_id: climate.living_thermostat, temperature: 24}
service climate.set_hvac_mode  {entity_id: climate.living_thermostat, hvac_mode: heat}

# cooling
service climate.set_hvac_mode  {entity_id: climate.living_thermostat, hvac_mode: cool}
service climate.set_temperature {entity_id: climate.living_thermostat, temperature: 22}

# off
service climate.set_hvac_mode  {entity_id: climate.living_thermostat, hvac_mode: off}

# blinds
service cover.set_cover_position {entity_id: cover.living_blinds, position: 100}  # open
service cover.set_cover_position {entity_id: cover.living_blinds, position: 50}   # half
service cover.set_cover_position {entity_id: cover.living_blinds, position: 0}    # closed
service cover.open_cover         {entity_id: cover.living_blinds}                 # moving

# lights
service light.turn_on  {entity_id: light.living_main, brightness: 240}            # bright
service light.turn_on  {entity_id: light.living_main, brightness: 110}            # dim
service light.turn_off {entity_id: light.living_main}                             # off
service light.turn_on  {entity_id: light.living_main, brightness: 13}             # night
```
