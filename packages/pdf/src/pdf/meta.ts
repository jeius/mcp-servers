import { getMeta } from 'unpdf';
import type { PdfProxy } from './proxy.js';

export interface Permissions {
  printing: boolean;
  modifying: boolean;
  extracting: boolean;
  annotationsAndForms: boolean;
  fillForms: boolean;
  accessibility: boolean;
  assemble: boolean;
  highQualityPrint: boolean;
}

export interface DocInfo {
  pages: number;
  encrypted: boolean;
  permissions?: Permissions;
  title?: string;
  author?: string;
  subject?: string;
  keywords?: string[];
  creator?: string;
  producer?: string;
  creationDate?: string;
  modDate?: string;
}

const PERM_BITS = {
  printing: 4,
  modifying: 8,
  extracting: 16,
  annotationsAndForms: 32,
  fillForms: 256,
  accessibility: 512,
  assemble: 1024,
  highQualityPrint: 2048,
} as const;

export function decodePermissions(flags: number[]): Permissions {
  return {
    printing: flags.includes(PERM_BITS.printing),
    modifying: flags.includes(PERM_BITS.modifying),
    extracting: flags.includes(PERM_BITS.extracting),
    annotationsAndForms: flags.includes(PERM_BITS.annotationsAndForms),
    fillForms: flags.includes(PERM_BITS.fillForms),
    accessibility: flags.includes(PERM_BITS.accessibility),
    assemble: flags.includes(PERM_BITS.assemble),
    highQualityPrint: flags.includes(PERM_BITS.highQualityPrint),
  };
}

export async function getDocInfo(proxy: PdfProxy): Promise<DocInfo> {
  const perms = await proxy.getPermissions();
  const encrypted = perms !== null;
  const { info } = await getMeta(proxy);
  const docInfo: DocInfo = { pages: proxy.numPages, encrypted };
  if (perms !== null) docInfo.permissions = decodePermissions(perms);
  setStr(info.Title, (v) => (docInfo.title = v));
  setStr(info.Author, (v) => (docInfo.author = v));
  setStr(info.Subject, (v) => (docInfo.subject = v));
  setStr(info.Creator, (v) => (docInfo.creator = v));
  setStr(info.Producer, (v) => (docInfo.producer = v));
  setStr(info.CreationDate, (v) => (docInfo.creationDate = v));
  setStr(info.ModDate, (v) => (docInfo.modDate = v));
  setStr(info.Keywords, (v) => {
    const kws = v.split(',').map((s) => s.trim()).filter(Boolean);
    if (kws.length > 0) docInfo.keywords = kws;
  });
  return docInfo;
}

function setStr(value: unknown, set: (v: string) => void): void {
  if (typeof value === 'string' && value !== '') set(value);
}
