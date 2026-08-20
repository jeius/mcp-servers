import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { describe, expect, it } from 'vitest';
import { findWorkspaceRoot, resolveServer } from '../src/resolve.js';

const RUN_SMOKE = process.env.RUN_SMOKE === '1';

describe.skipIf(!RUN_SMOKE)('smoke', () => {
  it('serves an MCP initialize handshake over stdio', async () => {
    const root = findWorkspaceRoot(process.cwd());
    expect(root).toBeDefined();
    const server = resolveServer('pdf', root as string);
    const response = await initialize(root as string, server.entryPath);
    const result = (response as { result: { serverInfo: { name: string } } }).result;
    expect(result.serverInfo.name).toBe('pdf');
  });
});

function initialize(root: string, entryPath: string): Promise<unknown> {
  return new Promise((resolvePromise, reject) => {
    const child = spawn('node', [entryPath], { cwd: root, stdio: ['pipe', 'pipe', 'inherit'] });
    const lines = createInterface({ input: child.stdout as NodeJS.ReadableStream });
    const timer = setTimeout(() => {
      child.kill('SIGTERM');
      reject(new Error('timed out waiting for the initialize response'));
    }, 5000);
    lines.on('line', (line) => {
      let parsed: unknown;
      try {
        parsed = JSON.parse(line);
      } catch {
        return;
      }
      if ((parsed as { id?: unknown }).id === 1) {
        clearTimeout(timer);
        child.kill('SIGTERM');
        resolvePromise(parsed);
      }
    });
    child.stdin?.write(
      `${JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: {
          protocolVersion: '2025-03-26',
          capabilities: {},
          clientInfo: { name: 'runner-smoke', version: '0.0.0' },
        },
      })}\n`
    );
  });
}
