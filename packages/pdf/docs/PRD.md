# Spec: PDF MCP Server

## Problem Statement

As a user of an MCP-compatible LLM host (e.g. Claude for Desktop, opencode), I want the LLM to be able to read the content of PDF files on my local disk, so that it can answer questions about, summarize, and reason over documents I already have — without me copying and pasting text by hand, and without losing page boundaries or layout cues that matter for understanding the document.

## Solution

A Model Context Protocol server, run over the standard stdio transport, that exposes a set of `pdf.*`-namespaced tools to the host. The initial release ships two read-side tools:

- `pdf.read` — extracts Text (and, on demand, Structured Text) from a local PDF, optionally over a Page Range, with per-call size caps.
- `pdf.info` — returns page count, encryption status, permission flags, and standard document metadata.

The server is architected to accept additional read-side tools (see Roadmap) and, via a future ADR, write-side tools (create/edit/merge/split) in the same server. The host launches the server from its MCP config (e.g. `node /ABSOLUTE/PATH/build/index.js`). The LLM calls the tools, passing an absolute filesystem path (and, for encrypted PDFs, a password). Results come back as MCP tool results: a human-readable text `content` item plus a machine-readable `structuredContent` object validated against an output schema. Errors are returned as `isError: true` results, never thrown.

## User Stories

1. As an LLM user, I want the LLM to read a PDF I point it at by absolute path, so that I don't have to paste the text myself.
2. As an LLM user, I want each Page's text returned with clear page boundaries, so that the LLM can cite page numbers and navigate long documents.
3. As an LLM user, I want the LLM to fetch just a Page Range (e.g. `1-3`, `7`) instead of the whole document, so that large PDFs don't overwhelm context.
4. As an LLM user, I want the LLM to ask how many Pages a PDF has before reading, so that it can plan which pages to pull.
5. As an LLM user, I want the LLM to get document metadata (title, author, dates), so that it can orient itself on what the document is.
6. As an LLM user, I want the LLM to read an Encrypted PDF when I supply the password, so that I can work with protected documents.
7. As an LLM user, I want the LLM to tell me when a PDF is Encrypted and needs a password, so that I can provide it.
8. As an LLM user, I want to know what a PDF permits (printing, copying, editing) without opening it, so that I understand its constraints.
9. As an LLM user, I want to optionally request Structured Text (positions, font, direction per Text Item) for a page range, so that the LLM can reason about columns, tables, and reading order.
10. As an LLM user, I want large reads capped by default so a 1,000-page PDF doesn't silently blow up context.
11. As an LLM user, I want to raise the per-call page and character caps when I knowingly want a large extract, so that the default guard doesn't block legitimate big reads.
12. As an LLM user, I want a clear, actionable message when a path doesn't exist, so that I can correct it.
13. As an LLM user, I want a clear message when a file isn't a valid PDF, so that I know the input is bad rather than the server being broken.
14. As an LLM user, I want a clear message when I pass a relative path, so that I know paths must be absolute.
15. As an LLM user, I want the server to never crash on bad input, so that one bad call doesn't take down the whole session.
16. As an LLM user, I want the server to write any diagnostic logs to stderr (never stdout), so that stdio JSON-RPC isn't corrupted.
17. As a maintainer, I want the server to be a single stdio entrypoint, so that it's trivial to wire into any MCP host config.
18. As a maintainer, I want no HTTP framework in the dependency tree, so that the server stays small and stdio-only.
19. As a maintainer, I want the project to build with `pnpm build` and test with `pnpm test`, so that the existing scripts are the source of truth.
20. As a maintainer, I want tools namespaced as `pdf.*`, so that read and future write tools coexist without collision and hosts can group them.

## Implementation Decisions

- **Transport**: stdio only, via `StdioServerTransport` from `@modelcontextprotocol/server/stdio`. No HTTP/streamable transport, no Hono or similar web framework.

- **Server**: `McpServer` from `@modelcontextprotocol/server` (SDK v2), tools registered with `server.registerTool(name, config, handler)`. Initial tools: `pdf.read`, `pdf.info`. Namespacing decision recorded in ADR-0002.

