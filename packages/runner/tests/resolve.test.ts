import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { NoBinError, UnknownServerError } from '../src/errors.js';
import { findWorkspaceRoot, resolveServer } from '../src/resolve.js';

const ws = resolve(dirname(fileURLToPath(import.meta.url)), 'fixtures', 'ws');

describe('findWorkspaceRoot', () => {
  it('returns the directory containing pnpm-workspace.yaml, reached by walking up', () => {
    expect(findWorkspaceRoot(resolve(ws, 'packages', 'pdf'))).toBe(ws);
  });

  it('returns undefined when no pnpm-workspace.yaml exists up the tree', () => {
    expect(findWorkspaceRoot('/')).toBeUndefined();
  });
});

describe('resolveServer', () => {
  it('resolves a server by its bin name to its package and entry', () => {
    const server = resolveServer('pdf', ws);
    expect(server.name).toBe('pdf');
    expect(server.binName).toBe('pdf');
    expect(server.packageName).toBe('@fixture/pdf');
    expect(server.packageDir).toBe(resolve(ws, 'packages', 'pdf'));
    expect(server.entryPath).toBe(resolve(ws, 'packages', 'pdf', 'build', 'index.js'));
  });

  it('throws NoBinError for a named package that is not a server', () => {
    expect(() => resolveServer('noserver', ws)).toThrow(NoBinError);
    expect(() => resolveServer('noserver', ws)).toThrow('"noserver" has no bin; not a server');
  });

  it('throws UnknownServerError listing the known servers', () => {
    let err: unknown;
    try {
      resolveServer('bogus', ws);
    } catch (e) {
      err = e;
    }
    expect(err).toBeInstanceOf(UnknownServerError);
    expect((err as UnknownServerError).known).toEqual(['pdf']);
    expect((err as UnknownServerError).message).toContain('no server named "bogus"');
    expect((err as UnknownServerError).message).toContain('Known: pdf');
  });

  it('excludes bin-bearing packages that are not MCP servers from the family', () => {
    let err: unknown;
    try {
      resolveServer('clitool', ws);
    } catch (e) {
      err = e;
    }
    expect(err).toBeInstanceOf(UnknownServerError);
    expect((err as UnknownServerError).known).toEqual(['pdf']);
  });
});
