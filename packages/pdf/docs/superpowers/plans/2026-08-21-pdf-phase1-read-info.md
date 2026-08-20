# PDF MCP Server — Phase 1 (`pdf.read` + `pdf.info`) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the two initial read-side MCP tools — `pdf.read` (text + structured-text extraction over an optional page range, with per-call size caps) and `pdf.info` (page count, encryption status, permission flags, metadata) — in `packages/pdf`, behind one test seam (the tool handler).

**Architecture:** A single Node stdio process. Three layers, one-way dependency: Transport (`StdioServerTransport`) → Tool layer (one pure-async handler per `pdf.*` tool, `(parsedInput) => Promise<CallToolResult>`, never throws) → PDF layer (the only place that touches `unpdf`/`fs`). The handler is the test seam; the PDF layer is exercised only through it with real fixtures. Source layout: `src/index.ts` (entrypoint), `src/tools/{read,info}.ts` (schemas + handlers), `src/pdf/{proxy,pages,text,meta}.ts` (unpdf/fs wrappers).

**Tech Stack:** Node >=22, TypeScript (strict, ES2022, `nodenext`), ESM. `@modelcontextprotocol/server` ^2.0.0 (`McpServer`, `registerTool`, `StdioServerTransport`, `CallToolResult`). `zod` ^4.4.3 (`zod/v4`) for input/output schemas (SDK derives JSON Schema; no `zod-to-json-schema`). `unpdf` ^1.8.1 (`getDocumentProxy`, `extractText`, `extractTextItems`, `getMeta`; `PDFDocumentProxy.numPages` / `.getPermissions()` / `.getMetadata()`). Vitest ^4.1.11. Biome 2.5.9. pnpm 11.22.0 + Turborepo.

**Spec:** `packages/pdf/docs/PRD.md` (living product spec — the what/why; this plan argues from it). Also read: `packages/pdf/docs/architecture.md` (module boundaries), `packages/pdf/AGENTS.md` (tool contracts), `packages/pdf/CONTEXT.md` (domain terms), `packages/pdf/docs/adr/0001-unpdf-node22.md` + `0002-pdf-namespace.md`, root `AGENTS.md` (cross-cutting rules).

## Global Constraints

(Copied verbatim from the spec / repo rules. Every task's requirements implicitly include these.)

- **No `console.log`.** stdout is reserved for JSON-RPC. Diagnostics go to `console.error` (stderr) only.
- **No comments in code** unless explaining *why* (not *what*). (Root `AGENTS.md`.)
- **Tool handlers never throw to the transport.** Every handler body is wrapped in try/catch; errors become `{ content: [{ type: "text", text }], isError: true }`.
- **Paths are absolute only.** `z.string().refine(p => isAbsolute(p), "Path must be absolute")` on both tool input schemas. Relative paths fail schema validation.
- **Use Zod v4** via `import * as z from "zod/v4"`. Input AND output schemas are Zod object schemas passed to `registerTool`.
- **`pdf.*` namespacing.** Tools are registered as `pdf.read` and `pdf.info`.
- **Omit empty optional fields** in `structuredContent` (never emit `null`). `fontFamily` omitted when `""`; `permissions` omitted when `getPermissions()` returns `null`; metadata fields omitted when absent/empty.
- **No HTTP framework.** stdio only. No native runtime deps. No new ADR needed for Phase 1.
- **Test seam = the tool handler.** Invoke handlers directly with schema-parsed input; assert the `CallToolResult` (`content`, `structuredContent`, `isError`). Use real fixtures, not mocks, for error paths. Do not unit-test the PDF layer or transport. (One justified exception: `shapeItem` in `src/pdf/text.ts` is a pure function tested directly for the empty-`fontFamily` omission, which is unreachable via real fixtures — see Task 4.)
- **Don't commit code that fails `pnpm build` / `pnpm test` / `pnpm lint` / `pnpm check-types`.** Run the package gates before every commit.
- **Node engine floor >=22** (`engines.node` already set in `packages/pdf/package.json`).
- **`unpdf` is already installed** (`^1.8.1` is in `packages/pdf/package.json` `dependencies`). Do not add it. Do not add `pdfjs-dist`.

---

## File Structure

(Created/modified across tasks. Each file has one clear responsibility.)

```
packages/pdf/
├── vitest.config.ts          # MODIFY (Task 1) — remove bogus setupFiles glob
├── src/
│   ├── index.ts              # CREATE (Task 2, MODIFY Task 7) — entrypoint: McpServer + registerTool(pdf.read, pdf.info) + StdioServerTransport
│   ├── tools/
│   │   ├── read.ts           # CREATE (Task 2, EXTEND Tasks 3,4,5,6,9) — readInputSchema, readOutputSchema, readHandler
│   │   └── info.ts           # CREATE (Task 7, EXTEND Tasks 8,9) — infoInputSchema, infoOutputSchema, infoHandler
│   └── pdf/
│       ├── proxy.ts          # CREATE (Task 2, EXTEND Task 6) — loadDocument(path, password?) + error mapping
│       ├── pages.ts          # CREATE (Task 2, EXTEND Tasks 3,5) — parsePageRange, applyMaxPages
│       ├── text.ts           # CREATE (Task 2, EXTEND Tasks 4,5) — extractPagesText, shapeItem, joinPages, truncateChars
│       └── meta.ts           # CREATE (Task 7, EXTEND Task 8) — getDocInfo, decodePermissions
└── tests/
    ├── fixtures.test.ts      # CREATE (Task 1) — fixture validity
    ├── read.test.ts          # CREATE (Task 2, EXTEND Tasks 3,4,5,6)
    ├── info.test.ts          # CREATE (Task 7, EXTEND Task 8)
    ├── text-shape.test.ts    # CREATE (Task 4) — pure shapeItem
    ├── schema.test.ts        # CREATE (Task 9) — relative-path rejection
    └── fixtures/
        ├── generate.py       # CREATE (Task 1) — pypdf fixture generator (dev script; pypdf is a system tool, NOT a project dep)
        ├── sample.pdf        # GENERATED (Task 1) — 2 pages, metadata, committed
        ├── encrypted.pdf     # GENERATED (Task 1) — user password "secret", committed
        └── not-pdf.txt       # GENERATED (Task 1) — plain text, committed
```

**Responsibilities:**

- `src/pdf/proxy.ts` — the ONLY module that reads the filesystem (`fs/promises.readFile`) and calls `getDocumentProxy`. Maps `PasswordException` / `InvalidPDFException` / `ENOENT` to `Error`s with final, user-facing messages (path included). Exports `loadDocument(path, password?)` and `type PdfProxy`.
- `src/pdf/pages.ts` — pure page-range logic. `parsePageRange(pages, totalPages)` → sorted/deduped/clamped `number[]`. `applyMaxPages(list, maxPages, totalPages)` → `{ pages, note }`.
- `src/pdf/text.ts` — text extraction + shaping. `extractPagesText(proxy, pageList, structured)` → `{ pages, text }`. `shapeItem(item)` → `ItemOut` (omits empty `fontFamily`). `joinPages(pages)` → marker-joined text. `truncateChars(pages, maxChars)` → `{ pages, note }` (lockstep: only fully-included pages kept).
- `src/pdf/meta.ts` — `getDocInfo(proxy)` → `DocInfo` (pages, encrypted derived from `getPermissions() !== null`, permissions decoded, metadata picked from the pdfjs `info` record with empties omitted). `decodePermissions(flags)` → `Permissions` (PDF 32000-1 Table 22 bits).
- `src/tools/read.ts` — `readInputSchema` / `readOutputSchema` (Zod) + `readHandler(args)` (the seam). Orchestrates proxy → pages → text → caps → `CallToolResult`.
- `src/tools/info.ts` — `infoInputSchema` / `infoOutputSchema` + `infoHandler(args)`. Orchestrates proxy → meta → `CallToolResult`.
- `src/index.ts` — constructs `McpServer({ name: "pdf", version: "1.0.0" })`, registers both tools, connects `StdioServerTransport`. Reads nothing from argv.

---

## Conventions used in every task

- **Run package gates before committing.**:
  - `pnpm test --filter=@jeius-mcp-servers/pdf` (vitest run)
  - `pnpm check-types --filter=@jeius-mcp-servers/pdf` (tsc --noEmit, src only)
  - `pnpm lint --filter=@jeius-mcp-servers/pdf` (biome lint)
  - `pnpm build --filter=@jeius-mcp-servers/pdf` (tsc --project tsconfig.build.json && chmod 755 build/index.js)
- **Tests import `{ describe, it, expect } from "vitest"`** (explicit — Biome's `noUndeclaredVariables: error` rejects globals). `vitest.config.ts` has `globals: true` but we do not rely on it.
- **Tests call handlers with schema-parsed input** so Zod defaults apply (the SDK applies defaults before calling the handler in production): `const args = readInputSchema.parse({ path: ... })`.
- **Fixture paths** in tests: `const fixture = (name) => join(dirname(fileURLToPath(import.meta.url)), "fixtures", name)`.
- **Commit message style:** the repo uses `chore:` / `feat:` Conventional Commits (see `git log --oneline`). One commit per task, scoped to that task's files.

---

## Task 1: Test harness + fixtures

**Files:**

- Modify: `packages/pdf/vitest.config.ts`
- Create: `packages/pdf/tests/fixtures/generate.py`
- Create: `packages/pdf/tests/fixtures.test.ts`
- Generated (committed): `packages/pdf/tests/fixtures/sample.pdf`, `encrypted.pdf`, `not-pdf.txt`

**Interfaces:** Produces none (no src yet). Establishes the fixtures every later task consumes.

- [ ] **Step 1: Fix `vitest.config.ts`** — the existing `setupFiles: ["test/**/**"]` is a bogus glob (there is no `test/` dir; we use `tests/`, and there are no setup files). Remove it so the harness is clean. Replace the whole file with:

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    reporters: ['default', 'blob'],
    outputFile: {
      blob: 'coverage/blob/report.json',
    },
    passWithNoTests: true,
  },
});
```

- [ ] **Step 2: Write the failing fixture-validity test**

Create `packages/pdf/tests/fixtures.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const fixture = (name: string) => join(here, 'fixtures', name);

