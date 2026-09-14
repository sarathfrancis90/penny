// Offline conversion only. This does not authenticate to or modify the legacy API.
import { createHash, randomUUID } from 'node:crypto';
import { openSync, closeSync, readSync, fstatSync, writeFileSync, fsyncSync, linkSync, unlinkSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseAmount, validDate, validTimestamp, validateSnapshot, requireExportCapacity, parseStrictJSON, parseRecoveryKey, sealBackup } from '../../packages/offline-contract/contract.mjs';
import { validateFinanceExpense } from '../../packages/offline-contract/finance.mjs';
import { convertLegacyFinance } from './migrate-finance.mjs';

const namespace = Buffer.from('6ba7b8119dad11d180b400c04fd430c8', 'hex');
const sourceFields = new Set(['id', 'userId', 'vendor', 'amount', 'currency', 'currencyCode', 'category', 'date', 'expenseType', 'isGroupExpense', 'createdAt', 'updatedAt', 'description', 'notes', 'receiptUrl', 'localId', 'syncStatus', 'groupId', 'groupMetadata', 'history']);
const sourceDomains = ['expenses', 'budgets', 'income', 'savings'];
const ensure = (condition, code) => { if (!condition) throw new Error(code); };
const present = value => value !== undefined && value !== null && value !== '';

export function legacyUUID(accountId, recordId) {
  // RFC 4122 version-5 identity derivation only; SHA-1 is never used for keys or authentication.
  const bytes = createHash('sha1').update(namespace).update(JSON.stringify(['penny-legacy', accountId, recordId])).digest().subarray(0, 16);
  bytes[6] = (bytes[6] & 15) | 80;
  bytes[8] = (bytes[8] & 63) | 128;
  const hex = bytes.toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export function civilDate(value, timeZone) {
  if (validDate(value)) return value;
  ensure(validTimestamp(value), 'invalid_expense_date');
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone, calendar: 'gregory', era: 'short', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date(value)).map(part => [part.type, part.value]));
  ensure(parts.era === 'AD', 'local_date_outside_supported_calendar');
  const result = `${parts.year.padStart(4, '0')}-${parts.month}-${parts.day}`;
  ensure(validDate(result), 'invalid_expense_date');
  return result;
}

function convertExpense(source, userId, timeZone) {
  ensure(source && typeof source === 'object' && !Array.isArray(source), 'invalid_record');
  ensure(typeof source.id === 'string' && source.id.length > 0 && source.id.length <= 200, 'invalid_source_id');
  ensure(source.userId === userId, 'ownership_mismatch');
  ensure(!Object.keys(source).some(key => !sourceFields.has(key)), 'unrepresented_expense_field');
  ensure((source.expenseType === undefined || source.expenseType === null || source.expenseType === 'personal') && !source.isGroupExpense && !present(source.groupId) && !present(source.groupMetadata), 'group_record_requires_separate_export');
  ensure(!present(source.history) || (Array.isArray(source.history) && source.history.length === 0), 'history_requires_migration');
  ensure(!present(source.syncStatus) || source.syncStatus === 'synced', 'unsynchronized_legacy_record');
  ensure(!present(source.currency) || source.currency === 'CAD', 'unsupported_currency');
  ensure(!present(source.currencyCode) || source.currencyCode === 'CAD', 'unsupported_currency');
  ensure(typeof source.amount === 'number' && Number.isFinite(source.amount), 'invalid_amount');
  const amountMinor = parseAmount(source.amount.toString());
  for (const field of ['description', 'notes']) ensure(!present(source[field]) || typeof source[field] === 'string', 'invalid_note');
  const expense = validateFinanceExpense({ id: legacyUUID(userId, source.id), merchant: source.vendor, amountMinor, currencyCode: 'CAD', expenseDate: civilDate(source.date, timeZone), category: source.category,
    description: source.description ?? '', note: source.notes ?? '', recurringTemplateId: null, recurringOccurrenceDate: null, createdAt: source.createdAt, updatedAt: source.updatedAt });
  return expense;
}

