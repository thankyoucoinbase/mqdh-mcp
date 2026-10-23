# Changelog

## 0.2.0

- Split into modules under `Source/`; entry point is now `Source/server.js`.
- macOS default paths; all paths overridable via env vars (`MQDH_DIR`, `MQDH_USER_DATA`, `MQDH_MCP_STATE`, …).
- `upload_build` gains `dry_run`.
- Identifies with its own User-Agent instead of MQDH's.
- Offline and live (read-only) test suites; CI on Windows and Linux.

## 0.1.0

- Initial release: orgs, apps, channels, uploads, copy build, test users, raw GraphQL, metavr passthrough.
