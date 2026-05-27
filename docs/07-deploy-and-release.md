# Deploy & release runbook

Audience: **any agent (human or AI) that wants to ship a change to
the Lovelace card and have it land on the Shelly Wall Displays and
the mobile dashboard.**

This is the canonical flow. If you discover a step that's wrong
here, fix it in this file in the same commit as the discovery —
the next agent will thank you.

---

## TL;DR — the happy path

```bash
# 1. Make sure typecheck + build are clean
npx tsc --noEmit
npm run build

# 2. Bump version (semver, patch unless we broke an API)
#    Edit package.json + src/cow-thermostat-card.ts (VERSION = …)
#    Edit CHANGELOG.md — new section at the TOP

# 3. Commit + tag + push
git add -A
git commit -m "feat(...): ... (vX.Y.Z)"
git tag vX.Y.Z
git push origin main
git push origin vX.Y.Z   # ← tag push triggers the Release workflow

# 4. Wait for the Release workflow (≈25–35 s)
gh run watch $(gh run list --limit 1 --json databaseId --jq '.[0].databaseId') --exit-status

# 5. Tell HACS to pull the new release
node scripts/ha-hacs-update.mjs
```

That's it. The displays pick it up on next page reload — modulo
their browser cache, see §6.

---

## 1. Where the bundle lives

| Stage | Location |
|---|---|
| Source | `src/**` (TypeScript, lit) |
| Build output | `dist/cow-thermostat-card.js` (single self-contained file, **all 5 Inter woff2 fonts inlined as base64**, ~1.1 MB) |
| GitHub release | `https://github.com/i87ce/cow-thermostat-card/releases/tag/vX.Y.Z` (one asset: `cow-thermostat-card.js`) |
| HACS-served URL | `https://<ha>/hacsfiles/cow-thermostat-card/cow-thermostat-card.js?hacstag=<repo_id><ver>` |
| Lovelace `resources` | `/hacsfiles/cow-thermostat-card/cow-thermostat-card.js?hacstag=…` |

HACS rewrites the `hacstag=` query param every time you trigger
a download, so cache busts itself — provided the *resource* entry
in Lovelace is updated. Browsers cache the result of *that* URL
indefinitely, so see §6 if a display is stuck on an old version.

## 2. Versioning

We follow semver-ish:

- **patch** (`1.4.x`) — bug fix, visual tweak, internal refactor.
  No API change.
- **minor** (`1.x.0`) — new card / new config field / new surface
  on an existing card.
- **major** (`x.0.0`) — breaking config change (renamed YAML key,
  removed field, etc.). Bump the README's `type: custom:…` example
  too.

**Two places to bump:**

1. `package.json` → `"version": "X.Y.Z"`.
2. `src/cow-thermostat-card.ts` → `const VERSION = "X.Y.Z";` (this
   is what gets printed in the orange console banner the card logs
   at module load — useful for confirming which version the
   display actually runs without screen-sharing).

Forgetting #2 isn't fatal but makes debugging painful — the
console banner will lie about the loaded version, and that's the
quickest way to confirm a display is or isn't running the new
build. **Always update both.**

## 3. CHANGELOG

Every release gets a section in `CHANGELOG.md` *at the top*, under
the `# Changelog` heading. Format:

```
## [X.Y.Z] — YYYY-MM-DD

### Added — <one-line summary of the user-visible thing>
<paragraph(s) explaining WHY, not just WHAT — the diff already
shows the what>

### Fixed
- **<thing that was broken>.** <one-sentence root cause>
  <one-sentence fix>

### Changed
- ...
```

Use **Added** / **Fixed** / **Changed** / **Removed** in that
order. Don't bury the lede — the most user-visible change goes
first.

## 4. Commit + push

The commit that lands the new version typically touches
`package.json`, `CHANGELOG.md`, `src/cow-thermostat-card.ts`, and
whatever sources you actually changed.

Commit message style: imperative present tense, prefix with
`feat:` / `fix:` / `refactor:` / `docs:` / `chore:`, end the
subject line with the version in parens:

```
feat(mobile-drawer): climate block at top of room drawer (v1.4.12)
```

Then a blank line and a paragraph or two explaining the why.
Bullet-list only when it earns its keep — the reviewer of the
year-from-now-debugging will read this commit message and decide
whether to dig further.

## 5. Tag + Release workflow

The Release workflow is **tag-triggered**, not push-triggered:

```yaml
on:
  push:
    tags:
      - "v*"
```

So you MUST do:

```bash
git tag vX.Y.Z
git push origin main          # land the source
git push origin vX.Y.Z        # ← THIS is what triggers the release
```

Or in one shot: `git push --follow-tags`. The workflow

1. checks out the tag,
2. runs `npm ci` + `npm run build`,
3. creates a GitHub Release whose only asset is
   `dist/cow-thermostat-card.js`.

You can watch it from the CLI:

```bash
gh run watch $(gh run list --limit 1 --json databaseId --jq '.[0].databaseId') --exit-status
```

Typical runtime is **25–35 seconds**.

## 6. HACS pull + browser cache

