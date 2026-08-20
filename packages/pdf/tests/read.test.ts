import { describe, it, expect } from 'vitest';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { readInputSchema, readHandler } from '../src/tools/read.js';

const here = dirname(fileURLToPath(import.meta.url));
const fixture = (name: string) => join(here, 'fixtures', name);

describe('pdf.read happy path', () => {
  it('extracts all pages with page markers and structuredContent', async () => {
    const args = readInputSchema.parse({ path: fixture('sample.pdf') });
    const result = await readHandler(args);

    expect(result.isError).not.toBe(true);

    const text = result.content[0].text;
    expect(text).toContain('--- Page 1 ---');
    expect(text).toContain('Page one content');
    expect(text).toContain('--- Page 2 ---');
    expect(text).toContain('Page two content');

    const sc = result.structuredContent as {
      totalPages: number;
      pagesReturned: number;
      pages: { page: number; text: string; items?: unknown[] }[];
    };
    expect(sc.totalPages).toBe(2);
    expect(sc.pagesReturned).toBe(2);
    expect(sc.pages).toHaveLength(2);
    expect(sc.pages[0].page).toBe(1);
    expect(sc.pages[0].text).toBe('Page one content');
    expect(sc.pages[0].items).toBeUndefined();
  });
});

describe('pdf.read page range', () => {
  it('selects a single page', async () => {
    const args = readInputSchema.parse({ path: fixture('sample.pdf'), pages: '1' });
    const result = await readHandler(args);
    const sc = result.structuredContent as { pagesReturned: number; pages: { page: number }[] };
    expect(sc.pagesReturned).toBe(1);
    expect(sc.pages[0].page).toBe(1);
    expect(result.content[0].text).toContain('Page one content');
    expect(result.content[0].text).not.toContain('Page two content');
  });

  it('selects a comma list', async () => {
    const args = readInputSchema.parse({ path: fixture('sample.pdf'), pages: '1,2' });
    const result = await readHandler(args);
    expect((result.structuredContent as { pagesReturned: number }).pagesReturned).toBe(2);
  });

  it('selects and clamps a range that overshoots totalPages', async () => {
    const args = readInputSchema.parse({ path: fixture('sample.pdf'), pages: '1-3' });
    const result = await readHandler(args);
    expect((result.structuredContent as { pagesReturned: number }).pagesReturned).toBe(2);
  });

  it('returns zero pages when every requested page is out of range', async () => {
    const args = readInputSchema.parse({ path: fixture('sample.pdf'), pages: '5' });
    const result = await readHandler(args);
    const sc = result.structuredContent as { pagesReturned: number; pages: unknown[] };
    expect(sc.pagesReturned).toBe(0);
    expect(sc.pages).toHaveLength(0);
  });

  it('rejects an invalid page range with isError', async () => {
    const args = readInputSchema.parse({ path: fixture('sample.pdf'), pages: 'abc' });
    const result = await readHandler(args);
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('Invalid page range');
  });
});

describe('pdf.read structured text', () => {
  it('returns items with position/font/direction when structured:true', async () => {
    const args = readInputSchema.parse({ path: fixture('sample.pdf'), structured: true });
    const result = await readHandler(args);
    const sc = result.structuredContent as {
      pages: { items?: { str: string; x: number; y: number; dir: string; hasEOL: boolean; fontFamily?: string }[] }[];
    };
    const first = sc.pages[0].items?.[0];
    expect(first).toBeDefined();
    if (first) {
      expect(first.str).toBe('Page one content');
      expect(first.x).toBe(72);
      expect(first.y).toBe(720);
      expect(first.dir).toBe('ltr');
      expect(first.hasEOL).toBe(false);
      expect(first.fontFamily).toBe('sans-serif');
    }
  });

  it('omits items when structured:false', async () => {
    const args = readInputSchema.parse({ path: fixture('sample.pdf'), structured: false });
    const result = await readHandler(args);
    const sc = result.structuredContent as { pages: { items?: unknown[] }[] };
    expect(sc.pages[0].items).toBeUndefined();
  });
});

describe('pdf.read size caps', () => {
  it('caps extracted pages at maxPages and appends a page-truncation note', async () => {
    const args = readInputSchema.parse({ path: fixture('sample.pdf'), maxPages: 1 });
    const result = await readHandler(args);
    const sc = result.structuredContent as { pagesReturned: number; pages: { page: number }[] };
    expect(sc.pagesReturned).toBe(1);
    expect(sc.pages[0].page).toBe(1);
    expect(result.content[0].text).toContain('[truncated, pages 1-1 of 2 shown]');
    expect(result.content[0].text).not.toContain('Page two content');
  });

  it('caps total characters at maxChars and appends a char-truncation note', async () => {
    const args = readInputSchema.parse({ path: fixture('sample.pdf'), maxChars: 33 });
    const result = await readHandler(args);
    const sc = result.structuredContent as { pagesReturned: number; pages: { page: number }[] };
    expect(sc.pagesReturned).toBe(1);
    expect(sc.pages[0].page).toBe(1);
    expect(result.content[0].text).toContain('Page one content');
    expect(result.content[0].text).not.toContain('Page two content');
    expect(result.content[0].text).toContain('[truncated at 33 characters]');
  });
});

describe('pdf.read error paths', () => {
  it('returns isError for a missing file', async () => {
    const args = readInputSchema.parse({ path: fixture('does-not-exist.pdf') });
    const result = await readHandler(args);
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('not found');
  });

  it('returns isError for a non-PDF file', async () => {
    const args = readInputSchema.parse({ path: fixture('not-pdf.txt') });
    const result = await readHandler(args);
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('not a valid PDF');
  });

  it('returns isError for an encrypted PDF without a password', async () => {
    const args = readInputSchema.parse({ path: fixture('encrypted.pdf') });
    const result = await readHandler(args);
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('encrypted');
  });

  it('returns isError for an encrypted PDF with the wrong password', async () => {
    const args = readInputSchema.parse({ path: fixture('encrypted.pdf'), password: 'wrong' });
    const result = await readHandler(args);
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('Incorrect password');
  });

  it('reads an encrypted PDF with the correct password', async () => {
    const args = readInputSchema.parse({ path: fixture('encrypted.pdf'), password: 'secret' });
    const result = await readHandler(args);
    expect(result.isError).not.toBe(true);
    expect(result.content[0].text).toContain('Page one content');
  });
});
