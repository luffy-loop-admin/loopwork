import { createClient } from '@/lib/supabase/server';
import { serviceAccountEmail } from '@/lib/sheets';
import SheetForm from '@/components/SheetForm';
import type { SheetKind } from '@/lib/fields';
import { saveSource } from '@/app/actions/sheets';

export const maxDuration = 300;

export default async function NewSheetPage({ searchParams }: { searchParams: Promise<{ kind?: string; vendor?: string }> }) {
  const sp = await searchParams;
  const kind: SheetKind =
    sp.kind === 'orders' ? 'orders' : sp.kind === 'payments' ? 'payments' : sp.kind === 'ledger' ? 'ledger' : 'vendor';
  const supabase = await createClient();
  const { data } = await supabase.from('vendors').select('id,name').eq('active', true).order('name');
  const vendors = (data ?? []) as { id: string; name: string }[];

  const title =
    kind === 'ledger'
      ? 'Add vendor ledger sheet'
      : kind === 'vendor'
      ? 'Add a vendor price sheet'
      : kind === 'orders'
      ? 'Add your order history sheet'
      : 'Add your payments sheet';

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">{title}</h1>
      {(kind === 'vendor' || kind === 'ledger') && vendors.length === 0 ? (
        <p className="card p-4 text-sm">Add a vendor first, then come back to link their sheet.</p>
      ) : (
        <SheetForm kind={kind} vendors={vendors} serviceEmail={serviceAccountEmail()} action={saveSource} initial={{ vendor_id: sp.vendor ?? '' }} />
      )}
    </div>
  );
}