GitHub Release is just the artifact. To get HACS to actually swap
in the new version and update the Lovelace `resources` entry,
trigger an update on the HACS side:

```bash
node scripts/ha-hacs-update.mjs
```

The script uses `$HA_HOST` + `$HA_TOKEN` (long-lived token, see
`docs/05-step-7-remote-access.md`), opens a WebSocket to
`/api/websocket`, lists HACS repos, calls
`hacs/repository/download` with the latest available version,
and re-lists to confirm `installed_version` matches.

After that, the file `/hacsfiles/cow-thermostat-card/cow-thermostat-card.js`
serves the new bundle and the Lovelace `resources` registry
points at the new `?hacstag=…` URL. **All HA frontends pick it up
on next page load.**

EXCEPT: the **Shelly Wall Displays** cache aggressively. Their
Chromium build is old (M77-ish) and ignores cache-busting query
params more often than it should. Two reliable ways to force a
refresh on a stuck display:

```bash
# 1) Soft: tell the Shelly to reload its kiosk URL via RPC
curl -sS "http://172.16.2.10/rpc/KVS.Get?key=launcher.url"        # discover current URL
curl -sS "http://172.16.2.10/rpc/HTTP.GET?url=…&follow_redirects=true"  # nope, doesn't actually reload the UI

# 2) Hard: restart the Shelly app — bounces the kiosk Chromium fresh
curl -sS "http://172.16.2.10/rpc/Shelly.Reboot"
```

`scripts/shelly-restart-app.mjs` reboots every display in one
shot — use it after a release that touches the wall-display UI.

Don't reboot the displays for every release — only when:

- the UI of the small / XL card changed,
- the bundle layout shrank or grew significantly,
- a previous release shipped a bug that the new release fixes
  (you want to be sure the buggy bundle isn't still cached).

The mobile dashboard doesn't have a cache problem — phone
browsers handle the `hacstag` bust correctly.

## 7. HA-side YAML / dashboard changes

Some changes ship YAML alongside the card:

- `examples/ha-cow-climate-orchestration.yaml` — MQTT proxies +
  orchestration automation. **Lives in the user's HA config**, not
  in HACS. After editing, the user must reload the relevant YAML
  domain (`mqtt`, `automation`) or restart HA core. See
  `docs/06-house-hvac-architecture.md`.
- Lovelace dashboards (mobile, walldisplay-*) — managed by the
  scripts under `scripts/ha-patch-*` and `scripts/ha-push-*`.
  Pattern: read storage YAML via WS API, mutate, write back, no
  HA restart needed. The frontends pick up changes within seconds.

If a release changes the *config* schema of a card, document it
in the CHANGELOG and (optionally) ship a migration script under
`scripts/`.

## 8. Disaster recovery

| Problem | First move |
|---|---|
| Tag pushed, no release artifact appears | `gh run list` — workflow probably failed. `gh run view <id> --log-failed` shows the error. Common cause: `npm ci` lockfile mismatch. |
| HACS shows v1.4.X but displays still see v1.4.W | Browser cache, not HACS. Run `scripts/shelly-restart-app.mjs` to bounce the kiosks. |
| Build failure on the agent's machine but green on CI | Almost always a `node_modules/` drift. `rm -rf node_modules && npm ci`. |
| StrReplace edits silently no-op'd (happened on v1.4.12) | Run `npx tsc --noEmit` between every set of edits and the build. The compiler is the canary. |
| Version bumped in package.json but not in `cow-thermostat-card.ts` | Banner lies. No functional impact but you'll waste time chasing a ghost cache during the next bug hunt. Bump it and ship a patch. |
| Two parallel agents stash each other's work | `git stash list` first, `git stash show -p stash@{N}` before any `pop` — if HEAD already contains the symbol, the stash is duplicate and should be **dropped**, not popped. |

## 9. What lives where (cheat sheet)

```
src/
  cow-thermostat-card.ts            ← entry point, VERSION banner
  cow-mobile-dashboard-card.ts      ← mobile dashboard card
  small/panels/thermostat-panel.ts  ← 720×720 wall display thermostat
  small/panels/lights-panel.ts      ← lights surface
  small/panels/blinds-panel.ts      ← blinds surface
  devices-xl/drawer-tabs/*.ts       ← XL room drawer tabs
  shared/setpoint-modal.ts          ← shared setpoint modal (v1.4.15+)
  shared/hero/mobile-hero.ts        ← mobile hero block
  small/state/thermostat.ts         ← climate state derivation + accent palette
  small/state/lights.ts             ← lights state derivation

examples/
  ha-cow-climate-orchestration.yaml ← MQTT proxies + orchestrator

scripts/
  ha-hacs-update.mjs                ← trigger HACS pull post-release
  shelly-restart-app.mjs            ← reboot all displays
  shelly-display-detach-switch.mjs  ← idempotent: switch:0 in_mode=detached
  ha-push-dashboard.mjs             ← push a Lovelace YAML over WS API
  ha-patch-walldisplay-openings.mjs ← targeted Lovelace mutation

docs/
  06-house-hvac-architecture.md     ← climate architecture, proxies, orchestrator
  07-deploy-and-release.md          ← (this file)
```
