import { extractText, extractTextItems, type StructuredTextItem } from 'unpdf';
import type { PdfProxy } from './proxy.js';

export interface ItemOut {
  str: string;
  x: number;
  y: number;
  width: number;
  height: number;
  fontSize: number;
  fontFamily?: string;
  dir: string;
  hasEOL: boolean;
}

export interface PageOut {
  page: number;
  text: string;
  items?: ItemOut[];
}

export interface ExtractResult {
  pages: PageOut[];
  text: string;
}

export async function extractPagesText(
  proxy: PdfProxy,
  pageList: number[],
  structured: boolean,
): Promise<ExtractResult> {
  if (pageList.length === 0) return { pages: [], text: '' };
  const { text } = await extractText(proxy);
  const arr = Array.isArray(text) ? text : [text];
  let itemsPages: StructuredTextItem[][] | null = null;
  if (structured) {
    const r = await extractTextItems(proxy);
    itemsPages = r.items;
  }
  const pages: PageOut[] = pageList.map((p) => {
    const page: PageOut = { page: p, text: arr[p - 1] ?? '' };
    if (structured && itemsPages) page.items = itemsPages[p - 1].map(shapeItem);
    return page;
  });
  return { pages, text: joinPages(pages) };
}

export function shapeItem(it: StructuredTextItem): ItemOut {
  const out: ItemOut = {
    str: it.str,
    x: it.x,
    y: it.y,
    width: it.width,
    height: it.height,
    fontSize: it.fontSize,
    dir: it.dir,
    hasEOL: it.hasEOL,
  };
  if (it.fontFamily !== '') out.fontFamily = it.fontFamily;
  return out;
}

export function joinPages(pages: PageOut[]): string {
  return pages.map((p) => `--- Page ${p.page} ---\n${p.text}`).join('\n\n');
}

export function truncateChars(
  pages: PageOut[],
  maxChars: number,
): { pages: PageOut[]; note: string | null } {
  if (pages.length === 0 || joinPages(pages).length <= maxChars) {
    return { pages, note: null };
  }
  let len = 0;
  let count = 0;
  for (let i = 0; i < pages.length; i++) {
    const seg = `--- Page ${pages[i].page} ---\n${pages[i].text}`;
    const add = i === 0 ? seg.length : seg.length + 2;
    if (len + add > maxChars) break;
    len += add;
    count++;
  }
  return { pages: pages.slice(0, count), note: `[truncated at ${maxChars} characters]` };
}
