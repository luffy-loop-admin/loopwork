import { notFound } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { serviceAccountEmail } from '@/lib/sheets';
import SheetForm from '@/components/SheetForm';
import { saveSource } from '@/app/actions/sheets';

export const maxDuration = 300;

export default async function EditSheetPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const [{ data: src }, { data: vendorRows }] = await Promise.all([
    supabase.from('sheet_sources').select('*').eq('id', id).maybeSingle(),
    supabase.from('vendors').select('id,name').order('name'),
  ]);
  if (!src) notFound();
  const s = src as any;

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">Edit sheet</h1>
      <SheetForm
        kind={s.kind}
        vendors={(vendorRows ?? []) as { id: string; name: string }[]}
        serviceEmail={serviceAccountEmail()}
        action={saveSource}
        initial={{
          id: s.id, vendor_id: s.vendor_id, label: s.label, sheet_url: s.sheet_url, tab_name: s.tab_name,
          header_row: s.header_row, default_currency: s.default_currency, active: s.active, mapping: s.mapping ?? {},
        }}
      />
    </div>
  );
}
