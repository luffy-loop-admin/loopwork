import { NextResponse, type NextRequest } from 'next/server';
import { getAdmin } from '@/lib/auth';
import { fetchSheetTabs, parseSpreadsheetId } from '@/lib/sheets';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  if (!(await getAdmin())) return NextResponse.json({ error: 'Not allowed.' }, { status: 403 });
  const sp = req.nextUrl.searchParams;
  const id = parseSpreadsheetId(sp.get('url') ?? '');
  if (!id) return NextResponse.json({ error: 'That does not look like a Google Sheets link.' }, { status: 400 });

  try {
    const tabs = await fetchSheetTabs(id);
    return NextResponse.json({ tabs });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Could not read the sheet tabs.' }, { status: 400 });
  }
}
