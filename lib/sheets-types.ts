import { cleanUrl } from '@/lib/domain';

export type SheetTable = { tab: string; headers: string[]; body: unknown[][] };

export function colIndex(headers: string[], name: string | undefined): number {
  if (!name) return -1;
  const n = name.trim().toLowerCase();
  return headers.findIndex((h) => h.toLowerCase() === n);
}

/**
 * Converts a 0-based column index to A1 column letter (0 -> A, 1 -> B, 25 -> Z, 26 -> AA).
 */
export function colLetter(colIdx: number): string {
  let temp = colIdx;
  let letter = '';
  while (temp >= 0) {
    letter = String.fromCharCode((temp % 26) + 65) + letter;
    temp = Math.floor(temp / 26) - 1;
  }
  return letter;
}

export type WritebackCellUpdate = {
  range: string;
  value: 'Indexed' | 'Not indexed';
};

/**
 * Identifies the exact cells that need to be updated in a sheet tab.
 * Idempotent: Only returns cells whose current text does not already match the target status.
 */
export function buildWritebackRanges(
  tab: string,
  headers: string[],
  body: unknown[][],
  headerRow: number,
  mapping: { live_url?: string; status?: string },
  items: { live_url: string; status: 'indexed' | 'not_indexed' }[]
): WritebackCellUpdate[] {
  const liveIdx = colIndex(headers, mapping.live_url);
  const statusIdx = colIndex(headers, mapping.status);
  if (liveIdx < 0 || statusIdx < 0 || !items.length) return [];

  const statusLetter = colLetter(statusIdx);
  const updates: WritebackCellUpdate[] = [];

  // Map normalized live URL to target status
  const targetMap = new Map<string, 'Indexed' | 'Not indexed'>();
  for (const it of items) {
    if (it.status !== 'indexed' && it.status !== 'not_indexed') continue;
    const clean = cleanUrl(it.live_url);
    if (clean) {
      targetMap.set(clean.toLowerCase(), it.status === 'indexed' ? 'Indexed' : 'Not indexed');
    }
  }

  const escapedTab = tab.replace(/'/g, "''");

  for (let r = 0; r < body.length; r++) {
    const row = body[r];
    const cellLive = cleanUrl(row[liveIdx]);
    if (!cellLive) continue;

    const targetStatus = targetMap.get(cellLive.toLowerCase());
    if (!targetStatus) continue;

    const currentVal = String(row[statusIdx] ?? '').trim();
    // Only write if cell value is different (idempotent)
    if (currentVal.toLowerCase() === targetStatus.toLowerCase()) {
      continue;
    }

    const rowNum = headerRow + 1 + r;
    updates.push({
      range: `'${escapedTab}'!${statusLetter}${rowNum}`,
      value: targetStatus,
    });
  }

  return updates;
}
