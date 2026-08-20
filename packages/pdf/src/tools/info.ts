import { isAbsolute } from 'node:path';
import * as z from 'zod/v4';
import type { CallToolResult } from '@modelcontextprotocol/server';
import { loadDocument } from '../pdf/proxy.js';
import { getDocInfo, type DocInfo } from '../pdf/meta.js';

export const infoInputSchema = z.object({
  path: z.string().refine((p) => isAbsolute(p), 'Path must be absolute'),
  password: z.string().optional(),
});

export const infoOutputSchema = z.object({
  pages: z.number(),
  encrypted: z.boolean(),
  permissions: z
    .object({
      printing: z.boolean(),
      modifying: z.boolean(),
      extracting: z.boolean(),
      annotationsAndForms: z.boolean(),
      fillForms: z.boolean(),
      accessibility: z.boolean(),
      assemble: z.boolean(),
      highQualityPrint: z.boolean(),
    })
    .optional(),
  title: z.string().optional(),
  author: z.string().optional(),
  subject: z.string().optional(),
  keywords: z.array(z.string()).optional(),
  creator: z.string().optional(),
  producer: z.string().optional(),
  creationDate: z.string().optional(),
  modDate: z.string().optional(),
});

export type InfoInput = z.infer<typeof infoInputSchema>;

export async function infoHandler(args: InfoInput): Promise<CallToolResult> {
  try {
    const proxy = await loadDocument(args.path, args.password);
    const info: DocInfo = await getDocInfo(proxy);
    const lines = [`Pages: ${info.pages}`, `Encrypted: ${info.encrypted ? 'yes' : 'no'}`];
    if (info.title) lines.push(`Title: ${info.title}`);
    if (info.author) lines.push(`Author: ${info.author}`);
    if (info.subject) lines.push(`Subject: ${info.subject}`);
    if (info.keywords) lines.push(`Keywords: ${info.keywords.join(', ')}`);
    if (info.creator) lines.push(`Creator: ${info.creator}`);
    if (info.producer) lines.push(`Producer: ${info.producer}`);
    if (info.creationDate) lines.push(`CreationDate: ${info.creationDate}`);
    if (info.modDate) lines.push(`ModDate: ${info.modDate}`);
    return { content: [{ type: 'text', text: lines.join('\n') }], structuredContent: info };
  } catch (err) {
    return { content: [{ type: 'text', text: (err as Error).message }], isError: true };
  }
}
