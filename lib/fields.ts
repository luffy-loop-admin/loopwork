export type FieldDef = { key: string; label: string; required?: boolean; hint?: string; guess: RegExp };

export const VENDOR_FIELDS: FieldDef[] = [
  { key: 'site', label: 'Website / domain', required: true, guess: /site|website|domain|url|web/i },
  { key: 'price', label: 'Price', required: true, guess: /price|cost|rate|fee|\$/i },
  { key: 'currency', label: 'Currency', hint: 'Optional. Falls back to the default currency.', guess: /currency|curr/i },
  { key: 'da', label: 'DA', guess: /^da$|domain authority|moz/i },
  { key: 'dr', label: 'DR', guess: /^dr$|domain rating|ahrefs/i },
  { key: 'traffic', label: 'Traffic', guess: /traffic|visits|visitors/i },
  { key: 'niche', label: 'Niche / category', guess: /niche|category|topic|genre/i },
];

export const ORDER_FIELDS: FieldDef[] = [
  { key: 'site', label: 'Website / domain', hint: 'Needed unless the live link column is mapped.', guess: /^site|website|domain/i },
  { key: 'live_url', label: 'Live link URL', required: true, guess: /live|link|post url|article|published/i },
  { key: 'vendor', label: 'Vendor', guess: /vendor|seller|supplier|source/i },
  { key: 'date', label: 'Order date', guess: /date|ordered|bought|purchase/i },
  { key: 'price', label: 'Payment / price paid', guess: /payment|paid|price|cost|amount/i },
  { key: 'currency', label: 'Currency', guess: /currency|curr/i },
  { key: 'notes', label: 'Notes', guess: /note|comment|remark/i },
];

export function fieldsFor(kind: 'vendor' | 'orders'): FieldDef[] {
  return kind === 'vendor' ? VENDOR_FIELDS : ORDER_FIELDS;
}
