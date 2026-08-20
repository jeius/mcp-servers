# MCP Server Runner (`@jeius-mcp-servers/runner`)

A single binary, `mcp-serve`, that runs or develops any server in the Server Family by name — `mcp-serve <name> [--dev] [--no-build]`. It resolves the name via bin discovery, ensures the server is built, and runs it (or watches and respawns it in dev). The root delegates to it with `pnpm serve <name>`.

For cross-cutting rules (no stdout, no native deps without ADR, ADR numbering, no comments, don't commit failing builds), see the root [`AGENTS.md`](../../AGENTS.md). This file covers runner-specific rules and tool contracts.

## Commands

From the repo root:
```sh
pnpm --filter @jeius-mcp-servers/runner build
pnpm --filter @jeius-mcp-servers/runner test
pnpm --filter @jeius-mcp-servers/runner lint
pnpm --filter @jeius-mcp-servers/runner check-types
```

Or from within `packages/runner/`:
```sh
pnpm build    # tsc --project tsconfig.build.json && chmod 755 build/index.js
pnpm test     # vitest run
pnpm lint     # biome lint
pnpm fix      # biome check --write .
pnpm check-types  # tsc --noEmit
```

Run a server: `pnpm serve <name>` (root) or `node_modules/.bin/mcp-serve <name>` (direct bin — this is what an MCP host config invokes, e.g. `"command": "/ABSOLUTE/PATH/node_modules/.bin/mcp-serve", "args": ["pdf"]`). Dev: `pnpm serve <name> --dev`. Skip the build precondition: `--no-build` (run-only; ignored by `--dev`).

Smoke test (boots the real pdf server, asserts an MCP `initialize` handshake; requires the pdf package built):
```sh
RUN_SMOKE=1 pnpm --filter @jeius-mcp-servers/runner test
```

No watch mode for the runner itself — rebuild after edits.

## Engineering Rules (runner-specific)

- **The runner's stdout is the server's MCP stream once a server is spawned.** Never write to stdout from `mcp-serve`; every diagnostic goes to `console.error` (stderr). The spawned server inherits stdout by design; the runner must not interleave bytes.
- **Builds always discard turbo's stdout.** A `turbo build` run while the server child is alive would corrupt the MCP stream on our stdout; `buildPackage` pipes turbo's stdout to a sink and keeps stderr for errors.
- **Test only at the two pure seams:** `resolveServer(name, root)` and `buildFilterFor(packageName)`. Never mock `spawn` or the process layer; the smoke test is the only place a real server is booted, gated by `RUN_SMOKE=1` (skipped in CI).
- **Server Family membership = a package with a `bin` *and* a dependency on `@modelcontextprotocol/server`.** The SDK dependency is what keeps tool bins (like `mcp-serve` itself) out of the family. Do not add a `servers.json` registry — the `bin` field is the single source of truth (ADR-0005).
- **Adding a server = add a package with a `bin` + the SDK dep.** Zero runner edits, zero root edits. Run it by its bin name.
- **Runtime deps stay pure JS.** `chokidar` is the only runtime dependency; a native dep needs a repo-wide ADR.
- **Error contract:** every failure is a typed `ServerError` (unknown name, no bin, build failed, missing entry) carrying an actionable message; the CLI prefixes it with `mcp-serve:` and exits non-zero. No stack traces in user-facing output.

## Repo layout

```
packages/runner/
├── AGENTS.md           ← you are here (runner-specific rules + tool contracts)
├── CONTEXT.md          ← domain glossary (Runner, Server Family, Bin Discovery, Dev Respawn)
├── package.json        ← @jeius-mcp-servers/runner (deps + scripts)
├── tsconfig.json       ← extends ../../tsconfig.base.json
├── tsconfig.build.json ← extends ./tsconfig.json (outDir: build)
├── vitest.config.ts
├── src/                ← runner source
├── tests/              ← Vitest specs + fixtures workspace
└── docs/
    ├── PRD.md          ← product requirements (the what/why)
    ├── architecture.md ← system design, data flow, module boundaries
    ├── tech-stack.md   ← languages, frameworks, libs, tools inventory
    └── plan.md         ← status + deferred items
```

## Where to read first

- **What & why**: `docs/PRD.md`
- **How it's shaped**: `docs/architecture.md`
- **What with**: `docs/tech-stack.md`
- **Status / next**: `docs/plan.md`
- **Domain vocabulary** (use these terms, not synonyms): `CONTEXT.md`
- **Locked design decision**: `../../docs/adr/0005-server-runner.md` (ADR-0005)
- **Cross-cutting rules**: `../../AGENTS.md`
- **Repo-wide decisions**: `../../docs/adr/`
