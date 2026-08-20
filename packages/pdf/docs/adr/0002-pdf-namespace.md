# ADR-0002: Namespace tool names as pdf.*

**Status:** Accepted
**Date:** 2026-08-20

## Context

The MCP guide's examples use flat tool names (`get_alerts`, `get_forecast`). With only read-side tools that convention is fine, but this server is designed to accept write-side tools (create/edit/merge/split) later in the *same* server (read-only for now per ADR-0001, but flexibility to add writes is an explicit product goal). Flat names risk collisions and give hosts no grouping signal as the catalog grows: `read_pdf` vs `write_pdf` vs `split_pdf` vs `merge_pdf` vs `get_pdf_info` all sit in one undifferentiated list. MCP permits dots in tool names, and hosts sort/group namespaced names.

The decision is best made before any code or published host config exists, because renaming tools after deployment breaks every host config that references them.

## Decision

Name all tools with a `pdf.*` namespace. Read-side tools (initial and roadmap): `pdf.read`, `pdf.info`, `pdf.outline`, `pdf.search`, `pdf.page_size`, `pdf.links`, `pdf.form_fields`. Future write-side tools (`pdf.write`, `pdf.split`, `pdf.merge`, etc.) slot in under the same namespace without collision.

## Alternatives Considered

- **Flat names (`read_pdf`, `get_pdf_info`, ...)** — matches the MCP guide examples and is simplest for a read-only server. Rejected: gives no read/write separation when write tools arrive, and hosts lose any grouping signal as the catalog grows. Renaming post-deployment breaks host configs, so the call is cheaper now than later.
- **Separate servers for read vs write** — cleanest separation of concerns and trust boundaries (a host could enable read without write). Rejected for now: the user explicitly wants flexibility to add write tools to the *same* server later; splitting servers is a deploy/config burden premature to take on. Reversible via a new ADR if the write side grows large enough to warrant it.

## Consequences

- The two initially-specced tools rename from `read_pdf` / `get_pdf_info` to `pdf.read` / `pdf.info`. Cheap now — no code, no published config.
- Once shipped, host configs reference `pdf.read` etc.; the namespace is effectively fixed. Renaming would break configs, which is exactly why this is recorded as an ADR rather than left implicit.
- `pdf.form_fields` is read-only (reads filled values); a future fill tool needs a distinct name (`pdf.fill_form`, or governed under the write-side ADR) so the name doesn't imply mutation. Namespacing makes the read/write boundary visible in the tool name, but it is necessary, not sufficient — the future write-side ADR must govern mutation safety (overwriting user files, atomic writes, confirmation).
- A growing `pdf.*` catalog is the expected end state; the namespace scales to it.

---

*Keep ADRs short — a page, not an essay. If a decision changes, don't edit this file in place; write a new ADR that supersedes it and update this one's Status line. The history of "we used to do X, then switched to Y because Z" is itself useful information.*
