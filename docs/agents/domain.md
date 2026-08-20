# Domain docs: per-package layout

Each package in the monorepo owns its own domain glossary and package-specific decisions. The root holds only repo-wide decisions.

## Per-package

- **`packages/<name>/CONTEXT.md`** — the package's domain glossary. Terms specific to that server (e.g. Page, Text Item, Encrypted PDF for the pdf package).
- **`packages/<name>/docs/adr/`** — package-specific Architecture Decision Records. Decisions that affect only this package (e.g. library choice, tool namespacing).

## Root

- **`docs/adr/`** — repo-wide ADRs only. Decisions that affect every package (e.g. linter choice, monorepo structure, CI, Node engine floor).

## ADR numbering

ADRs are **globally sequential** across the whole monorepo but **split by location**: root `docs/adr/` holds repo-wide decisions; `packages/<name>/docs/adr/` holds package-specific decisions. Cross-references use the bare number (e.g. "see ADR-0004"); location resolves scope. Next ADR anywhere = the next unused number. See ADR-0004 for the full rule.

## When a skill says "publish to the issue tracker"

Create a GitHub issue (see `issue-tracker.md`).

## When a skill says "fetch the relevant ticket"

Run `gh issue view <number> --comments`.
