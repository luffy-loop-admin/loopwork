import Link from 'next/link';
import { notFound } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import ActionForm from '@/components/ActionForm';
import ActionButton from '@/components/ActionButton';
import OrderFields from '@/components/OrderFields';
import { deleteOrder, saveOrder } from '@/app/actions/orders';

export default async function EditOrderPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const [{ data: order }, { data: vendors }] = await Promise.all([
    supabase.from('orders').select('id,domain,live_url,vendor_id,vendor_name,order_date,price_paid,currency,notes').eq('id', id).maybeSingle(),
    supabase.from('vendors').select('id,name').order('name'),
  ]);
  if (!order) notFound();

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-xl font-semibold">Edit order</h1>
        <Link href="/admin/orders" className="link text-sm">Back to orders</Link>
      </div>
      <div className="card p-4 sm:p-5">
        <ActionForm
          action={saveOrder}
          submitLabel="Save order"
          extraButtons={<ActionButton action={deleteOrder.bind(null, id)} label="Delete order" className="btn btn-danger" confirm="Delete this order permanently?" />}
        >
          <OrderFields vendors={(vendors ?? []) as { id: string; name: string }[]} order={order as any} />
        </ActionForm>
      </div>
    </div>
  );
}
