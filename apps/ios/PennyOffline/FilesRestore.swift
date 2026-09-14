import Foundation
import PennyV4

/// Display values are separate from the one-shot candidate that authorizes replacement.
@MainActor final class FilesRestorePreview {
    let createdAt: String, recordCount: Int, receiptCount: Int, expenseTotalMinor: Int64
    private enum Payload { case legacy(VaultSnapshot, Int), candidate(DurableVaultStorage.InactiveCandidate) }
    private var payload: Payload?
    fileprivate init(snapshot: VaultSnapshot, revision: Int) {
        createdAt = snapshot.createdAt; recordCount = snapshot.recordCount
        receiptCount = snapshot.attachments.count; expenseTotalMinor = snapshot.expenses.reduce(0) { $0 + $1.amountMinor }
        payload = .legacy(snapshot, revision)
    }
    fileprivate init(candidate: DurableVaultStorage.InactiveCandidate) {
        let summary = candidate.summary
        createdAt = summary.createdAt; receiptCount = summary.counts["attachments", default: 0]
        recordCount = summary.counts.filter { $0.key != "attachments" }.values.reduce(0, +)
        expenseTotalMinor = summary.expenseTotalMinor; payload = .candidate(candidate)
    }
    func close() throws {
        let held = payload; payload = nil
        if case .candidate(let candidate) = held { try candidate.close() }
    }
    func replace(in store: VaultStore) async throws {
        guard let held = payload else { throw CancellationError() }; payload = nil
        try Task.checkCancellation()
        switch held {
        case .legacy(let snapshot, let revision): try await store.restoreAsync(snapshot, expectedRevision: revision)
        case .candidate(let candidate):
            do { try store.installLocalReceiptReplacement(candidate) }
            catch { try candidate.close(); throw error }
        }
    }
}

@MainActor extension VaultStore {
    func prepareFilesRestore(_ url: URL, recoveryKey: String,
                             afterAcquisition: @MainActor () throws -> Void = {}) async throws -> FilesRestorePreview {
        try Task.checkCancellation()
        _ = try BackupArchive.key(recoveryKey)
        let originalRevision = revision
        // Preserve legacy recovery for a locked vault; v4 requires an established target.
        let binding = Result { try captureLocalReceiptTarget() }
        let acquired = try await FilesRestoreWorker().acquire(url, recoveryKey: recoveryKey)
        do {
            try Task.checkCancellation(); try afterAcquisition(); try Task.checkCancellation()
            guard revision == originalRevision else { throw CloudFailure.staleRestore }
            switch acquired {
            case .legacy(let snapshot): return FilesRestorePreview(snapshot: snapshot, revision: originalRevision)
            case .v4(let encrypted):
                let candidate = try await prepareV4Replacement(binding: binding.get(), encrypted: encrypted, recoveryKey: recoveryKey)
                do { try Task.checkCancellation(); return FilesRestorePreview(candidate: candidate) }
                catch { try candidate.close(); throw error }
            }
        } catch { if case .v4(let owned) = acquired { try owned.close() }; throw error }
    }
}

/// Security-scoped provider access and its entire copy stay inside one coordinated
/// read on a worker. Both v4 passes use that same protected private ciphertext inode.
private actor FilesRestoreWorker {
    enum Acquired: Sendable { case legacy(VaultSnapshot), v4(V4Transfer<V4CiphertextSnapshot>) }
    func acquire(_ url: URL, recoveryKey: String) throws -> Acquired {
        try Task.checkCancellation()
        let scoped = url.startAccessingSecurityScopedResource()
        defer { if scoped { url.stopAccessingSecurityScopedResource() } }
        var coordinationError: NSError?, result: Result<V4CiphertextSnapshot, Error>?
        NSFileCoordinator().coordinate(readingItemAt: url, options: [], error: &coordinationError) { readable in
            result = Result { try V4CiphertextSnapshot.capture(FileInput(readable), cancellation: { try Task.checkCancellation() }) }
        }
        if let coordinationError {
            if case .success(let snapshot) = result { try snapshot.close() }
            throw coordinationError
        }
        guard let result else { throw BackupArchive.BackupError.invalidArchive }
        let snapshot = try result.get()
        do {
            try Task.checkCancellation()
            let probe = try snapshot.reader()
            let prefix: Data
            do { prefix = try probe.read(maximum: 8); try probe.close() }
            catch { try? probe.close(); throw error }
            if prefix == Data("PNYBKP4\n".utf8) {
                return .v4(V4Transfer(snapshot, cleanup: { try $0.close() }))
            }
            // Only legacy envelopes use the existing bounded in-memory decoder.
            // A recognized v4 archive is never retried as a legacy envelope.
            let reader = try snapshot.reader()
            var bytes = Data(), readerClosed = false
            defer { if !readerClosed { try? reader.close() } }
            while true {
                try Task.checkCancellation()
                let part = try reader.read(maximum: 65_536)
                if part.isEmpty { break }; bytes.append(part)
                guard bytes.count <= BackupArchive.maximumEnvelopeBytes else { throw ExpenseError.vaultCapacity }
            }
            readerClosed = true; try reader.close()
            guard reader.byteCount == snapshot.byteCount, reader.digest == snapshot.digest else { throw BackupArchive.BackupError.invalidArchive }
            let decoded = try BackupArchive.restore(bytes, recoveryKey: recoveryKey)
            try snapshot.close(); try Task.checkCancellation(); return .legacy(decoded)
        } catch { try snapshot.close(); throw error }
    }
    private final class FileInput: PennyV4Input {
        private var handle: FileHandle?
        init(_ url: URL) throws { handle = try FileHandle(forReadingFrom: url) }
        func read(maximum: Int) throws -> Data {
            guard let handle else { throw LocalReceiptBlobError.closed }
            return try handle.read(upToCount: maximum) ?? Data()
        }
        func close() throws { let held = handle; handle = nil; try held?.close() }
        deinit { try? handle?.close() }
    }
}
