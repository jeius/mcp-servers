import { describe, it, expect } from 'vitest';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { infoInputSchema, infoHandler } from '../src/tools/info.js';

const here = dirname(fileURLToPath(import.meta.url));
const fixture = (name: string) => join(here, 'fixtures', name);
const textContent = (result: Awaited<ReturnType<typeof infoHandler>>): string => {
  const item = result.content[0];
  return item.type === 'text' ? item.text : '';
};

describe('pdf.info happy path', () => {
  it('returns pages, encrypted=false, metadata, and omits absent/empty fields', async () => {
    const args = infoInputSchema.parse({ path: fixture('sample.pdf') });
    const result = await infoHandler(args);

    expect(result.isError).not.toBe(true);

    const sc = result.structuredContent as Record<string, unknown>;
    expect(sc.pages).toBe(2);
    expect(sc.encrypted).toBe(false);
    expect('permissions' in sc).toBe(false);
    expect(sc.title).toBe('Sample PDF');
    expect(sc.author).toBe('Test Author');
    expect(sc.subject).toBe('Testing');
    expect(sc.keywords).toEqual(['foo', 'bar', 'baz']);
    expect(sc.creator).toBe('TestCreator');
    expect(sc.producer).toBe('pypdf');
    expect('creationDate' in sc).toBe(false);
    expect('modDate' in sc).toBe(false);

    const text = textContent(result);
    expect(text).toContain('Pages: 2');
    expect(text).toContain('Encrypted: no');
    expect(text).toContain('Title: Sample PDF');
    expect(text).toContain('Keywords: foo, bar, baz');
  });
});

describe('pdf.info encrypted', () => {
  it('reports encrypted=true and decoded permissions with the correct password', async () => {
    const args = infoInputSchema.parse({ path: fixture('encrypted.pdf'), password: 'secret' });
    const result = await infoHandler(args);
    expect(result.isError).not.toBe(true);
    const sc = result.structuredContent as {
      pages: number;
      encrypted: boolean;
      permissions: {
        printing: boolean;
        modifying: boolean;
        extracting: boolean;
        annotationsAndForms: boolean;
        fillForms: boolean;
        accessibility: boolean;
        assemble: boolean;
        highQualityPrint: boolean;
      };
    };
    expect(sc.pages).toBe(2);
    expect(sc.encrypted).toBe(true);
    expect(sc.permissions.printing).toBe(true);
    expect(sc.permissions.modifying).toBe(true);
    expect(sc.permissions.extracting).toBe(true);
    expect(sc.permissions.annotationsAndForms).toBe(true);
    expect(sc.permissions.fillForms).toBe(true);
    expect(sc.permissions.accessibility).toBe(true);
    expect(sc.permissions.assemble).toBe(true);
    expect(sc.permissions.highQualityPrint).toBe(true);
  });

  it('returns isError for an encrypted PDF without a password', async () => {
    const args = infoInputSchema.parse({ path: fixture('encrypted.pdf') });
    const result = await infoHandler(args);
    expect(result.isError).toBe(true);
    expect(textContent(result)).toContain('encrypted');
  });

  it('returns isError for an encrypted PDF with the wrong password', async () => {
    const args = infoInputSchema.parse({ path: fixture('encrypted.pdf'), password: 'wrong' });
    const result = await infoHandler(args);
    expect(result.isError).toBe(true);
    expect(textContent(result)).toContain('Incorrect password');
  });

  it('returns isError for a non-PDF file', async () => {
    const args = infoInputSchema.parse({ path: fixture('not-pdf.txt') });
    const result = await infoHandler(args);
    expect(result.isError).toBe(true);
    expect(textContent(result)).toContain('not a valid PDF');
  });

  it('returns isError for a missing file', async () => {
    const args = infoInputSchema.parse({ path: fixture('does-not-exist.pdf') });
    const result = await infoHandler(args);
    expect(result.isError).toBe(true);
    expect(textContent(result)).toContain('not found');
  });
});
