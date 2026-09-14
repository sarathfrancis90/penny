import CryptoKit
import Darwin
import Foundation
import PennyV4

@MainActor extension VaultStore {
    enum V4ExportPhase: Sendable { case sourcePinned, sealed, verified }
    enum V4OutputPhase: Sendable { case wroteChunk, synced, closed }
    func prepareV4Export(recoveryKey: String,
                         outputFault: @escaping @Sendable (V4OutputPhase) throws -> Void = { _ in },
                         checkpoint: @escaping @MainActor (V4ExportPhase) throws -> Void = { _ in }) async throws -> V4VerifiedExport {
        let request = try captureV4Export()
        let result = try await V4ExportWorker().prepare(request: request, recoveryKey: recoveryKey, outputFault: outputFault, checkpoint: checkpoint)
        do { try Task.checkCancellation(); return result } catch { try await result.close(); throw error }
    }
}
private actor V4ExportWorker {
    func prepare(request: V4Transfer<DurableVaultStorage.ExportRequest>, recoveryKey: String,
                 outputFault: @escaping @Sendable (VaultStore.V4OutputPhase) throws -> Void,
                 checkpoint: @escaping @MainActor (VaultStore.V4ExportPhase) throws -> Void) async throws -> V4VerifiedExport {
        try Task.checkCancellation()
        let source = try request.take().open()
        var file: V4ExportFile?
        defer { try? source.close(); try? file?.close() }
        do {
            try await checkpoint(.sourcePinned); try Task.checkCancellation()
            let logical = try V4LogicalWriter(source: source)
            let output = try V4ExportFile(fault: outputFault); file = output
            let written = try PennyV4FrameWriter.seal(source: logical, output: output, recoveryKey: recoveryKey)
            guard written.plaintextBytes == logical.expectedPlaintextBytes, written.ciphertextBytes == logical.expectedCiphertextBytes,
                  written.plaintextSHA256 == logical.plaintextDigest else { throw ExpenseError.invalidSnapshot }
            try await checkpoint(.sealed); try Task.checkCancellation()
            let reader = try output.reader()
            let summary = try V4ReadOnlyAdapter.validate(source: reader, recoveryKey: recoveryKey)
            guard logical.matches(summary), reader.byteCount == output.byteCount, reader.digest == output.digest else { throw ExpenseError.invalidSnapshot }
            try await checkpoint(.verified); try Task.checkCancellation()
            try output.validate()
            let result = V4VerifiedExport(file: V4Transfer(output, cleanup: { try $0.close() }), summary: summary,
                ciphertextBytes: output.byteCount, ciphertextSHA256: output.digest)
            file = nil; return result
        } catch { try source.close(); try file?.close(); throw error }
    }
}

/// Opaque actor-owned ciphertext. Consumers receive only an owned read stream;
/// no mutable filename or plaintext state. Files/provider presentation is separate.
actor V4VerifiedExport {
    let summary: PennyV4Summary, ciphertextBytes: Int, ciphertextSHA256: String
    private let transfer: V4Transfer<V4ExportFile>
    private var file: V4ExportFile?
    fileprivate init(file: V4Transfer<V4ExportFile>, summary: PennyV4Summary, ciphertextBytes: Int, ciphertextSHA256: String) {
        transfer = file; self.summary = summary; self.ciphertextBytes = ciphertextBytes; self.ciphertextSHA256 = ciphertextSHA256
    }
    func ownedInput() throws -> V4Transfer<any PennyV4Input> {
        if file == nil { file = try transfer.take() }
        guard let file else { throw LocalReceiptBlobError.closed }
        return V4Transfer(try file.reader() as any PennyV4Input, cleanup: { try $0.close() })
    }
    func close() throws { let held = file; file = nil; try held?.close(); try transfer.close() }
}

