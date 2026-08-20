# MCP Servers

A pnpm-workspace monorepo of Model Context Protocol servers, managed by Turborepo. Each `packages/<name>/` is one server — independently buildable, testable, publishable. Read-only for now; architected to accept write-side tools later per package via a new ADR.

## Commands

All commands run from the repo root and delegate to Turborepo (`turbo run <task>` fans out to packages):

- Install: `pnpm install`
- Build: `pnpm build` (turbo run build)
- Test: `pnpm test` (turbo run test)
- Lint: `pnpm lint` (turbo run lint)
- Format: `pnpm format` (turbo run format)
- Fix: `pnpm fix` (turbo run fix — writes to disk)
- Type-check: `pnpm check-types` (turbo run check-types)

Target a single package: `pnpm --filter @jeius-mcp-servers/<name> <task>` or `turbo run <task> --filter=<name>`.

No `npm run dev` (no watch mode yet). Rebuild after edits.

## Engineering Rules (cross-cutting)

These apply to every package in the monorepo. Package-specific rules live in `packages/<name>/AGENTS.md`.

- **Never write to stdout** in any stdio MCP server. `console.log` is forbidden — it corrupts stdio JSON-RPC. Diagnostics go to `console.error` (stderr) only.
- **No native runtime deps** without a new ADR. `unpdf` bundles its pdfjs; `@napi-rs/canvas` is optional and only for render (deferred). Adding native deps requires a repo-wide ADR in `docs/adr/`.
- **ADR numbering is globally sequential, split by location.** Root `docs/adr/` holds repo-wide decisions (biome, monorepo, CI, …). `packages/<name>/docs/adr/` holds package-specific decisions. Next ADR anywhere = `0005`. Cross-references use the bare number; location resolves scope. See ADR-0004.
- **No comments in code** unless explaining *why* (not *what*).
- **Do not commit code that fails `pnpm test` or `pnpm build` or `pnpm lint`.**
- **Package tasks, not root tasks.** Scripts that do work live in each package's `package.json`; root `package.json` only delegates via `turbo run`. See `turbo.json`.

## Repo layout

```
.
├── AGENTS.md               ← you are here (monorepo entry + cross-cutting rules)
├── README.md               ← monorepo overview + package pointers
├── docs/
│   ├── adr/                ← repo-wide ADRs (0000 template, 0003 biome, 0004 monorepo, …)
│   └── agents/             ← repo-wide agent conventions (issue tracker, domain docs)
├── packages/
│   └── <name>/             ← one MCP server per package
│       ├── AGENTS.md       ← package-specific engineering rules + tool contracts
│       ├── CONTEXT.md      ← package domain glossary
│       ├── package.json    ← package deps + scripts (publishable)
│       ├── tsconfig.json   ← extends ../../tsconfig.base.json
│       ├── vitest.config.ts
│       ├── src/
│       ├── tests/
│       └── docs/
│           ├── PRD.md          ← product requirements
│           ├── architecture.md ← system design
│           ├── tech-stack.md   ← languages, frameworks, libs
│           ├── plan.md         ← phased roadmap
│           └── adr/            ← package-specific ADRs
├── turbo.json              ← task pipelines (build/test/lint/format/fix/check-types)
├── tsconfig.base.json      ← shared TypeScript strict base (ES2022, nodenext, strict)
├── biome.json              ← shared lint/format config
├── pnpm-workspace.yaml     ← workspace definition (packages/*)
└── skills-lock.json        ← vendored agent skills
```

## Where to read first

- **What a package does & why**: `packages/<name>/docs/PRD.md`
- **How a package is shaped**: `packages/<name>/docs/architecture.md`
- **What a package uses**: `packages/<name>/docs/tech-stack.md`
- **What's next / phased plan**: `packages/<name>/docs/plan.md`
- **Package domain vocabulary**: `packages/<name>/CONTEXT.md`
- **Package engineering rules + tool contracts**: `packages/<name>/AGENTS.md`
- **Locked decisions (repo-wide)**: `docs/adr/`
- **Locked decisions (package-specific)**: `packages/<name>/docs/adr/`
- **How to track work**: `docs/agents/issue-tracker.md` (GitHub Issues via `gh`)

## Agent skills

### Issue tracker

Issues live in this repo's GitHub Issues, managed with the `gh` CLI. See `docs/agents/issue-tracker.md`.

### Domain docs

Per-package layout: each `packages/<name>/` has its own `CONTEXT.md` plus `docs/adr/`; root holds repo-wide `docs/adr/` only. See `docs/agents/domain.md`.
