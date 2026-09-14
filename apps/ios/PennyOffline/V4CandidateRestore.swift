import Foundation
import PennyV4

/// Bulk copy/decrypt/image work runs in an operation-owned actor. Only target
/// capture/recheck and the existing publication boundary belong to VaultStore.
@MainActor extension VaultStore {
    enum V4Phase: Sendable { case captured, firstPassClosed, candidateBegan, secondPassClosed, snapshotClosed }
    func prepareV4Replacement(source: sending any PennyV4Input, recoveryKey: String,
                              cancellation: @escaping @Sendable () throws -> Void = { try Task.checkCancellation() },
                              checkpoint: @escaping @MainActor (V4Phase) throws -> Void = { _ in }) async throws -> DurableVaultStorage.InactiveCandidate {
        let binding: DurableVaultStorage.ReceivingBinding
        do { try cancellation(); binding = try captureLocalReceiptTarget() }
        catch { try source.close(); throw error }
        let worker = V4RestoreWorker(source: source, recoveryKey: recoveryKey, cancellation: cancellation, checkpoint: checkpoint)
        return try await prepareV4Replacement(binding: binding, worker: worker, cancellation: cancellation, checkpoint: checkpoint)
    }
    func prepareV4Replacement(binding: DurableVaultStorage.ReceivingBinding, encrypted: V4Transfer<V4CiphertextSnapshot>,
                              recoveryKey: String) async throws -> DurableVaultStorage.InactiveCandidate {
        let worker = V4RestoreWorker(encrypted: encrypted, recoveryKey: recoveryKey)
        return try await prepareV4Replacement(binding: binding, worker: worker, cancellation: { try Task.checkCancellation() }, checkpoint: { _ in })
    }
    private func prepareV4Replacement(binding: DurableVaultStorage.ReceivingBinding, worker: V4RestoreWorker,
                                       cancellation: @escaping @Sendable () throws -> Void,
                                       checkpoint: @escaping @MainActor (V4Phase) throws -> Void) async throws -> DurableVaultStorage.InactiveCandidate {
        var preparation: DurableVaultStorage.Preparation?
        do {
            let first = try await worker.firstPass()
            try cancellation(); try checkpoint(.firstPassClosed); try cancellation()
            let staged = try beginLocalReceiptReplacement(binding, body: first.body, receipts: first.receipts, cancellation: cancellation)
            preparation = staged
            try checkpoint(.candidateBegan); try cancellation()
            let transfer = V4Transfer(staged, cleanup: { try $0.close() })
            preparation = nil
            let result = try await worker.secondPass(transfer: transfer)
            do { try cancellation(); return try result.take() } catch { try result.close(); throw error }
        } catch { try preparation?.close(); try await worker.close(); throw error }
    }
}
private actor V4RestoreWorker {
    private var source: (any PennyV4Input)?, encrypted: V4CiphertextSnapshot?
    private var incoming: V4Transfer<V4CiphertextSnapshot>?
    private let recoveryKey: String, cancellation: @Sendable () throws -> Void
    private let checkpoint: @MainActor (VaultStore.V4Phase) throws -> Void
    private var summary: PennyV4Summary?
    init(source: sending any PennyV4Input, recoveryKey: String, cancellation: @escaping @Sendable () throws -> Void,
         checkpoint: @escaping @MainActor (VaultStore.V4Phase) throws -> Void) {
        self.source = source; self.recoveryKey = recoveryKey; self.cancellation = cancellation; self.checkpoint = checkpoint
    }
    init(encrypted: V4Transfer<V4CiphertextSnapshot>, recoveryKey: String) {
        incoming = encrypted; self.recoveryKey = recoveryKey
        cancellation = { try Task.checkCancellation() }; checkpoint = { _ in }
    }
    struct Metadata: Sendable { let body: VaultSnapshot, receipts: [DurableReceiptDeclaration] }
    func firstPass() async throws -> Metadata {
        let snapshot: V4CiphertextSnapshot
        if let incoming { self.incoming = nil; snapshot = try incoming.take() }
        else {
            guard let input = source else { throw LocalReceiptBlobError.closed }; source = nil
            snapshot = try V4CiphertextSnapshot.capture(input, cancellation: cancellation)
        }
        encrypted = snapshot
        try cancellation(); try await checkpoint(.captured); try cancellation()
        let collected = V4CollectedRecords(), first = try snapshot.reader()
        summary = try V4ReadOnlyAdapter.validate(source: first, recoveryKey: recoveryKey, events: collected, cancellation: cancellation)
        guard first.byteCount == snapshot.byteCount, first.digest == snapshot.digest else { throw LocalReceiptBlobError.bytes }
        return Metadata(body: collected.body, receipts: collected.receipts)
    }
    func secondPass(transfer: V4Transfer<DurableVaultStorage.Preparation>) async throws -> V4Transfer<DurableVaultStorage.InactiveCandidate> {
        let preparation = try transfer.take()
        do {
            try cancellation()
            guard let encrypted, let summary else { throw LocalReceiptBlobError.closed }
            let second = try encrypted.reader(), receipts = V4StagedReceipts(preparation)
            let repeated = try V4ReadOnlyAdapter.validate(source: second, recoveryKey: recoveryKey, events: receipts, cancellation: cancellation)
            guard repeated == summary, second.byteCount == encrypted.byteCount, second.digest == encrypted.digest else { throw LocalReceiptBlobError.bytes }
            try cancellation(); try await checkpoint(.secondPassClosed); try cancellation()
            try encrypted.close(); self.encrypted = nil
            try await checkpoint(.snapshotClosed); try cancellation()
            let candidate = try preparation.finish(); self.summary = nil
            return V4Transfer(candidate, cleanup: { try $0.close() })
        } catch { try preparation.close(); try close(); throw error }
    }
    func close() throws {
        let held = encrypted, pending = incoming; encrypted = nil; incoming = nil; summary = nil
        defer { try? pending?.close() }; try held?.close(); try pending?.close()
    }
}

