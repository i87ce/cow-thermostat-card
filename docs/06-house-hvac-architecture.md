# Step 6 — House HVAC architecture & climate entities

Goal: write down, before we forget, how heating / cooling is wired in
the house, which entities Home Assistant exposes for each zone, and
how the mobile dashboard is supposed to surface them. This page is
the source of truth for any future work on climate UI.

> Captured: 2026-05-21, after the v1.3.7 dashboard work.  
> **Updated: 2026-07-02 — v3 Mitsubishi + ESP32 serrande orchestrator** (replaces per-zone Koolnova control).

## v3 — Mitsubishi heat pump + ESP32 dampers (current)

The air-conditioning side no longer uses **per-zone Koolnova Modbus
climates**. A single Mitsubishi unit (`climate.koolnova_clima_clim1`)
feeds five motorised dampers (`cover.koolnova_serrande_serranda_1..5`)
that zone the house. Home Assistant exposes:

| Entity | Role |
|---|---|
| `climate.casa_aria` | **Global** — mode (`off/heat/cool/dry/fan_only`) + fan; identical on every display |
| `climate.casa_<room>` | **Per room** — setpoint + air on/off (`heat` = stanza partecipa al loop aria; `off` = esclusa) |
| `climate.koolnova_clima_clim1` | Physical Mitsubishi — **orchestrator only**; fixed setpoints: heat **30 °C**, cool/dry **16 °C** |
| `cover.koolnova_serrande_serranda_*` | Dampers — **orchestrator only**; never shown in UI |

Underfloor heating is unchanged: `climate.pavimento_*` (Generic
Thermostat on each display relay), coordinated by the same package
with `FLOOR_OFFSET = 1.0 °C` when `casa_aria` is in `heat`.

### REGOLA 1 (safety invariant)

**Mitsubishi ON ⇒ at least one damper open.** The orchestrator opens
dampers before turning the unit on, blocks closing the last open damper
while the motor runs, and a 30 s watchdog (`cow_climate_safety_damper_open`)
recovers if the invariant is violated.

### Zoning logic (summary)

- **Tolerance** `SETPOINT_TOLERANCE = 1.0 °C` around each room setpoint.
- Room in deficit → open its damper(s), then run Mitsubishi in the global mode.
- All participating rooms at setpoint → open **all five** dampers, Mitsubishi `fan_only`.
- One room leaves tolerance → return to global heat/cool/dry @ 30/16.
- `casa_aria off` → Mitsubishi off first, then close all dampers.
- **Sala & Cucina**: one setpoint (`sensor.display_sala_temperature`), dampers 4 (cucina) + 5 (sala).
- **Bathrooms / Ingresso PT**: floor-only proxies (`off/heat`); no `casa_aria` coupling for air.

### UI (`cow-thermostat-card` / XL drawer)

Card YAML:

```yaml
system_climate: climate.casa_aria   # global mode + fan
climate: climate.casa_<room>        # per-room setpoint + air on/off
```

- System chips: Cool → Heat → **Dry** → Fan → Off.
- Room section: Aria On/Off + setpoint.
- No damper controls.
- Legacy `climate.clima_casa_auto` removed from mobile / XL bar.

### Package

Source of truth: `examples/ha-cow-climate-orchestration.yaml` → deploy as
`cow_climate.yaml` on HA. Legacy per-zone Koolnova orchestration and
`clima_casa_auto` should stay **disabled**.

---

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

> ⚠ **Don't forget `switch:0.in_mode`.** Even without a thermostat
> profile, `switch:0` factory-ships with `in_mode: "follow"`, which
> makes the relay (`O`) mirror the SW input. That looked like the
> relay was working from HA's point of view but the valve never
> actually opened — `Switch.GetStatus` returned `source: "Auto power
> on (off)"` even right after `turn_on`. Force `in_mode: "detached"`
> on every display via `scripts/shelly-display-detach-switch.mjs`.
> Idempotent, picks IPs from the HA device registry, must be re-run
> after a factory reset.

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
| 8 | Persistence of proxy state across HA restart | broker-side retain + dedicated echo automation (see "Persistence requirement" below) | Initial assumption that `mqtt: climate:` retain would Just Work was wrong — `optimistic: true` skips the state publish. Bug B fix (2026-05-27) added the echo. |

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

### Proxies — current inventory (7 total)

