import Darwin
import Foundation

enum V4FileError: Error { case cannotOpen, notRegular, cannotProtect, replaced }

/// Read-only regular file handle. The caller owns/pins the input generation;
/// this wrapper cannot make an externally mutable provider path immutable.
final class V4FileInput: V4FrameInput {
    private var handle: FileHandle?
    init(url: URL, maximumBytes: Int64) throws {
        let fd = Darwin.open(url.path, O_RDONLY | O_CLOEXEC | O_NOFOLLOW)
        guard fd >= 0 else { throw V4FileError.cannotOpen }
        let opened = FileHandle(fileDescriptor: fd, closeOnDealloc: true)
        do {
            var metadata = stat()
            guard fstat(fd, &metadata) == 0, metadata.st_mode & S_IFMT == S_IFREG else { throw V4FileError.notRegular }
            guard metadata.st_size >= 0, metadata.st_size <= maximumBytes else { throw V4FrameError.capacity }
            handle = opened
        } catch { try? opened.close(); throw error }
    }
    func read(upToCount count: Int) throws -> Data {
        guard count > 0, count <= 65_536 else { throw V4FrameError.sourceViolation }
        guard let handle else { throw V4FrameError.closed }
        return try handle.read(upToCount: count) ?? Data()
    }
    func close() throws { if let open = handle { handle = nil; try open.close() } }
    deinit { try? close() }
}

/// Exclusive encrypted output only. Parent directory must already be private
/// and owned. This never accepts names/paths from decrypted records.
final class V4NewCiphertextFile: V4CiphertextSink {
    let url: URL
    private var handle: FileHandle?
    private var finished = false
    private var identity = stat()
    private var owned = false
    init(url: URL) throws {
        self.url = url
        let fd = Darwin.open(url.path, O_WRONLY | O_CREAT | O_EXCL | O_CLOEXEC | O_NOFOLLOW, S_IRUSR | S_IWUSR)
        guard fd >= 0 else { throw V4FileError.cannotOpen }
        handle = FileHandle(fileDescriptor: fd, closeOnDealloc: true)
        do {
            guard fstat(fd, &identity) == 0 else { throw V4FileError.cannotOpen }
            owned = true
            try FileManager.default.setAttributes([.protectionKey: FileProtectionType.complete], ofItemAtPath: url.path)
            var values = URLResourceValues(); values.isExcludedFromBackup = true
            var protected = url; try protected.setResourceValues(values)
        } catch { discard(); throw error }
    }
    func write(_ bytes: Data) throws {
        guard !finished, let handle else { throw V4FrameError.closed }
        guard bytes.count <= V4FrameCodec.maximumCiphertextChunk else { throw V4FrameError.invalidLength }
        try handle.write(contentsOf: bytes)
    }
    func finish() throws {
        guard !finished, let open = handle else { throw V4FrameError.closed }
        guard isOwnPath() else { throw V4FileError.replaced }
        try open.synchronize()
        try open.close(); handle = nil; finished = true
    }
    private func isOwnPath() -> Bool {
        var current = stat()
        return owned && lstat(url.path, &current) == 0 && current.st_dev == identity.st_dev && current.st_ino == identity.st_ino
    }
    func discard() {
        if let open = handle { handle = nil; try? open.close() }
        // Never unlink a substituted or pre-existing file at the same path.
        if isOwnPath() { _ = Darwin.unlink(url.path) }
        owned = false; finished = false
    }
    deinit { if !finished { discard() } }
}
