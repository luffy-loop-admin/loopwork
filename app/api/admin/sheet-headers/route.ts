import { NextResponse, type NextRequest } from 'next/server';
import { getAdmin } from '@/lib/auth';
import { fetchSheetHeaders, parseSpreadsheetId } from '@/lib/sheets';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  if (!(await getAdmin())) return NextResponse.json({ error: 'Not allowed.' }, { status: 403 });
  const sp = req.nextUrl.searchParams;
  const id = parseSpreadsheetId(sp.get('url') ?? '');
  if (!id) return NextResponse.json({ error: 'That does not look like a Google Sheets link.' }, { status: 400 });
  const row = Math.max(1, Math.floor(Number(sp.get('row')) || 1));
  try {
    const headers = await fetchSheetHeaders(id, sp.get('tab') || null, row);
    const clean = headers.filter((h) => h);
    if (!clean.length) return NextResponse.json({ error: `Row ${row} is empty. Check the header row number.` }, { status: 400 });
    return NextResponse.json({ headers: clean });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Could not read the sheet.' }, { status: 400 });
  }
}
