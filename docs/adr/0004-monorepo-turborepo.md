# ADR-0004: pnpm-workspace monorepo managed by Turborepo

**Status:** Accepted
**Date:** 2026-08-20

## Context

The repo currently lives at `github.com/jeius/pdf` as a single-package project, but it sits at `/home/jeius/Projects/mcp-servers/pdf` on disk and is intended as the durable long-term home for **many** MCP servers, not just the pdf server. Three forces are in tension: (1) we want each server to be an independently buildable/testable/publishable unit with its own tool contracts, domain glossary, and per-package decisions; (2) we want shared tooling (TypeScript strict base, Biome, Vitest conventions, agent skills) to be configured once and inherited, not duplicated per package; (3) we want a single clone-and-run surface for the whole family, with task caching/pipelining so `build`/`test`/`lint` across N packages stays fast as N grows.

`packageManager` is already pinned to pnpm 11.22.0 via corepack (sha512-pinned), and `pnpm-workspace.yaml` already exists. ADR-0003 just put Biome at the root as a shared devDependency. The decision to go monorepo is essentially already half-made; this ADR locks the structure and the task runner.

## Decision

Convert the repo to a pnpm-workspace monorepo managed by **Turborepo**, and rename the GitHub repo from `jeius/pdf` to `jeius/mcp-servers`. Strict scope split:

- **Root** holds workspace-wide concerns only: `turbo.json`, `pnpm-workspace.yaml` (`packages/*`), root `package.json` (private, no publish; devDeps: `turbo`, `@biomejs/biome`, shared agent skills), `tsconfig.base.json` (shared strict base), `biome.json` (shared; per-package needs via extends/glob overrides), root `AGENTS.md` (monorepo entry + cross-cutting rules), root `README.md`, root `docs/adr/` (repo-wide ADRs only), root `docs/agents/` (repo-wide gh/domain-doc conventions).
- **`packages/<name>/`** holds one MCP server each: its own `package.json` (publishable, own deps + scripts), `tsconfig.json` (extends `../../tsconfig.base.json`), `vitest.config.ts`, `AGENTS.md` (package-specific engineering rules + tool contracts), `CONTEXT.md` (package domain glossary), `src/`, `tests/`, and `docs/` (PRD, architecture, tech-stack, plan, `adr/` for package-specific ADRs).

**Turborepo** runs task pipelines (`build`, `test`, `lint`, `format`, `check-types`) with caching keyed on input hashes; `turbo run build --affected` rebuilds only changed packages. `turbo` is a root devDependency.

**Package naming** (npm scope): the workspace root `package.json` is named `@jeius-mcp-servers` and marked `private: true` (never published). Each package under `packages/<name>/` is named `@jeius-mcp-servers/<name>` — e.g. `packages/pdf/` → `@jeius-mcp-servers/pdf`. The scope aligns with the GitHub repo name (`jeius/mcp-servers`) so the publishable package name, the workspace path, and the remote URL all tell the same story.

**ADR numbering** is globally sequential across the whole monorepo but **split by location**: root `docs/adr/` holds repo-wide decisions (biome, monorepo, CI, …); `packages/<name>/docs/adr/` holds package-specific decisions (unpdf, pdf-namespace, …). Cross-references use the bare number; location resolves scope. Next ADR anywhere = `0005`.

## Alternatives Considered

- **Stay single-package** — keep `jeius/pdf` as just the pdf server, create a new repo per future server. Rejected: the user has explicitly committed to a long-term umbrella home; per-server repos mean N remotes, N clonedirs, N CI configs, and no shared skill/config inheritance. The `mcp-servers/` disk path already signals umbrella intent.
- **Plain pnpm workspaces, no task runner** — `pnpm -r run build` recurses, scripts work, no extra dep. Rejected: no task caching, no topological scheduling beyond what pnpm gives, no `--affected` filtering. Fine at 2 packages, painful at 5+. Adding turbo later is cheap, but adopting it now means the workflow is right from the first multi-package CI run.
- **Nx** — full-featured monorepo tool with generators, caching, project graph. Rejected: heavier config, opinionated about project structure, and its value (generators, distributed cache, affected-by-test-targets) is overkill for a family of small stdio servers. Turborepo covers the 90% need (cache + pipeline + affected) at a fraction of the setup.
- **Lerna** — the original JS monorepo task runner. Rejected: largely in maintenance mode since Nx absorbed it; the community moved to Nx or Turborepo. No reason to start a new repo on Lerna in 2026.

