# ADR-0005: Server runner (`mcp-serve`)

**Status:** Accepted
**Date:** 2026-08-21

## Context

ADR-0004 locked the monorepo: `packages/<name>/` holds one MCP server each (own deps, scripts, bin); the root holds workspace-wide concerns only and delegates via `turbo run`; "scripts that do work live in each package's `package.json`; root `package.json` only delegates via `turbo run`."

Today, running a server means `node packages/<name>/build/index.js`. That path is duplicated across host configs, each package's `AGENTS.md` prose, and human memory. As the family grows, every caller re-derives the path — no leverage, no locality. There is also no `dev`/watch loop (`AGENTS.md`: "no watch mode — rebuild after edits").

An architecture review + grilling pass (this session) produced a settled design for a deep launcher module behind a small interface, consistent with ADR-0004.

## Decision

Add an internal runner package `packages/runner/` named `@jeius-mcp-servers/runner`, exposing a `mcp-serve` bin.

**Interface:** `mcp-serve <server> [--dev] [--no-build]`. One name argument; `--dev` enters watch mode; `--no-build` (run-only) skips the build precondition.

**Implementation (deep module):**
- **Discovery:** resolve the name via bin introspection — read `pnpm-workspace.yaml`, walk sibling packages, read each `bin` field. The `bin` name *is* the server identity. Membership in the Server Family additionally requires a dependency on the MCP server SDK (`@modelcontextprotocol/server`): this keeps tool bins (including `mcp-serve` itself) out of the server pool. Adding a server = add a package with a `bin` + the SDK dep; zero runner or root edits. A named package with no `bin` is "not a server"; a named package outside the family is simply "no server named …".
- **Build precondition:** ensure built via `turbo build --filter=<name>` before spawn (skippable with `--no-build`, run-only). The caller never hits a stale-run failure.
- **Spawn:** `node <entry>` with stdio inherited (MCP needs pristine stdin/stdout). Forward `SIGINT`/`SIGTERM` to the child for a clean stdio close.
- **cwd:** works from any directory — walk up for `pnpm-workspace.yaml` to locate the workspace root.
- **`dev` mode:** initial blocking build (same path as `run`) → spawn → `chokidar` on `src/` → debounce → one-shot `turbo build --filter` → on success, kill + respawn the child; on compile error, keep the last-good child running and stream the error to stderr. Never leave the host without a server mid-session.

**Root stays a pure delegator:** root `package.json` gains `"serve": "mcp-serve"`. Callers: `pnpm serve pdf` / `pnpm serve pdf --dev`.

**Error contract:** all messages to stderr, actionable (names + paths), non-zero exit, no stack traces. Unknown name lists discovered bins; missing `bin` flags "not a server"; build failure echoes turbo's exit; built-but-no-entry signals a misconfigured `bin`/`outDir`.

**Tests:** pure `resolveServer(name, root)` unit tests at the seam (name → `{ packageDir, entryPath, binName }`), plus the build-filter arg construction. A smoke test boots a real server and asserts an MCP `initialize` handshake over stdio, gated by `RUN_SMOKE=1` (skipped in CI). Never mock past the interface — the interface is the test surface.

**Runtime dependency:** `chokidar` (pure JS, not native). Permitted without a native-deps ADR per the root `AGENTS.md` rule (native deps are the gated category; pure-JS watchers are not).

## Alternatives Considered

- **Root `scripts/serve.mjs` + amend ADR-0004** — rejected: a root script doing resolve/spawn/watch is literally a "root task doing work," which ADR-0004's "root only delegates via `turbo run`" forbids. Recording an amendment to permit it was the alternative; the internal-package placement avoids the amendment entirely because the work lives in a package, where ADR-0004 says it belongs.
- **Per-server root script aliases** (`"pdf": "node .../index.js"`, `"pdf:dev": "..."`) — rejected: shallow — 2N scripts growing 1:1 with the family, interface as wide as the (empty) implementation, no leverage.
- **Turbo `run`/`dev` persistent tasks** — rejected: turbo wraps stdout (bad for raw stdio MCP), doesn't model respawn-on-compile, and is designed for build/test pipelines not long-running interactive processes.
- **`tsc --watch` + mtime-watch on `build/index.js`** — rejected: mtime races on partial writes; `tsc --watch`'s "build done" signal is parse-only and fragile.
- **Explicit `servers.json` registry** — rejected: a second source of truth that drifts from the `bin` field, which already names the server for npm publishing.

## Consequences

- One new internal package, publishable, reusable across the family (and beyond — `mcp-serve` is a generic launcher for any workspace that follows the bin-name contract).
- Run/dev knowledge concentrates in one module (**locality**); callers learn one interface (**leverage**).
- Root stays a pure one-word delegator — ADR-0004's "package tasks, not root tasks" holds; no amendment to ADR-0004 was needed.
- Future server packages follow the bin-name contract automatically; no per-server root config, no per-server runner edits.
- `packages/runner/CONTEXT.md` is created lazily at build time with the terms the module introduces: **Runner**, **Server Family**, **bin discovery**, **dev respawn**.
- New runtime dep `chokidar` enters the runner package only (not root, not other packages).
- Reversible cheaply while only the runner package is affected; expensive once many host configs depend on `pnpm serve <name>` — which is the point of doing it before package #2.

---
