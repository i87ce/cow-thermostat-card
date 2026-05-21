# Step 6 — House HVAC architecture & climate entities

Goal: write down, before we forget, how heating / cooling is wired in
the house, which entities Home Assistant exposes for each zone, and
how the mobile dashboard is supposed to surface them. This page is
the source of truth for any future work on climate UI.

> Captured: 2026-05-21, after the v1.3.7 dashboard work.

## A. Two independent HVAC systems

The house has **two completely independent systems** that happen to
serve the same physical rooms. They share no wiring, no controller
and no Home Assistant entity:

| System | Job | Controller | Exposed to HA as |
|---|---|---|---|
| **Koolnova / Modbus** | Heat pump + air conditioning (warmth + cooling via air) — 5 active zones | Koolnova Modbus integration | `climate.koolnova_*` |
| **Underfloor heating** | Hydronic floor heating per zone, water valve per room | Shelly Wall Display (one per zone, `switch:0` relay opens the valve) + HA Generic Thermostat | `climate.pavimento_*` |

Floor heating gives a slow, comfortable warm baseline; the heat pump
adds fast top-up heat or summer cooling. They are intentionally
independent so a single failure doesn't kill the whole house.

## B. Per-zone mapping

The two systems don't cover exactly the same set of rooms — there
are more floor zones than Modbus zones, because Koolnova drives
the air system and you don't put air-con vents in a tiny bathroom.

| Room | Floor zone (`climate.pavimento_*`) | Modbus zone (`climate.koolnova_*`) |
|---|---|---|
| Sala | `pavimento_sala` *(shared loop, also heats Cucina)* | `koolnova_sala` |
| Cucina | shares `pavimento_sala` — single hydronic loop covers both rooms | `koolnova_cucina` |
| Camera 1 | `pavimento_camera_1` | `koolnova_camera_1` |
| Camera 2 (Studio Chiara) | `pavimento_camera_2` | `koolnova_camera_2` |
| Camera Padronale | `pavimento_camera_padronale` | `koolnova_camera_3` |
| Bagno Ospiti | `pavimento_bagno_ospiti` | — |
| Bagno Padronale | `pavimento_bagno_padronale` | — |
| Ingresso PT | `pavimento_ingresso_pt` | `koolnova_ingresso_pt` |
| Studio Alessio | — | — |
| Esterno / Terrazza | — | — |
| Servizi (box, scala, ecc.) | — | — |

User-reported counts vs. what HA actually sees:

| | User stated | HA reality |
|---|---|---|
| Modbus zones | 5 (sala, cucina, camera 1/2/3) | 6 (extra: `koolnova_ingresso_pt`) |
| Floor zones | 8 (one per Wall Display) | 7 valves; Cucina shares Sala's loop, so there's no separate `climate.pavimento_cucina` entity |

## C. Underfloor heating wiring (per display)

Each Shelly Wall Display has these terminals connected:

- **L / N** — mains power
- **SW** — input (manual override switch, currently unused)
- **O** — relay output → wired to the **valve actuator** for that
  zone's floor circuit

The display itself only exposes raw I/O and sensors to HA — **no
built-in thermostat profile is active**. We verified this with
`Shelly.GetConfig` on every display: only `switch:0`, `input:0`,
`temperature:0`, `humidity:0`, `illuminance:0`. No `thermostat:*`
component. So nothing to disable on the Shelly side — the loop is
HA-driven from day one.

Entities exposed per display:

| Entity | Role |
|---|---|
| `sensor.display_<room>_temperature` | Current room temperature (used as `target_sensor`) |
| `sensor.display_<room>_humidity` | Humidity (just UI / observability) |
| `switch.display_<room>` | The relay output (`heater` in Generic Thermostat) |
| `binary_sensor.display_<room>_input_0` | SW input (currently unused) |
| `sensor.display_<room>_illuminance` | Ambient light level (for screen dimming) |

## D. Design decision: Option A — "HA owns the relay"

Before we wired any climate entity we considered three options:

1. **A. HA-owned** — Generic Thermostat in HA controls `switch:0`
   directly. Display becomes a dumb I/O bridge.
2. **B. Shelly-owned** — Re-enable the Shelly thermostat profile;
   HA only reads the state via MQTT / RPC.
3. **C. Hybrid** — Shelly handles the local loop, HA pushes
   setpoint changes via RPC for scheduling.

We picked **A**. Reasons:

- HA is already the central source of truth for schedules,
  presence, automations and the mobile UI we're building.
- The display side already had **no active thermostat profile**,
  so option A was zero work on the Shelly side — we didn't have
  to disable anything.
- A single control loop means no setpoint divergence between
  display touch and HA app.
- Trade-off accepted: if HA is offline, the floor heating stops.
  Acceptable because (a) HA runs on always-on hardware, (b)
  Koolnova still works independently as a fallback, (c) a
  failsafe automation can be added later (e.g. force `switch:0`
  on if `sensor.display_<room>_temperature` drops below 16 °C).

## E. What was created in HA

Seven `generic_thermostat` config entries, one per display, via the
REST API `/api/config/config_entries/flow` (handler:
`generic_thermostat`):

