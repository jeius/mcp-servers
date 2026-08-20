# Architecture

System design, data flow, and module boundaries for the PDF MCP Server. Scope decisions and the domain glossary live in `docs/PRD.md` and `CONTEXT.md`; this doc describes *shape*.

## Overview

A single Node process that speaks the Model Context Protocol over stdio. An MCP host (Claude for Desktop, opencode, etc.) launches the process and sends JSON-RPC tool calls on its stdin; the server responds on stdout. The server reads PDF files from the local filesystem, extracts text and structure via `unpdf`, and returns results as MCP tool results.

```
┌─────────────┐   stdin (JSON-RPC)    ┌──────────────────┐    readFile    ┌──────────────┐
│  MCP Host   │ ───────────────────▶  │   PDF MCP Server │ ────────────▶ │  PDF on disk │
│ (Claude /   │                       │  (node stdio)    │ ◀──────────── │ (abs path)   │
│  opencode)  │ ◀───────────────────  │                  │   Buffer      └──────────────┘
└─────────────┘   stdout (JSON-RPC)   └──────────────────┘
                          │
                          │ getDocumentProxy / extractText / extractTextItems / getMeta
                          ▼
                   ┌──────────────┐
                   │    unpdf     │  (MIT; bundles serverless pdfjs v5.6.x)
                   └──────────────┘
```

## Boundaries

Three layers, one direction of dependency (top depends on bottom):

1. **Transport layer** — `StdioServerTransport` from `@modelcontextprotocol/server/stdio`. Owns stdin/stdout framing. Nothing above it touches stdio directly. Diagnostics go to stderr only.

2. **Tool layer** — one handler per `pdf.*` tool. Each handler is a pure function `(parsedInput) => Promise<CallToolResult>`. It:
   - validates input (Zod v4 schema, including the absolute-path refine),
   - calls the PDF layer,
   - shapes the result into `{ content, structuredContent, isError }` per the PRD output schemas,
   - catches every error and returns `isError: true` (never throws to the transport).

3. **PDF layer** — the only place that touches `unpdf` / pdfjs. Wraps `getDocumentProxy`, `extractText`, `extractTextItems`, `getMeta`, `getPermissions`, and (later) `getOutline` / `page.getAnnotations`. Owns: buffer reading (`fs/promises`), password passthrough, Page Range parsing + clamping, size-cap truncation, permission-bit decoding.

The tool layer is the **test seam**: handlers are invoked directly with parsed input; the transport and the PDF library are never unit-tested. The PDF layer is allowed to change shape freely as long as the handler contract holds.

## Module layout

```
src/
├── index.ts            # entrypoint: new McpServer, register tools, connect StdioServerTransport
├── tools/
│   ├── read.ts         # pdf.read handler + input/output schemas
│   └── info.ts         # pdf.info handler + input/output schemas
└── pdf/
    ├── proxy.ts        # getDocumentProxy wrapper (password, encrypted detection)
    ├── pages.ts        # Page Range parse + clamp; size-cap truncation
    ├── text.ts         # extractText / extractTextItems wrappers + structuredContent page shaping
    └── meta.ts         # getMeta + getPermissions (Table 22 decode)

tests/
├── read.test.ts        # pdf.read handler at the seam
├── info.test.ts        # pdf.info handler at the seam
└── fixtures/           # committed license-clear PDF, non-PDF, encrypted PDF
```

(Exact file names are suggestive, not binding. The boundary — tool layer vs PDF layer, one seam — is binding.)

## Data flow: a `pdf.read` call

1. Host sends `tools/call` with `name: "pdf.read"` and args on stdin.
2. Transport hands the parsed args to the `pdf.read` handler.
3. Handler runs the Zod schema (absolute-path refine fails here for relative paths → `isError`).
4. PDF layer reads the file into a Buffer (`fs/promises.readFile`); file-missing → `isError`.
5. PDF layer calls `getDocumentProxy(buffer, { password })`; encrypted-without/wrong-password → `isError`.
6. PDF layer calls `extractText` (and `extractTextItems` if `structured: true`), applies Page Range + clamping, applies size caps, appends the truncation note if needed.
7. Handler builds `structuredContent` (validated against `outputSchema`) + the text `content` item with `\n\n--- Page N ---\n` markers.
8. Transport serializes the `CallToolResult` to stdout.

Every error path returns at the handler, never propagates to the transport. `pdf.info` is the same shape minus the text/structure extraction and plus metadata + permissions.

## Cross-cutting rules

- **No stdout except JSON-RPC.** Logging is `console.error` (stderr) only. `console.log` is forbidden.
- **No shared mutable state.** Each tool call is independent; no caching across calls (PRD: each call re-reads).
- **No native deps in Phase 1–3.** `unpdf` bundles its pdfjs; `@napi-rs/canvas` is optional and only matters if render is added (deferred, needs an ADR).
- **Single entrypoint.** `src/index.ts` → `build/index.js`, run as `node build/index.js`. Reads nothing from argv.
- **Capabilities: tools only.** No resources, no prompts, no dynamic tool registration.

## Decisions that shaped this shape

- **stdio over HTTP** (PRD; Q3 in design) → no web framework, no port, one process per host.
- **`unpdf` over `mupdf`/direct `pdfjs-dist`** (ADR-0001) → zero runtime deps, no native build, but structure fidelity is pdfjs-level (positions only; column/reading-order analysis is the LLM's job via `structured:true`).
- **`pdf.*` namespacing** (ADR-0002) → read tools now, write tools later in the same server without collision; the tool layer is where read/write handlers coexist.
- **Handler as the only test seam** (PRD §Testing Decisions) → the PDF layer is free to refactor behind the handler contract.

When the architecture changes (e.g. a write-side layer lands, or render forces a native dep), record it in `docs/adr/` and update this doc's diagram + boundaries to match.
