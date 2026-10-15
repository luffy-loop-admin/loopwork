import assert from 'node:assert/strict';
import {
  inferMonthFromTabName,
  weekStart,
  weekLabel,
  parseLedgerOrders,
  parseLedgerPayments,
  previewLedger
} from '../lib/ledger.ts';
import { parseDate } from '../lib/parse.ts';
import { normalizeDomain } from '../lib/domain.ts';

console.log('--- Testing Month Inference ---');
assert.equal(inferMonthFromTabName('August Links')?.monthName, 'August');
assert.equal(inferMonthFromTabName('September Links')?.monthName, 'September');
assert.equal(inferMonthFromTabName('Sept')?.monthName, 'September');
assert.equal(inferMonthFromTabName('Payment History'), null);
assert.equal(inferMonthFromTabName('Travis Scott TL'), null);
console.log('✓ Month inference passed.');

console.log('--- Testing Week Helpers ---');
// 2026-08-11 is Tuesday -> week start is Monday 2026-08-10
assert.equal(weekStart('2026-08-11'), '2026-08-10');
assert.equal(weekLabel('2026-08-11'), 'Week of 10 Aug 2026');
console.log('✓ Week helpers passed.');

console.log('--- Testing Date & Domain Helpers ---');
// 11 Aug 2026 serial number in Google Sheets
// 2026-08-11: days between 1899-12-30 and 2026-08-11 is 46245
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
  // row 2
  ['timelynews.co.uk', 3500, null, 'CDG x Chrome Hearts 1', 'https://timelynews.co.uk/post1'],
  // row 3
  ['uselegance.co.uk', 4000, null, 'CDG x Chrome Hearts 2', 'https://uselegance.co.uk/post2'],
  // row 4
  ['https://tipsytiaras.com', 7000, null, 'On UK + On MX 1', 'https://tipsytiaras.com/post3'],
  // row 5
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

// Rows 2-5: 3500 + 4000 + 7000 + 7000 = 21,500
const first4Total = parsedOrders.orders.slice(0, 4).reduce((sum, o) => sum + o.price_paid, 0);
assert.equal(first4Total, 21500, 'Rows 2-5 sum must equal 21,500');

// Rows 8-16: 5000 + 7000 + 5000 + 3500 + 1000 + 1000 + 1000 + 1000 + 1000 = 25,500
const remainingTotal = parsedOrders.orders.slice(4).reduce((sum, o) => sum + o.price_paid, 0);
assert.equal(remainingTotal, 25500, 'Rows 8-16 sum must equal 25,500');

// Total must be 47,000
assert.equal(parsedOrders.totalOrderedPKR, 47000, 'Total of visible rows must equal 47,000');
console.log('✓ August tab fixture passed! Total PKR 47,000 verified.');

console.log('--- Testing Payment History Fixture ---');
const paymentHeaders = ['Date', 'Amount', 'Method', 'Remaining'];
const paymentBody = [
  ['2026-08-01', 20000, 'Bank Transfer', 27000], // valid
  ['2026-08-05', 10000, 'EasyPaisa', 17000], // valid
  ['2026-08-05', 10000, 'EasyPaisa', 7000], // identical payment - must stay two payments!
  ['Total', 40000, null, null], // invalid: label row, no date
  ['2026-08-10', null, 'Cash', null], // invalid: no amount
];
const paymentTable = { tab: 'Payment History', headers: paymentHeaders, body: paymentBody };
const paymentMapping = { date: 'Date', amount: 'Amount', method: 'Method' };

const parsedPayments = parseLedgerPayments(paymentTable, paymentMapping, 'PKR');
assert.equal(parsedPayments.payments.length, 3, 'Must have exactly 3 payments (including identical duplicates)');
assert.equal(parsedPayments.totalPaidPKR, 40000, 'Total paid must equal 40,000');
console.log('✓ Payment history fixture passed! Total PKR 40,000 verified.');

console.log('--- Testing Balance Calculation & Preview ---');
const preview = previewLedger([augustTable], paymentTable, orderMapping, paymentMapping);
assert.equal(preview.totalOrderedPKR, 47000);
assert.equal(preview.totalPaidPKR, 40000);
assert.equal(preview.resultingBalance, 7000, 'Resulting balance must be 47,000 - 40,000 = 7,000');
console.log('✓ Resulting balance 7,000 PKR verified.');

console.log('--- Testing Write-Back Ranges (Section 9) ---');
import { buildWritebackRanges, colLetter } from '../lib/sheets-types.ts';

assert.equal(colLetter(0), 'A');
assert.equal(colLetter(4), 'E');
assert.equal(colLetter(5), 'F');
assert.equal(colLetter(25), 'Z');
assert.equal(colLetter(26), 'AA');

const wbHeaders = ['Sites', 'Price', 'Date', 'Document', 'Live link', 'Status'];
// Build 15 rows. Row 1 is header. Row 12 in sheet corresponds to body index 10 (1 + 1 + 10 = 12).
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
