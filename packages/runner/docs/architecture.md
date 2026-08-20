# Architecture

System design, data flow, and module boundaries for the MCP Server Runner. The what/why and the locked decisions live in `docs/PRD.md` and ADR-0005 (`../../docs/adr/0005-server-runner.md`); this doc describes *shape*.

## Overview

A single Node process, `mcp-serve`. Given a server name, it (1) resolves the server package by bin discovery, (2) ensures the package is built (`turbo build --filter`), (3) spawns the server's entry as a child with stdio inherited, and (4) forwards signals to the child. In `--dev` mode it additionally watches the package's `src/` and respawns the child after each clean rebuild.

```
                     ┌───────────────────────────────┐
  pnpm serve pdf ───▶│         mcp-serve             │   spawn node <entry>
  (or host config    │  index.ts  (composition root) │──────────────────────────▶  Server child
   → mcp-serve pdf)  │   │                           │   stdio inherit             (e.g. pdf)
                     │   ▼                           │   SIGINT/SIGTERM forwarded ──▶  └── MCP over stdio
                     │ resolve.ts (pure)             │
                     │   │                           │
                     │   ▼                           │
                     │ run.ts / dev.ts (process)     │
                     │   │                           │
                     │   ▼                           │
                     │ buildPackage → pnpm exec      │
                     │   turbo build --filter=<pkg>  │   stdout discarded, stderr kept
                     └───────────────────────────────┘
```

## Boundaries

Three layers, one direction of dependency (composition root → process → pure):

1. **Composition root (`src/index.ts`)** — parses argv, finds the workspace root (walk up for `pnpm-workspace.yaml`), calls `resolveServer`, dispatches to `run` or `dev`, and owns the stderr error contract (`mcp-serve: <message>`, non-zero exit). Nothing here is unit-tested.

2. **Process layer (`src/run.ts`, `src/dev.ts`)** — `runServer`: build precondition (unless `--no-build`), entry existence check, `spawnServer`, signal forwarding, exit with the child's code. `devServer`: initial blocking build → `spawnFresh` → chokidar watch on `src/` → debounced `rebuild` → `respawn` on clean rebuild / keep-last-good on compile error. Not unit-tested (never mock spawn); covered by the gated smoke test.

3. **Pure layer (`src/resolve.ts`, `src/build-filter.ts`, `src/errors.ts`)** — the **test seams**. `findWorkspaceRoot`, workspace-glob parsing, `resolveServer(name, root) → { name, binName, packageName, packageDir, entryPath }`, `buildFilterFor(packageName)`, and the typed `ServerError` family. This layer has no I/O side effects beyond reading package manifests (via `fs`, exercised with a fixture workspace in tests).

The pure layer is the test surface: `resolveServer` and `buildFilterFor` are the only things unit-tested. The process layer is deliberately thin and is verified end-to-end by the `RUN_SMOKE=1` smoke test (boots the real pdf server, asserts an MCP `initialize` handshake over stdio).

## Module layout

```
src/
├── index.ts          # entrypoint: argv → resolve → run|dev, stderr error contract
├── resolve.ts        # findWorkspaceRoot, pnpm-workspace.yaml parsing, glob expansion,
│                     #   bin introspection, resolveServer (pure; test seam)
├── build-filter.ts   # buildFilterFor(packageName) → turbo args (pure; test seam)
├── run.ts            # buildPackage (stdout-discarding turbo), spawnServer, runServer
├── dev.ts            # devServer: chokidar watch → debounce → rebuild → respawn/keep-last-good
└── errors.ts         # ServerError, UnknownServerError, NoBinError, BuildFailedError, MissingEntryError

tests/
├── resolve.test.ts   # resolveServer + findWorkspaceRoot at the seam (fixture workspace)
├── build-filter.test.ts
├── smoke.test.ts     # RUN_SMOKE=1-gated: boot real pdf server, assert initialize handshake
└── fixtures/ws/      # fixture workspace: packages/{pdf, noserver, clitool} + pnpm-workspace.yaml
```

## Data flow

**Run mode (`mcp-serve pdf`):**
1. `index.ts` parses argv, finds the workspace root (any cwd, walk up).
2. `resolveServer('pdf', root)` → `{ entryPath, packageName, … }`; unknown name / no bin throws a typed error → printed to stderr, exit 1.
3. `runServer`: `turbo build --filter=@jeius-mcp-servers/pdf` (stdout discarded); failure → `build failed for "pdf"; see turbo output above`, exit = build's code.
4. Entry existence check → `built but no entry at <path>` on miss.
5. `spawn('node', [entryPath], { stdio: 'inherit' })`; SIGINT/SIGTERM forwarded to the child; exit with the child's code.

**Dev mode (`mcp-serve pdf --dev`):**
1–4. Same as run (initial blocking build always runs; `--no-build` is ignored).
5. `spawnFresh` starts the child; `watch(packageDir/src)` debounces change events by 150ms.
6. On a clean rebuild: `respawn` kills the current child (marking `respawnQueued`), then spawns a fresh one on exit.
7. On a compile error: the child is left running; turbo's error text streams on stderr; `build failed; keeping the last-good server running`.
8. On SIGINT/SIGTERM: forward to the child; exit with its code when it closes.

## Cross-cutting rules

- **No stdout except the server's MCP stream.** The runner never writes stdout; `buildPackage` discards turbo's stdout (a build during a live server would corrupt the stream).
- **All diagnostics to stderr**, prefixed `mcp-serve:`.
- **No shared mutable state** beyond the dev-loop's child handle; each `mcp-serve` invocation is one server process.
- **Server Family = package with `bin` + `@modelcontextprotocol/server` dep** — the only membership rule; no registry file.

## Decisions that shaped this shape

- **Deep module behind a small interface** (ADR-0005) → callers only ever say `mcp-serve <name>`; the resolve/build/spawn/watch machinery is the hidden depth.
- **Internal package, not root script** (ADR-0004) → work lives in a package; root is a one-word delegator.
- **Bin introspection, no `servers.json`** (ADR-0005) → the `bin` field is the single source of truth; adding a server needs zero runner edits.
- **SDK-dep discriminator** (ADR-0005) → tool bins don't self-list as servers.
- **Pure layer as the only test seam** (ADR-0005 §Tests) → the process layer is free to refactor behind `resolveServer`/`buildFilterFor`; spawn is only exercised by the gated smoke test.
