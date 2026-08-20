# ADR-0001: Use unpdf on Node 22 for PDF extraction

**Status:** Accepted
**Date:** 2026-08-20

## Context

The PDF MCP server extracts plain Text and positional Structured Text from local PDFs and returns them over stdio to an LLM host. The library choice is constrained by three forces in tension: we need both plain-text-per-page and per-item layout data (positions, font, direction); the project's `package.json` declares an MIT license, so any AGPL dependency would either force the whole server to AGPL or require a paid commercial license; and the server must run on Node with no native compilation step (stdrio MCP hosts launch it as a plain `node` process, no build toolchain on the host).

Node 20 reached end of maintenance in Apr 2026; Node 22 is the current LTS. The leading candidate library, unpdf 1.8.x, bundles a serverless pdfjs that uses `Promise.withResolvers` and therefore declares `engines.node: >=22`, refusing to install on Node 20. Pinning back to unpdf 1.7.x (Node >=18) avoids the engine bump but freezes us on an older bundled pdfjs.

## Decision

Use `unpdf` (^1.8.1) for PDF text and structured-text extraction, and raise the project's Node engine floor to >=22.

## Alternatives Considered

- **`mupdf` (official npm pkg)** — best structure fidelity (real reading-order/column analysis, dehyphenation, block→line JSON). Rejected: AGPL-3.0 engine conflicts with the MIT declaration; a commercial Artifex license would be required unless the server itself goes AGPL. Also WASM binary adds startup weight.
- **`pdfjs-dist` directly (Apache-2.0)** — license-clean and maximal control. Rejected: in Node it needs hand-written polyfills (DOMMatrix/Path2D/ImageData stubs, `Promise.withResolvers` on Node <22, resolved `standardFontDataUrl`/`cMapUrl` paths) and we'd write the per-page extraction loop ourselves. unpdf already wraps a serverless pdfjs build with these baked in.
- **Pin unpdf to 1.7.x (Node >=18/20)** — avoids the engine floor bump. Rejected: locks us to an older bundled pdfjs and doesn't solve the fact that Node 20 is already end-of-maintenance as of Apr 2026. Forward to Node 22 now rather than carrying tech debt from day one.

## Consequences

- The server requires Node >=22 to install and run. Hosts on older Node must upgrade. This is aligned with current LTS but is a hard floor, not a soft suggestion.
- Zero runtime dependencies from unpdf (pdfjs is bundled, `@napi-rs/canvas` is optional and only needed for page rendering, which we don't do). Keeps the dependency tree small and the server stdio-only.
- Structure fidelity is "pdfjs-level": we get per-Text-Item positions/font/direction, but real column/reading-order analysis and dehyphenation are not done for us. The LLM reasons over raw positions. If that proves insufficient, mupdf (and its AGPL/commercial-license question) becomes a live follow-up — recorded here so the choice can be revisited without re-deriving it.
- OCR for scanned/image-only PDFs is out of scope for any of these libraries; a future `tesseract.js` addition is independent of this decision.
- Reversing this means swapping the extraction module behind the tool handlers; the handler-boundary test seam keeps that swap cheap.

---

*Keep ADRs short — a page, not an essay. If a decision changes, don't edit this file in place; write a new ADR that supersedes it and update this one's Status line. The history of "we used to do X, then switched to Y because Z" is itself useful information.*
