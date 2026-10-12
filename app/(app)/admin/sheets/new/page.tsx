import { createClient } from '@/lib/supabase/server';
import { serviceAccountEmail } from '@/lib/sheets';
import SheetForm from '@/components/SheetForm';
import { saveSource } from '@/app/actions/sheets';

export const maxDuration = 300;

export default async function NewSheetPage({ searchParams }: { searchParams: Promise<{ kind?: string; vendor?: string }> }) {
  const sp = await searchParams;
  const kind = sp.kind === 'orders' ? 'orders' : 'vendor';
  const supabase = await createClient();
  const { data } = await supabase.from('vendors').select('id,name').eq('active', true).order('name');
  const vendors = (data ?? []) as { id: string; name: string }[];

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">{kind === 'vendor' ? 'Add a vendor sheet' : 'Add your order history sheet'}</h1>
      {kind === 'vendor' && vendors.length === 0 ? (
        <p className="card p-4 text-sm">Add a vendor first, then come back to link their sheet.</p>
      ) : (
        <SheetForm kind={kind} vendors={vendors} serviceEmail={serviceAccountEmail()} action={saveSource} initial={{ vendor_id: sp.vendor ?? '' }} />
      )}
    </div>
  );
}