/// Sole ownership crosses an actor boundary once. The durable objects themselves
/// are not Sendable. No callback receives the preparation; the sender performs
/// no further operations after boxing. Pending/cancelled transfer owns cleanup.
final class V4Transfer<Value>: @unchecked Sendable {
    private let lock = NSLock(), cleanup: @Sendable (Value) throws -> Void
    private var value: Value?
    init(_ value: Value, cleanup: @escaping @Sendable (Value) throws -> Void) { self.value = value; self.cleanup = cleanup }
    func take() throws -> Value {
        try lock.withLock {
            guard let held = value else { throw LocalReceiptBlobError.closed }; value = nil; return held
        }
    }
    func close() throws {
        let held = lock.withLock { let held = value; value = nil; return held }
        if let held { try cleanup(held) }
    }
    deinit { try? close() }
}

class V4CollectedRecords: PennyV4Events {
    var body = VaultSnapshot(), receipts: [DurableReceiptDeclaration] = []
    func begin(_ metadata: PennyV4Declaration) throws {
        body.snapshotId = metadata.snapshotId; body.vaultId = metadata.vaultId; body.createdAt = metadata.createdAt
    }
    func domain(kind: Int, json: Data) throws {
        let decoder = JSONDecoder()
        switch kind {
        case 2: body.budgets.append(try decoder.decode(Budget.self, from: json))
        case 3: body.incomeSources.append(try decoder.decode(IncomeSource.self, from: json))
        case 4: body.incomeEntries.append(try decoder.decode(IncomeEntry.self, from: json))
        case 5: body.savingsGoals.append(try decoder.decode(SavingsGoal.self, from: json))
        case 6: body.savingsEntries.append(try decoder.decode(SavingsEntry.self, from: json))
        case 7: body.recurringExpenses.append(try decoder.decode(RecurringExpense.self, from: json))
        case 8: body.expenses.append(try decoder.decode(Expense.self, from: json))
        default: throw ExpenseError.invalidSnapshot
        }
    }
    func receipt(_ descriptor: PennyV4Receipt, bytes: Data) throws {
        receipts.append(DurableReceiptDeclaration(id: descriptor.id, expenseId: descriptor.expenseId, mediaType: descriptor.mediaType,
            byteCount: Int(descriptor.byteCount), sha256: descriptor.sha256))
    }
    func discard() { body = VaultSnapshot(); receipts.removeAll() }
}
private final class V4StagedReceipts: PennyV4Events {
    let preparation: DurableVaultStorage.Preparation
    init(_ preparation: DurableVaultStorage.Preparation) { self.preparation = preparation }
    func begin(_ metadata: PennyV4Declaration) throws {}
    func domain(kind: Int, json: Data) throws {}
    func receipt(_ descriptor: PennyV4Receipt, bytes: Data) throws { try preparation.append(receiptId: descriptor.id, bytes: bytes) }
    // The caller performs throwing cleanup after any failure, including close.
    func discard() {}
}
