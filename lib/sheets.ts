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

let jwt: JWT | null = null;
function getClient(): JWT {
  if (!jwt) {
    const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
    let key = process.env.GOOGLE_PRIVATE_KEY;
    if (!email || !key) {
      throw new Error('Google service account is not configured (GOOGLE_SERVICE_ACCOUNT_EMAIL / GOOGLE_PRIVATE_KEY).');
    }
    key = key.trim().replace(/^"|"$/g, '').replace(/\\n/g, '\n');
    jwt = new JWT({ email, key, scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'] });
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
        `Google could not open this sheet (${res.status}). Share it with ${serviceAccountEmail() || 'the service account email'} (Viewer) and check the link/tab name. ${detail}`.trim(),
      );
    }
    if (res.status === 400 && /Unable to parse range/i.test(detail)) {
      throw new Error(`Tab name not found in this spreadsheet. Check the tab name exactly. ${detail}`);
    }
    throw new Error(`Google Sheets error ${res.status}. ${detail}`.trim());
  }
  return res.json();
}

async function resolveTitle(spreadsheetId: string, tab: string | null): Promise<string> {
  if (tab && tab.trim()) return tab.trim();
  const meta = await gfetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}?fields=sheets.properties.title`);
  const title = meta?.sheets?.[0]?.properties?.title;
  if (!title) throw new Error('This spreadsheet has no tabs.');
  return title as string;
}

async function getValues(spreadsheetId: string, title: string, a1Suffix = ''): Promise<unknown[][]> {
  const range = encodeURIComponent(`'${title.replace(/'/g, "''")}'${a1Suffix}`);
  const data = await gfetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${range}?valueRenderOption=UNFORMATTED_VALUE&dateTimeRenderOption=SERIAL_NUMBER&majorDimension=ROWS`,
  );
  return (data?.values ?? []) as unknown[][];
}

/** All rows of a tab (first tab when tab is empty). */
export async function fetchSheetRows(spreadsheetId: string, tab: string | null): Promise<unknown[][]> {
  const title = await resolveTitle(spreadsheetId, tab);
  return getValues(spreadsheetId, title);
}

/** Header names only (fast), used by the "Load columns" button. */
export async function fetchSheetHeaders(spreadsheetId: string, tab: string | null, headerRow: number): Promise<string[]> {
  const title = await resolveTitle(spreadsheetId, tab);
  const rows = await getValues(spreadsheetId, title, `!${headerRow}:${headerRow}`);
  return (rows[0] ?? []).map((c) => String(c ?? '').trim());
}

export function readTable(rows: unknown[][], headerRow: number): { headers: string[]; body: unknown[][] } {
  const headers = (rows[headerRow - 1] ?? []).map((c) => String(c ?? '').trim());
  return { headers, body: rows.slice(headerRow) };
}

export function colIndex(headers: string[], name: string | undefined): number {
  if (!name) return -1;
  const n = name.trim().toLowerCase();
  return headers.findIndex((h) => h.toLowerCase() === n);
}
