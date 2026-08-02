# Step 7 — Remote access to Home Assistant

Two channels, two different jobs:

| Channel | Use for | Speed |
|---|---|---|
| **SSH to HAOS** (`root@172.16.0.200:22222`) | Reading host-level files, restarting services, inspecting Docker, editing storage JSON | Slow — full TTY |
| **WebSocket API** (`wss://$HA_HOST/api/websocket`) | Anything scriptable: registries, lovelace config, services, HACS, area registry | Fast — used by every `scripts/ha-*.mjs` in this repo |

Most day-to-day work goes through the WebSocket. SSH only when you
need to touch a file the API doesn't expose (e.g. `.storage/core.*`,
custom_components, supervisor logs).

## A. SSH to HAOS (port 22222)

> This is the **host-level** SSH built into HassOS, not the
> `core-ssh` / `advanced-ssh` add-on. The add-on lands you inside the
> Home Assistant container (port 22); 22222 lands you on the host
> where you can `docker exec` into any container.

### Connect

```bash
ssh -i ~/.ssh/id_rsa -p 22222 root@172.16.0.200
```

- Host: `172.16.0.200` (HAOS LAN IP — adjust if your install differs).
- Port: `22222` (HAOS-integrated SSH).
- User: `root` (no sudo, no password prompt — key-only).
- Identity: `~/.ssh/id_rsa` (private key on this Mac).

If the prompt asks for a passphrase the key isn't loaded yet —
`ssh-add ~/.ssh/id_rsa` once per terminal session, or rely on
macOS Keychain.

### One-time key install

The HAOS SSH service reads `authorized_keys` from a **plugin config
YAML**, not from `/root/.ssh/`. To register a new public key:

1. Print the local public key: `cat ~/.ssh/id_rsa.pub`
2. In HA → **Settings → Add-ons → "Advanced SSH & Web Terminal" → Configuration**
3. Replace the `authorized_keys:` block:

   ```yaml
   authorized_keys:
     - "ssh-rsa AAAA…<your key>… user@host"
   ssh:
     allow_agent_forwarding: false
     allow_remote_port_forwarding: false
     allow_tcp_forwarding: false
   ```
4. **Save → Restart** the add-on.
5. Test from this machine: `ssh -p 22222 root@172.16.0.200 'uname -a'`.

> The add-on configures **both** its own port-22 server (container)
> and the HAOS port-22222 server (host) from the same
> `authorized_keys` list, which is why the add-on UI is the right
> place even though we never log into it.

### Drop into the HA container

From the HAOS shell:

```bash
docker exec -it homeassistant bash
```