/** Strict preflight: a rejected record prevents producing a replacement backup. */
export function prepareLegacyMigration(input, { now = new Date().toISOString() } = {}) {
  ensure(input && [1, 2].includes(input.exportVersion) && typeof input.userId === 'string' && input.userId.length > 0, 'invalid_export_header');
  ensure(typeof input.timeZone === 'string' && input.timeZone.length > 0, 'explicit_time_zone_required');
  new Intl.DateTimeFormat('en-CA', { timeZone: input.timeZone });
  ensure(validTimestamp(now), 'invalid_migration_time');
  ensure(Object.keys(input).every(key => ['exportVersion', 'userId', 'timeZone', 'pages', 'receiptAssets', ...(input.exportVersion === 2 ? ['savingsHistory'] : [])].includes(key)), 'unknown_export_field');
  ensure(Array.isArray(input.pages) && input.pages.length > 0 && input.pages.length <= 1000, 'invalid_page_count');
  ensure(input.receiptAssets === undefined || Array.isArray(input.receiptAssets), 'invalid_receipt_assets');
  const receipts = new Map();
  for (const asset of input.receiptAssets ?? []) {
    ensure(asset && Object.keys(asset).sort().join(',') === 'dataBase64,mediaType,sourceExpenseId', 'invalid_receipt_asset');
    ensure(typeof asset.sourceExpenseId === 'string' && !receipts.has(asset.sourceExpenseId), 'duplicate_receipt_asset');
    ensure(typeof asset.dataBase64 === 'string' && asset.dataBase64.length <= 3 * 1024 * 1024, 'receipt_asset_limit');
    receipts.set(asset.sourceExpenseId, asset);
  }
  const expenses = [], attachments = [], issues = [], ids = new Set(), usedReceipts = new Set(), provenance = [];
  const financeRecords = { budgets: [], income: [], savings: [] };
  const counts = { expenses: 0, budgets: 0, income: 0, savings: 0 };
  let expectedCursor = null;
  const cursors = new Set();
  for (const [pageIndex, page] of input.pages.entries()) {
    ensure(page && Object.keys(page).sort().join(',') === 'requestCursor,response' && page.requestCursor === expectedCursor, 'broken_cursor_chain');
    const response = page.response;
    ensure(response && response.schemaVersion === 1 && validTimestamp(response.serverWatermark) && typeof response.hasMore === 'boolean', 'invalid_bootstrap_page');
    ensure(Object.keys(response).sort().join(',') === 'hasMore,nextCursor,records,schemaVersion,serverWatermark', 'unknown_bootstrap_page_field');
    ensure(response.records && Object.keys(response.records).every(key => [...sourceDomains, 'profile', 'preferences'].includes(key)), 'unknown_source_domain');
    for (const domain of sourceDomains) {
      const values = response.records[domain];
      ensure(Array.isArray(values) && values.length <= 100, 'invalid_page_domain');
      counts[domain] += values.length;
      if (domain !== 'expenses') financeRecords[domain].push(...values);
    }
    for (const source of response.records.expenses) {
      try {
        ensure(source && typeof source.id === 'string' && !ids.has(source.id), 'duplicate_or_invalid_source_id');
        ids.add(source.id);
        const expense = convertExpense(source, input.userId, input.timeZone);
        const receipt = receipts.get(source.id);
        ensure(!present(source.receiptUrl) || receipt, 'receipt_bytes_missing');
        if (receipt) {
          const data = Buffer.from(receipt.dataBase64, 'base64');
          ensure(data.toString('base64') === receipt.dataBase64, 'invalid_receipt_base64');
          attachments.push({ id: legacyUUID(input.userId, `receipt:${source.id}`), expenseId: expense.id, mediaType: receipt.mediaType, byteCount: data.length, sha256: createHash('sha256').update(data).digest('hex'), dataBase64: receipt.dataBase64 });
          usedReceipts.add(source.id);
        }
        expenses.push(expense);
        provenance.push({ domain: 'expenses', sourceId: source.id, nativeId: expense.id, originalDates: { date: source.date } });
      } catch (error) { issues.push({ domain: 'expenses', sourceId: typeof source?.id === 'string' ? source.id : null, reason: error.message }); }
    }
    if (response.hasMore) {
      ensure(typeof response.nextCursor === 'string' && response.nextCursor.length > 0 && !cursors.has(response.nextCursor) && pageIndex < input.pages.length - 1, 'incomplete_or_repeated_cursor');
      cursors.add(response.nextCursor);
    } else ensure(response.nextCursor === null && pageIndex === input.pages.length - 1, 'invalid_final_page');
    expectedCursor = response.nextCursor;
  }
  ensure(expectedCursor === null, 'incomplete_export');
  ensure(usedReceipts.size === receipts.size, 'orphan_receipt_asset');
  const finance = convertLegacyFinance(financeRecords, { userId: input.userId, timeZone: input.timeZone, now, history: input.savingsHistory, legacyUUID, civilDate });
  issues.push(...finance.issues); provenance.push(...finance.provenance);
  const { budgets, incomeSources, incomeEntries, savingsGoals, savingsEntries, recurringExpenses } = finance;
  const snapshot = { schemaVersion: 3, snapshotId: randomUUID(), vaultId: legacyUUID(input.userId, 'vault'), createdAt: now, expenses, attachments, budgets, incomeSources, incomeEntries, savingsGoals, savingsEntries, recurringExpenses };
  if (!issues.length) {
    try { validateSnapshot(snapshot); requireExportCapacity(Buffer.byteLength(JSON.stringify(snapshot))); }
    catch (error) { issues.push({ domain: 'snapshot', reason: error.message }); }
  }
  return { ready: issues.length === 0, snapshot: issues.length ? null : snapshot, issues,
    provenance: { formatVersion: 1, parsedSourceJSONSHA256: createHash('sha256').update(JSON.stringify(input)).digest('hex'), timeZone: input.timeZone, calculatedAt: now, mappings: provenance },
    report: { sourceCounts: counts, importableExpenses: expenses.length, importedReceipts: attachments.length, importedTotalMinor: expenses.reduce((total, expense) => total + expense.amountMinor, 0),
      importedBudgets: budgets.length, importedIncomeSources: incomeSources.length, importedSavingsGoals: savingsGoals.length, importedSavingsEntries: savingsEntries.length,
      receivedIncomeMinor: 0, currencyCode: 'CAD', unresolved: issues.length, metadataExcluded: ['profile', 'preferences', 'syncStatus', 'localId'], sourceConsistency: 'file-validated; live source stability not established' } };
}

