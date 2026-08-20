# PDF MCP Server

An MCP server that reads the content of PDF files from local disk and returns text and positional structure to an LLM host over stdio.

## Language

**Page**:
A numbered leaf of a PDF, 1-indexed. The unit of extraction and the boundary for page-range selection.
_Avoid_: sheet, side

**Text**:
The textual content of a page's text layer, in reading order as yielded by the extractor. Carries no position or font.
_Avoid_: content, body

**Structured Text**:
Text plus per-item position (x, y, width, height), font size, font family, and direction. Preserves layout for column/reading-order/table reasoning.
_Avoid_: layout, positions

**Text Item**:
A single positioned text run on a page — the atomic unit of Structured Text.
_Avoid_: span, run, fragment

**Page Range**:
A compact selector for a subset of pages: `1-3`, `1,3,5`, `1-3,7`. Omit for all pages.
_Avoid_: selection

**Encrypted PDF**:
A PDF requiring a password to read; yields an error unless the correct password is supplied.
_Avoid_: protected, secured
