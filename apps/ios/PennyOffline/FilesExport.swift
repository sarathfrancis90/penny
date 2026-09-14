import Foundation
import PennyV4

/// Coordinates one new ciphertext file. Success describes local readback only,
/// never remote provider upload or cloud durability.
actor FilesExportWorker {
    enum Phase: Sendable { case copied, beforeReadback, verified }
    func save(_ export: V4VerifiedExport, to folder: URL, recoveryKey: String,
              fault: @escaping @Sendable (VaultStore.V4OutputPhase) throws -> Void = { _ in },
              checkpoint: @escaping @Sendable (Phase) throws -> Void = { _ in }) async throws -> URL {
        let summary = await export.summary, expectedBytes = await export.ciphertextBytes, expectedHash = await export.ciphertextSHA256
        let input = try await export.ownedInput().take()
        var inputClosed = false
        defer { if !inputClosed { try? input.close() } }
        try Task.checkCancellation()
        let scoped = folder.startAccessingSecurityScopedResource()
        defer { if scoped { folder.stopAccessingSecurityScopedResource() } }
        let target = folder.appendingPathComponent("Penny-" + summary.snapshotId + ".pennybackup")
        var file: V4ExportFile?, destination: URL?, coordinationError: NSError?, result: Result<Void, Error>?
        defer { try? file?.close() }
        do {
            NSFileCoordinator().coordinate(writingItemAt: target, options: [], error: &coordinationError) { coordinated in
                result = Result {
                    try Task.checkCancellation()
                    let output = try V4ExportFile(destination: coordinated, fault: fault); file = output; destination = coordinated
                    while true {
                        try Task.checkCancellation()
                        let bytes = try input.read(maximum: 65_536)
                        if bytes.isEmpty { break }
                        try output.write(bytes)
                    }
                    inputClosed = true; try input.close(); try Task.checkCancellation()
                    try output.finish(); try output.validateNamespace(coordinated)
                    guard output.byteCount == expectedBytes, output.digest == expectedHash else { throw LocalReceiptBlobError.bytes }
                    try checkpoint(.copied); try Task.checkCancellation()
                }
            }
            if let coordinationError { throw coordinationError }
            guard let result else { throw BackupArchive.BackupError.invalidArchive }; try result.get()
            guard let output = file, let destination else { throw BackupArchive.BackupError.invalidArchive }
            try checkpoint(.beforeReadback); try Task.checkCancellation()
            var verified: Result<Void, Error>?
            coordinationError = nil
            NSFileCoordinator().coordinate(readingItemAt: destination, options: [], error: &coordinationError) { readable in
                verified = Result {
                    try output.validateNamespace(readable)
                    let received = try V4ReadOnlyAdapter.validate(source: output.reader(), recoveryKey: recoveryKey)
                    guard received == summary else { throw BackupArchive.BackupError.invalidArchive }
                    try output.validateNamespace(readable)
                }
            }
            if let coordinationError { throw coordinationError }
            guard let verified else { throw BackupArchive.BackupError.invalidArchive }; try verified.get()
            try checkpoint(.verified); try Task.checkCancellation()
            try output.validateNamespace(destination); try output.retainDestination(); file = nil
            try Task.checkCancellation(); return destination
        } catch { try file?.close(); throw error }
    }
}
