# mqdh-mcp

**Unofficial MCP server for Meta Quest developers.** Lets an AI assistant list your developer organizations, apps and release channels, and upload builds (APK/OBB) to a channel such as ALPHA, BETA, RC or LIVE — the same way Meta Quest Developer Hub (MQDH) does.

> Not affiliated with or endorsed by Meta. Uploads use Meta's official `ovr-platform-util`. Org/app/channel lookups use undocumented `graph.oculus.com` operations that may change without notice.

## TL;DR for AI assistants

1. `auth_status` — confirm a Meta login is available.
2. `list_orgs` → `select_org { org }` — pick the developer organization (saved for later calls).
3. `list_apps` → find the app; `list_channels { app }` — see channels and latest builds.
4. `upload_build { app, channel, apk, dry_run: true }` — preview, then run without `dry_run`.
5. `upload_status { job_id }` — poll until `status` is `succeeded` or `failed`.

Rules: uploads are **drafts** unless `publish: true`. Publishing to **LIVE** (or copying a build into LIVE) needs `confirm_live: true` — only set it when the user explicitly asks to ship to the public store. `app` and `org` accept an id or a partial name.

## Tools

| Tool | Purpose | Key arguments |
|---|---|---|
| `auth_status` | Show login state, token source, selected org | — |
| `list_orgs` | List organizations you belong to | — |
| `select_org` | Set the default organization | `org` |
| `list_apps` | List apps in an org | `org?` |
| `list_channels` | Channels + latest builds for an app (`is_live` marks the store channel) | `app`, `org?` |
| `upload_build` | Upload a build in the background; returns `job_id` | `app`, `channel`, `apk`, `obb?`, `notes?`, `publish?`, `confirm_live?`, `dry_run?`, `extra_args?`, `org?` |
| `upload_status` | Progress/output of an upload (or list all) | `job_id?`, `tail?` |
| `copy_build` | Copy an existing build into another channel | `app`, `binary_id`, `to_channel`, `confirm_live?`, `org?` |
| `list_test_users` | Test users for an org | `org?` |
| `graphql` | Raw graph.oculus.com query (advanced) | `query`, `variables?` |
| `metavr` | Run any bundled `metavr` CLI command (devices, logcat, perf…) | `args[]` |

`channel` accepts `ALPHA`, `BETA`, `RC`, `LIVE` (aliases `store`, `production`), a custom channel name, or a channel id.

## Example

```text
User: Upload C:\builds\game.apk to the BETA channel of "Space Game" with notes "fixes crash".

→ list_orgs / select_org { "org": "My Studio" }
→ upload_build { "app": "Space Game", "channel": "BETA", "apk": "C:\\builds\\game.apk", "notes": "fixes crash", "dry_run": true }
→ upload_build { "app": "Space Game", "channel": "BETA", "apk": "C:\\builds\\game.apk", "notes": "fixes crash" }
← { "job_id": "a1b2c3d4", "channel": "BETA", "mode": "draft", "status": "uploading" }
→ upload_status { "job_id": "a1b2c3d4" }
```

## Install

Requirements: Node.js 20+, and [Meta Quest Developer Hub](https://developers.meta.com/horizon/documentation/unity/ts-mqdh/) installed and logged in (open it once so it downloads `ovr-platform-util`).

```bash
git clone https://github.com/thankyoucoinbase/mqdh-mcp.git
cd mqdh-mcp
npm install
```

**Claude Code**

```bash
claude mcp add mqdh -- node /absolute/path/to/mqdh-mcp/Source/server.js
```

**Claude Desktop / other MCP clients**

```json
{
  "mcpServers": {
    "mqdh": { "command": "node", "args": ["/absolute/path/to/mqdh-mcp/Source/server.js"] }
  }
}
```

## Authentication

No separate login: the server reuses your existing MQDH session. Token sources, in order:

1. `MQDH_TOKEN` environment variable
2. MQDH's `odh/mcp-config.json` in your app-data folder
3. Windows Credential Manager entry `Meta Quest Developer Hub/default`
4. `metavr auth profile-token`

If none work, log in to MQDH or run `metavr auth login`.

## Configuration

All optional; defaults follow the standard MQDH install.

| Variable | Default |
|---|---|
| `MQDH_DIR` | `%ProgramFiles%\Meta Quest Developer Hub` (Windows), `/Applications/Meta Quest Developer Hub.app` (macOS) |
| `MQDH_USER_DATA` | `%APPDATA%\odh` (Windows), `~/Library/Application Support/odh` (macOS) |
| `METAVR_PATH` | `metavr` inside MQDH's `resources/bin` |
| `OVR_PLATFORM_UTIL` | `ovr-platform-util` inside `MQDH_USER_DATA` |
| `MQDH_TOKEN` | — |
| `MQDH_MCP_STATE` | `~/.mqdh-mcp.json` (stores the selected org) |

Tested on Windows. macOS paths follow MQDH's layout but are untested.

## Security

- Tools never return the access token; it is redacted from upload output.
- `ovr-platform-util` receives the token as a command-line argument (as MQDH does), so it is visible to other local processes while an upload runs.
- The `graphql` tool can run mutations as you. Remove it from your client's allowed tools if you don't need it.

## How it works

| Operation | Mechanism |
|---|---|
| Orgs, apps, channels, test users, copy build | `POST https://graph.oculus.com/graphql` with form fields `access_token`, `doc_id`, `operation_name`, `variables` (persisted operations from MQDH 6.5.2, listed in [`Source/graph.js`](Source/graph.js)) |
| Upload | `ovr-platform-util upload-quest-build --app_id … --token … --channel … --apk … [--obb] [--notes] --disable-progress-bar [--draft]` (PC apps: `upload-rift-build --build-dir`). LIVE is passed as `store`. |

## Development

```bash
npm test            # offline tests, no login needed
npm run test:live   # read-only tests against your account; never uploads
```

Project layout and conventions for contributors (human or AI): [`AGENTS.md`](AGENTS.md).

## License

[MIT](LICENSE)