| Proxy | Modes | Koolnova target(s) | Pavimento target | feed |
|---|---|---|---|---|
| `climate.casa_sala_cucina` | off/heat/cool/fan_only | `koolnova_sala` **+** `koolnova_cucina` | `pavimento_sala` | `sensor.display_sala_*` |
| `climate.casa_camera` | off/heat/cool/fan_only | `koolnova_camera_1` | `pavimento_camera_1` | `sensor.display_camera_1_*` |
| `climate.casa_studio_chiara` | off/heat/cool/fan_only | `koolnova_camera_2` | `pavimento_camera_2` | `sensor.display_camera_2_*` |
| `climate.casa_camera_padronale` | off/heat/cool/fan_only | `koolnova_camera_3` | `pavimento_camera_padronale` | `sensor.display_camera_padronale_*` |
| `climate.casa_ingresso_pt` | off/heat/cool/fan_only | `koolnova_ingresso_pt` | `pavimento_ingresso_pt` | `sensor.display_ingresso_pt_*` |
| `climate.casa_bagno_padronale` | off/heat | — | `pavimento_bagno_padronale` | `sensor.display_bagno_padronale_*` |
| `climate.casa_bagno_ospiti` | off/heat | — | `pavimento_bagno_ospiti` | `sensor.display_bagno_ospiti_*` |

