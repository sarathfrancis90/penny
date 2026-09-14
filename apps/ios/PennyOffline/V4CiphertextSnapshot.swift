import CryptoKit
import Darwin
import Foundation
import PennyV4

/// One immutable, unlinked, read-only inode. The source is copied once with a
/// 64 KiB buffer and a 20 MiB wire limit; no plaintext is spooled. No path escapes.
final class V4CiphertextSnapshot {
    let digest: String, byteCount: Int
    private var pin: Int32
    private init(pin: Int32, digest: String, byteCount: Int) { self.pin = pin; self.digest = digest; self.byteCount = byteCount }
    static func capture(_ source: any PennyV4Input, cancellation: () throws -> Void) throws -> V4CiphertextSnapshot {
        var sourceClosed = false
        defer { if !sourceClosed { try? source.close() } }
        try cancellation()
        let directory = Darwin.open(FileManager.default.temporaryDirectory.path, O_RDONLY | O_DIRECTORY | O_NOFOLLOW | O_CLOEXEC)
        guard directory >= 0 else { throw LocalReceiptBlobError.file }
        var directoryClosed = false
        defer { if !directoryClosed { _ = Darwin.close(directory) } }
        let name = UUID().uuidString.lowercased() + ".pennyv4"
        let output = penny_open_receipt_protected_at(directory, name)
        guard output >= 0 else { throw LocalReceiptBlobError.file }
        var outputClosed = false, pin: Int32 = -1, transferred = false, linked = true
        var original = stat()
        defer {
            if linked {
                var current = stat()
                if fstatat(directory, name, &current, AT_SYMLINK_NOFOLLOW) == 0,
                   current.st_dev == original.st_dev, current.st_ino == original.st_ino { _ = unlinkat(directory, name, 0) }
            }
            if !outputClosed { _ = Darwin.close(output) }
            if pin >= 0 && !transferred { _ = Darwin.close(pin) }
        }
        guard fstat(output, &original) == 0, original.st_mode & S_IFMT == S_IFREG, original.st_uid == geteuid(),
              original.st_mode & 0o077 == 0, original.st_nlink == 1 else { throw LocalReceiptBlobError.file }
        try LocalReceiptProtectionMode.validate(output)
        pin = openat(directory, name, O_RDONLY | O_NOFOLLOW | O_CLOEXEC)
        var held = stat()
        guard pin >= 0, fstat(pin, &held) == 0, held.st_ino == original.st_ino, held.st_dev == original.st_dev else { throw LocalReceiptBlobError.replaced }
        var hash = SHA256(), count = 0
        while true {
            try cancellation()
            let part = try source.read(maximum: 65_536)
            try cancellation()
            guard part.count <= 65_536, count + part.count <= BackupArchive.maximumEnvelopeBytes else { throw ExpenseError.vaultCapacity }
            if part.isEmpty { break }
            try part.withUnsafeBytes { raw in
                var written = 0
                while written < raw.count {
                    let size = Darwin.write(output, raw.baseAddress!.advanced(by: written), raw.count - written)
                    if size < 0 && errno == EINTR { continue }
                    guard size > 0 else { throw LocalReceiptBlobError.file }; written += size
                }
            }
            count += part.count; hash.update(data: part)
        }
        sourceClosed = true; try source.close(); try cancellation()
        guard count > 0, fsync(output) == 0 else { throw LocalReceiptBlobError.file }
        var current = stat()
        guard fstatat(directory, name, &current, AT_SYMLINK_NOFOLLOW) == 0,
              current.st_dev == original.st_dev, current.st_ino == original.st_ino,
              unlinkat(directory, name, 0) == 0 else { throw LocalReceiptBlobError.replaced }
        linked = false
        outputClosed = true; guard Darwin.close(output) == 0 else { throw LocalReceiptBlobError.file }
        guard fsync(directory) == 0 else { throw LocalReceiptBlobError.file }
        directoryClosed = true
        guard Darwin.close(directory) == 0 else { throw LocalReceiptBlobError.file }
        let snapshot = V4CiphertextSnapshot(pin: pin, digest: hash.finalize().map { String(format: "%02x", $0) }.joined(), byteCount: count)
        transferred = true
        do { try snapshot.validate(); try cancellation(); return snapshot } catch { try snapshot.close(); throw error }
    }
    private func validate() throws {
        var info = stat()
        guard pin >= 0, fstat(pin, &info) == 0, info.st_mode & S_IFMT == S_IFREG, info.st_uid == geteuid(),
              info.st_mode & 0o077 == 0, info.st_nlink == 0, info.st_size == byteCount else { throw LocalReceiptBlobError.replaced }
        try LocalReceiptProtectionMode.validate(pin)
    }
    func reader() throws -> Reader {
        try validate()
        let copy = fcntl(pin, F_DUPFD_CLOEXEC, 0)
        guard copy >= 0 else { throw LocalReceiptBlobError.file }
        return Reader(fd: copy)
    }
    func close() throws {
        guard pin >= 0 else { return }; let held = pin; pin = -1
        guard Darwin.close(held) == 0 else { throw LocalReceiptBlobError.file }
    }
    deinit { try? close() }
    final class Reader: PennyV4Input {
        private var fd: Int32, hash = SHA256()
        private(set) var byteCount = 0, digest: String?
        fileprivate init(fd: Int32) { self.fd = fd }
        func read(maximum: Int) throws -> Data {
            guard fd >= 0, maximum > 0, maximum <= 65_536 else { throw LocalReceiptBlobError.closed }
            var result = Data(count: maximum)
            let read = result.withUnsafeMutableBytes { buffer in
                Darwin.pread(fd, buffer.baseAddress!, maximum, off_t(byteCount))
            }
            if read < 0 && errno == EINTR { return try self.read(maximum: maximum) }
            guard read >= 0 else { throw LocalReceiptBlobError.file }
            result.count = read; byteCount += read; hash.update(data: result); return result
        }
        func close() throws {
            guard fd >= 0 else { throw LocalReceiptBlobError.closed }; let held = fd; fd = -1
            guard Darwin.close(held) == 0 else { throw LocalReceiptBlobError.file }
            digest = hash.finalize().map { String(format: "%02x", $0) }.joined()
        }
        deinit { if fd >= 0 { _ = Darwin.close(fd) } }
    }
}
