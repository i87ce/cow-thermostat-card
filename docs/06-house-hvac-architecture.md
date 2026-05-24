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

## F-bis. Climate orchestration strategy (the "team brain")

Floor heating and Koolnova HVAC overlap in winter on the same
rooms but have very different physics:

- **Floor (hydronic)**: rise time ~1–2 h, fall time ~1–2 h. You
  can't aim it at 20.0 °C exactly without overshooting by 1–1.5 °C
  because thermal mass keeps releasing heat for a long time after
  the valve closes.
- **Koolnova (air)**: rise time ~5–15 min. Instantly responsive.

If both run "naively" you get predictable overshoot in winter:
Koolnova hits setpoint in 10 min and stops, then the floor keeps
dumping heat for 2 hours and the room ends 1.5 °C above target.
Comfort wrecked.

So we coordinate them with a **single user-facing proxy
thermostat per room** (`climate.casa_<room>`) sitting in front of
the raw Koolnova + Pavimento entities. The proxy is what the
mobile dashboard and the `cow-thermostat-card` actually talk to.
A Home Assistant automation translates proxy state changes into
coordinated commands on the two underlying systems.

```
                  user (mobile / wall card)
                          │
                          ▼
                  climate.casa_<room>      ← proxy: heat/cool/fan_only/off,
                  (template climate)         setpoint, fan_mode
                          │
              change in setpoint/mode/fan
                          │
                          ▼
                  automation: orchestrate
                          │
            ┌─────────────┴─────────────┐
            ▼                           ▼
    climate.koolnova_<room>      climate.pavimento_<room>
```

### Decision parameters (confirmed by user, 2026-05-21)

