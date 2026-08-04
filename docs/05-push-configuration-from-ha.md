# Step 12 — Push Wall Display configuration from Home Assistant

Goal: configure the Custom HA URL on each Shelly Wall Display from HA itself
(remote-friendly via Nabu Casa), instead of going to each device manually.

> Works for SAWD1 (4") and Wall Display XL (10.1").  
> Requires firmware ≥ **2.5.5** on each display (current as of May 2026: 2.6.0-beta).

## A. Inventory

You have Wall Displays already known by HA's Shelly integration.

> ⚠️ **Reconciled 2026-05-30 against live data** (HA device registry +
> each Shelly's own `Shelly.GetConfig` `sys.device.name`). The displays
> were physically reassigned since this table was first written — the
> rows below now reflect reality. `172.16.2.10`–`.13` were probed
> directly; `.15`/`.100` are from the HA registry. The XL lives on the
> `172.16.1.0/24` VLAN (UniFi reservation), not the `172.16.2.x` subnet
> used by the 4" SAWD1 units.

| MAC | IP | Model | Room (live name) | Kiosk user |
|---|---|---|---|---|
| `000822097825` | `172.16.2.10` | SAWD1 | **Camera 1** | `c1` |
| `00082254AD11` | `172.16.2.11` | SAWD1 | Camera 2 | `c2` |
| `000822D2D2C5` | `172.16.2.12` | SAWD1 | Bagno Ospiti | `bo` |
| `000822F61B9C` | `172.16.2.13` | SAWD1 | Camera Padronale | `cp` |
| `000822767310` | `172.16.2.15`? | SAWD1 | Ingresso PT / Scala | `sc` |
| `000822CBE280` | (setup_retry) | SAWD1 | Bagno Padronale | `bp` |
| `00A90B9D02FE` | `172.16.1.50` | **XL (10.1")** | Sala e Cucina | `sala` |

> The MAC↔room mapping in [`examples/ha-walldisplay-rest-commands.yaml`](../examples/ha-walldisplay-rest-commands.yaml)
> is a placeholder — swap any two IPs in the YAML to physically reassign a
> display, then re-run the provision script.
>
> Re-derive this table any time with `node scripts/ha-diagnose-camera-1.mjs`
> (lists every Wall Display device with its MAC) plus a quick
> `curl http://<ip>/rpc/Shelly.GetDeviceInfo` per IP.

## B. Install the YAML in HA

1. Copy the contents of [`examples/ha-walldisplay-rest-commands.yaml`](../examples/ha-walldisplay-rest-commands.yaml)
   into your `<ha-config>/configuration.yaml` (under existing `rest_command:`
   and `script:` keys, or as separate top-level blocks if not yet defined).
2. **Settings → Developer Tools → YAML → Check Configuration** to validate.
3. **Settings → Developer Tools → YAML → Restart** to load.

## C. Discovery (one-time, expected ~30s)

Before pushing, we need to verify the **exact RPC field name** the firmware
uses for the HA URL. Educated guess in the YAML is `sys.homeassistant.url`,
but Shelly may have changed it on 2.6.0-beta.

1. Developer Tools → Services → search **`script.cow_walldisplay_discover_camera`**
2. Click **Call Service**
3. Notifications panel (top-right bell icon) → see "Wall Display Camera config dump"
4. Copy that JSON dump and send it to me.
5. I'll update the `payload` in the YAML to match the discovered key.

> Alternative without HA: open `http://172.16.2.10/rpc/Shelly.GetConfig` in a
> browser when you're on the LAN.

## D. Push URLs to all displays

Once the discover step has confirmed the key:

1. Developer Tools → Services → **`script.cow_walldisplay_provision_all`**
2. Click **Call Service**
3. Each display will reboot softly within ~5s and load its new dashboard URL.

## E. Re-provisioning after physically swapping a display

If you decide to move the display currently in `172.16.2.10` (Camera) to
e.g. `172.16.2.13` (Bagno Ospiti), you have two options:

- **Option 1 — re-IP via DHCP**: cleanest. Set static DHCP reservations on
  your router so each MAC gets the IP that matches its room in the YAML.
- **Option 2 — edit the YAML**: swap the IP values for the two affected
  `rest_command:` entries, restart HA, re-run `cow_walldisplay_provision_all`.

## F. Bonus services available right now

Stock firmware exposes these RPC methods, no key-discovery required:

| Service | What it does |
|---|---|
| `rest_command.walldisplay_camera_screen_on` | Turn the screen on |
| `rest_command.walldisplay_camera_screen_off` | Turn the screen off |
| `rest_command.walldisplay_camera_brightness_max` | Force brightness 100% |

You can chain these into HA automations (e.g. dim all displays at sunset,
turn off screens during the night, blink one to physically identify it).

## G. Limitations

- Settings that the Wall Display firmware exposes only via its on-device UI
  (e.g. on some firmware versions: `Screen Lock`, `Disable gestures when
  locked`) may NOT be settable via RPC. We'll know after step C dumps the
  full schema.
- The XL (`172.16.1.50`, MAC `00A90B9D02FE`, area `living_room`) hosts
  `cow-room-dashboard-card` on dashboard `walldisplay-sala-cucina`. It is
  on the `172.16.1.x` subnet — do not assume it shares the `172.16.2.x`
  DHCP pool with the 4" displays. The legacy `ha-walldisplay-rest-commands.yaml`
  provision script still omits the XL; point its HA URL manually or add a
  dedicated `rest_command` once you need remote re-provisioning.
- After firmware updates, RPC schemas may change. Re-run discover.