private final class V4ExportFile: PennyV4Output {
    private var directory: Int32 = -1, output: Int32 = -1, pin: Int32 = -1
    private let name = UUID().uuidString.lowercased() + ".pennyv4export"
    private var identity = stat(), hash = SHA256(), finished = false
    private let fault: @Sendable (VaultStore.V4OutputPhase) throws -> Void
    private(set) var byteCount = 0, digest = ""
    init(fault: @escaping @Sendable (VaultStore.V4OutputPhase) throws -> Void) throws {
        self.fault = fault
        directory = Darwin.open(FileManager.default.temporaryDirectory.path, O_RDONLY | O_DIRECTORY | O_NOFOLLOW | O_CLOEXEC)
        guard directory >= 0 else { throw LocalReceiptBlobError.file }
        do {
            output = penny_open_receipt_protected_at(directory, name)
            guard output >= 0, fstat(output, &identity) == 0 else { throw LocalReceiptBlobError.file }
            pin = openat(directory, name, O_RDONLY | O_NOFOLLOW | O_CLOEXEC)
            guard pin >= 0 else { throw LocalReceiptBlobError.file }; try validate()
        } catch { try close(); throw error }
    }
    func validate() throws {
        var held = stat(), current = stat()
        guard directory >= 0, pin >= 0, fstat(pin, &held) == 0, fstatat(directory, name, &current, AT_SYMLINK_NOFOLLOW) == 0,
              held.st_dev == identity.st_dev, held.st_ino == identity.st_ino, current.st_dev == held.st_dev, current.st_ino == held.st_ino,
              held.st_mode & S_IFMT == S_IFREG, held.st_mode & 0o077 == 0, held.st_uid == geteuid(), held.st_nlink == 1,
              held.st_size == byteCount else { throw LocalReceiptBlobError.replaced }
        try LocalReceiptProtectionMode.validate(pin)
    }
    func write(_ bytes: Data) throws {
        guard !finished, output >= 0, byteCount + bytes.count <= BackupArchive.maximumEnvelopeBytes else { throw ExpenseError.vaultCapacity }
        try Task.checkCancellation()
        try bytes.withUnsafeBytes { raw in
            var at = 0
            while at < raw.count {
                let written = Darwin.write(output, raw.baseAddress!.advanced(by: at), raw.count - at)
                if written < 0 && errno == EINTR { continue }
                guard written > 0 else { throw LocalReceiptBlobError.file }; at += written
            }
        }
        byteCount += bytes.count; hash.update(data: bytes)
        try fault(.wroteChunk)
    }
    func finish() throws {
        guard !finished, output >= 0, fsync(output) == 0 else { throw LocalReceiptBlobError.file }
        try fault(.synced)
        let held = output; output = -1
        guard Darwin.close(held) == 0, fsync(directory) == 0 else { throw LocalReceiptBlobError.file }
        try fault(.closed)
        digest = hash.finalize().map { String(format: "%02x", $0) }.joined(); finished = true
        try validate(); try Task.checkCancellation()
    }
    func reader() throws -> V4ExportReader {
        guard finished else { throw LocalReceiptBlobError.closed }; try validate()
        let opened = openat(directory, name, O_RDONLY | O_NOFOLLOW | O_CLOEXEC)
        guard opened >= 0 else { throw LocalReceiptBlobError.file }
        var info = stat()
        do {
            guard fstat(opened, &info) == 0, info.st_dev == identity.st_dev, info.st_ino == identity.st_ino else { throw LocalReceiptBlobError.replaced }
            try LocalReceiptProtectionMode.validate(opened)
            return V4ExportReader(fd: opened, expectedBytes: byteCount, expectedDigest: digest)
        } catch { _ = Darwin.close(opened); throw error }
    }
    func discard() { try? close() }
    func close() throws {
        let writer = output, held = pin, parent = directory
        output = -1; pin = -1; directory = -1; finished = true
        guard parent >= 0 else { return }; var failed = false, current = stat()
        if fstatat(parent, name, &current, AT_SYMLINK_NOFOLLOW) == 0 {
            if current.st_dev == identity.st_dev && current.st_ino == identity.st_ino {
                if unlinkat(parent, name, 0) != 0 || fsync(parent) != 0 { failed = true }
            } else { failed = true }
        } else if errno != ENOENT { failed = true }
        for fd in [writer, held, parent] where fd >= 0 { if Darwin.close(fd) != 0 { failed = true } }
        if failed { throw LocalReceiptBlobError.file }
    }
    deinit { try? close() }
}
private final class V4ExportReader: PennyV4Input {
    private var fd: Int32, hash = SHA256()
    private let expectedBytes: Int, expectedDigest: String
    private var eof = false
    private(set) var byteCount = 0, digest = ""
    init(fd: Int32, expectedBytes: Int, expectedDigest: String) {
        self.fd = fd; self.expectedBytes = expectedBytes; self.expectedDigest = expectedDigest
    }
    func read(maximum: Int) throws -> Data {
        guard fd >= 0, maximum > 0, maximum <= 65_536 else { throw LocalReceiptBlobError.closed }
        var bytes = Data(count: maximum)
        let count = bytes.withUnsafeMutableBytes { Darwin.read(fd, $0.baseAddress!, maximum) }
        if count < 0 && errno == EINTR { return try read(maximum: maximum) }
        guard count >= 0 else { throw LocalReceiptBlobError.file }
        guard byteCount + count <= expectedBytes else { throw LocalReceiptBlobError.bytes }
        bytes.count = count; byteCount += count; hash.update(data: bytes)
        if count == 0 {
            digest = hash.finalize().map { String(format: "%02x", $0) }.joined()
            guard byteCount == expectedBytes, digest == expectedDigest else { throw LocalReceiptBlobError.bytes }
            eof = true
        }
        return bytes
    }
    func close() throws {
        guard fd >= 0 else { throw LocalReceiptBlobError.closed }; let held = fd; fd = -1
        guard Darwin.close(held) == 0 else { throw LocalReceiptBlobError.file }
        guard eof, byteCount == expectedBytes, digest == expectedDigest else { throw LocalReceiptBlobError.bytes }
    }
    deinit { if fd >= 0 { _ = Darwin.close(fd) } }
}
