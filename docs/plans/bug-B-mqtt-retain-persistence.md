# Plan B — Setpoint / mode resets to off / 21° after HA restart

**Owner**: parallel-agent B  •  **Severity**: high (HA restart is
common — losing every climate setting every time is real user
pain)  •  **Estimate**: ~20 min config + 15 min verify

## Symptom

After `ha core restart` (or any container/HAOS restart), every
`climate.casa_*` proxy resets to:

- `state: off`
- `temperature: 21.0`
- `fan_mode: auto`

User's expected behaviour: the proxy should restore the last
setpoint, mode, and fan it had before the restart. That's what
`retain: true` on the MQTT climate is supposed to give us.

## Root cause analysis (likely, in order of probability)

### Hypothesis B1 — Mosquitto persistence disabled (most likely)

The MQTT broker is `core-mosquitto` (HA add-on). By default the
HA add-on **does not** enable on-disk persistence — retained
messages live in RAM and evaporate on restart. The
`mqtt: climate:` proxy's `retain: true` only marks outgoing
publishes as retained; if the broker doesn't persist them, a
broker restart drops them all.

When HA core restarts, the add-on may or may not restart too —
but even if Mosquitto stays up, the **HA MQTT integration
restarts** and re-subscribes to topics. As long as the broker
still has the retained payloads, the proxies repopulate
immediately. If the broker was bounced too (HAOS restart, supervisor
update, etc.), the retains are gone.

**Fix**: enable persistence in the Mosquitto add-on config.

### Hypothesis B2 — `optimistic: true` interaction

The proxies are declared `optimistic: true` so that HA flips the
local state instantly on a command without waiting for a
broker round-trip. With `optimistic`, HA may not be publishing the
new state back to the `*_state` topic at all — only consuming the
command. If that's the case, **no retained state ever lands on
the broker**, so persistence wouldn't help either.

Investigate by subscribing to the state topics from outside HA
during a setpoint change:

```bash
mosquitto_sub -h localhost -p 1883 -u <user> -P <pwd> \
  -t 'cow/casa/+/setpoint/state' -t 'cow/casa/+/mode/state' \
  -v
# Then change a setpoint from the mobile dashboard.
```

If you see the state topic being published → B2 is not the
problem (the publish happens). If nothing arrives → B2 is the
real issue and `optimistic` needs rethinking.

### Hypothesis B3 — Wrong topic shape

If `mode_state_topic` and `mode_command_topic` point to the same
topic, retain handling can get racy on reconnect. Check that
state and command topics are **distinct** in every proxy. (They
already are in the current YAML — different paths under
`cow/casa/<room>/<field>/{state,set}`. So this is unlikely but
worth a 30-second visual check.)

## Solution

### Step 1 — Confirm which hypothesis is true

```bash
# 1) Check broker config
ssh -i ~/.ssh/id_rsa -p 22222 root@172.16.0.200
docker exec addon_core_mosquitto sh -c 'cat /share/mosquitto/mosquitto.conf 2>/dev/null; cat /etc/mosquitto/mosquitto.conf 2>/dev/null'
# Look for `persistence true` and `persistence_location …`.

# 2) Subscribe to state topics while making a change (Hypothesis B2)
docker exec addon_core_mosquitto mosquitto_sub \
  -u <ha_mqtt_user> -P <pwd> \
  -t 'cow/casa/+/setpoint/state' -v
# In another shell, change a setpoint from the mobile dashboard.
# Expect:  cow/casa/<room>/setpoint/state 22.5

# 3) Restart Mosquitto only, see if retains survive
ha addons restart core_mosquitto
# Then check the proxies' state in HA Developer Tools → States.
```

### Step 2a — Fix Hypothesis B1: enable persistence

The Mosquitto add-on has a `customize: { active: true, folder:
"mosquitto" }` mechanism where the user can drop a `*.conf` file
under `/share/mosquitto/`. Easier path (HAOS-native):

In the add-on UI → "Configuration" tab → there's a flag for
persistent storage. If the UI doesn't surface it (older add-on
versions), drop this file:

```bash
ssh -p 22222 root@172.16.0.200
mkdir -p /share/mosquitto
cat > /share/mosquitto/cow-persistence.conf <<'EOF'
# Enabled by the cow-thermostat-card project to keep climate
# proxy setpoints/modes/fan across HA / broker restarts.
# Without this, every `mqtt: climate` proxy resets to its
# config-defined defaults on every restart.
persistence true
persistence_location /share/mosquitto/data/
autosave_interval 60
EOF
mkdir -p /share/mosquitto/data
# Make sure the add-on picks it up (set customize.active = true)
# via the Configuration tab; then restart the add-on.
ha addons restart core_mosquitto
```

Then **republish the retained values once** by setting each climate
manually from the mobile dashboard (or via a one-shot script that
walks the 7 proxies and re-applies their current state). After that,
retains persist across restarts.

### Step 2b — Fix Hypothesis B2: drop `optimistic`

If subscription confirms HA isn't publishing back the state topic,
remove `optimistic: true` from every proxy and rely on the round
trip. Cost: ~50 ms latency between command and visible state change
in the UI, which is below the human-perceptible threshold. Plus
side: the broker becomes the single source of truth for the
state, and persistence gives us free restart recovery.

If you keep `optimistic`, add an echo automation that publishes
the new state to `*/state` every time the proxy receives a command
on `*/set`. Less clean, more code; only do this if there's a
measurable UX regression from dropping optimistic.

## Verification checklist

1. Set every `climate.casa_<room>` to a distinctive setpoint:
   sala_cucina=22.5, camera=19.5, studio_chiara=18.0, etc.
2. `ha core restart`. Wait for HA to come back.
3. Open the mobile dashboard → each room's climate block should
   show the same setpoint it had before the restart.
4. `ha host reboot`. (Yes, the whole host — that's the real
   stress test, because it bounces Mosquitto too.) Wait ~3 minutes
   for HAOS + HA to come back.
5. Same check — setpoints should still be there.
6. Confirm broker persistence file exists:
   `ls -lh /share/mosquitto/data/mosquitto.db`. File should be
   non-empty and the mtime should be < 60 s after the last
   setpoint change (because `autosave_interval 60`).

## Files to touch

- `/share/mosquitto/cow-persistence.conf` (on the HAOS host, not
  in this repo).
- `examples/ha-cow-climate-orchestration.yaml` — possibly drop
  `optimistic: true` if Hypothesis B2 is true. Add a comment
  explaining the persistence requirement.
- `docs/06-house-hvac-architecture.md` — add a "Persistence
  requirement" subsection under §F-bis.
- `docs/07-deploy-and-release.md` — note that a fresh HAOS
  install needs this Mosquitto persistence config too (otherwise
  every climate resets on first restart).
- `CHANGELOG.md` — patch entry: "Fixed: climate setpoints survive
  HA / broker restart (Mosquitto persistence + …)".

## Out of scope

- Migrating away from MQTT climate. We had a long discussion in
  v1.4.0 about why `template: climate` died in HA 2026.5.x.
  Don't rehash.
- Replacing retain with `input_number` helpers. Doable but doubles
  the state machine and breaks the "one source of truth = proxy"
  contract.

## Coordination with Plan A

Plan A also adds `retain: true` on the `action_topic`. The same
persistence config benefits both. Whichever plan lands first should
set up persistence; the second one inherits it for free.
