export function parsePageRange(pages: string | undefined, totalPages: number): number[] {
  if (pages === undefined || pages.trim() === '') return range(1, totalPages);
  const result = new Set<number>();
  for (const token of pages.split(',')) {
    const t = token.trim();
    if (t === '') continue;
    const rangeMatch = /^(\d+)-(\d+)$/.exec(t);
    if (rangeMatch) {
      const start = Number.parseInt(rangeMatch[1], 10);
      const rawEnd = Number.parseInt(rangeMatch[2], 10);
      if (start < 1 || rawEnd < start) throw new Error(`Invalid page range: ${t}`);
      const end = Math.min(rawEnd, totalPages);
      for (let p = start; p <= end; p++) result.add(p);
    } else if (/^\d+$/.test(t)) {
      const p = Number.parseInt(t, 10);
      if (p < 1) throw new Error(`Invalid page number: ${t}`);
      result.add(p);
    } else {
      throw new Error(`Invalid page range: ${t}`);
    }
  }
  return [...result].filter((p) => p <= totalPages).sort((a, b) => a - b);
}

function range(start: number, end: number): number[] {
  const out: number[] = [];
  for (let p = start; p <= end; p++) out.push(p);
  return out;
}

export function applyMaxPages(
  pageList: number[],
  maxPages: number,
  totalPages: number,
): { pages: number[]; note: string | null } {
  if (pageList.length <= maxPages) return { pages: pageList, note: null };
  const shown = pageList.slice(0, maxPages);
  const first = shown[0];
  const last = shown[shown.length - 1];
  return { pages: shown, note: `[truncated, pages ${first}-${last} of ${totalPages} shown]` };
}