describe('fixtures', () => {
  it('sample.pdf is a valid PDF', async () => {
    const bytes = await readFile(fixture('sample.pdf'));
    expect(bytes.subarray(0, 5).toString('latin1')).toBe('%PDF-');
  });

  it('encrypted.pdf is a valid PDF', async () => {
    const bytes = await readFile(fixture('encrypted.pdf'));
    expect(bytes.subarray(0, 5).toString('latin1')).toBe('%PDF-');
  });

  it('not-pdf.txt is not a PDF', async () => {
    const bytes = await readFile(fixture('not-pdf.txt'));
    expect(bytes.subarray(0, 5).toString('latin1')).not.toBe('%PDF-');
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run (from `packages/pdf/`): `pnpm test`
Expected: FAIL — `ENOENT: no such file .../tests/fixtures/sample.pdf` (fixtures not generated yet).

- [ ] **Step 4: Create the fixture generator**

Create `packages/pdf/tests/fixtures/generate.py`. This uses **pypdf** (already installed system-wide as `pypdf 6.16.1`; it is a dev/build convenience, NOT a project dependency — do not add it to `package.json`). It builds a 2-page PDF with a Helvetica text layer and metadata, an encrypted clone (user password `secret`), and a non-PDF text file:

```python
from pypdf import PdfWriter
from pypdf.generic import (
    DecodedStreamObject,
    DictionaryObject,
    NameObject,
)


def make_page_resources():
    font = DictionaryObject(
        {
            NameObject("/Type"): NameObject("/Font"),
            NameObject("/Subtype"): NameObject("/Type1"),
            NameObject("/BaseFont"): NameObject("/Helvetica"),
        }
    )
    return DictionaryObject(
        {NameObject("/Font"): DictionaryObject({NameObject("/F1"): font})}
    )


def make_contents(text):
    contents = DecodedStreamObject()
    contents.set_data(f"BT /F1 12 Tf 72 720 Td ({text}) Tj ET\n".encode("latin-1"))
    return contents


w = PdfWriter()
for label in ["Page one content", "Page two content"]:
    page = w.add_blank_page(width=612, height=792)
    page[NameObject("/Resources")] = make_page_resources()
    page[NameObject("/Contents")] = w._add_object(make_contents(label))

w.add_metadata(
    {
        "/Title": "Sample PDF",
        "/Author": "Test Author",
        "/Subject": "Testing",
        "/Keywords": "foo, bar, baz",
        "/Creator": "TestCreator",
    }
)
with open("tests/fixtures/sample.pdf", "wb") as f:
    w.write(f)

w2 = PdfWriter(clone_from="tests/fixtures/sample.pdf")
w2.encrypt(user_password="secret", owner_password="secret")
with open("tests/fixtures/encrypted.pdf", "wb") as f:
    w2.write(f)

with open("tests/fixtures/not-pdf.txt", "wb") as f:
    f.write(b"this is not a pdf at all\n")

print("OK")
```

- [ ] **Step 5: Generate the fixtures**

Run (from `packages/pdf/`): `python3 tests/fixtures/generate.py`
Expected: prints `OK`; `tests/fixtures/sample.pdf`, `encrypted.pdf`, `not-pdf.txt` now exist.
(Verified behavior: `sample.pdf` → `unpdf.extractText` yields `{ totalPages: 2, text: ["Page one content", "Page two content"] }`; `getMeta().info` has `Title/Author/Subject/Keywords/Creator/Producer`; `encrypted.pdf` without password throws `PasswordException` code 1, with `secret` succeeds, with `wrong` throws code 2; `not-pdf.txt` throws `InvalidPDFException`.)

- [ ] **Step 6: Run the test to verify it passes**

Run: `pnpm test`
Expected: PASS — 3 fixtures valid.

- [ ] **Step 7: Lint + typecheck + build**

Run: `pnpm lint && pnpm check-types && pnpm build`
Expected: all clean (lint 0 errors; check-types 0 errors; build emits `build/index.js`).

- [ ] **Step 8: Commit**

```bash
git add packages/pdf/vitest.config.ts packages/pdf/tests/
git commit -m "test: add pdf fixtures and clean vitest harness"
```

---

## Task 2: `pdf.read` — happy path (all pages, text only)

**Files:**

- Create: `packages/pdf/src/pdf/proxy.ts`, `packages/pdf/src/pdf/pages.ts`, `packages/pdf/src/pdf/text.ts`
- Create: `packages/pdf/src/tools/read.ts`
- Create: `packages/pdf/src/index.ts`
- Create: `packages/pdf/tests/read.test.ts`

**Interfaces:**

- Consumes: `unpdf` (`getDocumentProxy`, `extractText`, `extractTextItems`, `StructuredTextItem`), `@modelcontextprotocol/server` (`McpServer`, `CallToolResult`), `@modelcontextprotocol/server/stdio` (`StdioServerTransport`), `zod/v4`, `node:fs/promises`, `node:path`.
- Produces:
  - `src/pdf/proxy.ts`: `export type PdfProxy = Awaited<ReturnType<typeof getDocumentProxy>>;` and `export async function loadDocument(path: string, password?: string): Promise<PdfProxy>`
  - `src/pdf/pages.ts`: `export function parsePageRange(pages: string | undefined, totalPages: number): number[]` and `export function applyMaxPages(pageList: number[], maxPages: number, totalPages: number): { pages: number[]; note: string | null }`
  - `src/pdf/text.ts`: `export interface PageOut { page: number; text: string; items?: ItemOut[] }`, `export interface ItemOut { str: string; x: number; y: number; width: number; height: number; fontSize: number; fontFamily?: string; dir: string; hasEOL: boolean }`, `export async function extractPagesText(proxy: PdfProxy, pageList: number[], structured: boolean): Promise<{ pages: PageOut[]; text: string }>`, `export function shapeItem(it: StructuredTextItem): ItemOut`, `export function joinPages(pages: PageOut[]): string`, `export function truncateChars(pages: PageOut[], maxChars: number): { pages: PageOut[]; note: string | null }`
  - `src/tools/read.ts`: `export const readInputSchema`, `export const readOutputSchema`, `export type ReadInput = z.infer<typeof readInputSchema>`, `export async function readHandler(args: ReadInput): Promise<CallToolResult>`

- [ ] **Step 1: Write the failing happy-path test**

Create `packages/pdf/tests/read.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { readInputSchema, readHandler } from '../src/tools/read.js';

const here = dirname(fileURLToPath(import.meta.url));
const fixture = (name: string) => join(here, 'fixtures', name);

describe('pdf.read happy path', () => {
  it('extracts all pages with page markers and structuredContent', async () => {
    const args = readInputSchema.parse({ path: fixture('sample.pdf') });
    const result = await readHandler(args);

    expect(result.isError).not.toBe(true);

    const text = result.content[0].text;
    expect(text).toContain('--- Page 1 ---');
    expect(text).toContain('Page one content');
    expect(text).toContain('--- Page 2 ---');
    expect(text).toContain('Page two content');

    const sc = result.structuredContent as {
      totalPages: number;
      pagesReturned: number;
      pages: { page: number; text: string; items?: unknown[] }[];
    };
    expect(sc.totalPages).toBe(2);
    expect(sc.pagesReturned).toBe(2);
    expect(sc.pages).toHaveLength(2);
    expect(sc.pages[0].page).toBe(1);
    expect(sc.pages[0].text).toBe('Page one content');
    expect(sc.pages[0].items).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm test`
Expected: FAIL — `Failed to resolve import "../src/tools/read.js"` (module does not exist).

- [ ] **Step 3: Create `src/pdf/proxy.ts`**

```ts
import { readFile } from 'node:fs/promises';
import { getDocumentProxy } from 'unpdf';

const PASSWORD_NEEDED = 1;
const PASSWORD_INCORRECT = 2;

export type PdfProxy = Awaited<ReturnType<typeof getDocumentProxy>>;

export async function loadDocument(path: string, password?: string): Promise<PdfProxy> {
  let buffer: Buffer;
  try {
    buffer = await readFile(path);
  } catch (err) {
    const e = err as NodeJS.ErrnoException;
    if (e?.code === 'ENOENT') throw new Error(`File not found: ${path}`);
    throw new Error(`Cannot read file: ${path} (${(err as Error).message})`);
  }
  try {
    return await getDocumentProxy(new Uint8Array(buffer), password ? { password } : {});
  } catch (err) {
    const e = err as Error & { code?: number };
    if (e.name === 'PasswordException') {
      if (e.code === PASSWORD_NEEDED) throw new Error('PDF is encrypted; provide a password');
      if (e.code === PASSWORD_INCORRECT) throw new Error('Incorrect password for encrypted PDF');
      throw new Error(`Password error: ${e.message ?? 'unknown'}`);
    }
    if (e.name === 'InvalidPDFException') throw new Error(`File is not a valid PDF: ${path}`);
    throw err;
  }
}
```

- [ ] **Step 4: Create `src/pdf/pages.ts`**

```ts
export function parsePageRange(pages: string | undefined, totalPages: number): number[] {
  if (pages === undefined || pages.trim() === '') return range(1, totalPages);
  const result = new Set<number>();
  for (const token of pages.split(',')) {
    const t = token.trim();
    if (t === '') continue;
    const rangeMatch = /^(\d+)-(\d+)$/.exec(t);
    if (rangeMatch) {
      const start = Number.parseInt(rangeMatch[1], 10);
      const end = Number.parseInt(rangeMatch[2], 10);
      if (start < 1 || end < start) throw new Error(`Invalid page range: ${t}`);
      for (let p = start; p <= end; p++) result.add(p);
    } else if (/^\d+$/.test(t)) {
      const p = Number.parseInt(t, 10);
      if (p < 1) throw new Error(`Invalid page number: ${t}`);
      result.add(p);
    } else {
      throw new Error(`Invalid page range: ${t}`);
    }
  }
  return [...result].filter((p) => p <= totalPages).sort((a, b) => a - b);
}

function range(start: number, end: number): number[] {
  const out: number[] = [];
  for (let p = start; p <= end; p++) out.push(p);
  return out;
}

export function applyMaxPages(
  pageList: number[],
  maxPages: number,
  totalPages: number,
): { pages: number[]; note: string | null } {
  if (pageList.length <= maxPages) return { pages: pageList, note: null };
  const shown = pageList.slice(0, maxPages);
  const first = shown[0];
  const last = shown[shown.length - 1];
  return { pages: shown, note: `[truncated, pages ${first}-${last} of ${totalPages} shown]` };
}
```

- [ ] **Step 5: Create `src/pdf/text.ts`**

```ts
import { extractText, extractTextItems, type StructuredTextItem } from 'unpdf';
import type { PdfProxy } from './proxy.js';

export interface ItemOut {
  str: string;
  x: number;
  y: number;
  width: number;
  height: number;
  fontSize: number;
  fontFamily?: string;
  dir: string;
  hasEOL: boolean;
}

export interface PageOut {
  page: number;
  text: string;
  items?: ItemOut[];
}

export interface ExtractResult {
  pages: PageOut[];
  text: string;
}

export async function extractPagesText(
  proxy: PdfProxy,
  pageList: number[],
  structured: boolean,
): Promise<ExtractResult> {
  if (pageList.length === 0) return { pages: [], text: '' };
  const { text } = await extractText(proxy);
  const arr = Array.isArray(text) ? text : [text];
  let itemsPages: StructuredTextItem[][] | null = null;
  if (structured) {
    const r = await extractTextItems(proxy);
    itemsPages = r.items;
  }
  const pages: PageOut[] = pageList.map((p) => {
    const page: PageOut = { page: p, text: arr[p - 1] ?? '' };
    if (structured && itemsPages) page.items = itemsPages[p - 1].map(shapeItem);
    return page;
  });
  return { pages, text: joinPages(pages) };
}

export function shapeItem(it: StructuredTextItem): ItemOut {
  const out: ItemOut = {
    str: it.str,
    x: it.x,
    y: it.y,
    width: it.width,
    height: it.height,
    fontSize: it.fontSize,
    dir: it.dir,
    hasEOL: it.hasEOL,
  };
  if (it.fontFamily !== '') out.fontFamily = it.fontFamily;
  return out;
}

export function joinPages(pages: PageOut[]): string {
  return pages.map((p) => `--- Page ${p.page} ---\n${p.text}`).join('\n\n');
}

export function truncateChars(
  pages: PageOut[],
  maxChars: number,
): { pages: PageOut[]; note: string | null } {
  if (pages.length === 0 || joinPages(pages).length <= maxChars) {
    return { pages, note: null };
  }
  let len = 0;
  let count = 0;
  for (let i = 0; i < pages.length; i++) {
    const seg = `--- Page ${pages[i].page} ---\n${pages[i].text}`;
    const add = i === 0 ? seg.length : seg.length + 2;
    if (len + add > maxChars) break;
    len += add;
    count++;
  }
  return { pages: pages.slice(0, count), note: `[truncated at ${maxChars} characters]` };
}
```

- [ ] **Step 6: Create `src/tools/read.ts`**

```ts
import * as z from 'zod/v4';
import type { CallToolResult } from '@modelcontextprotocol/server';
import { loadDocument } from '../pdf/proxy.js';
import { applyMaxPages, parsePageRange } from '../pdf/pages.js';
import { extractPagesText, joinPages, truncateChars } from '../pdf/text.js';

export const readInputSchema = z.object({
  path: z.string(),
  password: z.string().optional(),
  pages: z.string().optional(),
  structured: z.boolean().default(false),
  maxPages: z.number().default(50),
  maxChars: z.number().default(200000),
});

export const readOutputSchema = z.object({
  totalPages: z.number(),
  pagesReturned: z.number(),
  pages: z.array(
    z.object({
      page: z.number(),
      text: z.string(),
      items: z
        .array(
          z.object({
            str: z.string(),
            x: z.number(),
            y: z.number(),
            width: z.number(),
            height: z.number(),
            fontSize: z.number(),
            fontFamily: z.string().optional(),
            dir: z.string(),
            hasEOL: z.boolean(),
          }),
        )
        .optional(),
    }),
  ),
});

export type ReadInput = z.infer<typeof readInputSchema>;

export async function readHandler(args: ReadInput): Promise<CallToolResult> {
  try {
    const proxy = await loadDocument(args.path, args.password);
    const totalPages = proxy.numPages;
    const pageList = parsePageRange(args.pages, totalPages);
    const capped = applyMaxPages(pageList, args.maxPages, totalPages);
    const { pages } = await extractPagesText(proxy, capped.pages, args.structured);
    const { pages: finalPages, note: charNote } = truncateChars(pages, args.maxChars);
    const fullText = joinPages(capped.pages.length === finalPages.length ? finalPages : pages);
    const truncatedText = fullText.slice(0, args.maxChars);
    const notes = [capped.note, charNote].filter((n): n is string => n !== null).join(' ');
    const contentText = notes ? `${truncatedText}\n\n${notes}` : truncatedText;
    return {
      content: [{ type: 'text', text: contentText }],
      structuredContent: {
        totalPages,
        pagesReturned: finalPages.length,
        pages: finalPages,
      },
    };
  } catch (err) {
    return { content: [{ type: 'text', text: (err as Error).message }], isError: true };
  }
}
```

> Note on `fullText`: when the char-cap dropped trailing pages, we build the content text from the full (pre-char-cap) page set, sliced to `maxChars`, so the truncation note is accurate ("truncated at N characters"). `structuredContent.pages` is the lockstep-truncated `finalPages` (only fully-included pages). When no char-cap fires, `finalPages === pages` and `truncatedText === fullText`.

- [ ] **Step 7: Create `src/index.ts`** (entrypoint; registers `pdf.read` only for now — `pdf.info` is added in Task 7)

```ts
#!/usr/bin/env node
import { McpServer } from '@modelcontextprotocol/server';
import { StdioServerTransport } from '@modelcontextprotocol/server/stdio';
import { readHandler, readInputSchema, readOutputSchema } from './tools/read.js';

const server = new McpServer({ name: 'pdf', version: '1.0.0' });

server.registerTool(
  'pdf.read',
  {
    description:
      'Extract text (and optionally structured per-item positions) from a local PDF, over an optional page range, with per-call size caps.',
    inputSchema: readInputSchema,
    outputSchema: readOutputSchema,
  },
  readHandler,
);

const transport = new StdioServerTransport();
await server.connect(transport);
```

- [ ] **Step 8: Run the test to verify it passes**

Run: `pnpm test`
Expected: PASS — happy-path assertions hold (`totalPages=2`, both pages, markers present, `items` undefined).

- [ ] **Step 9: Lint + typecheck + build**

Run: `pnpm lint && pnpm check-types && pnpm build`
Expected: all clean. If `check-types` flags a `registerTool` type mismatch on the handler (the SDK's `ToolCallback` vs `(args: ReadInput) => ...`), adjust the handler parameter type to match `z.infer<typeof readInputSchema>` exactly — do not loosen the schema.

- [ ] **Step 10: Commit**

```bash
git add packages/pdf/src/ packages/pdf/tests/read.test.ts
git commit -m "feat(pdf): add pdf.read tool (text extraction, page range, size caps)"
```

---

## Task 3: `pdf.read` — page range selection + out-of-range clamping

**Files:**

- Modify: `packages/pdf/tests/read.test.ts` (append cases)
- No source change expected (`parsePageRange` already supports ranges from Task 2 — this task verifies it via failing tests first; if a case fails, fix `pages.ts`).

**Interfaces:** Consumes `parsePageRange` (Task 2). Produces nothing new.

- [ ] **Step 1: Append failing tests to `tests/read.test.ts`** (add inside a new `describe` block at the end of the file):

```ts
describe('pdf.read page range', () => {
  it('selects a single page', async () => {
    const args = readInputSchema.parse({ path: fixture('sample.pdf'), pages: '1' });
    const result = await readHandler(args);
    const sc = result.structuredContent as { pagesReturned: number; pages: { page: number }[] };
    expect(sc.pagesReturned).toBe(1);
    expect(sc.pages[0].page).toBe(1);
    expect(result.content[0].text).toContain('Page one content');
    expect(result.content[0].text).not.toContain('Page two content');
  });

  it('selects a comma list', async () => {
    const args = readInputSchema.parse({ path: fixture('sample.pdf'), pages: '1,2' });
    const result = await readHandler(args);
    expect((result.structuredContent as { pagesReturned: number }).pagesReturned).toBe(2);
  });

  it('selects and clamps a range that overshoots totalPages', async () => {
    const args = readInputSchema.parse({ path: fixture('sample.pdf'), pages: '1-3' });
    const result = await readHandler(args);
    expect((result.structuredContent as { pagesReturned: number }).pagesReturned).toBe(2);
  });

  it('returns zero pages when every requested page is out of range', async () => {
    const args = readInputSchema.parse({ path: fixture('sample.pdf'), pages: '5' });
    const result = await readHandler(args);
    const sc = result.structuredContent as { pagesReturned: number; pages: unknown[] };
    expect(sc.pagesReturned).toBe(0);
    expect(sc.pages).toHaveLength(0);
  });

  it('rejects an invalid page range with isError', async () => {
    const args = readInputSchema.parse({ path: fixture('sample.pdf'), pages: 'abc' });
    const result = await readHandler(args);
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('Invalid page range');
  });
});
```

- [ ] **Step 2: Run the tests to verify behavior**

Run: `pnpm test`
Expected: PASS (all five). `parsePageRange` from Task 2 already implements ranges, comma lists, clamping, empty-result, and the `Invalid page range` throw (caught by the handler → `isError`). If any fail, fix `src/pdf/pages.ts` `parsePageRange` — do not change the tests.

- [ ] **Step 3: Lint + typecheck + build**

Run: `pnpm lint && pnpm check-types && pnpm build`
Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add packages/pdf/tests/read.test.ts packages/pdf/src/pdf/pages.ts
git commit -m "test(pdf): cover pdf.read page-range selection and clamping"
```

---

## Task 4: `pdf.read` — structured items + `fontFamily` shaping

**Files:**

- Modify: `packages/pdf/tests/read.test.ts` (append structured cases)
- Create: `packages/pdf/tests/text-shape.test.ts` (pure `shapeItem`)
- No source change expected (`extractPagesText` structured path + `shapeItem` exist from Task 2 — this verifies them; fix `text.ts` if a case fails).

**Interfaces:** Consumes `shapeItem`, `extractPagesText` (Task 2).

- [ ] **Step 1: Append failing structured tests to `tests/read.test.ts`**:

```ts
describe('pdf.read structured text', () => {
  it('returns items with position/font/direction when structured:true', async () => {
    const args = readInputSchema.parse({ path: fixture('sample.pdf'), structured: true });
    const result = await readHandler(args);
    const sc = result.structuredContent as {
      pages: { items?: { str: string; x: number; y: number; dir: string; hasEOL: boolean; fontFamily?: string }[] }[];
    };
    const item = sc.pages[0].items![0];
    expect(item.str).toBe('Page one content');
    expect(item.x).toBe(72);
    expect(item.y).toBe(720);
    expect(item.dir).toBe('ltr');
    expect(item.hasEOL).toBe(false);
    expect(item.fontFamily).toBe('sans-serif');
  });

  it('omits items when structured:false', async () => {
    const args = readInputSchema.parse({ path: fixture('sample.pdf'), structured: false });
    const result = await readHandler(args);
    const sc = result.structuredContent as { pages: { items?: unknown[] }[] };
    expect(sc.pages[0].items).toBeUndefined();
  });
});
```

- [ ] **Step 2: Create the failing pure-shape test `tests/text-shape.test.ts`** (the empty-`fontFamily` omission is unreachable via real fixtures — pdfjs resolves every standard/unknown Type1 font to `"sans-serif"` — so we test the pure shaper directly):

```ts
import { describe, it, expect } from 'vitest';
import { shapeItem } from '../src/pdf/text.js';

describe('shapeItem', () => {
  it('omits fontFamily when empty', () => {
    const out = shapeItem({
      str: 'x',
      x: 1,
      y: 2,
      width: 3,
      height: 4,
      fontSize: 5,
      fontFamily: '',
      dir: 'ltr',
      hasEOL: false,
    });
    expect('fontFamily' in out).toBe(false);
  });

  it('keeps fontFamily when non-empty', () => {
    const out = shapeItem({
      str: 'x',
      x: 1,
      y: 2,
      width: 3,
      height: 4,
      fontSize: 5,
      fontFamily: 'sans-serif',
      dir: 'ltr',
      hasEOL: false,
    });
    expect(out.fontFamily).toBe('sans-serif');
  });
});
```

- [ ] **Step 3: Run the tests**

Run: `pnpm test`
Expected: PASS. If the structured assertions fail (e.g. `fontFamily` is `undefined` instead of `"sans-serif"`, or `items` missing), fix `src/pdf/text.ts` `extractPagesText`/`shapeItem` — not the tests.

- [ ] **Step 4: Lint + typecheck + build**

Run: `pnpm lint && pnpm check-types && pnpm build`
Expected: clean.

- [ ] **Step 5: Commit**

```bash
git add packages/pdf/tests/read.test.ts packages/pdf/tests/text-shape.test.ts packages/pdf/src/pdf/text.ts
git commit -m "test(pdf): cover pdf.read structured items and fontFamily shaping"
```

---

## Task 5: `pdf.read` — size caps (`maxPages`, `maxChars`) + truncation notes

**Files:**

- Modify: `packages/pdf/tests/read.test.ts` (append cap cases)
- No source change expected (`applyMaxPages` + `truncateChars` exist from Task 2 — verifies them; fix `pages.ts`/`text.ts`/`read.ts` if a case fails).

**Interfaces:** Consumes `applyMaxPages`, `truncateChars`, `joinPages` (Task 2).

- [ ] **Step 1: Append failing cap tests to `tests/read.test.ts`**:

```ts
describe('pdf.read size caps', () => {
  it('caps extracted pages at maxPages and appends a page-truncation note', async () => {
    const args = readInputSchema.parse({ path: fixture('sample.pdf'), maxPages: 1 });
    const result = await readHandler(args);
    const sc = result.structuredContent as { pagesReturned: number; pages: { page: number }[] };
    expect(sc.pagesReturned).toBe(1);
    expect(sc.pages[0].page).toBe(1);
    expect(result.content[0].text).toContain('[truncated, pages 1-1 of 2 shown]');
    expect(result.content[0].text).not.toContain('Page two content');
  });

  it('caps total characters at maxChars and appends a char-truncation note', async () => {
    const args = readInputSchema.parse({ path: fixture('sample.pdf'), maxChars: 33 });
    const result = await readHandler(args);
    const sc = result.structuredContent as { pagesReturned: number; pages: { page: number }[] };
    expect(sc.pagesReturned).toBe(1);
    expect(sc.pages[0].page).toBe(1);
    expect(result.content[0].text).toContain('Page one content');
    expect(result.content[0].text).not.toContain('Page two content');
    expect(result.content[0].text).toContain('[truncated at 33 characters]');
  });
});
```

- [ ] **Step 2: Run the tests**

Run: `pnpm test`
Expected: PASS. The 2-page fixture with `maxPages:1` yields `pages 1-1 of 2 shown`; with `maxChars:33`, page 1's segment (`--- Page 1 ---\nPage one content`, 32 chars) fits but page 2's does not, so `pagesReturned=1` and the note fires. If a note string or count mismatches, fix the cap logic in `src/pdf/pages.ts` / `src/pdf/text.ts` / `src/tools/read.ts` — not the tests.

- [ ] **Step 3: Lint + typecheck + build**

Run: `pnpm lint && pnpm check-types && pnpm build`
Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add packages/pdf/tests/read.test.ts packages/pdf/src/
git commit -m "test(pdf): cover pdf.read maxPages and maxChars truncation"
```

---

## Task 6: `pdf.read` — error paths (missing / not-a-PDF / encrypted / wrong password)

**Files:**

- Modify: `packages/pdf/tests/read.test.ts` (append error cases)
- Source: `src/pdf/proxy.ts` error mapping already exists from Task 2; this task verifies it. If any case fails, fix `proxy.ts` — not the tests.

**Interfaces:** Consumes `loadDocument` error mapping (Task 2).

- [ ] **Step 1: Append failing error tests to `tests/read.test.ts`**:

```ts
describe('pdf.read error paths', () => {
  it('returns isError for a missing file', async () => {
    const args = readInputSchema.parse({ path: fixture('does-not-exist.pdf') });
    const result = await readHandler(args);
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('not found');
  });

  it('returns isError for a non-PDF file', async () => {
    const args = readInputSchema.parse({ path: fixture('not-pdf.txt') });
    const result = await readHandler(args);
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('not a valid PDF');
  });

  it('returns isError for an encrypted PDF without a password', async () => {
    const args = readInputSchema.parse({ path: fixture('encrypted.pdf') });
    const result = await readHandler(args);
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('encrypted');
  });

  it('returns isError for an encrypted PDF with the wrong password', async () => {
    const args = readInputSchema.parse({ path: fixture('encrypted.pdf'), password: 'wrong' });
    const result = await readHandler(args);
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('Incorrect password');
  });

  it('reads an encrypted PDF with the correct password', async () => {
    const args = readInputSchema.parse({ path: fixture('encrypted.pdf'), password: 'secret' });
    const result = await readHandler(args);
    expect(result.isError).not.toBe(true);
    expect(result.content[0].text).toContain('Page one content');
  });
});
```

- [ ] **Step 2: Run the tests**

Run: `pnpm test`
Expected: PASS. `loadDocument` maps `ENOENT`→`File not found`, `InvalidPDFException`→`not a valid PDF`, `PasswordException` code 1→`encrypted`, code 2→`Incorrect password`; the correct-password case succeeds. If a message mismatches, fix `src/pdf/proxy.ts` — not the tests.

- [ ] **Step 3: Lint + typecheck + build**

Run: `pnpm lint && pnpm check-types && pnpm build`
Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add packages/pdf/tests/read.test.ts packages/pdf/src/pdf/proxy.ts
git commit -m "test(pdf): cover pdf.read error paths and encrypted-password handling"
```

---

## Task 7: `pdf.info` — happy path (pages, encrypted, metadata, permissions, empty-field omission)

**Files:**

- Create: `packages/pdf/src/pdf/meta.ts`
- Create: `packages/pdf/src/tools/info.ts`
- Modify: `packages/pdf/src/index.ts` (register `pdf.info`)
- Create: `packages/pdf/tests/info.test.ts`

**Interfaces:**

- Consumes: `unpdf` (`getMeta`), `PdfProxy` (Task 2: `proxy.numPages`, `proxy.getPermissions()`).
- Produces:
  - `src/pdf/meta.ts`: `export interface Permissions { printing: boolean; modifying: boolean; extracting: boolean; annotationsAndForms: boolean; fillForms: boolean; accessibility: boolean; assemble: boolean; highQualityPrint: boolean }`, `export interface DocInfo { pages: number; encrypted: boolean; permissions?: Permissions; title?: string; author?: string; subject?: string; keywords?: string[]; creator?: string; producer?: string; creationDate?: string; modDate?: string }`, `export function decodePermissions(flags: number[]): Permissions`, `export async function getDocInfo(proxy: PdfProxy): Promise<DocInfo>`
  - `src/tools/info.ts`: `export const infoInputSchema`, `export const infoOutputSchema`, `export type InfoInput = z.infer<typeof infoInputSchema>`, `export async function infoHandler(args: InfoInput): Promise<CallToolResult>`

- [ ] **Step 1: Write the failing `pdf.info` happy-path test**

Create `packages/pdf/tests/info.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { infoInputSchema, infoHandler } from '../src/tools/info.js';

const here = dirname(fileURLToPath(import.meta.url));
const fixture = (name: string) => join(here, 'fixtures', name);

describe('pdf.info happy path', () => {
  it('returns pages, encrypted=false, metadata, and omits absent/empty fields', async () => {
    const args = infoInputSchema.parse({ path: fixture('sample.pdf') });
    const result = await infoHandler(args);

    expect(result.isError).not.toBe(true);

    const sc = result.structuredContent as Record<string, unknown>;
    expect(sc.pages).toBe(2);
    expect(sc.encrypted).toBe(false);
    expect('permissions' in sc).toBe(false);
    expect(sc.title).toBe('Sample PDF');
    expect(sc.author).toBe('Test Author');
    expect(sc.subject).toBe('Testing');
    expect(sc.keywords).toEqual(['foo', 'bar', 'baz']);
    expect(sc.creator).toBe('TestCreator');
    expect(sc.producer).toBe('pypdf');
    expect('creationDate' in sc).toBe(false);
    expect('modDate' in sc).toBe(false);

    const text = result.content[0].text;
    expect(text).toContain('Pages: 2');
    expect(text).toContain('Encrypted: no');
    expect(text).toContain('Title: Sample PDF');
    expect(text).toContain('Keywords: foo, bar, baz');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm test`
Expected: FAIL — `Failed to resolve import "../src/tools/info.js"`.

- [ ] **Step 3: Create `src/pdf/meta.ts`**

```ts
import { getMeta } from 'unpdf';
import type { PdfProxy } from './proxy.js';

export interface Permissions {
  printing: boolean;
  modifying: boolean;
  extracting: boolean;
  annotationsAndForms: boolean;
  fillForms: boolean;
  accessibility: boolean;
  assemble: boolean;
  highQualityPrint: boolean;
}

export interface DocInfo {
  pages: number;
  encrypted: boolean;
  permissions?: Permissions;
  title?: string;
  author?: string;
  subject?: string;
  keywords?: string[];
  creator?: string;
  producer?: string;
  creationDate?: string;
  modDate?: string;
}

const PERM_BITS = {
  printing: 4,
  modifying: 8,
  extracting: 16,
  annotationsAndForms: 32,
  fillForms: 256,
  accessibility: 512,
  assemble: 1024,
  highQualityPrint: 2048,
} as const;

export function decodePermissions(flags: number[]): Permissions {
  return {
    printing: flags.includes(PERM_BITS.printing),
    modifying: flags.includes(PERM_BITS.modifying),
    extracting: flags.includes(PERM_BITS.extracting),
    annotationsAndForms: flags.includes(PERM_BITS.annotationsAndForms),
    fillForms: flags.includes(PERM_BITS.fillForms),
    accessibility: flags.includes(PERM_BITS.accessibility),
    assemble: flags.includes(PERM_BITS.assemble),
    highQualityPrint: flags.includes(PERM_BITS.highQualityPrint),
  };
}

export async function getDocInfo(proxy: PdfProxy): Promise<DocInfo> {
  const perms = await proxy.getPermissions();
  const encrypted = perms !== null;
  const { info } = await getMeta(proxy);
  const docInfo: DocInfo = { pages: proxy.numPages, encrypted };
  if (perms !== null) docInfo.permissions = decodePermissions(perms);
  setStr(info.Title, (v) => (docInfo.title = v));
  setStr(info.Author, (v) => (docInfo.author = v));
  setStr(info.Subject, (v) => (docInfo.subject = v));
  setStr(info.Creator, (v) => (docInfo.creator = v));
  setStr(info.Producer, (v) => (docInfo.producer = v));
  setStr(info.CreationDate, (v) => (docInfo.creationDate = v));
  setStr(info.ModDate, (v) => (docInfo.modDate = v));
  setStr(info.Keywords, (v) => {
    const kws = v.split(',').map((s) => s.trim()).filter(Boolean);
    if (kws.length > 0) docInfo.keywords = kws;
  });
  return docInfo;
}

function setStr(value: unknown, set: (v: string) => void): void {
  if (typeof value === 'string' && value !== '') set(value);
}
```

> `info` is pdfjs's info record (type `Record<string, any>`). It mixes standard metadata keys (`Title`, `Author`, `Subject`, `Keywords`, `Creator`, `Producer`, `CreationDate`, `ModDate`) with pdfjs-internal keys (`PDFFormatVersion`, `IsAcroFormPresent`, `EncryptFilterName`, …). We deliberately pick ONLY the 8 documented metadata keys and omit empties — never expose the internal keys. `encrypted` is derived from `getPermissions() !== null` (permissions only exist on encrypted documents; this correctly flags docs encrypted with an empty user password that open without a password).

- [ ] **Step 4: Create `src/tools/info.ts`**

```ts
import * as z from 'zod/v4';
import type { CallToolResult } from '@modelcontextprotocol/server';
import { loadDocument } from '../pdf/proxy.js';
import { getDocInfo, type DocInfo } from '../pdf/meta.js';

export const infoInputSchema = z.object({
  path: z.string(),
  password: z.string().optional(),
});

export const infoOutputSchema = z.object({
  pages: z.number(),
  encrypted: z.boolean(),
  permissions: z
    .object({
      printing: z.boolean(),
      modifying: z.boolean(),
      extracting: z.boolean(),
      annotationsAndForms: z.boolean(),
      fillForms: z.boolean(),
      accessibility: z.boolean(),
      assemble: z.boolean(),
      highQualityPrint: z.boolean(),
    })
    .optional(),
  title: z.string().optional(),
  author: z.string().optional(),
  subject: z.string().optional(),
  keywords: z.array(z.string()).optional(),
  creator: z.string().optional(),
  producer: z.string().optional(),
  creationDate: z.string().optional(),
  modDate: z.string().optional(),
});

export type InfoInput = z.infer<typeof infoInputSchema>;

export async function infoHandler(args: InfoInput): Promise<CallToolResult> {
  try {
    const proxy = await loadDocument(args.path, args.password);
    const info: DocInfo = await getDocInfo(proxy);
    const lines = [`Pages: ${info.pages}`, `Encrypted: ${info.encrypted ? 'yes' : 'no'}`];
    if (info.title) lines.push(`Title: ${info.title}`);
    if (info.author) lines.push(`Author: ${info.author}`);
    if (info.subject) lines.push(`Subject: ${info.subject}`);
    if (info.keywords) lines.push(`Keywords: ${info.keywords.join(', ')}`);
    if (info.creator) lines.push(`Creator: ${info.creator}`);
    if (info.producer) lines.push(`Producer: ${info.producer}`);
    if (info.creationDate) lines.push(`CreationDate: ${info.creationDate}`);
    if (info.modDate) lines.push(`ModDate: ${info.modDate}`);
    return { content: [{ type: 'text', text: lines.join('\n') }], structuredContent: info };
  } catch (err) {
    return { content: [{ type: 'text', text: (err as Error).message }], isError: true };
  }
}
```

- [ ] **Step 5: Register `pdf.info` in `src/index.ts`** — replace `src/index.ts` with:

```ts
#!/usr/bin/env node
import { McpServer } from '@modelcontextprotocol/server';
import { StdioServerTransport } from '@modelcontextprotocol/server/stdio';
import { readHandler, readInputSchema, readOutputSchema } from './tools/read.js';
import { infoHandler, infoInputSchema, infoOutputSchema } from './tools/info.js';

const server = new McpServer({ name: 'pdf', version: '1.0.0' });

server.registerTool(
  'pdf.read',
  {
    description:
      'Extract text (and optionally structured per-item positions) from a local PDF, over an optional page range, with per-call size caps.',
    inputSchema: readInputSchema,
    outputSchema: readOutputSchema,
  },
  readHandler,
);

server.registerTool(
  'pdf.info',
  {
    description:
      'Return page count, encryption status, permission flags, and standard document metadata for a local PDF.',
    inputSchema: infoInputSchema,
    outputSchema: infoOutputSchema,
  },
  infoHandler,
);

const transport = new StdioServerTransport();
await server.connect(transport);
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `pnpm test`
Expected: PASS — `pages=2`, `encrypted=false`, no `permissions`, metadata present, `creationDate`/`modDate` omitted, content text has the summary lines.

- [ ] **Step 7: Lint + typecheck + build**

Run: `pnpm lint && pnpm check-types && pnpm build`
Expected: clean.

- [ ] **Step 8: Commit**

```bash
git add packages/pdf/src/ packages/pdf/tests/info.test.ts
git commit -m "feat(pdf): add pdf.info tool (metadata, encryption, permissions)"
```

---

## Task 8: `pdf.info` — encrypted fixture (encrypted=true, permissions decode, password errors)

**Files:**

- Modify: `packages/pdf/tests/info.test.ts` (append encrypted cases)
- No source change expected (`getDocInfo` + `loadDocument` already handle encryption from Tasks 2/7 — verifies it; fix `meta.ts`/`proxy.ts` if a case fails).

**Interfaces:** Consumes `getDocInfo`, `decodePermissions`, `loadDocument` (Tasks 2, 7).

- [ ] **Step 1: Append failing encrypted tests to `tests/info.test.ts`**:

```ts
describe('pdf.info encrypted', () => {
  it('reports encrypted=true and decoded permissions with the correct password', async () => {
    const args = infoInputSchema.parse({ path: fixture('encrypted.pdf'), password: 'secret' });
    const result = await infoHandler(args);
    expect(result.isError).not.toBe(true);
    const sc = result.structuredContent as {
      pages: number;
      encrypted: boolean;
      permissions: {
        printing: boolean;
        modifying: boolean;
        extracting: boolean;
        annotationsAndForms: boolean;
        fillForms: boolean;
        accessibility: boolean;
        assemble: boolean;
        highQualityPrint: boolean;
      };
    };
    expect(sc.pages).toBe(2);
    expect(sc.encrypted).toBe(true);
    expect(sc.permissions.printing).toBe(true);
    expect(sc.permissions.modifying).toBe(true);
    expect(sc.permissions.extracting).toBe(true);
    expect(sc.permissions.annotationsAndForms).toBe(true);
    expect(sc.permissions.fillForms).toBe(true);
    expect(sc.permissions.accessibility).toBe(true);
    expect(sc.permissions.assemble).toBe(true);
    expect(sc.permissions.highQualityPrint).toBe(true);
  });

  it('returns isError for an encrypted PDF without a password', async () => {
    const args = infoInputSchema.parse({ path: fixture('encrypted.pdf') });
    const result = await infoHandler(args);
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('encrypted');
  });

  it('returns isError for an encrypted PDF with the wrong password', async () => {
    const args = infoInputSchema.parse({ path: fixture('encrypted.pdf'), password: 'wrong' });
    const result = await infoHandler(args);
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('Incorrect password');
  });

  it('returns isError for a non-PDF file', async () => {
    const args = infoInputSchema.parse({ path: fixture('not-pdf.txt') });
    const result = await infoHandler(args);
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('not a valid PDF');
  });

  it('returns isError for a missing file', async () => {
    const args = infoInputSchema.parse({ path: fixture('does-not-exist.pdf') });
    const result = await infoHandler(args);
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('not found');
  });
});
```

> The encrypted fixture is cloned from `sample.pdf`, so its metadata is identical. pypdf's `encrypt` grants all permission bits, so `getPermissions()` returns `[4,8,16,32,256,512,1024,2048]` → every permission boolean is `true` (verified).

- [ ] **Step 2: Run the tests**

Run: `pnpm test`
Expected: PASS. If any fail, fix `src/pdf/meta.ts` (`getDocInfo`/`decodePermissions`) or `src/pdf/proxy.ts` — not the tests.

- [ ] **Step 3: Lint + typecheck + build**

Run: `pnpm lint && pnpm check-types && pnpm build`
Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add packages/pdf/tests/info.test.ts packages/pdf/src/pdf/
git commit -m "test(pdf): cover pdf.info encrypted, permissions, and error paths"
```

---

## Task 9: input-schema relative-path rejection (both tools)

**Files:**

- Create: `packages/pdf/tests/schema.test.ts`
- Modify: `packages/pdf/src/tools/read.ts` (add `isAbsolute` refine to `readInputSchema`)
- Modify: `packages/pdf/src/tools/info.ts` (add `isAbsolute` refine to `infoInputSchema`)

**Interfaces:** Consumes `readInputSchema`, `infoInputSchema` (Tasks 2, 7). Produces no new exports (modifies existing schemas).

- [ ] **Step 1: Write the failing schema-rejection test**

Create `packages/pdf/tests/schema.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { readInputSchema } from '../src/tools/read.js';
import { infoInputSchema } from '../src/tools/info.js';

describe('input schemas reject relative paths', () => {
  it('read rejects a relative path', () => {
    const r = readInputSchema.safeParse({ path: 'relative/path.pdf' });
    expect(r.success).toBe(false);
  });

  it('info rejects a relative path', () => {
    const r = infoInputSchema.safeParse({ path: 'relative/path.pdf' });
    expect(r.success).toBe(false);
  });

  it('read accepts an absolute path', () => {
    const r = readInputSchema.safeParse({ path: '/abs/path.pdf' });
    expect(r.success).toBe(true);
  });

  it('info accepts an absolute path', () => {
    const r = infoInputSchema.safeParse({ path: '/abs/path.pdf' });
    expect(r.success).toBe(true);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm test`
Expected: FAIL — the relative-path cases expect `r.success === false`, but the schemas currently use bare `z.string()` so they succeed. The absolute-path cases already pass.

- [ ] **Step 3: Add the absolute-path refine to `readInputSchema`** — in `src/tools/read.ts`, replace the `path: z.string(),` line with:

```ts
  path: z.string().refine((p) => isAbsolute(p), 'Path must be absolute'),
```

and add the import at the top of the file (with the other imports):

```ts
import { isAbsolute } from 'node:path';
```

- [ ] **Step 4: Add the absolute-path refine to `infoInputSchema`** — in `src/tools/info.ts`, replace the `path: z.string(),` line with:

```ts
  path: z.string().refine((p) => isAbsolute(p), 'Path must be absolute'),
```

and add the import at the top of the file:

```ts
import { isAbsolute } from 'node:path';
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `pnpm test`
Expected: PASS — relative paths now fail validation; absolute paths still succeed. No handler test regresses (all handler tests use absolute fixture paths).

- [ ] **Step 6: Lint + typecheck + build**

Run: `pnpm lint && pnpm check-types && pnpm build`
Expected: clean.

- [ ] **Step 7: Commit**

```bash
git add packages/pdf/tests/schema.test.ts packages/pdf/src/tools/
git commit -m "feat(pdf): reject relative paths in tool input schemas"
```

---

## Task 10: Full gate verification + server smoke test

**Files:** None (verification only). Optionally update `packages/pdf/docs/plan.md` checkboxes.

**Interfaces:** Consumes the whole package.

- [ ] **Step 1: Run the full repo gate from the monorepo root**

Run (from repo root `/home/jeius/Projects/mcp-servers/pdf`):

```bash
pnpm build && pnpm test && pnpm lint && pnpm check-types
```

Expected: all four green via Turborepo (build → test → lint → check-types). `packages/pdf` build emits `packages/pdf/build/index.js` (executable).

- [ ] **Step 2: Smoke-test the server over stdio**

The server speaks JSON-RPC on stdio. Send an `initialize` + a `notifications/initialized` + `tools/list` + a `tools/call` for `pdf.info` on the sample fixture, capture stdout to a temp file (avoids EPIPE from piping into `head`), then assert with `grep`. Run from `packages/pdf/`:

```bash
OUT=/tmp/pdf-smoke.out
printf '%s\n' \
'{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"smoke","version":"0.0.0"}}}' \
'{"jsonrpc":"2.0","method":"notifications/initialized"}' \
'{"jsonrpc":"2.0","id":2,"method":"tools/list","params":{}}' \
"$(printf '{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"pdf.info","arguments":{"path":"%s"}}}' "$(pwd)/tests/fixtures/sample.pdf")" \
| node build/index.js 2>/dev/null > "$OUT"
echo "lines: $(wc -l < "$OUT")"
grep -q '"pdf.read"' "$OUT" && grep -q '"pdf.info"' "$OUT" && grep -q 'Pages: 2' "$OUT" && echo "SMOKE OK" || echo "SMOKE FAIL"
```

Expected: prints `SMOKE OK`. The server reads the four messages, responds on stdout, and exits when stdin closes (EOF). `tools/list` (id 2) lists both `pdf.read` and `pdf.info`; `tools/call` (id 3) returns `content[0].text` containing `Pages: 2` and `structuredContent.pages === 2`. Stderr is discarded (`2>/dev/null`) — only JSON-RPC on stdout. If `SMOKE FAIL`, inspect `$OUT` (it contains the raw JSON-RPC lines) to diagnose.

- [ ] **Step 3: Mark `packages/pdf/docs/plan.md` Phase 1 checkboxes complete**

In `packages/pdf/docs/plan.md`, tick the completed Phase 1 items (the `unpdf` dependency, `src/index.ts`, `pdf.read`, `pdf.info`, error handling, fixtures, tests, green gates).

- [ ] **Step 4: Commit the plan doc update**

```bash
git add packages/pdf/docs/plan.md
git commit -m "docs(pdf): mark Phase 1 complete"
```

---

## Self-Review

**1. Spec coverage** (PRD §Implementation Decisions / §Testing Decisions / §Roadmap Phase 1):

- stdio transport via `StdioServerTransport` → Task 2 (index.ts). ✓
- `McpServer` + `registerTool(name, config, handler)`, tools `pdf.read`/`pdf.info` → Tasks 2, 7. ✓
- Input schemas (Zod v4): `pdf.read` path/password/pages/structured/maxPages/maxChars; `pdf.info` path/password → Tasks 2, 7. ✓
- Absolute-path refine → Task 9. ✓
- `unpdf` extraction (`getDocumentProxy` with password, `extractText`, `extractTextItems`) → Tasks 2, 4. ✓
- Page Range parsing (sorted/deduped/clamped, `1-3`,`1,3,5`,`1-3,7`, omit=all) → Task 3. ✓
- `pdf.read` output: text `content` with `\n\n--- Page N ---\n` markers + `structuredContent` (`totalPages`/`pagesReturned`/`pages`); `items` only when `structured:true`; `fontFamily` omitted when empty → Tasks 2, 4. ✓
- `pdf.info` output: `pages`, `encrypted`, `permissions?` (omitted when null), metadata (omitted when empty), Table 22 decode → Tasks 7, 8. ✓
- Size caps: `maxPages` (default 50) + `maxChars` (default 200000), truncation note, lockstep structured truncation, `pagesReturned` reflects returned count, `totalPages` true count → Task 5. ✓
- Error handling: try/catch every handler → `isError:true`; file-not-found, not-a-PDF, encrypted no/wrong password → Task 6. ✓
- Logging stderr-only (no `console.log`) → enforced by Global Constraints; no `console.log` in any source. ✓ (No logging is actually needed in Phase 1; handlers return errors as results.)
- `fs/promises.readFile` buffer reading → Task 2 (proxy.ts). ✓
- Single entrypoint `src/index.ts` → `build/index.js`, `bin.pdf`, reads nothing from argv → Task 2. ✓
- Tools-only capabilities, no resources/prompts/dynamic registration → Task 2/7 (only `registerTool` calls). ✓
- Testing: handler seam, real fixtures, coverage priorities (all-pages happy path; page-range subset; out-of-range clamping; structured items + `fontFamily`; caps truncation; empty `fontFamily` omission; relative-path rejection; missing/not-a-PDF/encrypted error paths; `pdf.info` pages+encrypted always; permissions present/omitted; metadata present/omitted; no handler throws; every result has a `content` array with ≥1 text item) → Tasks 2–9. ✓
- Phase 1 roadmap items (`pdf.outline`/`pdf.search`/`pdf.page_size`) → explicitly out of scope for this plan (Phase 1 = the two initial tools per PRD §Roadmap "initial release ships two read-side tools"; the roadmap's "Phase 1 (high value or cheap)" list is a separate later batch — not this plan). ✓

**2. Placeholder scan:** No `TBD`/`TODO`/`implement later`/`add appropriate …`/`similar to Task N`. Every code step contains full, runnable code. ✓

**3. Type consistency:**

- `PdfProxy` defined once in `proxy.ts`, imported by `text.ts`, `meta.ts`. ✓
- `PageOut`/`ItemOut` defined in `text.ts`, consumed by `read.ts` (via `joinPages`/`truncateChars`/`extractPagesText`). ✓
- `shapeItem` signature `(it: StructuredTextItem) => ItemOut` matches both the pure test (Task 4) and `extractPagesText` usage. ✓
- `loadDocument(path: string, password?: string): Promise<PdfProxy>` — same signature used by `readHandler` and `infoHandler`. ✓
- `parsePageRange(pages: string | undefined, totalPages: number): number[]` and `applyMaxPages(pageList: number[], maxPages: number, totalPages: number): { pages: number[]; note: string | null }` — match `readHandler` calls. ✓
- `getDocInfo(proxy: PdfProxy): Promise<DocInfo>` and `decodePermissions(flags: number[]): Permissions` — match `infoHandler` usage. ✓
- Permission bit constants (4/8/16/32/256/512/1024/2048) match the verified `unpdf/pdfjs` `PermissionFlag` values and the PRD's 8 booleans (printing/modifying/extracting/annotationsAndForms/fillForms/accessibility/assemble/highQualityPrint). ✓
- Error messages (`File not found:`, `not a valid PDF:`, `encrypted; provide a password`, `Incorrect password for encrypted PDF`, `Invalid page range:`) — produced in `proxy.ts`/`pages.ts`, asserted in Tasks 6, 8, 3. ✓
- `readInputSchema`/`infoInputSchema` exported names match the schema-test imports (Task 9). ✓