Inside that shell, `/config` is the usual HA config dir (same as
the Supervisor's "File editor" add-on sees). Useful when you need
to run `python -c "import homeassistant…"` against the live install,
read `.storage/core.config_entries`, or vendor a custom component.

To run a one-shot command without the interactive shell:

```bash
docker exec homeassistant python3 -c "print('ok')"
```

### Common host-level tasks

```bash
# Tail Supervisor logs
docker logs -f hassio_supervisor

# Restart HA core (gracefully)
ha core restart                    # via HAOS CLI
# or, equivalently:
docker restart homeassistant

# Read a storage file the API hides
cat /mnt/data/supervisor/homeassistant/.storage/core.config_entries

# Backup/restore extraction (uses securetar; see scripts/_archive)
docker exec homeassistant python3 -m securetar …
```

## B. WebSocket API (every `ha-*.mjs` script)

All operational scripts under `scripts/ha-*.mjs` connect via the
HA WebSocket. They expect two environment variables:

| Var | Value (this Mac) | Purpose |
|---|---|---|
| `HA_HOST` | `8ywaxxculoipavdsrwewtrhw5qhlqysg.ui.nabu.casa` | Nabu Casa hostname (use `172.16.0.200:8123` if you're on the LAN and prefer plain http) |
| `HA_TOKEN` | Long-lived access token (~180 chars, JWT) | Created in HA → **Profile → Security → Long-lived access tokens** |

### Create a long-lived token

1. HA → click your profile photo (bottom-left) → **Security** tab.
2. Scroll to **Long-Lived Access Tokens** → **Create Token**.
3. Name it something like `cursor-laptop` so you can revoke per device.
4. Copy the JWT (you only see it once).

### Wire it into the shell

The cleanest spot is `~/.zshrc.local` (loaded by the user's `~/.zshrc`):

```bash
# ~/.zshrc.local
export HA_HOST="8ywaxxculoipavdsrwewtrhw5qhlqysg.ui.nabu.casa"
export HA_TOKEN="eyJhbGciOiJIUzI1NiIsInR5cCI6Ikp…"
```

After editing: `source ~/.zshrc.local` (or open a new terminal).

> The tokens never expire by default, but they ARE revocable from
> the same Profile → Security page. If you rotate them, just update
> the env var — none of the scripts cache them.

### Smoke test

```bash
node -e "
import('ws').then(async ({ default: WS }) => {
  const ws = new WS(\`wss://\${process.env.HA_HOST}/api/websocket\`);
  ws.on('message', (data) => {
    const m = JSON.parse(data.toString());
    if (m.type === 'auth_required')
      ws.send(JSON.stringify({ type: 'auth', access_token: process.env.HA_TOKEN }));
    if (m.type === 'auth_ok') { console.log('auth OK'); ws.close(); process.exit(0); }
    if (m.type === 'auth_invalid') { console.error('auth FAIL'); process.exit(1); }
  });
});
"
```

`auth OK` → ready to run any `scripts/ha-*.mjs` script.

### Useful scripts in this repo

| Script | What it does |
|---|---|
| `scripts/ha-list-users.mjs` | List every HA user account |
| `scripts/ha-check-person.mjs` | Dump a `person.*` entity's tracked devices/zones |
| `scripts/ha-derive-mobile-areas.mjs [--apply]` | Reconcile `areas:` field on every room of `dashboard-mobile` |
| `scripts/ha-patch-walldisplay-openings.mjs [--apply]` | Write `areas:` + `opening_default_kind:` on every wall-display dashboard |
| `scripts/ha-hacs-update.mjs` | Trigger an HACS update for `i87ce/cow-thermostat-card` |
| `scripts/ha-hacs-refresh.mjs` | Force HACS to re-poll GitHub releases, then download |
| `scripts/ha-push-dashboard.mjs` | Push a local YAML to `lovelace/config/save` |
| `scripts/ha-inspect-dashboards.mjs` | List every Lovelace dashboard + its url_path |

All of them follow the same skeleton: open WS, auth, run a few
`send(type, payload)` requests, `process.exit(0)`.

## C. When to use which

```
┌──────────────────────────────────────┬─────────┬────────────────┐
│ Task                                 │ SSH 22222│ WS API         │
├──────────────────────────────────────┼─────────┼────────────────┤
│ Read entity state                    │   no    │  ✓ (get_states)│
│ Call a service (light.turn_on, …)    │   no    │  ✓ (call_service)│
│ Edit Lovelace YAML programmatically  │   no    │  ✓ (lovelace/config/save)│
│ Trigger HACS download                │   no    │  ✓             │
│ Read .storage/core.* JSON            │   ✓     │  no (API hides)│
│ Restart HA core                      │   ✓     │  ✓ (homeassistant.restart)│
│ Tail Supervisor logs                 │   ✓     │  no            │
│ Edit custom_components/*             │   ✓     │  no            │
│ Decode an encrypted backup           │   ✓     │  no            │
│ Push a single device area change     │   no    │  ✓ (config/device_registry/update)│
└──────────────────────────────────────┴─────────┴────────────────┘
```

> Rule of thumb: try the WS API first (it's 10× faster and survives
> reboots gracefully). Reach for SSH only when you hit "Method not
> found" or when the data lives outside `/config`.

## D. UniFi Dream Machine Pro Max (router / gateway)

The home network gateway is a **UniFi Dream Machine Pro Max** at
`172.16.0.1` (it also answers on the other VLAN gateways, e.g.
`172.16.1.1`). SSH is enabled from UniFi OS → Console Settings.

> **Credentials are NOT in this file** — this repo is public. SSH
> user/password live in the local-only knowledge base at
> `~/casa/01-credenziali.md` (outside the repo), together with the
> rest of the home-infra credentials.

- Host: `172.16.0.1`, user `root`, password auth (`sshpass` is
  installed via Homebrew on this Mac).

Useful on the UDM shell: `iptables-save` / `nft list ruleset` (firewall
rules), MongoDB of the Network app on port 27117 (`/usr/bin/mongo
--port 27117 ace`), config lives under `/data/udapi-config/`.

## E. Troubleshooting

**"Permission denied (publickey)" on port 22222**
The public key is not registered in the Advanced SSH add-on YAML
(see §A). Add it, restart the add-on, retry.

**"auth_invalid" on the WebSocket**
Token revoked / typo. Re-issue from HA → Profile → Security and
update `$HA_TOKEN`.

**Scripts hang at "Trying hacs/repository/refresh…"**
HACS WebSocket schema changes across versions; the refresh script
falls back through three variants. If all three fail, HACS itself
may be down — check **HA → Settings → Integrations → HACS** for a
red banner.

**Nabu Casa URL changes**
The `8ywax…ui.nabu.casa` hostname is tied to this HA instance's
Nabu Casa subscription. If you ever migrate or reset Nabu Casa, the
new URL is in **HA → Settings → Home Assistant Cloud → Remote
control → Nabu Casa URL**. Update `$HA_HOST` accordingly.

**SSH key works on port 22 (add-on) but not on 22222 (HAOS)**
The add-on may have been (re)installed without enabling the host-
level SSH server. Open the add-on's **Info** tab → toggle "Start on
boot" + "Watchdog" ON, then **Restart**. The 22222 listener spawns
during add-on startup.
