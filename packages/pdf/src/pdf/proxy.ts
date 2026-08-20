import { readFile } from 'node:fs/promises';
import { getDocumentProxy } from 'unpdf';

const PASSWORD_NEEDED = 1;
const PASSWORD_INCORRECT = 2;

export type PdfProxy = Awaited<ReturnType<typeof getDocumentProxy>>;

export async function loadDocument(path: string, password?: string): Promise<PdfProxy> {
  let buffer: Buffer;
  try {
    buffer = await readFile(path);
  } catch (err) {
    const e = err as NodeJS.ErrnoException;
    if (e?.code === 'ENOENT') throw new Error(`File not found: ${path}`);
    throw new Error(`Cannot read file: ${path} (${(err as Error).message})`);
  }
  try {
    return await getDocumentProxy(new Uint8Array(buffer), password ? { password } : {});
  } catch (err) {
    const e = err as Error & { code?: number };
    if (e.name === 'PasswordException') {
      if (e.code === PASSWORD_NEEDED) throw new Error('PDF is encrypted; provide a password');
      if (e.code === PASSWORD_INCORRECT) throw new Error('Incorrect password for encrypted PDF');
      throw new Error(`Password error: ${e.message ?? 'unknown'}`);
    }
    if (e.name === 'InvalidPDFException') throw new Error(`File is not a valid PDF: ${path}`);
    throw err;
  }
}
