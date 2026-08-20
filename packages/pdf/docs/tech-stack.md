# Tech Stack

What this project is built with and why. Decisions are recorded in `docs/adr/`; this file is the inventory.

## Runtime

| Layer | Choice | Version floor | Why |
|---|---|---|---|
| Runtime | Node.js | `>=22` | unpdf 1.8.x bundles pdfjs using `Promise.withResolvers` (Node 22+); Node 20 EOL Apr 2026. See ADR-0001 |
| Module system | ESM | `"type": "module"` | MCP SDK v2 is ESM; stdio transport, no CJS interop needed |
| Transport | stdio | — | `StdioServerTransport` from `@modelcontextprotocol/server/stdio`; no HTTP layer. See PRD |
| Package manager | pnpm | `11.22.0` | Pinned via `packageManager` + corepack |

## Languages & types

| Layer | Choice | Notes |
|---|---|---|
| Language | TypeScript | `tsconfig.json` strict, `target: ES2022`, `module/moduleResolution: nodenext` |
| Validation | Zod v4 | `import * as z from 'zod/v4'`; tool input/output schemas declared as Zod object schemas, SDK derives JSON Schema via Standard Schema (no `zod-to-json-schema`) |
| Types | `@types/node` | devDependency |

## Dependencies

### Runtime (`dependencies`)

| Package | Version | Purpose |
|---|---|---|
| `@modelcontextprotocol/server` | `^2.0.0` | MCP server SDK v2 — `McpServer`, `registerTool`, `StdioServerTransport`, `CallToolResult` with `structuredContent` |
| `zod` | `^4.4.3` | Tool input/output schemas (SDK requires zod `>=4.2.0` for self-conversion) |
| `unpdf` | `^1.8.1` (to add) | PDF text + structured-text extraction; MIT, zero runtime deps, bundles serverless pdfjs v5.6.x. See ADR-0001 |

### Dev (`devDependencies`)

| Package | Version | Purpose |
|---|---|---|
| `typescript` | `^7.0.2` | `tsc` compiler |
| `vitest` | `^4.1.11` | Test runner; `pnpm test` → `vitest run` |
| `@types/node` | `^26.2.0` | Node type defs |

### Explicitly not in the tree

| Package | Why not |
|---|---|
| Hono / Express / any web framework | stdio-only; no HTTP transport (PRD) |
| `pdfjs-dist` (direct) | Replaced by `unpdf`, which bundles a serverless pdfjs with Node polyfills baked in (ADR-0001) |
| `mupdf` / `mupdf-js` | AGPL-3.0 conflicts with MIT; commercial license required (ADR-0001) |
| `pdf-lib` | No text extraction (create/edit only); unmaintained since 2021 |
| `pdf-parse` | Would add a second extractor just for `getTable()`; rejected (PRD §Deferred) |
| `@napi-rs/canvas` | Optional unpdf peer; only needed for page render, which is deferred (needs an ADR) |
| `tesseract.js` | OCR deferred; different runtime profile, likely a separate server |

## Tooling & commands

| Command | Does |
|---|---|
| `pnpm install` | Install deps |
| `pnpm build` | `tsc && chmod 755 build/index.js` → `build/index.js` |
| `pnpm test` | `vitest run` |
| `node build/index.js` | Run the server (stdio); what MCP hosts invoke |

Biome 2.5.9 installed; `pnpm lint` / `pnpm format` / `pnpm fix` (biome lint / biome format / biome check --write .). No `pnpm dev` (server has no watch mode; rebuild after edits).

## Agent tooling

- `AGENTS.md` — operational guide for AI coding agents (project summary, commands, rules) + the agent-skills block pointing at `docs/agents/`.
- `docs/agents/issue-tracker.md` — GitHub Issues via `gh` CLI (the issue tracker for this repo).
- `docs/agents/domain.md` — single-context domain docs layout; consumer rules for `CONTEXT.md` + `docs/adr/`.
- `.agents/skills/` — vendored `zod` and `vitest` skills, pinned in `skills-lock.json`.
- `CONTEXT.md` — domain glossary (per the domain-modeling skill).
- `docs/adr/` — Architecture Decision Records (0000 template, 0001 unpdf+Node22, 0002 `pdf.*` namespace).
