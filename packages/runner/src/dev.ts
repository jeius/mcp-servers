import type { ChildProcess } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { watch } from 'chokidar';
import { MissingEntryError } from './errors.js';
import type { ResolvedServer } from './resolve.js';
import { buildPackage, spawnServer } from './run.js';

const DEBOUNCE_MS = 150;

export async function devServer(server: ResolvedServer, root: string): Promise<void> {
  await buildPackage(root, server.packageName);
  if (!existsSync(server.entryPath)) {
    throw new MissingEntryError(server.entryPath);
  }

  let child: ChildProcess | null = null;
  let respawnQueued = false;
  let shuttingDown = false;
  let rebuildTimer: NodeJS.Timeout | null = null;
  let rebuilding = false;
  let pending = false;

  const spawnFresh = (): void => {
    child = spawnServer(server.entryPath);
    child.on('exit', (code) => {
      child = null;
      if (shuttingDown) {
        process.exit(code ?? 0);
      } else if (respawnQueued) {
        respawnQueued = false;
        spawnFresh();
      } else {
        console.error(`mcp-serve: server exited with code ${code ?? 'null'}`);
      }
    });
  };

  const respawn = (): void => {
    if (child === null) {
      spawnFresh();
    } else {
      respawnQueued = true;
      child.kill('SIGTERM');
    }
  };

  const rebuild = async (): Promise<void> => {
    if (rebuilding) {
      pending = true;
      return;
    }
    rebuilding = true;
    let ok = false;
    try {
      await buildPackage(root, server.packageName);
      ok = true;
    } catch {
      // turbo already streamed the compile error to stderr
    }
    rebuilding = false;
    if (ok) {
      console.error('mcp-serve: rebuild ok, restarting server');
      respawn();
    } else {
      console.error('mcp-serve: build failed; keeping the last-good server running');
    }
    if (pending) {
      pending = false;
      void rebuild();
    }
  };

  const scheduleRebuild = (): void => {
    if (rebuildTimer !== null) {
      clearTimeout(rebuildTimer);
    }
    rebuildTimer = setTimeout(() => {
      rebuildTimer = null;
      void rebuild();
    }, DEBOUNCE_MS);
  };

  for (const signal of ['SIGINT', 'SIGTERM'] as const) {
    process.on(signal, () => {
      shuttingDown = true;
      child?.kill(signal);
      if (child === null) {
        process.exit(0);
      }
    });
  }

  spawnFresh();
  const watcher = watch(join(server.packageDir, 'src'), { ignoreInitial: true });
  watcher.on('all', scheduleRebuild);
}
