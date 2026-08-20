# Plan

Status of the MCP Server Runner. Execution status lives in GitHub Issues (label `ready-for-agent`); the locked design is ADR-0005 (`../../docs/adr/0005-server-runner.md`). This file records what has shipped and what is deliberately deferred.

## Phase 1 — Run mode (done)

- [x] Package scaffold: `package.json` (`@jeius-mcp-servers/runner`), `tsconfig.json`/`tsconfig.build.json`, `vitest.config.ts`
- [x] `src/resolve.ts` — `findWorkspaceRoot` (any-cwd walk-up), `pnpm-workspace.yaml` parsing, glob expansion, bin introspection, `resolveServer`
- [x] `src/run.ts` — `turbo build --filter=<pkg>` precondition (stdout discarded), `--no-build` hatch, spawn with stdio inherited, signal forwarding
- [x] `src/index.ts` — CLI + stderr error contract; root `"serve": "mcp-serve"` delegation
- [x] Tests — `resolve.test.ts` + `build-filter.test.ts` at the seams; `RUN_SMOKE=1`-gated smoke test (real pdf server, `initialize` handshake)
- [x] Shipped as issue #2 / PR #4

## Phase 2 — Dev mode (done)

- [x] `src/dev.ts` — chokidar on `src/` → 150ms debounce → one-shot build → respawn on clean rebuild / keep-last-good on compile error
- [x] Shipped as issue #2 / PR #4

## Phase 3 — Documentation (done)

- [x] `CONTEXT.md` (domain glossary), `AGENTS.md`, `docs/{PRD,architecture,tech-stack,plan}.md`
- [x] Shipped as issue #3

## Deferred (require a new ADR or a real need before starting)

- **Args passthrough to the server** — out of scope per ADR-0005; the seam exists but is deliberately unfilled until a non-stdio transport is needed.
- **`run all`** (multi-server supervisor) — YAGNI until a second server needs concurrent launch.
- **Publishing `@jeius-mcp-servers/runner`** — the package is publishable but stays internal; the root remains `private: true`.
