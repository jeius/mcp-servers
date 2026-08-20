# Spec: MCP Server Runner

## Problem Statement

As a maintainer of a monorepo whose Server Family keeps growing, I want to run any server by name (`pnpm serve <name>`) instead of re-deriving the hardcoded path `node packages/<name>/build/index.js` in every host config, AGENTS.md, and human memory — and I want a `--dev` loop that rebuilds and restarts the server on edit, so that working on a server doesn't mean manually rebuilding and restarting.

## Solution

A single binary, `mcp-serve`, from an internal package `@jeius-mcp-servers/runner`. It resolves a server by its bin name, ensures it is built, and runs it over stdio; with `--dev` it watches `src/` and respawns on clean rebuilds (keeping the last-good server running on compile errors). The root delegates with `"serve": "mcp-serve"`, so the family is run via `pnpm serve <name>` and developed via `pnpm serve <name> --dev`.

The design is locked in ADR-0005 (`docs/adr/0005-server-runner.md`); this doc records the what/why, not the alternatives. Execution of the build-out was issue #2 (merged as PR #4).

## User Stories

1. As a maintainer, I want to run any server by name, so that I don't re-derive or copy the `node packages/<name>/build/index.js` path.
2. As a maintainer, I want `pnpm serve pdf` to work from any directory, so that I don't have to `cd` to the repo root first.
3. As a maintainer, I want the runner to build the server before running it, so that I never hit a stale-build failure — with a `--no-build` hatch when I know the build is current.
4. As a maintainer, I want `--dev` to watch `src/` and restart on a clean rebuild, so that I can iterate without manual rebuild+restart.
5. As a maintainer, I want a broken edit to keep the last-good server running, so that a compile error never takes the host down mid-session.
6. As a maintainer, I want an actionable message when I typo a name, so that I can see the list of known servers.
7. As a maintainer, I want the runner to write nothing to stdout, so that the server's MCP stdio stream stays pristine.
8. As a maintainer, I want to add a server by just adding a package with a `bin` (+ the MCP SDK dep), so that the runner needs no per-server config.
9. As an MCP host, I want to launch `mcp-serve pdf` directly as the server command, so that the host config is stable even if the server package moves.

## Implementation Decisions

The decision record is ADR-0005; the executable surface is `packages/runner/src/`. Key decisions, with pointers:

- **Interface**: `mcp-serve <server> [--dev] [--no-build]`; `--no-build` is run-only and ignored by `--dev`. (ADR-0005 §Interface)
- **Module location**: internal package `packages/runner/`, bin `mcp-serve`; root stays a pure delegator (`"serve": "mcp-serve"`). (ADR-0005 §Decision; ADR-0004 keeps root from doing work)
- **Discovery**: bin introspection — read `pnpm-workspace.yaml`, walk sibling packages, read each `bin` field. The `bin` name is the server identity; membership also requires the `@modelcontextprotocol/server` dependency (keeps tool bins out of the family). No `servers.json` registry. (`src/resolve.ts`; ADR-0005 §Discovery)
- **Build precondition**: `turbo build --filter=<scoped-package-name>` before spawn; turbo's stdout is discarded so the MCP stream stays pristine. (`src/run.ts`; ADR-0005 §Implementation)
- **Spawn**: `node <entry>` with stdio inherited; SIGINT/SIGTERM forwarded for a clean stdio close. (`src/run.ts`)
- **`--dev` lifecycle**: initial blocking build (same path as run) → spawn → chokidar on `src/` → debounce → one-shot build → respawn on clean rebuild; keep last-good child + stream errors on compile failure. (`src/dev.ts`; ADR-0005 §dev mode)
- **Error contract**: typed errors — unknown name (lists known servers), no bin, build failed (exit = build's exit), built-but-no-entry — all printed to stderr as `mcp-serve: <message>` with a non-zero exit. (`src/errors.ts`, `src/index.ts`; ADR-0005 §Error contract)
- **Tests**: pure `resolveServer` + `buildFilterFor` unit tests at the seams; a `RUN_SMOKE=1`-gated smoke test boots the real pdf server and asserts an MCP `initialize` handshake. No spawn mocking. (`tests/`; ADR-0005 §Tests)

## Out of Scope

- **Args passthrough to the server** (for a future non-stdio transport) — the seam exists; don't fill it yet. (ADR-0005 §Consequences)
- **`run all`** (a multi-server supervisor) — YAGNI until a second server needs concurrent launch.
- **A root bin / publishing** `@jeius-mcp-servers` itself — root stays `private: true`.
- **HTTP/streamable transport** — stdio only; `mcp-serve` is a process runner over stdio.

## Further Notes

- Domain glossary: `CONTEXT.md` (Runner, Server Family, Bin Discovery, Dev Respawn).
- Related issues: #2 (build-out, done — PR #4), #3 (this docs pass).

---

**Status:** Living product document. Source of truth for what the runner is and must do. The locked design is ADR-0005; execution is tracked in GitHub Issues, not here.
