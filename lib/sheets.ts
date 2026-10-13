import 'server-only';
import { JWT } from 'google-auth-library';

export function parseSpreadsheetId(url: string): string | null {
  const m = url.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  if (m) return m[1];
  const t = url.trim();
  return /^[a-zA-Z0-9-_]{25,}$/.test(t) ? t : null;
}

export function serviceAccountEmail(): string {
  return process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL ?? '';
}

/** Rebuilds the private key cleanly, whatever quotes, commas, "\n" or real line breaks were pasted. */
function normalizeKey(raw: string): string {
  const body = raw
    .replace(/\\n/g, '\n')
    .replace(/-----BEGIN [A-Z ]*PRIVATE KEY-----/, '')
    .replace(/-----END [A-Z ]*PRIVATE KEY-----/, '')
    .replace(/["',\s]/g, '');
  if (body.length < 1000) {
    throw new Error('GOOGLE_PRIVATE_KEY looks cut off or incomplete. Paste the full private_key value from the JSON file.');
  }
  const lines = body.match(/.{1,64}/g) ?? [];
  return `-----BEGIN PRIVATE KEY-----\n${lines.join('\n')}\n-----END PRIVATE KEY-----\n`;
}

let jwt: JWT | null = null;
function getClient(): JWT {
  if (!jwt) {
    const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
    const raw = process.env.GOOGLE_PRIVATE_KEY;
    if (!email || !raw) {
      throw new Error('Google service account is not configured (GOOGLE_SERVICE_ACCOUNT_EMAIL / GOOGLE_PRIVATE_KEY).');
    }
    jwt = new JWT({ email, key: normalizeKey(raw), scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'] });
  }
  return jwt;
}

async function gfetch(url: string): Promise<any> {
  const { token } = await getClient().getAccessToken();
  if (!token) throw new Error('Could not get a Google access token. Check the service account key.');
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store' });
  if (!res.ok) {
    let detail = '';
    try {
      const j = await res.json();
      detail = j?.error?.message ?? '';
    } catch {
      /* ignore */
    }
    if (res.status === 403 || res.status === 404) {
      throw new Error(
        `Google could not open this sheet (${res.status}). Share it with ${serviceAccountEmail() || 'the service account email'} (Viewer) and check the link. ${detail}`.trim(),
      );
    }
    if (res.status === 400 && /Unable to parse range/i.test(detail)) {
      throw new Error(`A tab name was not found in this spreadsheet. Check the tab names exactly. ${detail}`);
    }
    if (res.status === 429) throw new Error('Google is rate limiting requests. Wait a minute and try again.');
    throw new Error(`Google Sheets error ${res.status}. ${detail}`.trim());
  }
  return res.json();
}

/** Names of every tab in the spreadsheet, in order. */
export async function fetchSheetTabs(spreadsheetId: string): Promise<string[]> {
  const meta = await gfetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}?fields=sheets.properties.title`);
  const titles = ((meta?.sheets ?? []) as any[]).map((s) => s?.properties?.title as string).filter(Boolean);
  if (!titles.length) throw new Error('This spreadsheet has no tabs.');
  return titles;
}

/**
 * Tab setting:  empty = first tab | "*" = every tab | "Jan 2026, Feb 2026" = those tabs.
 * Names that do not exist are ignored (reported back in "missing").
 */
export async function resolveTabs(spreadsheetId: string, spec: string | null): Promise<{ tabs: string[]; missing: string[] }> {
  const all = await fetchSheetTabs(spreadsheetId);
  const s = (spec ?? '').trim();
  if (!s) return { tabs: [all[0]], missing: [] };
  if (s === '*' || /^all$/i.test(s)) return { tabs: all, missing: [] };
  const wanted = s.split(/[,\n;]+/).map((t) => t.trim()).filter(Boolean);
  const lower = new Map(all.map((t) => [t.toLowerCase(), t]));
  const tabs: string[] = [];
  const missing: string[] = [];
  for (const w of wanted) {
    const hit = lower.get(w.toLowerCase());
    if (hit) {
      if (!tabs.includes(hit)) tabs.push(hit);
    } else missing.push(w);
  }
  if (!tabs.length) throw new Error(`None of these tabs exist: ${wanted.join(', ')}. Tabs found: ${all.join(', ')}`);
  return { tabs, missing };
}

export type SheetTable = { tab: string; headers: string[]; body: unknown[][] };

const q = (title: string) => `'${title.replace(/'/g, "''")}'`;

/** Reads several tabs in ONE Google request and splits each into headers + rows. */
export async function fetchTables(spreadsheetId: string, spec: string | null, headerRow: number): Promise<{ tables: SheetTable[]; missing: string[] }> {
  const { tabs, missing } = await resolveTabs(spreadsheetId, spec);
  const ranges = tabs.map((t) => `ranges=${encodeURIComponent(q(t))}`).join('&');
  const data = await gfetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values:batchGet?${ranges}&valueRenderOption=UNFORMATTED_VALUE&dateTimeRenderOption=SERIAL_NUMBER&majorDimension=ROWS`,
  );
  const tables: SheetTable[] = ((data?.valueRanges ?? []) as any[]).map((vr, i) => {
    const rows = (vr?.values ?? []) as unknown[][];
    return {
      tab: tabs[i],
      headers: (rows[headerRow - 1] ?? []).map((c) => String(c ?? '').trim()),
      body: rows.slice(headerRow),
    };
  });
  return { tables, missing };
}

/** Header names only (fast), read from the FIRST tab of the setting. Used by "Load columns". */
export async function fetchSheetHeaders(spreadsheetId: string, spec: string | null, headerRow: number): Promise<string[]> {
  const { tabs } = await resolveTabs(spreadsheetId, spec);
  const range = encodeURIComponent(`${q(tabs[0])}!${headerRow}:${headerRow}`);
  const data = await gfetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${range}?valueRenderOption=UNFORMATTED_VALUE&majorDimension=ROWS`,
  );
  const rows = (data?.values ?? []) as unknown[][];
  return (rows[0] ?? []).map((c) => String(c ?? '').trim());
}

export function colIndex(headers: string[], name: string | undefined): number {
  if (!name) return -1;
  const n = name.trim().toLowerCase();
  return headers.findIndex((h) => h.toLowerCase() === n);
}
