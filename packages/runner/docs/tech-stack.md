# Tech Stack

What the runner is built with and why. Decisions are recorded in `../../docs/adr/0005-server-runner.md` (ADR-0005); this file is the inventory.

## Runtime

| Layer | Choice | Version floor | Why |
|---|---|---|---|
| Runtime | Node.js | `>=22` | `fs`, `child_process` spawn, ESM; matches the monorepo engine floor |
| Module system | ESM | `"type": "module"` | Workspace convention; `bin` entry is ESM |
| Package manager | pnpm | `11.22.0` | Pinned via `packageManager` + corepack; root `turbo run` pipeline |
| Build orchestration | Turborepo | `^2` (root) | `pnpm exec turbo build --filter=<pkg>` is the build precondition |

## Languages & types

| Layer | Choice | Notes |
|---|---|---|
| Language | TypeScript | `tsconfig.json` strict, `target: ES2022`, `module/moduleResolution: nodenext`, `verbatimModuleSyntax` |
| Types | `@types/node` | devDependency |
| Validation | none | The runner has no user-input schemas; the only "schema" is `package.json` manifests read directly |

## Dependencies

### Runtime (`dependencies`)

| Package | Version | Purpose |
|---|---|---|
| `chokidar` | `^4.0.3` | Filesystem watch for `--dev`; pure JS, zero transitive deps (ADR-0005: no native deps without a repo-wide ADR) |

### Dev (`devDependencies`)

| Package | Version | Purpose |
|---|---|---|
| `typescript` | `^7.0.2` | `tsc` compiler |
| `vitest` | `^4.1.11` | Test runner; `pnpm test` → `vitest run` |
| `@types/node` | `^26.2.0` | Node type defs |

### Explicitly not in the tree

| Package / approach | Why not |
|---|---|
| A `servers.json` registry | The `bin` field is the single source of truth; a registry would be a second source that drifts (ADR-0005) |
| A YAML library | `pnpm-workspace.yaml` needs only the `packages:` block; a small tested parser in `resolve.ts` suffices |
| `tsx` / watch-mode runners | The runner *is* the watch loop; `--dev` builds + respawns rather than re-running TS |
| `@modelcontextprotocol/server` | The runner launches servers; it is not itself an MCP server |

## Tooling & commands

| Command | Does |
|---|---|
| `pnpm install` | Install deps |
| `pnpm build` | `tsc --project tsconfig.build.json && chmod 755 build/index.js` |
| `pnpm test` | `vitest run` (smoke test skipped unless `RUN_SMOKE=1`) |
| `pnpm check-types` | `tsc --noEmit` |
| `pnpm serve <name>` (root) | Run a server by name (`mcp-serve`) |
| `pnpm serve <name> --dev` (root) | Run with watch + respawn |
| `node_modules/.bin/mcp-serve <name>` | Direct bin — the MCP-host-facing invocation |

Biome 2.5.9 via root; `pnpm lint` / `pnpm format` / `pnpm fix`. No watch mode for the runner itself (rebuild after edits).

## Agent tooling

- `AGENTS.md` — operational guide for AI coding agents (commands, runner-specific rules, layout).
- `CONTEXT.md` — domain glossary (Runner, Server Family, Bin Discovery, Dev Respawn).
- `../../docs/adr/0005-server-runner.md` — the locked design decision (ADR-0005), repo-wide.
- `docs/` — PRD (what/why), architecture (shape), tech-stack (this file), plan (status + deferred).
