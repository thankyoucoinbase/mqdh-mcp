# AGENTS.md

Guide for AI agents and contributors working on this repo.

## Layout

```
src/
  server.js   MCP tool definitions (entry point, stdio transport)
  config.js   Paths and constants; all user-specific values come from env vars or OS defaults
  auth.js     Token resolution (env → MQDH config → Credential Manager → metavr)
  graph.js    graph.oculus.com client, persisted operation ids (OPS), org/app/channel resolvers
  upload.js   ovr-platform-util argument builder and background upload jobs
  state.js    Persisted selected org (~/.mqdh-mcp.json)
test/
  offline.test.js   No network; runs in CI
  live.test.js      Read-only against a real account (npm run test:live)
  helpers.js        Spawns the server with uploads disabled and an isolated state file
```

## Rules

- Never hardcode user paths, ids, org names or tokens. Use `config.js` and env vars.
- Never return or log the access token. Redact it from any subprocess output.
- Keep safety defaults: drafts unless `publish: true`; anything touching LIVE requires `confirm_live: true`.
- Tests must never upload. `test/helpers.js` points `OVR_PLATFORM_UTIL` at a non-existent file; keep it that way.
- New graph.oculus.com calls: add the persisted operation to `OPS` in `src/graph.js` with its variables in a comment. Named inline queries are usually rejected by the API.
- Dependencies: only `@modelcontextprotocol/sdk` and `zod`. Plain ESM JavaScript, Node 20+, no build step.

## Updating persisted operation ids

When MQDH updates and a lookup starts failing, the new `doc_id` can be found in MQDH's own bundle (search for the operation name, e.g. `OrgsQuery`, next to its `id`). Do not commit any MQDH source or binaries to this repo.
