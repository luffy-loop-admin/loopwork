export type SheetKind = 'vendor' | 'orders' | 'payments';
export type FieldDef = { key: string; label: string; required?: boolean; hint?: string; guess: RegExp };

export const VENDOR_FIELDS: FieldDef[] = [
  { key: 'site', label: 'Website / domain', hint: 'Optional if you map the live link. Needed for rows without a live link.', guess: /^site|website|domain/i },
  { key: 'price', label: 'Price (PKR)', hint: 'Optional. Price or cost for the guest post / site.', guess: /price|cost|rate|fee|amount/i },
  { key: 'live_url', label: 'Live link URL', hint: 'Optional. Published guest post URL.', guess: /live|^link$|^url$|published url/i },
  { key: 'status', label: 'Status (Indexed / Not indexed)', hint: 'Optional. Status from the sheet (e.g. Indexed, Live).', guess: /status|index/i },
  { key: 'date', label: 'Date / Order date', hint: 'Optional. Date of the post or order.', guess: /date|ordered|bought|purchase/i },
  { key: 'article', label: 'Article doc link (DOC)', hint: 'Optional. Link to the article document / Google Doc.', guess: /article|doc/i },
  { key: 'pair', label: 'Pair', hint: 'Optional. Saved as text.', guess: /pair/i },
  { key: 'vendor', label: 'Vendor', hint: 'Optional. Overrides the selected vendor if specified in sheet.', guess: /vendor|seller|supplier|source/i },
  { key: 'currency', label: 'Currency', hint: 'Optional. Leave unused and PKR is assumed.', guess: /currency|curr/i },
  { key: 'da', label: 'DA', guess: /^da$|domain authority|moz/i },
  { key: 'dr', label: 'DR', guess: /^dr$|domain rating|ahrefs/i },
  { key: 'traffic', label: 'Traffic', guess: /traffic|visits|visitors/i },
  { key: 'niche', label: 'Niche / category', guess: /niche|category|topic|genre/i },
  { key: 'notes', label: 'Notes', guess: /note|comment|remark/i },
];

export const ORDER_FIELDS: FieldDef[] = [
  { key: 'site', label: 'Website / domain', hint: 'Optional if you map the live link. Needed for orders that are not live yet.', guess: /^site|website|domain/i },
  { key: 'live_url', label: 'Live link URL', hint: 'The website is taken from this link when no Website column is mapped.', guess: /live|^link$|^url$|published url/i },
  { key: 'pair', label: 'Pair', hint: 'Optional. Saved as text and shown next to the order.', guess: /pair/i },
  { key: 'article', label: 'Article doc link (DOC)', hint: 'Optional. Link to the article document / Google Doc.', guess: /article|doc/i },
  { key: 'vendor', label: 'Vendor', guess: /vendor|seller|supplier|source/i },
  { key: 'date', label: 'Order date', guess: /date|ordered|bought|purchase/i },
  { key: 'price', label: 'Price (PKR)', guess: /price|cost|amount|payment|paid/i },
  { key: 'status', label: 'Status (Indexed / Not indexed)', hint: 'Your team types "Indexed" here. It is imported automatically.', guess: /status|index/i },
  { key: 'currency', label: 'Currency', guess: /currency|curr/i },
  { key: 'notes', label: 'Notes', guess: /note|comment|remark/i },
];

export const PAYMENT_FIELDS: FieldDef[] = [
  { key: 'vendor', label: 'Vendor', required: true, guess: /vendor|seller|supplier|paid to|payee/i },
  { key: 'amount', label: 'Amount (PKR)', required: true, guess: /amount|pkr|total/i },
  { key: 'date', label: 'Payment date', required: true, guess: /date/i },
  { key: 'time', label: 'Payment time', guess: /time/i },
  { key: 'method', label: 'Payment method', guess: /method|mode|via|channel|account/i },
  { key: 'reference', label: 'Reference / transaction ID', guess: /ref|txn|trx|transaction|receipt/i },
  { key: 'currency', label: 'Currency', guess: /currency|curr/i },
  { key: 'notes', label: 'Notes', guess: /note|comment|remark/i },
];

export function fieldsFor(kind: SheetKind): FieldDef[] {
  if (kind === 'vendor') return VENDOR_FIELDS;
  if (kind === 'payments') return PAYMENT_FIELDS;
  return ORDER_FIELDS;
}

export const KIND_LABEL: Record<SheetKind, string> = {
  vendor: 'Vendor prices',
  orders: 'Order history',
  payments: 'Payments',
};
