import { type ChildProcess, spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { buildFilterFor } from './build-filter.js';
import { BuildFailedError, MissingEntryError } from './errors.js';
import type { ResolvedServer } from './resolve.js';

export function buildPackage(root: string, packageName: string): Promise<void> {
  return new Promise((resolvePromise, reject) => {
    const child = spawn('pnpm', ['exec', 'turbo', ...buildFilterFor(packageName)], {
      cwd: root,
      env: process.env,
      stdio: ['ignore', 'pipe', 'inherit'],
    });
    child.stdout?.on('data', () => {
      // discard turbo's stdout so the MCP stream over our stdout stays pristine
    });
    child.on('error', reject);
    child.on('exit', (code) => {
      if (code === 0) {
        resolvePromise();
      } else {
        reject(new BuildFailedError(packageName, code ?? 1));
      }
    });
  });
}

export function spawnServer(entryPath: string): ChildProcess {
  return spawn('node', [entryPath], { env: process.env, stdio: 'inherit' });
}

export async function runServer(
  server: ResolvedServer,
  root: string,
  noBuild: boolean
): Promise<void> {
  if (!noBuild) {
    await buildPackage(root, server.packageName);
  }
  if (!existsSync(server.entryPath)) {
    throw new MissingEntryError(server.entryPath);
  }
  const child = spawnServer(server.entryPath);
  for (const signal of ['SIGINT', 'SIGTERM'] as const) {
    process.on(signal, () => {
      child.kill(signal);
    });
  }
  const code = await new Promise<number | null>((resolvePromise) => {
    child.on('exit', resolvePromise);
  });
  process.exitCode = code ?? 0;
}
