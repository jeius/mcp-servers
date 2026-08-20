# MCP Server Runner

Runs or develops any server in the family by name. One binary, `mcp-serve`; the root delegates to it with `pnpm serve <name>`.

## Language

**Runner**:
The `mcp-serve` process — resolves a server by name, ensures it is built, and runs it (or watches and respawns it in dev). A deep module: callers only ever say `mcp-serve <name>`.
_Avoid_: launcher, dispatcher, supervisor

**Server Family**:
The set of server packages in the workspace that declare a `bin` **and** depend on the MCP server SDK (`@modelcontextprotocol/server`) — the pool `mcp-serve` runs. The SDK dependency is what keeps tool bins (like `mcp-serve` itself) out of the family. Growing the family = adding a package with a `bin` + SDK dep; the runner needs no new config.
_Avoid_: fleet, catalog

**Bin Discovery**:
The act of learning what servers exist by reading the workspace (`pnpm-workspace.yaml`) and each package's `bin` field. The bin name *is* the server identity; there is no registry file to keep in sync.
_Avoid_: registry, manifest lookup

**Dev Respawn**:
The dev-mode lifecycle: on a clean rebuild the runner kills the running server child and starts a fresh one; on a compile error it keeps the last-good child running and streams the error to stderr. The host is never left without a server mid-session.
_Avoid_: hot reload, restart loop
