import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseReceipt, validateModelProposal } from './receipt-parser.mjs';
import { csvCell } from './finance.mjs';
const corpus = JSON.parse(readFileSync(new URL('./fixtures/receipt-parser-corpus.json', import.meta.url)));
test('shared capture corpus proposes only grounded totals and preserves exact source', () => {
  for (const entry of corpus.cases) {
    const source = entry.input ?? entry.inputRepeat.value.repeat(entry.inputRepeat.count);
    if (entry.error) { assert.throws(() => parseReceipt(source, entry.locale), new RegExp(entry.error), entry.name); continue; }
    const result = parseReceipt(source, entry.locale);
    for (const field of ['merchant', 'amountMinor', 'reasons', 'merchantLineIndex', 'totalLineIndex']) assert.deepEqual(result[field], entry[field], `${entry.name}: ${field}`);
    assert.equal(result.sourceText, source); assert.equal(result.requiresReview, true); assert.equal(result.category, null);
    assert.equal(result.currencyCode, result.amountMinor === null ? null : 'CAD');
  }
});
test('input locale scalar limits and original line offsets remain explicit', () => {
  assert.throws(() => parseReceipt('Total 20.00', 'en-US'), /unsupported_locale/);
  assert.throws(() => parseReceipt('\ud800', 'en-CA'), /invalid_unicode/);
  const source = '\r\n Merchant: Cafe \r\nTOTAL CAD 20.00\r\n';
  const result = parseReceipt(source, 'en-CA'); assert.equal(result.sourceText, source); assert.equal(result.merchantLineIndex, 1); assert.equal(result.totalLineIndex, 2);
  assert.equal(parseReceipt('😀'.repeat(4000), 'en-CA').sourceText.length, 8000);
});
test('foreign currency and signed refund forms cannot become CAD expenses', () => {
  for (const marker of ['USD', 'US $', 'EUR', '€', 'GBP', '£', 'JPY', '¥', 'INR', '₹']) assert.ok(parseReceipt(`Cafe\nTOTAL ${marker}20.00`, 'en-CA').reasons.includes('foreign_currency'), marker);
  for (const value of ['(20.00)', '−20.00', '+20.00', '20.00 CR']) assert.ok(parseReceipt(`Cafe\nTOTAL CAD ${value}`, 'en-CA').reasons.includes('signed_total'));
});
test('optional model output cannot replace ambiguous or absent source money', () => {
  const source = 'Merchant: Cafe\nTotal CAD 20.00';
  const model = { merchant: 'Cafe', amountMinor: 2000, currencyCode: 'CAD', category: 'Meals and entertainment' };
  assert.equal(validateModelProposal(source, 'en-CA', model).requiresReview, true);
  assert.throws(() => validateModelProposal(source, 'en-CA', { ...model, amountMinor: 2500 }), /model_amount_ungrounded/);
  assert.throws(() => validateModelProposal(source, 'en-CA', { ...model, merchant: 'Invented' }), /model_merchant_ungrounded/);
  assert.throws(() => validateModelProposal(source, 'en-CA', { ...model, category: 'Dining' }), /model_category_invalid/);
  assert.throws(() => validateModelProposal(source, 'en-CA', { ...model, action: 'save' }));
  assert.throws(() => validateModelProposal(`${source}\nTotal CAD 25.00`, 'en-CA', model), /model_amount_ungrounded/);
  assert.throws(() => validateModelProposal('Cafe\nTotal USD 20.00', 'en-CA', model), /model_amount_ungrounded/);
});
test('CSV formula defense handles BOM and nonbreaking whitespace without changing source text', () => {
  for (const prefix of ['\ufeff', '\u00a0', '\u202f', '\ufeff\u00a0']) {
    const input = `${prefix}=1+1`; assert.equal(csvCell(input), `"'${input}"`);
  }
});
