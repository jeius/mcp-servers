import { isAbsolute } from 'node:path';
import * as z from 'zod/v4';
import type { CallToolResult } from '@modelcontextprotocol/server';
import { loadDocument } from '../pdf/proxy.js';
import { applyMaxPages, parsePageRange } from '../pdf/pages.js';
import { extractPagesText, joinPages, truncateChars } from '../pdf/text.js';

export const readInputSchema = z.object({
  path: z.string().refine((p) => isAbsolute(p), 'Path must be absolute'),
  password: z.string().optional(),
  pages: z.string().optional(),
  structured: z.boolean().default(false),
  maxPages: z.number().int().positive().default(50),
  maxChars: z.number().int().min(1).default(200000),
});

export const readOutputSchema = z.object({
  totalPages: z.number(),
  pagesReturned: z.number(),
  pages: z.array(
    z.object({
      page: z.number(),
      text: z.string(),
      items: z
        .array(
          z.object({
            str: z.string(),
            x: z.number(),
            y: z.number(),
            width: z.number(),
            height: z.number(),
            fontSize: z.number(),
            fontFamily: z.string().optional(),
            dir: z.string(),
            hasEOL: z.boolean(),
          }),
        )
        .optional(),
    }),
  ),
});

export type ReadInput = z.infer<typeof readInputSchema>;

export async function readHandler(args: ReadInput): Promise<CallToolResult> {
  try {
    const proxy = await loadDocument(args.path, args.password);
    const totalPages = proxy.numPages;
    const pageList = parsePageRange(args.pages, totalPages);
    const capped = applyMaxPages(pageList, args.maxPages, totalPages);
    const { pages } = await extractPagesText(proxy, capped.pages, args.structured);
    const { pages: finalPages, note: charNote } = truncateChars(pages, args.maxChars);
    const notes = [capped.note, charNote].filter((n): n is string => n !== null);
    const body = joinPages(finalPages);
    const contentText = notes.length > 0 ? `${body}\n\n${notes.join(' ')}` : body;
    return {
      content: [{ type: 'text', text: contentText }],
      structuredContent: {
        totalPages,
        pagesReturned: finalPages.length,
        pages: finalPages,
      },
    };
  } catch (err) {
    return { content: [{ type: 'text', text: (err as Error).message }], isError: true };
  }
}
