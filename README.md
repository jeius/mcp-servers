# MCP Servers

A monorepo of Model Context Protocol servers. Each server under `packages/` is an independently buildable, testable, and publishable MCP server that runs over stdio.

## Packages

| Package | Description |
|---|---|
| [`@jeius-mcp-servers/pdf`](packages/pdf/) | Reads PDF files from local disk; returns text and positional structure to an LLM host over stdio. |

## Quickstart

```sh
pnpm install
pnpm build
pnpm test
pnpm lint
```

Requires Node >=22 and pnpm (managed via corepack — the `packageManager` field in the root `package.json` pins the exact version).

## Repository layout

```
.
├── packages/
│   └── pdf/                # @jeius-mcp-servers/pdf
├── docs/
│   ├── adr/                # repo-wide Architecture Decision Records
│   └── agents/             # repo-wide agent conventions (issue tracker, domain docs)
├── AGENTS.md               # operational guide for AI coding agents (monorepo entry)
├── turbo.json              # Turborepo task pipelines
├── tsconfig.base.json      # shared TypeScript strict base
├── biome.json              # shared lint/format config
└── pnpm-workspace.yaml     # workspace definition (packages/*)
```

Each package has its own `AGENTS.md`, `CONTEXT.md`, `docs/` (PRD, architecture, tech-stack, plan, `adr/`), `src/`, and `tests/`.

## Documentation

- **Agent guide**: [`AGENTS.md`](AGENTS.md)
- **Decisions**: [`docs/adr/`](docs/adr/) — repo-wide ADRs; package-specific ADRs live in `packages/<name>/docs/adr/`
- **Domain glossaries**: each `packages/<name>/CONTEXT.md`

## License

MIT
