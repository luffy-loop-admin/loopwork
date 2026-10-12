import { NextResponse } from 'next/server';
import { checkOrders } from '@/lib/indexing';

export const maxDuration = 300;
export const dynamic = 'force-dynamic';

// Vercel Cron (daily, see vercel.json). Checks links not checked in the last 20 hours, oldest first.
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get('authorization') !== `Bearer ${secret}`) {
    return new NextResponse('Unauthorized', { status: 401 });
  }
  try {
    const r = await checkOrders({ onlyStaleHours: 20, budgetMs: 270_000, concurrency: 6 });
    return NextResponse.json({ ok: true, checked: r.checked, failed: r.failed, total: r.total, remaining: r.remaining });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : 'Check failed' }, { status: 500 });
  }
}
