#!/usr/bin/env node
import { devServer } from './dev.js';
import { BuildFailedError, ServerError } from './errors.js';
import { findWorkspaceRoot, type ResolvedServer, resolveServer } from './resolve.js';
import { runServer } from './run.js';

interface CliOptions {
  name: string | undefined;
  dev: boolean;
  noBuild: boolean;
}

function parseArgs(argv: string[]): CliOptions {
  return {
    name: argv.find((arg) => !arg.startsWith('--')),
    dev: argv.includes('--dev'),
    noBuild: argv.includes('--no-build'),
  };
}

async function main(): Promise<void> {
  const { name, dev, noBuild } = parseArgs(process.argv.slice(2));
  if (name === undefined) {
    console.error('mcp-serve: missing server name');
    console.error('usage: mcp-serve <server> [--dev] [--no-build]');
    process.exitCode = 1;
    return;
  }
  const root = findWorkspaceRoot(process.cwd());
  if (root === undefined) {
    console.error(`mcp-serve: no pnpm-workspace.yaml found up the tree from ${process.cwd()}`);
    process.exitCode = 1;
    return;
  }
  let server: ResolvedServer;
  try {
    server = resolveServer(name, root);
  } catch (err) {
    if (err instanceof ServerError) {
      console.error(`mcp-serve: ${err.message}`);
      process.exitCode = 1;
      return;
    }
    throw err;
  }
  try {
    if (dev) {
      await devServer(server, root);
    } else {
      await runServer(server, root, noBuild);
    }
  } catch (err) {
    if (err instanceof BuildFailedError) {
      console.error(`mcp-serve: ${err.message}`);
      process.exitCode = err.code;
    } else if (err instanceof ServerError) {
      console.error(`mcp-serve: ${err.message}`);
      process.exitCode = 1;
    } else {
      throw err;
    }
  }
}

main().catch((err) => {
  console.error(`mcp-serve: ${err instanceof Error ? err.message : String(err)}`);
  process.exitCode = 1;
});
