# Step 11 — Configure each Shelly Wall Display

The card targets **Shelly Wall Display SAWD1** (4" square touch). Same procedure works on Wall Display X2i / XL with no changes — the card scales to any square viewport.

## A. Update firmware

Open the Shelly Smart Control app or the device's web UI, go to Settings → Firmware, and update to **at least 2.5.5** (older versions broke against HA 2026.1 — see [home-assistant/frontend#28746](https://github.com/home-assistant/frontend/issues/28746), now fixed). Use the most recent stable version available in your region.

> SAWD1 firmware changelog: [ShellyGroup/Wall-Display-Changelog](https://github.com/ShellyGroup/Wall-Display-Changelog)

## B. Point the display at our dashboard

On the device:

1. Swipe to **Settings → Network → Home Assistant**
2. Choose **Custom URL** (not auto-discovery)
3. Enter:
   ```
   https://<ha-host>/walldisplay-<room>/0?kiosk&block_context_menu&cache
   ```
   Replace `<ha-host>` with your HA address and `<room>` with `living`, `bedroom`, `kitchen`, etc.
4. Save

The first time the page loads, kiosk-mode persists the flags in localStorage thanks to `?cache`, so subsequent reloads/reboots stay kiosk even if the Shelly firmware drops the query string.

## C. Display behaviour

In Settings → Display:

| Setting | Value | Why |
|---|---|---|
| Screen Lock | **No Settings** | Locks Settings page so passersby don't change config; gestures still work |
| Disable gestures when locked | **ON** | Prevents Shelly's native swipe from fighting our card's swipe |
| Turn Screen Off | when dark | Wakes on touch / motion |
| Screen Saver | OFF | The card itself will be the always-on view |

## D. Expose the display's sensors to Home Assistant

The Wall Display's local sensors (temperature / humidity / illuminance + the integrated 5 A relay) are exposed by HA's official **Shelly** integration:

1. **Settings → Devices & Services → + Add Integration → Shelly**
2. The display should auto-discover; otherwise enter its IP
3. After install, you'll get entities like:
   - `sensor.shelly_walldisplay_<room>_temperature`
   - `sensor.shelly_walldisplay_<room>_humidity`
   - `sensor.shelly_walldisplay_<room>_illuminance`
   - `switch.shelly_walldisplay_<room>_relay`

Wire `sensor.shelly_walldisplay_<room>_temperature` into the card config as `local_temp`, and `..._humidity` as `local_humidity`. The thermostat panel will use these to show the room's actual temperature and humidity.

## E. Kiosk account + autologin (house convention)

Each display gets a dedicated HA user and logs in automatically via
the `trusted_networks` auth provider (IP → user, `allow_bypass_login`):

1. **Kiosk user** — created with `scripts/ha-create-kiosk-user.mjs`:
   short-code name (`sala`, `c1`, `st`, …), group `system-users`,
   `local_only: true`, homeassistant credential username = password =
   code (fallback only), `default_panel` set to the room dashboard.
2. **Stable IP** — the Wall Display firmware ignores static IP config
   (`WiFi.SetConfig` accepts it but keeps using DHCP), so pin the IP
   with a **fixed-IP reservation in UniFi** for the display's MAC,
   like every other display (172.16.2.10–.16, .100, …).
3. **Autologin** — add the IP to `configuration.yaml` on HA
   (`homeassistant.auth_providers` → `trusted_networks`): one entry in
   `trusted_networks:` (`<ip>/32`) and one in `trusted_users:`
   (`<ip>/32: <user_id>  # <code>`). Requires a **core restart**.
4. **Redirect** — add the code → `/walldisplay-<room>/0?kiosk` route to
   `USER_ROUTES` in `src/cow-redirect-card.ts` (+ sibling maps in
   `ha-fix-displays.mjs`, `ha-merge-lovelace.mjs`, `ha-list-users.mjs`)
   and release. The display opens `/lovelace`, the redirect card reads
   `hass.user.name` and lands it on the room dashboard.
5. On the device, point the HA app at `http://172.16.0.200:8123` —
   with the trusted network in place no credentials are asked.

## F. Per-display checklist

For each Wall Display you mount in a room, complete:

- [ ] Firmware ≥ 2.5.5 (or latest)
- [ ] Custom URL set with `?kiosk&block_context_menu&cache`
- [ ] Screen lock = "No Settings"
- [ ] Gestures disabled when locked = ON
- [ ] Display added to HA via Shelly integration
- [ ] Sensors renamed to `..._<room>_*` to match the dashboard YAML
- [ ] Dashboard YAML created in `<ha-config>/dashboards/walldisplay-<room>.yaml`
- [ ] Dashboard registered in `configuration.yaml`
- [ ] HA restarted
- [ ] Display refreshed (a manual reload after HA restart) — confirm the card renders full-screen, no header/sidebar
