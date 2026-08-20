# Plan

Phased roadmap for the PDF MCP Server. Execution status lives in GitHub Issues (label `ready-for-agent`), not here. Update this file when milestones change; update issues when tasks move.

## Phase 0 — Foundation (done)

- [x] Repo scaffold: `package.json` (`@jeius-mcp-servers/pdf`), `tsconfig.json` (strict, ES2022/nodenext), `.gitignore`
- [x] Agent workspace: `AGENTS.md` agent-skills block, `docs/agents/{issue-tracker,domain}.md`, vendored zod/vitest skills + `skills-lock.json`
- [x] Domain glossary: `CONTEXT.md` (Page, Text, Structured Text, Text Item, Page Range, Encrypted PDF)
- [x] Decisions recorded: ADR-0001 (unpdf + Node 22), ADR-0002 (`pdf.*` namespacing)
- [x] Product doc: `docs/PRD.md` (this plan's source of truth)
- [x] Published to GitHub: https://github.com/jeius/mcp-servers

## Phase 1 — Core read tools (next)

Ship the two initial tools specced in `docs/PRD.md`.

- [ ] Add `unpdf` (^1.8.1) dependency; set `engines.node` `>=22` in `package.json`
- [ ] `src/index.ts` — `McpServer` + `StdioServerTransport` entrypoint, registers `pdf.read` + `pdf.info`
- [ ] `pdf.read` — input schema (path/password/pages/structured/maxPages/maxChars), Page Range parser, extraction via `getDocumentProxy` + `extractText`/`extractTextItems`, size caps + truncation note, `structuredContent` + `outputSchema`
- [ ] `pdf.info` — metadata via `getMeta` + permissions via `pdf.getPermissions()` (decode Table 22 bits), `encrypted` flag, omit empties
- [ ] Error handling — try/catch in every handler → `isError: true` results; absolute-path zod refine
- [ ] Fixtures — committed license-clear PDF, non-PDF file, encrypted PDF (known password) under `tests/fixtures/`
- [ ] Tests (Vitest) — tool-handler seam only; coverage priorities per PRD §Testing Decisions
- [ ] `pnpm build` + `pnpm test` green

## Phase 2 — Read-side roadmap tools (no new deps)

- [ ] `pdf.outline` — pdfjs `getOutline()`; flattened `{title, level, page?, url?, bold?, italic?}`; 500-node cap
- [ ] `pdf.search` — literal default, `regex` opt-in; `{totalMatches, matchesReturned, matches:[{page, match, context}]}`; builds on `extractTextItems`
- [ ] `pdf.page_size` — per-page `{page, width, height, rotation, userUnit}` in PDF points; `maxPages` default 500

## Phase 3 — Richer read tools (raw pdfjs, more nuance)

- [ ] `pdf.links` — rich via `page.getAnnotations({intent:'display'})` filtered to `subtype==='Link'`; `{page, url?, destPage?, rect, text?}` (reject shallow `extractLinks`)
- [ ] `pdf.form_fields` — read-only field defs + filled values; `{page, fieldName, fieldType, value, readOnly, required, rect, options?}`; `fieldType` normalized `text|choice|button`; value from `annotationStorage` → fallback `fieldValue`

## Deferred (require a new ADR before starting)

- Render page to image — forces `pdfjs-dist` runtime dep + `@napi-rs/canvas` native binding
- OCR for scanned PDFs (`tesseract.js`) — likely a separate server
- Table extraction — try LLM inference from `pdf.read` `structured:true` first
- Write-side tools (create/edit/merge/split) — read-only for now by design; same server, new ADR governs mutation safety
