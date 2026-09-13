import Foundation
import CryptoKit

struct PreparedArchive: Sendable {
    let id: UUID
    let url: URL
    let bytes: Data
    let snapshot: VaultSnapshot
}

/// One serial worker owns protected staging and expensive archive validation.
/// Only immutable values cross to the main actor; callers guard their own epochs.
actor ArchiveWorker {
    static let shared = ArchiveWorker()
    private var exports: [UUID: VerifiedBackupExport] = [:]

    func prepare(_ snapshot: VaultSnapshot, key: String, directory: URL? = nil) throws -> PreparedArchive {
        try Task.checkCancellation()
        let staged = try VerifiedBackupExport(snapshot: snapshot, recoveryKey: key, directory: directory)
        do { try Task.checkCancellation() } catch { staged.cancel(); throw error }
        let id = UUID(); exports[id] = staged
        return PreparedArchive(id: id, url: staged.url, bytes: staged.bytes, snapshot: staged.verifiedSnapshot)
    }
    func prepareVault(_ next: VaultSnapshot, key: SymmetricKey, revision: Int, writerId: String, restoreEpoch: String, restoring: Bool) throws -> PreparedVaultWrite {
        try PreparedVaultWrite.prepare(next, key: key, revision: revision, writerId: writerId, restoreEpoch: restoreEpoch, restoring: restoring)
    }
    func cancel(_ archive: PreparedArchive) { exports.removeValue(forKey: archive.id)?.cancel() }
    func decode(_ bytes: Data, key: String) throws -> VaultSnapshot {
        try Task.checkCancellation()
        let snapshot = try BackupArchive.restore(bytes, recoveryKey: key)
        try Task.checkCancellation(); return snapshot
    }
    func verify(_ bytes: Data, key: String, manifest: CloudManifest) throws -> VaultSnapshot {
        try Task.checkCancellation()
        let snapshot = try CloudWire.verifySnapshot(bytes, key: key, manifest: manifest)
        try Task.checkCancellation(); return snapshot
    }
    func read(_ url: URL, key: String) throws -> VaultSnapshot {
        try Task.checkCancellation()
        let scoped = url.startAccessingSecurityScopedResource()
        defer { if scoped { url.stopAccessingSecurityScopedResource() } }
        var coordinationError: NSError?, result: Result<Data, Error>?
        NSFileCoordinator().coordinate(readingItemAt: url, options: [], error: &coordinationError) { readable in
            result = Result { try StrictJSON.boundedRead(readable, maximum: BackupArchive.maximumEnvelopeBytes) }
        }
        if let coordinationError { throw coordinationError }
        guard let result else { throw VerifiedBackupExport.Failure.verification }
        return try decode(result.get(), key: key)
    }
    func export(_ archive: PreparedArchive, to folder: URL) throws {
        try Task.checkCancellation()
        guard let staged = exports[archive.id] else { throw CancellationError() }
        let scoped = folder.startAccessingSecurityScopedResource()
        defer { if scoped { folder.stopAccessingSecurityScopedResource() } }
        var coordinationError: NSError?, failure: Error?, destination: URL?
        let newURL = folder.appendingPathComponent(staged.url.lastPathComponent)
        NSFileCoordinator().coordinate(writingItemAt: newURL, options: [], error: &coordinationError) { coordinated in
            do { try Task.checkCancellation(); destination = try staged.writeNewFile(to: coordinated) }
            catch { failure = error }
        }
        if let failure { throw failure }
        if let coordinationError { throw coordinationError }
        guard let destination else { throw VerifiedBackupExport.Failure.verification }
        try Task.checkCancellation()
        var verified = false
        NSFileCoordinator().coordinate(readingItemAt: destination, options: [], error: &coordinationError) { readable in
            do { try staged.verifyDestination(readable); verified = true } catch { failure = error }
        }
        if let failure { throw failure }
        if let coordinationError { throw coordinationError }
        guard verified else { throw VerifiedBackupExport.Failure.verification }
        try Task.checkCancellation()
    }
}
