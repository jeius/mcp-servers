import { describe, it, expect } from 'vitest';
import { readInputSchema } from '../src/tools/read.js';
import { infoInputSchema } from '../src/tools/info.js';

describe('input schemas reject relative paths', () => {
  it('read rejects a relative path', () => {
    const r = readInputSchema.safeParse({ path: 'relative/path.pdf' });
    expect(r.success).toBe(false);
  });

  it('info rejects a relative path', () => {
    const r = infoInputSchema.safeParse({ path: 'relative/path.pdf' });
    expect(r.success).toBe(false);
  });

  it('read accepts an absolute path', () => {
    const r = readInputSchema.safeParse({ path: '/abs/path.pdf' });
    expect(r.success).toBe(true);
  });

  it('info accepts an absolute path', () => {
    const r = infoInputSchema.safeParse({ path: '/abs/path.pdf' });
    expect(r.success).toBe(true);
  });
});
