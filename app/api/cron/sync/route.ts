import { NextResponse } from 'next/server';
import { syncAllSources } from '@/lib/sync';

export const maxDuration = 300;
export const dynamic = 'force-dynamic';

// Vercel Cron (every 6 hours, see vercel.json). Also callable from any external scheduler with the same Bearer token.
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get('authorization') !== `Bearer ${secret}`) {
    return new NextResponse('Unauthorized', { status: 401 });
  }
  try {
    const result = await syncAllSources(270_000);
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : 'Sync failed' }, { status: 500 });
  }
}
