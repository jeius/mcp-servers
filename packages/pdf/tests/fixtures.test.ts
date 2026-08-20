import { describe, it, expect } from 'vitest';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const fixture = (name: string) => join(here, 'fixtures', name);

describe('fixtures', () => {
  it('sample.pdf is a valid PDF', async () => {
    const bytes = await readFile(fixture('sample.pdf'));
    expect(bytes.subarray(0, 5).toString('latin1')).toBe('%PDF-');
  });

  it('encrypted.pdf is a valid PDF', async () => {
    const bytes = await readFile(fixture('encrypted.pdf'));
    expect(bytes.subarray(0, 5).toString('latin1')).toBe('%PDF-');
  });

  it('not-pdf.txt is not a PDF', async () => {
    const bytes = await readFile(fixture('not-pdf.txt'));
    expect(bytes.subarray(0, 5).toString('latin1')).not.toBe('%PDF-');
  });
});
