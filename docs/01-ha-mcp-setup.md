# Step 1 — Setup Home Assistant MCP Server + Cursor

This connects Cursor to your Home Assistant instance through MCP, so the agent can read entity state and call services during development.

> Requires Home Assistant Core ≥ **2025.2** (the `mcp_server` integration shipped in 2025.2).

## A. In Home Assistant

### 1. Expose entities to "Assist"

The `mcp_server` integration exposes **only** the entities you have explicitly exposed to Assist. Without this step the MCP endpoint will return an empty world.

1. Open HA → **Settings → Voice assistants → Expose** tab
2. Filter the list and toggle ON, at minimum:
   - All `climate.*` entities you want the card to control
   - All `light.*` entities
   - All `cover.*` entities (blinds/shutters)
   - Relevant `sensor.*` entities (outdoor temperature, Shelly Wall Display sensors)
3. Save

### 2. Add the MCP Server integration

1. **Settings → Devices & Services → + Add Integration**
2. Search for `Model Context Protocol Server` and add it
3. Confirm the default options
4. Done — the integration exposes the SSE endpoint at:
   ```
   https://<ha-host>/mcp_server/sse
   ```

### 3. Create a long-lived access token

Use a dedicated user for Cursor (best practice — easier to revoke):

1. **Settings → People → Add Person** → name `cursor`, no login required initially, then add Login → password
2. Log in as `cursor`
3. Click your profile (bottom-left) → **Security** tab → scroll to **Long-lived access tokens** → **Create token**
4. Name it `cursor-mcp` and copy the token (you'll see it only once)

## B. In Cursor

Edit `~/.cursor/mcp.json` (create the file if it doesn't exist) and add the `home-assistant` block. A template is in this repo at [`.cursor/mcp.json.example`](../.cursor/mcp.json.example).

```json
{
  "mcpServers": {
    "home-assistant": {
      "url": "https://YOUR-HA-HOST/mcp_server/sse",
      "transport": "sse",
      "headers": {
        "Authorization": "Bearer YOUR-LONG-LIVED-TOKEN"
      }
    }
  }
}
```

> If your HA is on a `.local` mDNS hostname (e.g. `homeassistant.local:8123`) and Cursor can't resolve it, use the LAN IP instead.

Restart Cursor after editing the file.

## C. Smoke test

In a new Cursor chat, ask:

> Use the Home Assistant MCP to list my exposed climate entities.

The agent should call `GetLiveContext` and return your exposed `climate.*` entities. If it returns an empty list, you missed step A1 (expose entities).

## Troubleshooting

| Symptom | Fix |
|---|---|
| `401 Unauthorized` from MCP | Token wrong or expired. Recreate. |
| Empty entity list | Entities not exposed to Assist. See A1. |
| `connect ECONNREFUSED` | HA URL wrong or HA not reachable from your machine. |
| `Unsupported transport` in Cursor logs | Cursor version too old for SSE; update Cursor. |
| Self-signed cert errors | Use plain `http://` for LAN, or install your CA. |