function readBounded(path, maximum) {
  const fd = openSync(path, 'r');
  try {
    const stat = fstatSync(fd);
    ensure(stat.isFile() && stat.size <= maximum, 'input_size_limit');
    const buffer = Buffer.alloc(Math.min(stat.size + 1, maximum + 1));
    let length = 0, count;
    while (length < buffer.length && (count = readSync(fd, buffer, length, buffer.length - length, null)) > 0) length += count;
    ensure(length <= stat.size && length <= maximum, 'input_changed_or_too_large');
    return buffer.subarray(0, length);
  } finally { closeSync(fd); }
}

function writeExclusiveJSON(path, value) {
  const target = resolve(path), temporary = `${target}.${randomUUID()}.tmp`;
  let created = false;
  try {
    const fd = openSync(temporary, 'wx', 0o600);
    created = true;
    try { writeFileSync(fd, JSON.stringify(value)); fsyncSync(fd); } finally { closeSync(fd); }
    linkSync(temporary, target); // atomic publication; refuses to overwrite existing output
    const directory = openSync(dirname(target), 'r');
    try { fsyncSync(directory); } finally { closeSync(directory); }
  } finally { if (created) unlinkSync(temporary); }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const args = process.argv.slice(2);
    ensure(args.length > 0 && args.length % 2 === 1, 'invalid_arguments');
    const options = new Map();
    for (let index = 1; index < args.length; index += 2) {
      ensure(['--output', '--key-file', '--report-output'].includes(args[index]) && !options.has(args[index]), 'invalid_arguments');
      options.set(args[index], args[index + 1]);
    }
    ensure(options.has('--output') === options.has('--key-file'), 'backup_requires_key');
    const input = parseStrictJSON(readBounded(args[0], 50 * 1024 * 1024), 50 * 1024 * 1024);
    const result = prepareLegacyMigration(input);
    console.log(JSON.stringify({ ready: result.ready, ...result.report }, null, 2));
    if (options.has('--report-output')) writeExclusiveJSON(options.get('--report-output'), { ready: result.ready, report: result.report, issues: result.issues, provenance: result.provenance });
    ensure(result.ready, 'migration_has_unresolved_records; no backup written');
    if (options.has('--output')) {
      const key = readBounded(options.get('--key-file'), 128).toString('utf8').trim();
      parseRecoveryKey(key);
      writeExclusiveJSON(options.get('--output'), sealBackup(result.snapshot, key));
      console.log('Encrypted finance backup written. Original export retained. Live-source consistency and complete-account migration remain separate gates.');
    }
  } catch {
    // Native JSON/IO errors may echo financial source text or private paths.
    console.error('Migration could not complete. Check the export, unresolved-record report, recovery-key file and an unused output filename. Original export and existing backup files were retained.');
    process.exitCode = 1;
  }
}
