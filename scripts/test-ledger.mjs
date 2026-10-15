import assert from 'node:assert/strict';
import {
  inferMonthFromTabName,
  weekStart,
  weekLabel,
  parseLedgerOrders,
  parseLedgerPayments,
  previewLedger,
} from '../lib/ledger.ts';
import { parseDate } from '../lib/parse.ts';
import { normalizeDomain } from '../lib/domain.ts';
import { buildWritebackRanges, colLetter } from '../lib/sheets-types.ts';

console.log('--- Testing Month Inference Edge Cases ---');
assert.equal(inferMonthFromTabName('August Links')?.monthName, 'August');
assert.equal(inferMonthFromTabName('August Links')?.year, 2026);
assert.equal(inferMonthFromTabName('August_Links')?.monthName, 'August');
assert.equal(inferMonthFromTabName('August2026')?.monthName, 'August');
assert.equal(inferMonthFromTabName('August2026')?.year, 2026);
assert.equal(inferMonthFromTabName('Aug2026')?.monthName, 'August');
assert.equal(inferMonthFromTabName('Aug 26')?.monthName, 'August');
assert.equal(inferMonthFromTabName('Aug 26')?.year, 2026);
assert.equal(inferMonthFromTabName('Aug_24')?.monthName, 'August');
assert.equal(inferMonthFromTabName('Aug_24')?.year, 2024);
assert.equal(inferMonthFromTabName('08-August')?.monthName, 'August');
assert.equal(inferMonthFromTabName('August(Links)')?.monthName, 'August');
assert.equal(inferMonthFromTabName('September Links')?.monthName, 'September');
assert.equal(inferMonthFromTabName('Sept')?.monthName, 'September');
assert.equal(inferMonthFromTabName('Sep')?.monthName, 'September');
assert.equal(inferMonthFromTabName('July')?.monthName, 'July');
assert.equal(inferMonthFromTabName('October')?.monthName, 'October');
assert.equal(inferMonthFromTabName('Payment History'), null);
assert.equal(inferMonthFromTabName('Travis Scott TL'), null);
assert.equal(inferMonthFromTabName('Remaining'), null);
assert.equal(inferMonthFromTabName('Master Price List'), null);
console.log('✓ Month inference passed with full edge case coverage.');

console.log('--- Testing Week Helpers ---');
// 2026-08-11 is Tuesday -> week start is Monday 2026-08-10
assert.equal(weekStart('2026-08-11'), '2026-08-10');
assert.equal(weekLabel('2026-08-11'), 'Week of 10 Aug 2026');
console.log('✓ Week helpers passed.');

console.log('--- Testing Date & Domain Helpers ---');
const serialAug11 = 46245;
assert.equal(parseDate(serialAug11), '2026-08-11');
assert.equal(normalizeDomain('https://alamdiya.com/'), 'alamdiya.com');
assert.equal(normalizeDomain('https://connection-hints.com/'), 'connection-hints.com');
assert.equal(normalizeDomain('starbucksmenuus.info/'), 'starbucksmenuus.info');
assert.equal(normalizeDomain('Wordmaticz.com'), 'wordmaticz.com');
console.log('✓ Date and domain helpers passed.');

console.log('--- Testing August Tab Fixture (Section 2 & 9) ---');
const headers = ['Sites', 'Price', 'Date', 'Document', 'Live link'];
const body = [
  // row 2: empty date cell -> must fall back to tab's month (2026-08-01)
  ['timelynews.co.uk', 3500, null, 'CDG x Chrome Hearts 1', 'https://timelynews.co.uk/post1'],
  // row 3: empty date cell -> must fall back to tab's month (2026-08-01)
  ['uselegance.co.uk', 4000, null, 'CDG x Chrome Hearts 2', 'https://uselegance.co.uk/post2'],
  // row 4: empty date cell -> must fall back to tab's month (2026-08-01)
  ['https://tipsytiaras.com', 7000, null, 'On UK + On MX 1', 'https://tipsytiaras.com/post3'],
  // row 5: empty date cell -> must fall back to tab's month (2026-08-01)
  ['https://alamdiya.com/', 7000, null, 'On UK + On MX 2', 'https://alamdiya.com/post4'],
  // row 6: summary row (orange cell), no live link! Must be ignored!
  [null, 20000, null, 'By Hamayun Saleem', null],
  // row 7: helper row ("Remaining 1500 paid"), no live link! Must be ignored!
  ['Remaining', 1500, 'paid', null, null],
  // rows 8-16
  ['thesalfordmagazine.com', 5000, serialAug11, 'How to Build the Perfect Modern Casual Outfit', 'https://thesalfordmagazine.com/post5'],
  ['Rarelyradiant.com', 7000, serialAug11, 'Best Ways to Style Comfort With Everyday Fashion', 'https://rarelyradiant.com/post6'],
  ['trendifymagazine.com', 5000, serialAug11, 'Chrome Hearts & Comme des Garcons', 'https://trendifymagazine.com/post7'],
  ['Wordmaticz.com', 3500, serialAug11, 'Chrome Hearts & Comme des Garcons', 'https://wordmaticz.com/post8'],
  ['https://connection-hints.com/', 1000, serialAug11, 'On Cloud & Barbas Hats', 'https://connection-hints.com/post9'],
  ['starbucksmenuus.info/', 1000, serialAug11, 'On Cloud & Barbas Hats', 'https://starbucksmenuus.info/post10'],
  ['grammarsguide.com/', 1000, serialAug11, 'On Cloud & Barbas Hats', 'https://grammarsguide.com/post11'],
  ['wordorae.com/', 1000, serialAug11, 'On Cloud & Barbas Hats', 'https://wordorae.com/post12'],
  ['etargetlimited.co.uk/', 1000, serialAug11, 'On Cloud & Barbas Hats', 'https://etargetlimited.co.uk/post13'],
];

