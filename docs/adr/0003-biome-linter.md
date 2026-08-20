# ADR-0003: Adopt Biome for lint and format

**Status:** Accepted
**Date:** 2026-08-20

## Context

The repo had no lint or format script (AGENTS.md and docs/tech-stack.md both said "No lint script yet"). As source code lands in Phase 1, we need automated enforcement of style and a class of correctness smells at the tool-handler boundary and the PDF layer. Constraints in tension: the project is stdio-only with a deliberately tiny dependency tree (no native build, no framework), so the linter must be lightweight and fast; agents will run lint/format repeatedly during development, so startup cost matters; and we want lint + format from a single tool with one config to avoid the traditional two-tool split's drift.

`packageManager` is already pinned to pnpm 11.22.0 (corepack), and `engines.node` is `>=22` per ADR-0001 — so any tool must install cleanly under pnpm strict node_modules and run on Node 22+.

## Decision

Adopt Biome 2.5.9 as the single linter and formatter, configured via root `biome.json`. Scripts: `pnpm lint` (`biome lint`), `pnpm format` (`biome format`), `pnpm fix` (`biome check --write .`). Biome is a devDependency at the workspace root and shared across all packages.

## Alternatives Considered

- **ESLint + Prettier** — the default JS/TS stack. Rejected: two tools, two configs, plugin生态 to maintain, and notably slower cold starts (ESLint's Node startup + config resolution vs Biome's native binary). The split also invites drift when lint and format disagree. Acceptable in large codebases with deep plugin needs; overkill here.
- **No linter / `tsc --noEmit` only** — keeps the tree minimal. Rejected: `tsc` catches type errors but not style, unused vars, or a class of bugs (e.g. `console.log` slipping into a stdio server, which is explicitly forbidden by AGENTS.md). A stdio server that must never write to stdout specifically benefits from a lint rule enforcing that.
- **Standard / `ts-standard`** — opinionated, zero-config. Rejected: pulls in ESLint under the hood (same startup cost), and its opinionated rule set is less tunable than Biome when we need to exempt the stdio entrypoint's allowed `console.error`.
- **Deno lint** — fast, native. Rejected: wrong runtime; would pull the Deno toolchain into a Node project.

## Consequences

- One config file (`biome.json`), one devDependency, one set of scripts. `docs/tech-stack.md` and `AGENTS.md` lose the "No lint script yet" caveat.
- Biome's rule set is smaller than ESLint+plugins. If a specific rule we need is missing (e.g. a custom stdio-guard), we either add a Biome override, accept the gap, or revisit this ADR. So far Biome 2.x covers our needs (lint, format, import sorting, `noConsoleLog` with an allow for `console.error`).
- Shared at the workspace root: per-package `biome.json` overrides use glob/extends rather than a second devDependency. This matters once the monorepo (ADR-0004) lands — one install, one version, consistent style across all packages.
- `pnpm fix` writes to disk; agents and CI should call `pnpm lint` / `pnpm check-types` (non-mutating) as gates, and `pnpm fix` only as a local convenience.
- Native binary: no postinstall compile, but platform-specific binaries ship via npm optionalDependencies. Under pnpm's strict layout this resolves fine; flagged here as a thing to verify if a CI runner ever reports a missing binary.
- Reversing this means removing one devDependency and the `biome.json` + three scripts. Low lock-in.

---