## Consequences

- **Repo rename**: `jeius/pdf` → `jeius/mcp-servers` on GitHub (Settings → Rename; GitHub keeps an old→new redirect indefinitely). Local remote URL updated via `git remote set-url origin`. All in-repo references to `github.com/jeius/pdf` (AGENTS.md repo layout, docs/PRD.md Further Notes, docs/plan.md Phase 0) must be updated in the same restructure commit.
- **Package rename**: the current single `package.json` name `@jeius/server-pdf` becomes `@jeius-mcp-servers/pdf` when it moves to `packages/pdf/`, and a new root `package.json` is created with name `@jeius-mcp-servers` (`private: true`). The npm scope `@jeius-mcp-servers` is new; if we intend to publish to the npm registry under this scope, the scope must be created/owned on npmjs.com (verify before first publish — not needed for local/CI use). `docs/plan.md` Phase 0's reference to `@jeius/server-pdf` updates in the restructure commit.
- **Structure migration**: current `src/`, `tests/`, `package.json`, `tsconfig.*`, `vitest.config.ts`, `CONTEXT.md`, and the pdf-specific docs (`docs/PRD.md`, `docs/architecture.md`, `docs/tech-stack.md`, `docs/plan.md`, `docs/adr/0001`, `docs/adr/0002`) move into `packages/pdf/`. Root keeps `docs/agents/` and gains `docs/adr/` for repo-wide ADRs (0003, 0004, and future). The existing `AGENTS.md` is rewritten as a monorepo entry; a new `packages/pdf/AGENTS.md` inherits the pdf-specific engineering rules + tool contracts currently in the root `AGENTS.md`.
- **Shared config inheritance**: `packages/*/tsconfig.json` extends `../../tsconfig.base.json` (strict, ES2022, Node16). Biome stays at root; per-package overrides via `biome.jsonc` extends or glob. One Biome install, one version, consistent style.
- **`docs/agents/domain.md` needs a rewrite**: the single-context layout rule ("`CONTEXT.md` at repo root + `docs/adr/`") becomes "each package has its own `CONTEXT.md` + `docs/adr/`; root holds repo-wide `docs/adr/`." Tracked as part of the restructure.
- **Per-package autonomy with shared spine**: each new server follows the same `packages/<name>/` layout — its own PRD, architecture, tech-stack, plan, ADRs, CONTEXT, AGENTS. The root never grows package-specific content. This is the strict-split discipline; drifting it (putting a pdf-specific ADR in root, say) is the failure mode to watch for.
- **Turborepo obligations**: `turbo.json` pipelines must declare `dependsOn` (e.g. `build` depends on `^build` for package-internal deps; `test` depends on `build`), and outputs must be declared for cache hits (`build` outputs `build/**`). CI (when added) runs `turbo run lint test build --affected` from root. Without these, turbo degrades to plain recursion.
- **Agent onboarding**: `AGENTS.md` at root must make the package layout obvious so an agent landing in the repo knows to `cd packages/pdf` (or target a package via `turbo --filter=pdf`) rather than edit root configs for package-specific work. The root AGENTS.md rewrite carries this.
- **Reversing this** is expensive once multiple packages land (each package's docs/ADRs/configs would need to move back out). It's cheap right now, with only pdf — which is exactly why we're doing it now, before package #2 arrives.
- **Renaming a repo with no GitHub Pages and no published Packages is low-risk**: stars/forks/issues/PRs transfer with the rename, the old URL redirects, and no external consumers depend on the name yet.

---