The two bathroom proxies were added later (May 26) when we
realised the original 5-proxy design forced the bathroom dashboards
to reach past the proxy and target `climate.pavimento_bagno_*`
directly. That violated the "always go through the proxy" rule and
meant the bathroom drawer's Climate tab could never expose
`current_humidity` (Generic Thermostat doesn't have that attribute).
Wrapping the bathroom floor zones in `casa_*` MQTT proxies makes
the surface uniform and adds humidity to the bathroom UI.

Rooms with no heating system at all — Studio Alessio, Esterno,
Servizi — get no climate entity. Their Lovelace cards skip the
Climate tab / pill.

### Implementation status

| Step | Status |
|---|---|
| Build `climate.casa_aria` + 7 `climate.casa_<room>` proxies | ✅ done (`examples/ha-cow-climate-orchestration.yaml`) |
| v3 Mitsubishi + damper orchestrator (`cow_climate_sync_air`) | ✅ done 2026-07-02 |
| REGOLA 1 watchdog | ✅ done |
| UI split: `system_climate` + Dry chip + no damper UI | ✅ done 2026-07-02 |
| Repoint dashboards to proxies + `system_climate` | ✅ example YAMLs updated |
| Disable legacy Koolnova per-zone + `clima_casa_auto` | ⏳ on HA instance |

> **Historical note:** Sections F-bis and below describe the **v1/v2
> per-zone Koolnova** design (BOOST_THRESHOLD, dual proxy modes on one
> entity). Superseded by v3 above for the air side; floor coordination
> rules still apply.

### How it ended up implemented

HA 2026.5.x dropped the `climate` platform from the `template:`
integration (the natural choice for this kind of proxy). Next-best
supported option was **MQTT climate** — we already have a Mosquitto
add-on serving Zigbee2MQTT, so the broker was free of charge. The
**seven** proxies are declared under `mqtt: climate:` with:

- `optimistic: true` — HA updates the proxy's state locally on each
  command for snappy UX (no broker round-trip on every tap).
- `retain: true` — Mosquitto persists last setpoint / mode / fan
  across HA restarts. *Requires the state-echo automation*, see
  "Persistence requirement" below.
- One MQTT topic family per room: `cow/casa/<room>/{mode,setpoint,
  fan,current,humidity}/{state,set}`.

The dual-system proxies (sala_cucina, camera, studio_chiara,
camera_padronale, ingresso_pt) advertise the full mode list
`[off, heat, cool, fan_only]` plus fan modes
`[auto, low, medium, high]`. The two floor-only proxies
(bagno_padronale, bagno_ospiti) advertise only `[off, heat]` and
no fan modes — they wrap a Generic Thermostat that has neither.
All seven are otherwise identical so the UI stays uniform.

The orchestrator is a single HA automation (mode `queued`, max 20)
that triggers on `state_changed` of any of the 7 proxies plus the
7 room temperature sensors. A `rooms:` map in `variables:` is the
single source of truth — adding a new proxy is one entry in that
map. Each entry carries `koolnova: [...]` and `pavimento: ...`
fields; the bathroom entries set `koolnova: []` so the dispatch's
cool / fan_only / boost branches skip the air-side call cleanly.

### The boundary: where the upstream sensor meets the proxy

Two small automations sit at the boundary between the upstream
display sensors and the proxy abstraction. They fire on every state
change of `sensor.display_<room>_temperature` /
`sensor.display_<room>_humidity` and republish the value to the
matching MQTT topic with `retain: true`:

```
sensor.display_<room>_temperature ──┐
                                    ├─→ mqtt.publish (retain) ──→ cow/casa/<room>/{current,humidity}/state
sensor.display_<room>_humidity ─────┘                              │
                                                                   ▼
                                                  climate.casa_<room> (MQTT proxy)
                                                                   │
                                                  ┌────────────────┴───────────────────┐
                                                  ▼                 ▼                  ▼
                                       header pill (XL)    climate-tab drawer    mobile dashboard
```

Every UI surface — XL header chip, XL drawer Climate tab, mobile
dashboard tile, small wall card — reads `current_temperature` and
`current_humidity` from the proxy entity. None of them reach past
the proxy to the raw sensor anymore. If we ever move the canonical
reading (e.g. switch to an Aqara T1 in some room), we change a
single mqtt.publish action in `cow_climate.yaml` and every surface
picks up the new feed.

The same boundary applies to **`hvac_action`** — the attribute the
card uses to switch between the `idle` (green "Target raggiunto") and
the `heating` (orange "Sta scaldando") variants. The MQTT climate
platform does not derive `hvac_action` on its own; it can only mirror
whatever is published to `action_topic`. We therefore added
`action_topic: "cow/casa/<room>/action/state"` to every of the 7
proxies and a fourth automation (`cow_climate_publish_action`) that
watches the underlying truth — the 7 floor-display relays
(`switch.display_<room>`) and the 6 `climate.koolnova_*` zones — and
publishes one of `off | heating | cooling | fan | idle` to each
proxy's action topic with `retain: true`. The action is `heating` as
soon as **either** the floor relay closes **or** any Koolnova in the
room reports `heat`, because they're a team per Section F-bis. The
retain flag means the proxy picks up the last-known action straight
after an HA restart, before the underlying entities have finished
re-initialising. The automation also triggers on
`homeassistant.start` to republish from ground truth if the broker
ever drifted during an outage.

```
switch.display_<room>  ───┐
                          ├─→ cow_climate_publish_action ──→ cow/casa/<room>/action/state (retain)
climate.koolnova_<room> ──┘                                  │
                                                             ▼
                                          climate.casa_<room>.hvac_action
                                                             │
                                                  every card surface
```

Card code path: `deriveThermostatView` in
`src/small/state/thermostat.ts` keeps reading **only** from the
proxy — no peeking past it to the raw entities — so the
"every surface reads from the proxy" contract holds, and the card
package needs no TypeScript change to surface heating state.

### Persistence requirement — MQTT state echo

The naïve mental model is: "`mqtt: climate:` proxies have
`retain: true`, so Mosquitto persists their setpoint / mode / fan,
and an HA restart repopulates them automatically." That mental
model is wrong, and we paid for it (Bug B, 2026-05-27): every
`ha core restart` (and every HAOS reboot) reset all 7 proxies to
their YAML defaults — `off`, 21.0 °C, `auto` — losing whatever
the user had configured.

The root cause is the interaction between `optimistic: true` and
HA's own MQTT publish logic. With `optimistic`:

- HA flips the proxy's local state the instant a command lands
  (good — no broker round-trip on every tap of the ▼ ▲ bumpers).
- HA publishes the command to `cow/casa/<room>/<field>/set` with
  `retain: true` (so the broker holds the retained *command*).
- HA does **not** publish anything to `cow/casa/<room>/<field>/
  state` — the state topic stays empty on the broker forever.

Active proof from the diagnosis run: after a `climate.set_temperature
(climate.casa_sala_cucina, 22.5)` we observed exactly
`cow/casa/sala_cucina/setpoint/set => '22.5' (retain=True)` on the
broker, with no companion `setpoint/state` publish. The 12 retained
topics we saw before the test were all `current/state` and
`humidity/state` — published explicitly by the temperature /
humidity echo automations above, not by the proxy itself.

So `retain: true` had nothing to persist for mode / setpoint / fan.
On restart, HA's MQTT integration re-subscribes to `*/state`, the
broker has nothing retained for it, and the proxies come up with
the YAML defaults.

**Fix**: the small `cow_climate_publish_state_echo` automation in
`cow_climate.yaml` listens on every `cow/casa/+/{mode,setpoint,
fan}/set` and republishes the same payload to the matching
`/state` topic with `retain: true`. End-to-end flow becomes:

```
UI tap
   │
   ▼
climate.casa_<room>.set_temperature(X)
   │   (optimistic — UI state flips immediately)
   ▼
HA publishes  cow/casa/<room>/setpoint/set => "X"  retain=true
   │
   ▼  (mqtt platform trigger fires the echo)
echo automation
   │
   ▼
HA publishes  cow/casa/<room>/setpoint/state => "X"  retain=true
   │
   ▼
mosquitto.db on disk  (/data/mosquitto.db in the add-on data volume)
   │
   ▼  (HA / HAOS restart, broker comes back up, file is re-read)
HA's MQTT integration re-subscribes to cow/casa/+/setpoint/state
   │
   ▼
broker delivers retained "X" to HA
   │
   ▼
climate.casa_<room>.temperature = X  ← user's setting is back
```

Why we kept `optimistic: true` rather than dropping it:

- Dropping `optimistic` alone does **not** fix the bug. Without
  optimistic HA waits for the state topic to confirm the command,
  but nothing else in the system was publishing to `*/state`, so
  the UI state would stay stale forever. We'd need the echo
  regardless.
- With the echo in place the round-trip latency is single-digit
  milliseconds — but it's still a round trip, and the UI updates
  visibly slower than under optimistic. No upside to paying it.
- Optimistic + echo is the canonical pattern HA's own docs
  recommend for MQTT climate when you want both snappy UX *and*
  retained state.

Broker-side, the **core-mosquitto add-on already ships with
persistence enabled** by default. Its built-in
`/etc/mosquitto/mosquitto.conf` contains:

```
persistence true
persistence_location /data/
```

…and `/data/` inside the container is a bind mount onto
`/mnt/data/supervisor/addons/data/core_mosquitto/` on the host,
so `mosquitto.db` survives container restarts and HAOS reboots
out of the box. We checked this — no add-on config change is
needed. A fresh HAOS install with the default core-mosquitto
add-on will work as long as the echo automation is present.

If a future maintenance step moves to a different MQTT broker
(self-hosted Mosquitto, EMQX, HiveMQ…) the same constraints
apply: enable on-disk persistence on the broker AND keep the
echo automation alive. Either alone is insufficient.

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
- **B-fix. ~~Floor valves never opened — relay slaved to SW input~~** —
  **resolved 2026-05-27.** Symptom: every `climate.pavimento_<room>`
  showed `hvac_action: heating` on demand, the Generic Thermostat
  was calling `switch.display_<room>.turn_on`, and the HA state of
  that switch did flip to `on`, **but the physical valve on terminal
  O never energised**. Reason: the SAWD1 factory-default for
  `switch:0` is `in_mode: "follow"`, which makes the relay output
  (`O`) literally mirror the input pin (`SW`). With nothing wired
  on `SW` the relay sat at OFF and silently ignored every RPC
  command — `Switch.GetStatus` reported `output: false, source:
  "Auto power on (off)"` even right after a `turn_on` call. The
  fix is to flip every display to `in_mode: "detached"` so the
  relay takes RPC commands again; `SW` stays available as
  `binary_sensor.display_<room>_input_0` for the future C5 boost
  button. Applied via `scripts/shelly-display-detach-switch.mjs`
  (idempotent, discovers IPs from the HA device registry). Six of
  seven displays updated; Bagno Padronale was offline at the time
  and will be picked up on the next run.

- **C6. ~~Repoint user-facing surfaces to the new proxies~~** —
  **resolved 2026-05-26.** All seven dashboards (6 walldisplay-*
  + 1 XL walldisplay-sala-cucina) and the mobile dashboard now
  target `climate.casa_<room>` via the stored Lovelace YAML. The
  two bathroom dashboards moved from `climate.pavimento_bagno_*`
  to `climate.casa_bagno_*` once the bathroom proxies were added
  on the same day (see "Proxies — current inventory" above).
  The small wall-display thermostat-panel (v1.3.8+) now accepts
  `fan_only` in its mode chip-row, and the XL drawer's
  climate-tab (v1.4.9+) picks up the THERMOSTAT_ACCENT palette so
  the body gradient + selected mode chip both switch colour with
  the variant — matching the small panel exactly.

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
