# Step 9–10 — Lovelace dashboard for Wall Display

## Why a dedicated dashboard

Two reasons:

1. **`kiosk-mode` does not run on "Default dashboards"** managed by HA's UI editor (see [NemesisRE/kiosk-mode README](https://github.com/NemesisRE/kiosk-mode#important-info)). It only runs on dashboards created from scratch.
2. We want the URL to be predictable and per-room (`/walldisplay-living/0`) so each Wall Display can be configured once.

## Install kiosk-mode

> Required only for the `?kiosk` URL flag that hides the HA header + sidebar.

1. **HACS → Frontend → search "Kiosk Mode" → Download.**
2. **Match the version to your HA**:
   | HA version | Kiosk Mode | 
   |---|---|
   | `2026.3.0+` | **v11.x** |
   | `2026.2.x`  | v10.0.0 |
   | `2025.10.0+` | v8.0.0+ |
   | `2025.5.1+` | v7.0.0+ |
3. If you run HA in **YAML mode**, append to `configuration.yaml`:
   ```yaml
   frontend:
     extra_module_url:
       - /hacsfiles/kiosk-mode/kiosk-mode.js
       - /hacsfiles/cow-thermostat-card/cow-thermostat-card.js
   ```
4. Reload frontend resources: Settings → Server controls → Reload resources.
5. Smoke-test: open any dashboard with `?kiosk` in the URL — header + sidebar should vanish.

We **do not** add a `kiosk_mode:` block inside the dashboard YAML — we drive it through the URL only, so the same dashboard renders normally from a phone or PC and as a kiosk only when opened by the Wall Display.

## Per-room dashboards

For each room with a Wall Display, copy one of the example YAML files in [`examples/dashboards/`](../examples/dashboards/) into your HA config:

```bash
cp cow-thermostat-card/examples/dashboards/walldisplay-living.yaml \
   /config/dashboards/walldisplay-living.yaml
```

Then register the dashboards in `configuration.yaml`. A complete snippet is at [`examples/configuration-snippet.yaml`](../examples/configuration-snippet.yaml).

After restarting HA, each dashboard is reachable at:

```
https://<ha-host>/walldisplay-<room>/0
```

## Per-room URL with kiosk flags

Open this exact URL on each Wall Display (see [Step 11 docs](03-shelly-wall-display.md)):

```
https://<ha-host>/walldisplay-living/0?kiosk&block_context_menu&cache
```

| flag | what it does |
|---|---|
| `?kiosk` | hides HA header + sidebar |
| `?block_context_menu` | disables long-press menu on touch |
| `?cache` | localStorage-persists the flags so refresh/reboot stays kiosk |

## Optional: full-screen fallback

If the Shelly WebView doesn't enter full-screen automatically, add [KTibow/fullscreen-card](https://github.com/KTibow/fullscreen-card) (HACS) as the first card of the view. The user only needs to tap it once on the very first load.