| # | Parameter | Value | Notes |
|---|---|---|---|
| 1 | `FLOOR_OFFSET` | **−1.0 °C** | Pavimento aims at `setpoint − 1.0` to absorb its own overshoot |
| 2 | `BOOST_THRESHOLD` | **1.5 °C** | When `setpoint − current > 1.5`, Koolnova kicks in as booster |
| 3 | Behaviour at `idle` (target reached in heat mode) | **floor stays ON, Koolnova OFF** | Inertia of the floor holds the temperature, silently |
| 4 | Pavimento in `cool` / `fan_only` | **always OFF** | Floor is heating-only |
| 5 | **Sala + Cucina** | **always managed as a single proxy** `climate.casa_sala_cucina` | Even though Koolnova has 2 separate zones, the user wants 1 thermostat. The automation sets both Koolnova zones identically |
| 6 | Pavimento setpoint when shared (Sala / Cucina) | not applicable — single proxy means single setpoint already | (Was open before #5 collapsed Sala+Cucina) |
| 7 | Fan speed in `heat` with delta ≤ threshold | applied only when Koolnova is actually running; UI shows "auto" / "silent" otherwise | Avoids user confusion when fan setting isn't audible |
| 8 | Persistence of proxy state across HA restart | built-in via template climate state machine | No extra work |

### Algorithm — what the automation runs on every proxy change

```
inputs from proxy: mode_user, setpoint_user, fan_user
inputs from sensors: current = sensor.display_<room>_temperature

CASE mode_user == off:
    koolnova.set_hvac_mode = off
    pavimento.set_hvac_mode = off

CASE mode_user == cool:
    koolnova.set_hvac_mode = cool
    koolnova.set_temperature = setpoint_user
    koolnova.set_fan_mode = fan_user
    pavimento.set_hvac_mode = off

CASE mode_user == fan_only:
    koolnova.set_hvac_mode = fan_only
    koolnova.set_fan_mode = fan_user
    pavimento.set_hvac_mode = off

CASE mode_user == heat:
    pavimento.set_hvac_mode  = heat
    pavimento.set_temperature = setpoint_user - FLOOR_OFFSET

    delta = setpoint_user - current
    IF delta > BOOST_THRESHOLD:
        koolnova.set_hvac_mode    = heat
        koolnova.set_temperature  = setpoint_user
        koolnova.set_fan_mode     = fan_user
    ELSE:
        koolnova.set_hvac_mode    = off    # let the floor handle it
```

Special case for Sala + Cucina (rule #5): the automation fires for
the single `climate.casa_sala_cucina` proxy and writes the same
mode / setpoint / fan to **both** `climate.koolnova_sala` and
`climate.koolnova_cucina`. The pavimento side stays unchanged
(`climate.pavimento_sala` already covers both rooms).

### Proxies to create

5 proxies that orchestrate both subsystems:

| Proxy | Koolnova target(s) | Pavimento target | target_sensor (current temp) |
|---|---|---|---|
| `climate.casa_sala_cucina` | `koolnova_sala` **+** `koolnova_cucina` | `pavimento_sala` | `sensor.display_sala_temperature` |
| `climate.casa_camera` | `koolnova_camera_1` | `pavimento_camera_1` | `sensor.display_camera_1_temperature` |
| `climate.casa_studio_chiara` | `koolnova_camera_2` | `pavimento_camera_2` | `sensor.display_camera_2_temperature` |
| `climate.casa_camera_padronale` | `koolnova_camera_3` | `pavimento_camera_padronale` | `sensor.display_camera_padronale_temperature` |
| `climate.casa_ingresso_pt` | `koolnova_ingresso_pt` | `pavimento_ingresso_pt` | `sensor.display_ingresso_pt_temperature` |

2 rooms have no Koolnova zone, just the floor — for these the
proxy isn't needed: the mobile dashboard and the wall card can
target the pavimento entity directly. The two bare floor zones:

- `climate.pavimento_bagno_ospiti` (no proxy, used directly)
- `climate.pavimento_bagno_padronale` (no proxy, used directly)

The remaining rooms have no climate at all: Studio Alessio,
Esterno, Servizi.

### Implementation status

| Step | Status |
|---|---|
| Build 5 `climate.casa_<room>` proxies | ✅ done (`examples/ha-cow-climate-orchestration.yaml`) |
| Implement orchestrator automation | ✅ done (single HA automation, Jinja-templated dispatch) |
| Validate pilot on one room | ✅ done 2026-05-24, see results below |
| Repoint mobile dashboard `rooms[].climate` to proxies | ⏳ pending — see C6 in open items |
| Repoint wall-display `cow-thermostat-card` to proxies | ⏳ pending — see C6 in open items |

### How it ended up implemented

HA 2026.5.x dropped the `climate` platform from the `template:`
integration (the natural choice for this kind of proxy). Next-best
supported option was **MQTT climate** — we already have a Mosquitto
add-on serving Zigbee2MQTT, so the broker was free of charge. The
5 proxies are declared under `mqtt: climate:` with:

- `optimistic: true` — HA updates the proxy's state locally on each
  command, no echo automation needed.
- `retain: true` — Mosquitto persists last setpoint / mode / fan
  across HA restarts.
- One MQTT topic family per room: `cow/casa/<room>/{mode,setpoint,
  fan,current}/{state,set}`.

The orchestrator is a single HA automation (mode `queued`, max 20)
that triggers on `state_changed` of any of the 5 proxies plus the
5 room temperature sensors. A `rooms:` map in `variables:` is the
single source of truth — adding a new proxy is one entry in that
map. The dispatch logic is the algorithm above.

A second tiny automation forwards each `sensor.display_<room>_
temperature` reading to the proxy's `current_temperature_topic`
(retained), so the proxy populates the current temperature on
startup without polling.

### Pilot validation — 2026-05-24

Forced state changes on `climate.casa_ingresso_pt` (current room
temp 23.5 °C, Koolnova system off for the season so its `climate.*`
entity is `unavailable` — the dispatcher's calls just produce a
warning and the floor side does the real work):

| Step | Action via proxy | Expected behaviour | Observed |
|---|---|---|---|
| 1 | `heat`, setpoint 26 (Δ +2.5 > 1.5) | floor `heat@25`, relay ON; Koolnova `heat@26` | floor `heat@25` action=heating, **relay ON**, Koolnova call attempted (unavailable) |
| 2 | setpoint 24 (Δ +0.5 < 1.5) | Koolnova OFF, floor `heat@23` idle | floor `heat@23` action=idle, **relay OFF** |
| 3 | `cool`, setpoint 22 | Koolnova `cool@22`, floor OFF | floor **off**, Koolnova call attempted, relay OFF |
| 4 | `off` | everything OFF | proxy off, floor off, relay OFF |

All four steps pass. The algorithm survives off-season Koolnova
`unavailable`: the dispatcher logs a warning and the floor side
still does its job. The orchestrator scaled cleanly to all five
rooms (state-changed events on neighbouring proxies during YAML
reload triggered the automation 5× without contention).

## F. Open items

These are intentionally **not done yet** so we can pick them up
later from a clean state:

- **C1. ~~Mobile dashboard support for 2 climates per room~~** —
  **superseded 2026-05-21.** No multi-climate schema needed: the
  user wants a *single* user-facing thermostat per room. We build
  proxy `climate.casa_<room>` entities (see Section F-bis) and the
  dashboard's `rooms[].climate` keeps being a single string, just
  pointing at the proxy instead of the raw Koolnova entity. The
  dashboard card needs no code change — only a config migration.
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
- **C3. ~~Cucina Modbus surfacing~~** — **resolved 2026-05-21.**
  Folded into rule #5 in Section F-bis: `climate.casa_sala_cucina`
  drives `koolnova_sala` and `koolnova_cucina` together as a single
  proxy. No separate UI for Cucina.
- **C6. Repoint user-facing surfaces to the new proxies.** The
  proxy entities `climate.casa_<room>` are live but nothing in
  Lovelace points at them yet. Two changes needed:
  - **mobile dashboard**: migrate `rooms[].climate` from
    `climate.koolnova_<zone>` → `climate.casa_<room>` for the 5
    rooms with both subsystems; leave the two bathrooms on
    `climate.pavimento_bagno_*` (they have no Koolnova zone).
  - **wall-display dashboards** (one Lovelace dashboard per
    `walldisplay-*`): the `cow-thermostat-card` entity should
    target the matching proxy. Camera 2's card → `climate.casa_
    studio_chiara`, etc. The two bathroom displays target
    `climate.pavimento_bagno_*` directly.

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