const augustTable = { tab: 'August Links', headers, body };
const orderMapping = {
  site: 'Sites',
  price: 'Price',
  date: 'Date',
  article: 'Document',
  live_url: 'Live link',
};

const parsedOrders = parseLedgerOrders([augustTable], orderMapping, { referenceYear: 2026 });

assert.equal(parsedOrders.skippedNoLink, 2, 'Rows 6 and 7 must be skipped due to no live link');
assert.equal(parsedOrders.orders.length, 13, '13 valid orders must be parsed');

// Verify empty date cells inherit the tab's inferred month (2026-08-01)
const emptyDateRow = parsedOrders.orders[0];
assert.equal(emptyDateRow.order_date, null);
assert.equal(emptyDateRow.order_month, '2026-08-01', 'Order with empty date must inherit tab month 2026-08-01');

// Rows 2-5: 3500 + 4000 + 7000 + 7000 = 21,500
const first4Total = parsedOrders.orders.slice(0, 4).reduce((sum, o) => sum + o.price_paid, 0);
assert.equal(first4Total, 21500, 'Rows 2-5 sum must equal 21,500');

// Rows 8-16: 5000 + 7000 + 5000 + 3500 + 1000 + 1000 + 1000 + 1000 + 1000 = 25,500
const remainingTotal = parsedOrders.orders.slice(4).reduce((sum, o) => sum + o.price_paid, 0);
assert.equal(remainingTotal, 25500, 'Rows 8-16 sum must equal 25,500');

// Total must be 47,000
assert.equal(parsedOrders.totalOrderedPKR, 47000, 'Total of visible rows must equal 47,000');
console.log('✓ August tab fixture passed! Total PKR 47,000 verified.');

console.log('--- Testing Payment History Fixture with Column Auto-Detection & Exclusion ---');
// Test with "Amount (PKR)" header variation and "Remaining" column
const paymentHeaders = ['Date', 'Amount (PKR)', 'Method', 'Remaining'];
const paymentBody = [
  ['2026-08-01', 20000, 'Bank Transfer', 27000], // valid
  ['2026-08-05', 10000, 'EasyPaisa', 17000], // valid
  ['2026-08-05', 10000, 'EasyPaisa', 7000], // identical payment - must stay two payments!
  ['Total', 40000, null, null], // invalid: label row, no date
  ['2026-08-10', null, 'Cash', null], // invalid: no amount
];
const paymentTable = { tab: 'Payment History', headers: paymentHeaders, body: paymentBody };

// Test auto-detection with empty paymentMapping
const parsedPaymentsAuto = parseLedgerPayments(paymentTable, {}, 'PKR');
assert.equal(parsedPaymentsAuto.payments.length, 3, 'Must auto-detect columns and find 3 payments');
assert.equal(parsedPaymentsAuto.totalPaidPKR, 40000, 'Total paid must equal 40,000');

// Test that Remaining column is never read as amount even if passed in mapping
const badMapping = { date: 'Date', amount: 'Remaining' };
const parsedPaymentsGuarded = parseLedgerPayments(paymentTable, badMapping, 'PKR');
assert.notEqual(parsedPaymentsGuarded.totalPaidPKR, 51000, 'Remaining column must NEVER be read as amount');
assert.equal(parsedPaymentsGuarded.totalPaidPKR, 40000, 'Must fall back to real amount column');
console.log('✓ Payment history fixture passed! Total PKR 40,000 verified.');

