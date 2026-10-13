import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import ActionForm from '@/components/ActionForm';
import OrderFields from '@/components/OrderFields';
import { saveOrder } from '@/app/actions/orders';

// Opened from the "Assign order" button on a search result: website, vendor and price are pre-filled.
export default async function NewOrderPage({ searchParams }: { searchParams: Promise<{ domain?: string; vendor?: string; price?: string; currency?: string }> }) {
  const sp = await searchParams;
  const supabase = await createClient();
  const { data } = await supabase.from('vendors').select('id,name').eq('active', true).order('name');
  const vendors = (data ?? []) as { id: string; name: string }[];
  const today = new Date().toISOString().slice(0, 10);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-xl font-semibold">Assign a new order</h1>
        <Link href="/admin/orders" className="link text-sm">Back to orders</Link>
      </div>
      <div className="card p-4 sm:p-5">
        <ActionForm action={saveOrder} submitLabel="Assign order">
          <OrderFields
            vendors={vendors}
            after="/admin/orders"
            order={{
              domain: sp.domain ?? '',
              vendor_id: sp.vendor ?? '',
              price_paid: sp.price ? Number(sp.price) : null,
              currency: sp.currency ?? 'PKR',
              order_date: today,
              order_status: 'ordered',
            }}
          />
        </ActionForm>
      </div>
    </div>
  );
}
