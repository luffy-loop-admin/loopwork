type Vendor = { id: string; name: string };
type Order = {
  id: string; domain: string; live_url: string | null; vendor_id: string | null; vendor_name: string | null;
  order_date: string | null; price_paid: number | null; currency: string | null; notes: string | null;
};

/** Inputs shared by "Add order" and "Edit order". Rendered inside an <ActionForm>. */
export default function OrderFields({ vendors, order }: { vendors: Vendor[]; order?: Order }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {order && <input type="hidden" name="id" value={order.id} />}
      <div className="sm:col-span-2">
        <label className="label" htmlFor="live_url">Live link URL</label>
        <input id="live_url" name="live_url" className="input" defaultValue={order?.live_url ?? ''} placeholder="https://example.com/my-guest-post" />
      </div>
      <div>
        <label className="label" htmlFor="domain">Website <span className="font-normal text-muted">(only if there is no live link yet)</span></label>
        <input id="domain" name="domain" className="input" defaultValue={order?.live_url ? '' : order?.domain ?? ''} placeholder="example.com" />
      </div>
      <div>
        <label className="label" htmlFor="vendor_id">Vendor</label>
        <select id="vendor_id" name="vendor_id" className="input" defaultValue={order?.vendor_id ?? ''}>
          <option value="">Not in the list</option>
          {vendors.map((v) => (
            <option key={v.id} value={v.id}>{v.name}</option>
          ))}
        </select>
      </div>
      <div>
        <label className="label" htmlFor="vendor_name">Vendor name <span className="font-normal text-muted">(if not in the list)</span></label>
        <input id="vendor_name" name="vendor_name" className="input" defaultValue={order?.vendor_id ? '' : order?.vendor_name ?? ''} />
      </div>
      <div>
        <label className="label" htmlFor="order_date">Order date</label>
        <input id="order_date" name="order_date" type="date" className="input" defaultValue={order?.order_date ?? ''} />
      </div>
      <div className="grid grid-cols-[1fr_6rem] gap-3">
        <div>
          <label className="label" htmlFor="price_paid">Price paid</label>
          <input id="price_paid" name="price_paid" inputMode="decimal" className="input" defaultValue={order?.price_paid ?? ''} />
        </div>
        <div>
          <label className="label" htmlFor="currency">Currency</label>
          <input id="currency" name="currency" maxLength={3} className="input" defaultValue={order?.currency ?? 'USD'} />
        </div>
      </div>
      <div>
        <label className="label" htmlFor="notes">Notes</label>
        <input id="notes" name="notes" className="input" defaultValue={order?.notes ?? ''} />
      </div>
    </div>
  );
}
