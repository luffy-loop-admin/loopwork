type Vendor = { id: string; name: string };
type Order = {
  id?: string; domain?: string; live_url?: string | null; vendor_id?: string | null; vendor_name?: string | null;
  order_date?: string | null; price_paid?: number | null; currency?: string | null; notes?: string | null;
  order_status?: string | null; indexed_status?: string | null; pair?: string | null; article_url?: string | null;
};

/** Inputs shared by "Add / assign order" and "Edit order". Rendered inside an <ActionForm>. Pass a partial `order` to pre-fill. */
export default function OrderFields({ vendors, order, after }: { vendors: Vendor[]; order?: Order; after?: string }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {order?.id && <input type="hidden" name="id" value={order.id} />}
      {after && <input type="hidden" name="after" value={after} />}
      <div>
        <label className="label" htmlFor="vendor_id">Assign to vendor</label>
        <select id="vendor_id" name="vendor_id" className="input" defaultValue={order?.vendor_id ?? ''}>
          <option value="">Not in the list</option>
          {vendors.map((v) => (
            <option key={v.id} value={v.id}>{v.name}</option>
          ))}
        </select>
        <p className="mt-1 text-xs text-muted">The vendor will see this order in their account.</p>
      </div>
      <div>
        <label className="label" htmlFor="vendor_name">Vendor name <span className="font-normal text-muted">(if not in the list)</span></label>
        <input id="vendor_name" name="vendor_name" className="input" defaultValue={order?.vendor_id ? '' : order?.vendor_name ?? ''} />
      </div>
      <div>
        <label className="label" htmlFor="domain">Website</label>
        <input id="domain" name="domain" className="input" defaultValue={order?.domain ?? ''} placeholder="example.com" autoCapitalize="none" />
      </div>
      <div>
        <label className="label" htmlFor="order_date">Order date</label>
        <input id="order_date" name="order_date" type="date" className="input" defaultValue={order?.order_date ?? ''} />
      </div>
      <div className="grid grid-cols-[1fr_6rem] gap-3">
        <div>
          <label className="label" htmlFor="price_paid">Price (PKR)</label>
          <input id="price_paid" name="price_paid" inputMode="decimal" className="input" defaultValue={order?.price_paid ?? ''} />
        </div>
        <div>
          <label className="label" htmlFor="currency">Currency</label>
          <input id="currency" name="currency" maxLength={3} className="input" defaultValue={order?.currency ?? 'PKR'} />
        </div>
      </div>
      <div>
        <label className="label" htmlFor="order_status">Order status</label>
        <select id="order_status" name="order_status" className="input" defaultValue={order?.order_status ?? 'ordered'}>
          <option value="ordered">Ordered (waiting for link)</option>
          <option value="live">Live (link delivered)</option>
          <option value="cancelled">Cancelled</option>
        </select>
      </div>
      <div className="sm:col-span-2">
        <label className="label" htmlFor="live_url">Live link URL <span className="font-normal text-muted">(when delivered)</span></label>
        <input id="live_url" name="live_url" className="input" defaultValue={order?.live_url ?? ''} placeholder="https://example.com/my-guest-post" autoCapitalize="none" />
      </div>
      <div>
        <label className="label" htmlFor="indexed_status">Index status</label>
        <select id="indexed_status" name="indexed_status" className="input" defaultValue={order?.indexed_status ?? 'pending'}>
          <option value="pending">Pending</option>
          <option value="indexed">Indexed</option>
          <option value="not_indexed">Not indexed</option>
        </select>
      </div>
      <div>
        <label className="label" htmlFor="pair">Pair</label>
        <input id="pair" name="pair" className="input" defaultValue={order?.pair ?? ''} />
      </div>
      <div>
        <label className="label" htmlFor="article_url">Article doc link</label>
        <input id="article_url" name="article_url" className="input" defaultValue={order?.article_url ?? ''} autoCapitalize="none" />
      </div>
      <div>
        <label className="label" htmlFor="notes">Notes</label>
        <input id="notes" name="notes" className="input" defaultValue={order?.notes ?? ''} />
      </div>
      {!order?.id && (
        <div className="sm:col-span-2 pt-2">
          <label className="inline-flex items-center gap-2 cursor-pointer text-sm font-medium text-foreground">
            <input type="checkbox" name="ring_vendor" defaultChecked className="h-4 w-4 rounded border-line text-accent focus:ring-accent" />
            <span>🔔 Ring vendor&apos;s phone / device when this order is saved</span>
          </label>
          <p className="ml-6 text-xs text-muted">Plays the &quot;New order from Loop&quot; ringtone on the vendor&apos;s logged-in device.</p>
        </div>
      )}
    </div>
  );
}