console.log('--- Testing Balance Calculation & Preview ---');
const preview = previewLedger([augustTable], paymentTable, orderMapping, {}, { allSheetTabs: ['August Links', 'Payment History', 'Travis Scott TL'] });
assert.equal(preview.totalOrderedPKR, 47000);
assert.equal(preview.totalPaidPKR, 40000);
assert.equal(preview.resultingBalance, 7000, 'Resulting balance must be 47,000 - 40,000 = 7,000');
assert.ok(preview.tabDiagnostics?.some((t) => t.tab === 'Travis Scott TL' && t.type === 'ignored'));
console.log('✓ Resulting balance 7,000 PKR and diagnostics verified.');

console.log('--- Testing 3 Vendors Simulation (Problem 1 Requirement) ---');
// Vendor 1: Junaid (August: 47k, July: 20k, Paid: 40k)
const junaidJuly = {
  tab: 'July',
  headers: ['Sites', 'Price', 'Live link'],
  body: [
    ['site-a.com', 10000, 'https://site-a.com/link1'],
    ['site-b.com', 10000, 'https://site-b.com/link2'],
  ],
};
const junaidPreview = previewLedger([augustTable, junaidJuly], paymentTable, {}, {});
assert.equal(junaidPreview.totalOrderedPKR, 67000);
assert.equal(junaidPreview.totalPaidPKR, 40000);
assert.equal(junaidPreview.resultingBalance, 27000);

// Vendor 2: Sultan (September Links: 35k, October: 15k, Paid: 50k)
const sultanSept = {
  tab: 'September Links',
  headers: ['Website', 'Price', 'Live link'],
  body: [
    ['site-c.com', 35000, 'https://site-c.com/link3'],
  ],
};
const sultanOct = {
  tab: 'October',
  headers: ['Website', 'Price', 'Live link'],
  body: [
    ['site-d.com', 15000, 'https://site-d.com/link4'],
  ],
};
const sultanPayment = {
  tab: 'Payment History',
  headers: ['Date', 'Amount'],
  body: [['2026-10-01', 50000]],
};
const sultanPreview = previewLedger([sultanSept, sultanOct], sultanPayment, {}, {});
assert.equal(sultanPreview.totalOrderedPKR, 50000);
assert.equal(sultanPreview.totalPaidPKR, 50000);
assert.equal(sultanPreview.resultingBalance, 0);

// Vendor 3: Ali (Aug_24: 10k, Paid: 5k)
const aliAug24 = {
  tab: 'Aug_24',
  headers: ['Sites', 'Price', 'Live link'],
  body: [
    ['site-e.com', 10000, 'https://site-e.com/link5'],
  ],
};
const aliPayment = {
  tab: 'Payment History',
  headers: ['Date', 'Amount'],
  body: [['2024-08-15', 5000]],
};
const aliPreview = previewLedger([aliAug24], aliPayment, {}, {});
assert.equal(aliPreview.totalOrderedPKR, 10000);
assert.equal(aliPreview.totalPaidPKR, 5000);
assert.equal(aliPreview.resultingBalance, 5000);
assert.equal(inferMonthFromTabName('Aug_24')?.year, 2024);

console.log('✓ Multi-vendor simulation passed (Junaid, Sultan, Ali verified).');

console.log('--- Testing Write-Back Ranges (Section 9) ---');
assert.equal(colLetter(0), 'A');
assert.equal(colLetter(4), 'E');
assert.equal(colLetter(5), 'F');
assert.equal(colLetter(25), 'Z');
assert.equal(colLetter(26), 'AA');

const wbHeaders = ['Sites', 'Price', 'Date', 'Document', 'Live link', 'Status'];
const wbBody = Array.from({ length: 15 }, (_, i) => [
  `site${i}.com`,
  1000,
  '2026-08-11',
  'doc',
  i === 10 ? 'https://example.com/post12' : `https://site${i}.com/post`,
  i === 10 ? '' : 'Indexed',
]);

const wbItems = [{ live_url: 'https://example.com/post12', status: 'not_indexed' }];
const wbMapping = { live_url: 'Live link', status: 'Status' };

const ranges1 = buildWritebackRanges('August Links', wbHeaders, wbBody, 1, wbMapping, wbItems);
assert.equal(ranges1.length, 1);
assert.equal(ranges1[0].range, "'August Links'!F12");
assert.equal(ranges1[0].value, 'Not indexed');

// Now update body row 10 with 'Not indexed' and run again: must write nothing (idempotent)!
wbBody[10][5] = 'Not indexed';
const ranges2 = buildWritebackRanges('August Links', wbHeaders, wbBody, 1, wbMapping, wbItems);
assert.equal(ranges2.length, 0, 'Running it again must write nothing (idempotent)');
console.log('✓ Write-back ranges test passed! F12 updated and idempotent on second run.');

console.log('\nALL FIXTURE TESTS PASSED SUCCESSFULLY! 🎉\n');
