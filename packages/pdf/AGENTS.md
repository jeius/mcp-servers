# PDF MCP Server (`@jeius-mcp-servers/pdf`)

An MCP server that reads the content of PDF files from local disk and returns text and positional structure to an LLM host over stdio. Read-only for now; architected to accept write-side tools later in the same server via a new ADR.

For cross-cutting rules (no stdout, no native deps without ADR, ADR numbering, no comments, don't commit failing builds), see the root [`AGENTS.md`](../../AGENTS.md). This file covers pdf-specific rules and tool contracts.

## Commands

From the repo root:
```sh
pnpm --filter @jeius-mcp-servers/pdf build
pnpm --filter @jeius-mcp-servers/pdf test
pnpm --filter @jeius-mcp-servers/pdf lint
pnpm --filter @jeius-mcp-servers/pdf check-types
```

Or from within `packages/pdf/`:
```sh
pnpm build    # tsc --project tsconfig.build.json && chmod 755 build/index.js
pnpm test     # vitest run
pnpm lint     # biome lint
pnpm fix      # biome check --write .
pnpm check-types  # tsc --noEmit
```

Run the server: `node build/index.js` (stdio; this is what MCP hosts invoke).
Run in a host config: `"pdf": { "command": "node", "args": ["/ABSOLUTE/PATH/packages/pdf/build/index.js"] }`

No `npm run dev` (no watch mode — rebuild after edits).

## Engineering Rules (pdf-specific)

- **Tool handlers never throw to the transport.** Wrap every handler body in try/catch and return `{ content: [{ type: "text", text }], isError: true }` on any error (file not found, not a PDF, encrypted/needs password, parse failure, relative path).
- **Paths are absolute only.** Validate with a Zod `.refine(p => path.isAbsolute(p))`. Relative paths fail at schema validation and surface as `isError` results.
- **No HTTP framework.** stdio transport only. Do not add Hono/Express/etc.
- **One test seam: the tool handler.** Test handlers directly with parsed input; assert the `CallToolResult` (content, structuredContent, isError). Do not unit-test the PDF layer internals or the transport. Use real fixtures, not mocks, for error paths.
- **Every result has a `content` array** with at least one text item, alongside `structuredContent` validated against the tool's `outputSchema`.
- **Use Zod v4** (`import * as z from 'zod/v4'`) for tool input/output schemas. The SDK derives JSON Schema; no manual `zod-to-json-schema`.
- **`pdf.*` tool namespacing.** Read tools (`pdf.read`, `pdf.info`, `pdf.outline`, ...) and future write tools share the `pdf.` prefix. See ADR-0002.
- **Omit empty optional fields** in `structuredContent` (don't emit `null`). `fontFamily` omitted when empty; `permissions` omitted when `getPermissions()` returns null.

## Repo layout

```
packages/pdf/
├── AGENTS.md           ← you are here (pdf-specific rules + tool contracts)
├── CONTEXT.md          ← domain glossary (Page, Text, Structured Text, Text Item, Page Range, Encrypted PDF)
├── package.json        ← @jeius-mcp-servers/pdf (deps + scripts)
├── tsconfig.json       ← extends ../../tsconfig.base.json
├── tsconfig.build.json ← extends ./tsconfig.json (outDir: build)
├── vitest.config.ts
├── src/                ← server source
├── tests/              ← Vitest specs + fixtures
└── docs/
    ├── PRD.md          ← product requirements (the what/why; living doc)
    ├── architecture.md ← system design, data flow, module boundaries
    ├── tech-stack.md   ← languages, frameworks, libs, tools inventory
    ├── plan.md         ← phased roadmap + milestones
    └── adr/            ← pdf-specific ADRs (0001 unpdf+Node22, 0002 pdf-namespace, …)
```

## Where to read first

- **What to build & why**: `docs/PRD.md`
- **How it's shaped**: `docs/architecture.md`
- **What with**: `docs/tech-stack.md`
- **What's next / phased plan**: `docs/plan.md`
- **Domain vocabulary** (use these terms, not synonyms): `CONTEXT.md`
- **Locked decisions** (don't re-litigate): `docs/adr/`
- **Cross-cutting rules**: `../../AGENTS.md`
- **Repo-wide decisions**: `../../docs/adr/`
