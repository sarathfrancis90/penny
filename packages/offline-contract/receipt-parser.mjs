import { categories, exactKeys, limits, parseAmount, requireThat as check, validUnicode } from './contract.mjs';

const horizontal = '[ \\t\\u00a0\\u202f]';
const currencyMarker = '(?:CAD(?:[ \\t]*\\$)?|CA\\$|C\\$|\\$)';
const suffixMarker = '(?:\\$[ \\t]*CAD|CAD|CA\\$|C\\$|\\$)';
const merchantLabel = /^(?:merchant|vendor|marchand|commerçant)\s*:\s*(.*)$/iu;
const ignoredTotal = /^(?:sub[ -]?total|sous[ -]?total|total\s+(?:tax(?:es)?|items?|articles?|discounts?|remises?)|tax(?:es)?|tps|tvq|hst|gst|pst|tender(?:ed)?|cash|change|discount|remise|monnaie|comptant)\b/iu;
const instructionLike = /\b(?:ignore\s+(?:all\s+)?(?:previous|prior|above)\s+instructions|system\s+prompt|assistant\s*:|execute\s+(?:code|command)|send\s+(?:money|data)|ignorez\s+les\s+instructions)(?!\p{L})/iu;
const foreignCurrency = /\b(?:USD|EUR|GBP|AUD|NZD|JPY|CNY|INR|MXN|CHF|RMB|US\s+dollars?)(?![a-z])|US\s*\$|[€£¥₹]/iu;
const refund = /\b(?:refund(?:ed)?|remboursement|remboursé|credit\s+note|note\s+de\s+crédit)(?!\p{L})/iu;
const signed = /[-−+()]|\bCR\b/iu;
function input(text, locale) {
  check(locale === 'en-CA' || locale === 'fr-CA', 'unsupported_locale');
  check(validUnicode(text), 'invalid_unicode');
  check([...text].length <= 4000, 'input_too_long');
}
function validMerchant(value) {
  return value.length > 0 && [...value].length <= 200 && /\p{L}/u.test(value) && !/[\p{Cc}]/u.test(value)
    && !/^(?:receipt|invoice|facture|welcome|thank you|merci)$/iu.test(value)
    && !/\d+[.,]\d{2}/u.test(value) && !ignoredTotal.test(value);
}
function totalLabel(locale) {
  return locale === 'en-CA' ? /^(?:grand\s+total|total\s+paid|amount\s+due|balance\s+due|total)\b\s*:?\s*(.*)$/iu
    : /^(?:total\s+général|montant\s+total|total\s+à\s+payer|net\s+à\s+payer|total\s+ttc|total)\b\s*:?\s*(.*)$/iu;
}
function amount(text, locale) {
  check(!signed.test(text), 'signed_total');
  const numeric = locale === 'en-CA' ? '(?:0|[1-9][0-9]*|[1-9][0-9]{0,2}(?:,[0-9]{3})+)\\.[0-9]{2}'
    : `(?:0|[1-9][0-9]*|[1-9][0-9]{0,2}(?:${horizontal}[0-9]{3})+),[0-9]{2}`;
  const match = new RegExp(`^(?:${currencyMarker}${horizontal}*)?(${numeric})(?:${horizontal}*${suffixMarker})?$`, 'iu').exec(text);
  check(match, 'malformed_total');
  const normalized = locale === 'en-CA' ? match[1].replaceAll(',', '') : match[1].replace(/[ \t\u00a0\u202f]/gu, '').replace(',', '.');
  check(normalized !== '0.00', 'nonpositive_total');
  try { return parseAmount(normalized); } catch { throw new Error('total_overflow'); }
}

/** Suggestions only. This module has no persistence, model, network or tool path. */
export function parseReceipt(sourceText, locale) {
  input(sourceText, locale);
  const proposal = { parserVersion: 1, locale, sourceText, merchant: null, amountMinor: null, currencyCode: null, merchantLineIndex: null, totalLineIndex: null, category: null, requiresReview: true, reasons: [] };
  const lines = sourceText.split(/\r\n|\r|\n/u).map((raw, index) => ({ text: raw.trim(), index })).filter(line => line.text !== '');
  if (instructionLike.test(sourceText)) { proposal.reasons.push('instruction_like_text'); return proposal; }
  const labelled = lines.map(line => ({ ...line, match: merchantLabel.exec(line.text) })).filter(line => line.match);
  if (labelled.length > 1) proposal.reasons.push('ambiguous_merchant');
  else {
    const candidate = labelled.length ? { text: labelled[0].match[1].trim(), index: labelled[0].index } : lines[0];
    if (candidate && (labelled.length || !totalLabel(locale).test(candidate.text)) && validMerchant(candidate.text)) { proposal.merchant = candidate.text; proposal.merchantLineIndex = candidate.index; }
    else proposal.reasons.push('missing_merchant');
  }
  if (foreignCurrency.test(sourceText)) { proposal.reasons.push('foreign_currency'); return proposal; }
  if (refund.test(sourceText)) { proposal.reasons.push('unsupported_refund'); return proposal; }
  const totals = lines.filter(line => !merchantLabel.test(line.text) && !ignoredTotal.test(line.text)).map(line => ({ ...line, match: totalLabel(locale).exec(line.text) })).filter(line => line.match);
  if (totals.length === 0) proposal.reasons.push('missing_total');
  else if (totals.length > 1) proposal.reasons.push('multiple_totals');
  else {
    try {
      proposal.amountMinor = amount(totals[0].match[1].trim(), locale); proposal.totalLineIndex = totals[0].index; proposal.currencyCode = 'CAD';
      if (!/\bCAD(?![a-z])|CA\$|C\$/iu.test(sourceText)) proposal.reasons.push('currency_assumed_cad');
    } catch (error) { proposal.reasons.push(error.message); }
  }
  return proposal;
}

/** Optional on-device models may classify a grounded proposal, never invent cash. */
export function validateModelProposal(sourceText, locale, output) {
  const proposal = parseReceipt(sourceText, locale);
  exactKeys(output, ['merchant', 'amountMinor', 'currencyCode', 'category']);
  check(output.merchant === null || (typeof output.merchant === 'string' && output.merchant === proposal.merchant), 'model_merchant_ungrounded');
  check(output.amountMinor === null || (Number.isSafeInteger(output.amountMinor) && output.amountMinor > 0 && output.amountMinor <= limits.amountMinor && output.amountMinor === proposal.amountMinor), 'model_amount_ungrounded');
  check(output.currencyCode === (output.amountMinor === null ? null : 'CAD'), 'model_currency_ungrounded');
  check(output.category === null || categories.includes(output.category), 'model_category_invalid');
  check(output.category === null || (proposal.merchant !== null && proposal.amountMinor !== null), 'model_category_ungrounded');
  return { ...proposal, category: output.category };
}