- **Input schemas** (Zod v4, `zod/v4`):
  - `pdf.read`: `path` (string, refined to absolute via `path.isAbsolute`), `password` (string, optional), `pages` (string, optional — Page Range), `structured` (boolean, default `false`), `maxPages` (number, default `50`), `maxChars` (number, default `200000`).
  - `pdf.info`: `path` (string, absolute), `password` (string, optional).
  - Relative paths fail schema validation (zod `.refine`), surfaced as an `isError` result with a clear message.

- **PDF extraction library**: `unpdf` (^1.8.1), MIT, zero runtime deps, bundles a serverless pdfjs. Chosen over `mupdf` (AGPL-3.0) and direct `pdfjs-dist` (manual Node polyfills). See ADR-0001.

- **Node engine floor**: >=22 (unpdf 1.8.x bundles pdfjs using `Promise.withResolvers`; Node 20 maintenance ended Apr 2026). Recorded in ADR-0001.

- **Password handling**: passed to `unpdf`'s `getDocumentProxy(buffer, { password })`, which forwards to pdfjs `getDocument`. Used by both tools.

- **Page Range parsing**: a single `pages` string selector, e.g. `1-3`, `1,3,5`, `1-3,7`. Parsed into a sorted, de-duplicated 1-indexed page list. Omit the argument to select all Pages. Out-of-range pages are ignored (clamped to the document's `totalPages`).

- **`pdf.read` output** — returns both a text `content` item and `structuredContent` validated against an `outputSchema`:
  - `content`: `[{ type: "text", text }]` where `text` is the joined page texts separated by `\n\n--- Page N ---\n` markers (N is the 1-indexed page number).
  - `structuredContent` shape:

    ```
    { totalPages: number, pagesReturned: number,
      pages: Array<{ page: number, text: string,
        items?: Array<{ str: string, x: number, y: number,
          width: number, height: number, fontSize: number,
          fontFamily?: string, dir: string, hasEOL: boolean }> }> }
    ```

  - `items` is present on each page only when `structured: true`; otherwise omitted.
  - `fontFamily` is omitted from each Text Item when empty (`''`).

- **`pdf.info` output**:
  - `content`: `[{ type: "text", text }]` with a short human-readable summary.
  - `structuredContent` shape:

    ```
    { pages: number, encrypted: boolean,
      permissions?: { printing: boolean, modifying: boolean,
        extracting: boolean, annotationsAndForms: boolean,
        fillForms: boolean, accessibility: boolean,
        assemble: boolean, highQualityPrint: boolean },
      title?, author?, subject?, keywords?: string[],
      creator?, producer?, creationDate?, modDate? }
    ```

  - `permissions` is omitted (not null) when `pdf.getPermissions()` returns null (no permission flags in the file). Empty/absent metadata fields are omitted (not emitted as `null`).
  - Permission booleans decode PDF spec Table 22 bits.

- **Size caps** (configurable per call on `pdf.read`):
  - `maxPages` (default 50): the number of Pages actually extracted in a single call is capped. `pagesReturned` reflects the count returned. `totalPages` always reflects the document's true page count. On overflow, the returned text carries a trailing note, e.g. `[truncated, pages 1-50 of N shown]`.
  - `maxChars` (default 200000): total returned characters across all returned pages; on overflow, truncate and append the same style of note.
  - Caps apply to both the `content` text and the `structuredContent.pages` array (an over-cap structured extract is truncated in lockstep).

- **Error handling**: every handler wraps its body in try/catch. All error classes (file not found, not a PDF, Encrypted PDF without/with wrong password, parse failure, relative path) become `{ content: [{ type: "text", text: "<message>" }], isError: true }`. Handlers never throw to the transport.

- **Logging**: diagnostics go to `stderr` only (`console.error`). `stdout` is reserved for JSON-RPC. No `console.log`.

- **File reading**: `fs/promises` `readFile(path)`. No streaming; PDFs are read into a buffer for `unpdf`. (Reversible if memory pressure shows up on huge PDFs.)

- **Entrypoint**: a single `src/index.ts` compiled to `build/index.js`, executable via `bin.pdf`. Reads nothing from argv; serves over stdio until stdin closes.

- **Tool registration**: registered on server construction. No dynamic tool registration, no resources, no prompts. Capabilities advertise tools only.

## Testing Decisions

- **What makes a good test here**: assert only external behavior at the tool-handler boundary — given parsed input, the handler returns the expected `CallToolResult` (content, structuredContent, isError). Do not assert internal helper structure, library call counts, or private module shapes.

- **The seam**: one seam, the highest possible — the per-tool handler. Each tool's handler is exercised directly (either by invoking the function passed to `registerTool`, or by exporting a thin handler per tool and calling it). This is the MCP contract surface; nothing above it is ours to test, and testing below it would be implementation-detail testing.

- **Runner**: Vitest (already a devDependency; `pnpm test` runs `vitest run`).

- **Fixtures**: a small, committed, license-clear PDF under `tests/fixtures/` for happy-path Text and Structured Text assertions. Error paths use real conditions, not mocks:
  - missing path → a non-existent absolute path
  - not a PDF → a committed non-PDF fixture file
  - Encrypted PDF → a committed fixture PDF encrypted with a known password (assert success with password, error without / with wrong password)
  - relative path → `"relative/path.pdf"` (caught at schema validation)

- **Coverage priorities**:
  - `pdf.read`: all-pages happy path; Page Range subset (`1-3`, `1,3,5`, `1-3,7`); out-of-range clamping; `structured:true` returns `items` with the documented fields, `structured:false` omits `items`; `maxPages`/`maxChars` truncation appends the note and sets `pagesReturned`; empty `fontFamily` omitted; relative path rejected; missing path → `isError`; not-a-PDF → `isError`; encrypted without password → `isError`; encrypted with correct password succeeds.
  - `pdf.info`: returns `pages` and `encrypted` always; `permissions` present when flags exist, omitted when null; present metadata fields returned, empty fields omitted; encrypted fixture reports `encrypted: true`; missing path / not-a-PDF / relative path → `isError`.
  - Shared: no handler ever throws; every result has a `content` array with at least one text item.

- **Prior art**: none in-repo (greenfield). Vitest conventions come from the project's vendored vitest skill.

## Roadmap

Tools decided but not built in the initial release. Shapes captured here to avoid re-deriving; finalized at build time. All are read-side; write-side tools require a future ADR (see Deferred).

### Phase 1 (high value or cheap, no new dependencies)

- **`pdf.outline`** — document outline / bookmarks / TOC.
  - Input: `path` (absolute), `password?`.
  - Output `structuredContent`: `{totalNodes, nodesReturned, nodes:[{title, level, page?, url?, bold?, italic?}]}`.
  - Flattened with 1-indexed `level` (depth), in document order. Internal `dest` resolved to 1-indexed `page`; external → `url`. `bold`/`italic` omitted when false. `page` omitted for url-only nodes, `url` omitted for internal.
  - Cap: 500 nodes; overflow appends `[outline truncated, 500 of N nodes]`.
  - Implementation: pdfjs `getDocumentProxy(...).getOutline()` via proxy.

- **`pdf.search`** — literal/regex search across text.
  - Input: `path` (absolute), `password?`, `query` (string), `regex` (boolean, default false → literal), `caseSensitive` (boolean, default false), `pages` (Page Range, optional), `contextChars` (number, default 40), `maxMatches` (number, default 100).
  - Output `structuredContent`: `{totalMatches, matchesReturned, matches:[{page, match, context}]}`. `context` = ±`contextChars` chars around match. Overflow: `matchesReturned` < `totalMatches`, note appended. No position in v1.
  - Implementation: builds on `extractTextItems`; regex is opt-in to avoid catastrophic backtracking from LLM-supplied patterns.

- **`pdf.page_size`** — per-page dimensions.
  - Input: `path` (absolute), `password?`, `pages` (Page Range, optional), `maxPages` (number, default 500).
  - Output `structuredContent`: `{totalPages, pagesReturned, pages:[{page, width, height, rotation, userUnit}]}`. Units: PDF points (user-space, from unscaled `page.view`). `rotation` degrees (0/90/180/270); `userUnit` default 1.0.

### Phase 2 (richer, more nuance)

- **`pdf.links`** — hyperlinks and internal links, rich.
  - Input: `path` (absolute), `password?`, `pages?`.
  - Output `structuredContent`: `{totalPages, links:[{page, url?, destPage?, rect:[x1,y1,x2,y2], text?}]}`. Internal `dest`→page resolved; external → `url`; `text` = annotation alt text if present.
  - Implementation: raw pdfjs `page.getAnnotations({ intent: 'display' })` filtered to `subtype === 'Link'` (unpdf's `extractLinks` is too shallow — flat URLs, no page/rect/dest).

- **`pdf.form_fields`** — read-only read of form field definitions and filled values.
  - Input: `path` (absolute), `password?`, `pages?`.
  - Output `structuredContent`: `{totalPages, fields:[{page, fieldName, fieldType, value, readOnly, required, rect, options?}]}`. `fieldType` normalized to `text|choice|button`. `value` from `annotationStorage` live values, fallback `fieldValue`. `options` (choice fields) = `[{displayValue, exportValue}]`.
  - Read-only: no fill tool. Filling is write-side, deferred to a future ADR.

### Folded into `pdf.info` (not standalone)

- **Permissions** — decoded PDF permission bits as the `permissions` object on `pdf.info` `structuredContent` (see Implementation Decisions), omitted when `pdf.getPermissions()` returns null. `encrypted: boolean` already on `pdf.info`.

### Deferred (not on the roadmap without a new ADR)

- **Render page to image** (`render_page_as_image`) — deferred. Would force `pdfjs-dist` as a runtime dep (the serverless bundled build doesn't support render) plus `@napi-rs/canvas`, a native binding. A new ADR if vision becomes a hard requirement.
- **OCR for scanned PDFs** (`tesseract.js`) — deferred, likely to a separate server. Different runtime profile (long, CPU-bound, large WASM).
- **Table extraction** — deferred. Try LLM inference from `pdf.read` `structured:true` Text Items first; a dedicated `pdf.tables` built on position clustering is a future tool only if inference proves insufficient. `pdf-parse` v2 `getTable()` rejected (a second extractor is not worth it).
- **Write-side tools (create/edit/merge/split)** — read-only for now by design; the server is architected to accept write tools later in the same server via a new ADR.

## Out of Scope

- OCR of scanned / image-only PDFs (no text layer). Deferred per Roadmap.
- Fetching PDFs by URL or accepting base64 input. Path-only, by decision.
- Rendering pages to images (vision-model input). Deferred per Roadmap.
- Table detection beyond what raw Text Item positions allow the LLM to infer. Deferred per Roadmap.
- A sandbox/restricted root directory. Path-only is arbitrary-read by design; that's the product.
- HTTP / streamable transport. Stdio only.
- Resources or prompts as MCP capabilities. Tools only.
- PDF creation, editing, merging, splitting, or form filling. Read-only for now; write-side deferred to a future ADR.
- Caching extracted text across calls. Each call re-reads.

## Further Notes

- The `package.json` `bin` field is `pdf`.
- Repo: <https://github.com/jeius/mcp-servers>. A GitHub Issue (label `ready-for-agent`) points at this doc as the execution task.
- ADR-0001 records the unpdf + Node 22 decision. ADR-0002 records the `pdf.*` namespacing decision. `CONTEXT.md` holds the domain glossary (Page, Text, Structured Text, Text Item, Page Range, Encrypted PDF); roadmap-tool terms (Outline, Link, Form Field, Permission, Page Size) will be added lazily as each tool is built.
- MCP SDK v2 notes that drove decisions: `CallToolResult` supports `structuredContent` validated against `outputSchema`; input/output schemas are Zod v4 object schemas (no manual `zod-to-json-schema`); `registerTool(name, config, handler)` replaces v1 `.tool()`; MCP permits dots in tool names.

---

**Status:** Living product document. Source of truth for what this server is and must do. A GitHub Issue (label `ready-for-agent`) is the execution task that points here. Update this doc when the product scope changes; track execution in GitHub Issues, not here.