```
climate.pavimento_sala               heater=switch.display_sala               sensor=sensor.display_sala_temperature   (covers Sala + Cucina, friendly_name="Pavimento Sala & Cucina")
climate.pavimento_camera_1           heater=switch.display_camera_1           sensor=sensor.display_camera_1_temperature
climate.pavimento_camera_2           heater=switch.display_camera_2           sensor=sensor.display_camera_2_temperature
climate.pavimento_camera_padronale   heater=switch.display_camera_padronale   sensor=sensor.display_camera_padronale_temperature
climate.pavimento_bagno_ospiti       heater=switch.display_bagno_ospiti       sensor=sensor.display_bagno_ospiti_temperature
climate.pavimento_bagno_padronale    heater=switch.display_bagno_padronale    sensor=sensor.display_bagno_padronale_temperature
climate.pavimento_ingresso_pt        heater=switch.display_ingresso_pt        sensor=sensor.display_ingresso_pt_temperature
```

Shared parameters:

```
ac_mode:             false           (heat-only, no AC reverse)
min_temp:            15
max_temp:            28
cold_tolerance:      0.3
hot_tolerance:       0.3
min_cycle_duration:  00:05:00        (prevent valve thrash)
comfort_temp:        21
eco_temp:            18
sleep_temp:          19
away_temp:           16
hvac_modes:          [heat, off]
preset_modes:        [none, away, comfort, eco, sleep]
```

Initial state for all 7: `hvac_mode=off`, `target_temp=15`. Safe to
leave them parked until the dashboard exposes them.

### Validation done on Camera 2

| Action | Expected | Observed |
|---|---|---|
| `set_hvac_mode: heat` + `set_temperature: 25` (current 22.6) | relay ON | relay ON, `hvac_action=heating` ✓ |
| `set_temperature: 15` (below current) | relay OFF | relay OFF, `hvac_action=idle` ✓ |
| `set_hvac_mode: off` | relay OFF | relay OFF ✓ |

The other six were created with the same flow but not actively
tested (they're parked `off` so the relay stays off regardless).

## F. Open items

These are intentionally **not done yet** so we can pick them up
later from a clean state:

- **C1. Mobile dashboard support for 2 climates per room.** The
  `cow-mobile-dashboard-card` schema currently has a single
  `climate: string` field per room. The house has rooms with two
  climates (e.g. Sala has both `koolnova_sala` and `pavimento_sala`)
  and we need both reachable from the room drawer. Candidate
  approaches:
  - extend the schema to `climate` (HVAC) + `floor_climate` (floor)
  - or generalise to `climates: string[]`
  - decision deferred — track in CHANGELOG when picked.
- **C2. ~~Cucina floor zone~~** — **resolved 2026-05-21.** Confirmed
  by the user: the Cucina floor circuit is physically tied to the
  Sala valve (single hydronic loop, one actuator). No extra entity
  needed. The `climate.pavimento_sala` friendly_name was renamed
  to **"Pavimento Sala & Cucina"** so any UI that reads it makes
  the shared-loop nature obvious. Important downstream consequence:
  the `target_sensor` is still `sensor.display_sala_temperature`,
  so the thermostat loop reacts to **Sala's** temperature only.
  Cucina temp will drift slightly because there's no closed loop
  on it — acceptable since they're an open-plan space.
- **C3. Cucina Modbus surfacing.** `climate.koolnova_cucina` exists
  but isn't reachable from the dashboard because "Sala & Cucina"
  is a single room tile that only points at `koolnova_sala`. Fixed
  by C1 above (multi-climate per room) or by splitting Sala and
  Cucina into two tiles.
- **C4. Failsafe automations.** Should add a "freeze-protect"
  automation: if any `sensor.display_<room>_temperature` reads
  below 14 °C for >5 min while HA is up, force the corresponding
  `switch.display_<room>` on for 30 min. Also a watchdog so that
  if HA loses connection to a display for >15 min, an alert goes
  out (the relay will stay in whatever state it was, but at least
  the user knows).
- **C5. SW input wiring.** Every display has a free `SW` input
  exposed as `binary_sensor.display_<room>_input_0`. We could
  wire a physical switch to it and use it as a manual "boost"
  trigger (e.g. press → set `comfort` preset for 1 hour).

## G. Reproducing the setup from scratch

If we ever wipe HA and need to rebuild the 7 thermostats, the
quickest path is to POST to the REST API (see git history for the
exact script that did the batch creation). Pseudo-code:

```js
for each room in [sala, camera_1, camera_2, camera_padronale,
                  bagno_ospiti, bagno_padronale, ingresso_pt]:

  POST /api/config/config_entries/flow
    { "handler": "generic_thermostat",
      "show_advanced_options": true }
  → returns flow_id

  POST /api/config/config_entries/flow/{flow_id}
    { "name": "Pavimento <Room>",
      "ac_mode": false,
      "target_sensor": "sensor.display_<room>_temperature",
      "heater": "switch.display_<room>",
      "cold_tolerance": 0.3,
      "hot_tolerance": 0.3,
      "min_temp": 15,
      "max_temp": 28,
      "min_cycle_duration": { "minutes": 5 } }

  POST /api/config/config_entries/flow/{flow_id}
    { "comfort_temp": 21, "eco_temp": 18,
      "sleep_temp": 19, "away_temp": 16 }
  → "create_entry" with auto entity_id
       climate.display_<room>_pavimento_<room>

  WS config/entity_registry/update
    { entity_id: "climate.display_<room>_pavimento_<room>",
      new_entity_id: "climate.pavimento_<room>",
      name: "Pavimento <Room>" }
```

Sala uses the Wall Display XL (`172.16.1.50`), all the rest use the
4" model. Same RPC API, same entity layout.
