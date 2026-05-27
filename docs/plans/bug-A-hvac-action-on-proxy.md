# Plan A — Card shows IDLE while floor is heating

**Owner**: parallel-agent A  •  **Severity**: medium (cosmetic but
confusing)  •  **Estimate**: ~30 min implementation + 10 min verify

## Symptom

The `cow-thermostat-panel` (small wall card), the XL drawer Climate
tab, and the mobile dashboard climate row all show variant **idle**
("Target raggiunto", green) when the user sets a high heat
setpoint and the floor relay actually closes. They should switch to
variant **heating** ("Sta scaldando", orange) the moment the
underlying floor / Koolnova starts working.

End-to-end repro:

1. Pick a room with a `climate.casa_<room>` proxy.
2. Set mode = `heat`, setpoint > current temperature (verified via
   the v1.4.15 setpoint-modal — type a high number directly).
3. The Generic Thermostat fires `switch.display_<room>.turn_on`,
   the SAWD1 relay flips to `output: true` (verified via
   `Switch.GetStatus?id=0` returning `source: "RPC Set"`).
4. **All three card surfaces still show idle / green.**

## Root cause (already diagnosed by user)

The MQTT climate proxy under `mqtt: climate:` in
`examples/ha-cow-climate-orchestration.yaml` does not publish
`hvac_action`. The config has no `action_topic`, so the HA climate
entity's `hvac_action` attribute is always `null`.

`src/small/state/thermostat.ts` :: `deriveThermostatView` looks at:

```ts
if (state === "off") variant = "off";
else if (attrs.hvac_action === "heating") variant = "heating";
else if (attrs.hvac_action === "cooling") variant = "cooling";
else variant = "idle";              // ← falls here, always
```

With `hvac_action: null` we always fall through to **idle**.

## Solution — single source of truth: the proxy publishes its action

**Do not** patch `deriveThermostatView` to peek past the proxy
into `climate.pavimento_*` / `climate.koolnova_*`. That breaks the
"every surface reads only from the proxy" contract documented in
`docs/06-house-hvac-architecture.md` §F-bis "The boundary". The
right move is to make the proxy publish `hvac_action` like a real
climate would.

Two pieces:

### A.1 — Add `action_topic` to every MQTT climate

In `examples/ha-cow-climate-orchestration.yaml`, every of the 7
`mqtt: climate:` entries:

```yaml
- name: "Casa Sala & Cucina"
  unique_id: casa_sala_cucina
  modes: [...]
  ...
  current_temperature_topic: "cow/casa/sala_cucina/current/state"
  current_humidity_topic:    "cow/casa/sala_cucina/humidity/state"
  action_topic:              "cow/casa/sala_cucina/action/state"   # ← NEW
  mode_state_topic:          "cow/casa/sala_cucina/mode/state"
  ...
```

`action_topic` is read-only from MQTT's point of view (no
`_command_topic` counterpart). Allowed payload values per the HA
MQTT climate docs: `off`, `heating`, `cooling`, `drying`, `fan`,
`idle`.

### A.2 — Automation: derive + publish the action

New automation in the same package file:

```yaml
- id: cow_climate_publish_action
  alias: "COW Climate · publish hvac_action to MQTT proxies"
  mode: queued
  max: 50
  trigger:
    # Trigger on every potential source of action change.
    - platform: state
      entity_id:
        - switch.display_sala
        - switch.display_camera_1
        - switch.display_camera_2
        - switch.display_camera_padronale
        - switch.display_ingresso_pt
        - switch.display_bagno_padronale
        - switch.display_bagno_ospiti
        - climate.koolnova_sala
        - climate.koolnova_cucina
        - climate.koolnova_camera_1
        - climate.koolnova_camera_2
        - climate.koolnova_camera_3
        - climate.koolnova_ingresso_pt
        - climate.casa_sala_cucina
        - climate.casa_camera
        - climate.casa_studio_chiara
        - climate.casa_camera_padronale
        - climate.casa_ingresso_pt
        - climate.casa_bagno_padronale
        - climate.casa_bagno_ospiti
  variables:
    rooms:
      sala_cucina:
        proxy: climate.casa_sala_cucina
        koolnova: [climate.koolnova_sala, climate.koolnova_cucina]
        pavimento_switch: switch.display_sala
      camera:
        proxy: climate.casa_camera
        koolnova: [climate.koolnova_camera_1]
        pavimento_switch: switch.display_camera_1
      studio_chiara:
        proxy: climate.casa_studio_chiara
        koolnova: [climate.koolnova_camera_2]
        pavimento_switch: switch.display_camera_2
      camera_padronale:
        proxy: climate.casa_camera_padronale
        koolnova: [climate.koolnova_camera_3]
        pavimento_switch: switch.display_camera_padronale
      ingresso_pt:
        proxy: climate.casa_ingresso_pt
        koolnova: [climate.koolnova_ingresso_pt]
        pavimento_switch: switch.display_ingresso_pt
      bagno_padronale:
        proxy: climate.casa_bagno_padronale
        koolnova: []
        pavimento_switch: switch.display_bagno_padronale
      bagno_ospiti:
        proxy: climate.casa_bagno_ospiti
        koolnova: []
        pavimento_switch: switch.display_bagno_ospiti
  action:
    - repeat:
        for_each: "{{ rooms | dict2items }}"
        sequence:
          - variables:
              slug: "{{ repeat.item.key }}"
              r: "{{ repeat.item.value }}"
              proxy_mode: "{{ states(r.proxy) }}"
              floor_on: >
                {{ is_state(r.pavimento_switch, 'on') }}
              air_active: >
                {{ r.koolnova | map('states') | select('in', ['heat','cool','dry','fan_only']) | list | count > 0 }}
              air_heating: >
                {{ r.koolnova | selectattr | list and
                   r.koolnova | map('states') | select('equalto','heat') | list | count > 0 }}
              air_cooling: >
                {{ r.koolnova | map('states') | select('equalto','cool') | list | count > 0 }}
              action: >
                {% if proxy_mode == 'off' %}off
                {% elif proxy_mode == 'heat' %}
                  {% if floor_on or air_heating %}heating{% else %}idle{% endif %}
                {% elif proxy_mode == 'cool' %}
                  {% if air_cooling %}cooling{% else %}idle{% endif %}
                {% elif proxy_mode == 'fan_only' %}
                  {% if air_active %}fan{% else %}idle{% endif %}
                {% else %}idle{% endif %}
          - service: mqtt.publish
            data:
              topic: "cow/casa/{{ slug }}/action/state"
              payload: "{{ action | trim }}"
              retain: true
```

Key choices:

- `mode: queued`, `max: 50` — same shape as the existing
  `cow_climate_orchestrator`. Action changes are bursty (relay
  flips can fire 3–4 transitions in a second when the Generic
  Thermostat is wobbling around the setpoint) and we don't want
  to drop any.
- `retain: true` — so the action survives HA restart and the
  proxies bind to the last known action on reload. (This is a
  separate concern from the **setpoint** retain bug in Plan B but
  uses the same mechanism.)
- Action `heating` is fired when **either** the floor switch is
  on OR the Koolnova is heating — they're a "team" per docs/06,
  and the user needs to see "sta scaldando" if *any* of them is
  working.

### A.3 — Sanity-check `deriveThermostatView`

No changes needed. Once `hvac_action` is published, the existing
ramo `else if (attrs.hvac_action === "heating") variant = "heating"`
takes over. But verify the bathroom proxies (which only have
`heat`/`off` modes) don't crash on the new attribute — they
shouldn't, since the heating branch is mode-agnostic in the
template.

## Verification checklist

1. Apply YAML changes: edit
   `examples/ha-cow-climate-orchestration.yaml`, reload via
   Developer Tools → YAML → "MQTT Configuration" + "Automations".
2. Watch `climate.casa_camera_padronale.hvac_action` while turning
   `switch.display_camera_padronale` on → should switch to
   `heating` within ~1 s.
3. Open the mobile dashboard, tap "Camera Padronale" → the
   climate block in the drawer turns **orange** with header
   "HEATING · Sta scaldando".
4. Same on the small wall-display panel (Camera Padronale → small
   thermostat card).
5. Same on the XL drawer (walldisplay-sala-cucina, open the
   "Camera Padronale" room, Climate tab).
6. After HA restart: proxy should pick up the last published
   action (because `retain: true`). Confirm by
   `mosquitto_sub -t 'cow/casa/+/action/state' -v` and seeing the
   retained values arrive immediately.

## Files to touch

- `examples/ha-cow-climate-orchestration.yaml` — add 7 `action_topic`
  lines + the new `cow_climate_publish_action` automation.
- `docs/06-house-hvac-architecture.md` — add a paragraph in
  "The boundary" section about the action topic flow.
- `CHANGELOG.md` — patch entry: "Fixed: climate cards now reflect
  heating/cooling state via MQTT action_topic".
- **No TypeScript change.**

## Out of scope

- Changing `deriveThermostatView` — single source of truth wins.
- Publishing fine-grained action (e.g. "floor heating only") —
  HA's `hvac_action` vocabulary is fixed.
- Bumping card version on this PR — there's no .ts diff. Bump only
  if you happen to ship something else in the same release.
