# MCP Servers

A monorepo of Model Context Protocol servers. Each server under `packages/` is an independently buildable, testable, and publishable MCP server that runs over stdio.

## Packages

| Package | Description |
|---|---|
| [`@jeius-mcp-servers/pdf`](packages/pdf/) | Reads PDF files from local disk; returns text and positional structure to an LLM host over stdio. |
| [`@jeius-mcp-servers/runner`](packages/runner/) | Internal runner (`mcp-serve`) that builds and runs any server in the workspace by name. Not a server itself. |

## Quickstart

```sh
pnpm install
pnpm build
pnpm test
pnpm lint
```

Requires Node >=22 and pnpm (managed via corepack — the `packageManager` field in the root `package.json` pins the exact version).

## Usage

Servers are run through the runner binary, `mcp-serve`, which the root delegates to with `pnpm serve <name>`.

Run a server (builds first, then runs over stdio):

```sh
pnpm serve pdf
```

Develop a server (watches `src/`, rebuilds, and respawns on a clean rebuild; keeps the last-good server running on a compile error):

```sh
pnpm serve pdf --dev
```

Skip the build precondition when you know the build is current (run-only; ignored by `--dev`):

```sh
pnpm serve pdf --no-build
```

Point an MCP host at a server by invoking the `mcp-serve` bin directly with the server name as the argument:

```json
{
  "mcpServers": {
    "pdf": {
      "command": "/absolute/path/to/node_modules/.bin/mcp-serve",
      "args": ["pdf"]
    }
  }
}
```

A typo'd name prints the list of known servers to stderr and exits non-zero.

## Repository layout

```
.
├── packages/
│   ├── pdf/                # @jeius-mcp-servers/pdf
│   └── runner/            # @jeius-mcp-servers/runner (the mcp-serve runner)
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
