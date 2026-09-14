import CryptoKit
import Darwin
import Foundation

/// Local-only foundation. No live store, backup, migration or activation caller.
enum LocalReceiptBlobError: Error { case descriptor, key, bytes, file, replaced, capacity, closed, protection(Int32) }

enum LocalReceiptProtectionMode {
    case simulatedFilesystem, complete
    #if targetEnvironment(simulator)
    static let current: Self = .simulatedFilesystem
    #else
    static let current: Self = .complete
    #endif

    static func validate(_ fd: Int32) throws {
        #if !targetEnvironment(simulator)
        let protection = penny_receipt_protection_class(fd)
        guard protection == 1 else { throw LocalReceiptBlobError.protection(protection < 0 ? errno : 0) }
        #endif
    }
}

struct LocalReceiptDescriptor: Equatable, Sendable, Codable {
    let vaultId: String, generationId: String, id: String, expenseId: String
    let mediaType: String, byteCount: Int, sha256: String
    init(vaultId: String, generationId: String, id: String, expenseId: String, mediaType: String, byteCount: Int, sha256: String) throws {
        guard [vaultId, generationId, id, expenseId].allSatisfy({ UUID(uuidString: $0)?.uuidString.lowercased() == $0 }),
              ["image/png", "image/jpeg"].contains(mediaType), (1...ReceiptAttachment.maximumBytes).contains(byteCount),
              sha256.utf8.count == 64, sha256.utf8.allSatisfy({ (48...57).contains($0) || (97...102).contains($0) }) else { throw LocalReceiptBlobError.descriptor }
        self.vaultId = vaultId; self.generationId = generationId; self.id = id; self.expenseId = expenseId
        self.mediaType = mediaType; self.byteCount = byteCount; self.sha256 = sha256
    }
    private enum CodingKeys: String, CodingKey, CaseIterable { case vaultId, generationId, id, expenseId, mediaType, byteCount, sha256 }
    init(from decoder: Decoder) throws {
        struct Key: CodingKey { let stringValue: String; var intValue: Int? { nil }; init?(stringValue: String) { self.stringValue = stringValue }; init?(intValue: Int) { return nil } }
        let shape = try decoder.container(keyedBy: Key.self)
        guard Set(shape.allKeys.map(\.stringValue)) == Set(CodingKeys.allCases.map(\.rawValue)) else { throw LocalReceiptBlobError.descriptor }
        let c = try decoder.container(keyedBy: CodingKeys.self)
        try self.init(vaultId: c.decode(String.self, forKey: .vaultId), generationId: c.decode(String.self, forKey: .generationId), id: c.decode(String.self, forKey: .id), expenseId: c.decode(String.self, forKey: .expenseId), mediaType: c.decode(String.self, forKey: .mediaType), byteCount: c.decode(Int.self, forKey: .byteCount), sha256: c.decode(String.self, forKey: .sha256))
    }

}

enum LocalReceiptBlob {
    static let magic = Data("PNYRCP01".utf8)
    private static func hex(_ value: String) -> Data {
        let bytes = Array(value.replacingOccurrences(of: "-", with: "").utf8)
        func nibble(_ x: UInt8) -> UInt8 { x >= 97 ? x - 87 : x - 48 }
        return Data(stride(from: 0, to: bytes.count, by: 2).map { nibble(bytes[$0]) * 16 + nibble(bytes[$0 + 1]) })
    }
    static func derivedKey(root: SymmetricKey, descriptor: LocalReceiptDescriptor) throws -> SymmetricKey {
        guard root.bitCount == 256 else { throw LocalReceiptBlobError.key }
        let context = Data("PENNY-OFFLINE-LOCAL-RECEIPT-KEY:1\0".utf8) + hex(descriptor.vaultId) + hex(descriptor.generationId)
        return SymmetricKey(data: HMAC<SHA256>.authenticationCode(for: context, using: root))
    }
    static func aad(_ d: LocalReceiptDescriptor) -> Data {
        let length = Data((0..<8).reversed().map { UInt8(truncatingIfNeeded: UInt64(d.byteCount) >> ($0 * 8)) })
        return Data("PENNY-OFFLINE-LOCAL-RECEIPT:1\0".utf8) + magic + hex(d.vaultId) + hex(d.generationId)
            + hex(d.id) + hex(d.expenseId) + Data([d.mediaType == "image/png" ? 1 : 2]) + length + hex(d.sha256)
    }
    static func validate(_ data: Data, descriptor: LocalReceiptDescriptor) throws {
        guard data.count == descriptor.byteCount,
              SHA256.hash(data: data).map({ String(format: "%02x", $0) }).joined() == descriptor.sha256 else { throw LocalReceiptBlobError.bytes }
        try autoreleasepool {
            let image = try ReceiptAttachment(data: data, expenseId: descriptor.expenseId)
            guard image.mediaType == descriptor.mediaType else { throw LocalReceiptBlobError.bytes }
        }
    }
    /// No deterministic nonce parameter. CryptoKit chooses a fresh nonce.
    static func seal(_ data: Data, descriptor: LocalReceiptDescriptor, root: SymmetricKey) throws -> Data {
        try validate(data, descriptor: descriptor)
        let box = try AES.GCM.seal(data, using: derivedKey(root: root, descriptor: descriptor), authenticating: aad(descriptor))
        guard let combined = box.combined else { throw LocalReceiptBlobError.bytes }
        return magic + combined
    }
    static func open(_ wire: Data, descriptor: LocalReceiptDescriptor, root: SymmetricKey) throws -> Data {
        guard wire.count == descriptor.byteCount + 36, wire.prefix(8) == magic else { throw LocalReceiptBlobError.bytes }
        let box = try AES.GCM.SealedBox(combined: wire.dropFirst(8))
        let plaintext = try AES.GCM.open(box, using: derivedKey(root: root, descriptor: descriptor), authenticating: aad(descriptor))
        try validate(plaintext, descriptor: descriptor); return plaintext
    }
}

/// A validated file identity, not permission to activate a vault or candidate.
struct LocalReceiptBlobHandle {
    let descriptor: LocalReceiptDescriptor
    fileprivate let name: String
    fileprivate let device: dev_t, inode: ino_t
    fileprivate func read(directoryFD: Int32, root: SymmetricKey) throws -> Data {
        let fd = openat(directoryFD, name, O_RDONLY | O_NONBLOCK | O_CLOEXEC | O_NOFOLLOW)
        guard fd >= 0 else { throw LocalReceiptBlobError.file }
        let file = FileHandle(fileDescriptor: fd, closeOnDealloc: true); defer { try? file.close() }
        var info = stat()
        guard fstat(fd, &info) == 0, info.st_mode & S_IFMT == S_IFREG, info.st_dev == device, info.st_ino == inode,
              info.st_uid == geteuid(), info.st_mode & 0o077 == 0, info.st_nlink == 1,
              info.st_size == descriptor.byteCount + 36 else { throw LocalReceiptBlobError.replaced }
        try LocalReceiptProtectionMode.validate(fd)
        var wire = Data(); wire.reserveCapacity(descriptor.byteCount + 36)
        while let part = try file.read(upToCount: min(65_536, descriptor.byteCount + 37 - wire.count)), !part.isEmpty {
            wire.append(part); guard wire.count <= descriptor.byteCount + 36 else { throw LocalReceiptBlobError.bytes }
        }
        try file.close()
        return try LocalReceiptBlob.open(wire, descriptor: descriptor, root: root)
    }
}

/// Owns only this unactivated generation's files. Explicit close/discard or
/// deinit removes owned entries; this is not a durable live-vault generation.
final class LocalReceiptGeneration {
    let receipts: [LocalReceiptBlobHandle]
    private var owner: LocalReceiptBlobGroup?
    fileprivate init(owner: LocalReceiptBlobGroup, receipts: [LocalReceiptBlobHandle]) { self.owner = owner; self.receipts = receipts }
    func read(receiptId: String, root: SymmetricKey) throws -> Data {
        guard let owner, let handle = receipts.first(where: { $0.descriptor.id == receiptId }) else { throw LocalReceiptBlobError.closed }
        return try owner.read(handle, root: root)
    }
    func validateOwnership() throws {
        guard let owner else { throw LocalReceiptBlobError.closed }; try owner.validateOwnership()
    }
    /// Transfer committed byte lifetime to the repository. Releasing this lease
    /// closes FD pins; explicit repository GC is the only later deletion owner.
    func retainCommitted() throws { guard let held = owner else { throw LocalReceiptBlobError.closed }; owner = nil; try held.releaseLease() }
    static func readCommitted(parent: URL, descriptor: LocalReceiptDescriptor, root: SymmetricKey) throws -> Data {
        let parentFD = Darwin.open(parent.path, O_RDONLY | O_DIRECTORY | O_NOFOLLOW | O_CLOEXEC)
        guard parentFD >= 0 else { throw LocalReceiptBlobError.file }; var parentClosed = false; defer { if !parentClosed { _ = Darwin.close(parentFD) } }
        let directory = openat(parentFD, descriptor.generationId, O_RDONLY | O_DIRECTORY | O_NOFOLLOW | O_CLOEXEC)
        guard directory >= 0 else { throw LocalReceiptBlobError.file }; var directoryClosed = false; defer { if !directoryClosed { _ = Darwin.close(directory) } }
        var folder = stat(); guard fstat(directory, &folder) == 0, folder.st_uid == geteuid(), folder.st_mode & 0o077 == 0 else { throw LocalReceiptBlobError.file }
        let name = descriptor.id + ".pennyreceipt"
        let pin = openat(directory, name, O_RDONLY | O_NONBLOCK | O_NOFOLLOW | O_CLOEXEC)
        guard pin >= 0 else { throw LocalReceiptBlobError.file }; var pinClosed = false; defer { if !pinClosed { _ = Darwin.close(pin) } }
        var info = stat(); guard fstat(pin, &info) == 0 else { throw LocalReceiptBlobError.file }
        let listingFD = openat(directory, ".", O_RDONLY | O_DIRECTORY | O_NOFOLLOW | O_CLOEXEC)
        guard listingFD >= 0, let listing = fdopendir(listingFD) else { if listingFD >= 0 { _ = Darwin.close(listingFD) }; throw LocalReceiptBlobError.file }
        var names = Set<String>(), listingClosed = false; defer { if !listingClosed { _ = closedir(listing) } }
        errno = 0
        while let entry = readdir(listing) {
            let entryName = withUnsafePointer(to: entry.pointee.d_name) { pointer in pointer.withMemoryRebound(to: CChar.self, capacity: MemoryLayout.size(ofValue: entry.pointee.d_name)) { String(cString: $0) } }
            if entryName != "." && entryName != ".." { names.insert(entryName) }
            errno = 0
        }
        guard errno == 0, names == [name] else { throw LocalReceiptBlobError.replaced }
        let data = try LocalReceiptBlobHandle(descriptor: descriptor, name: name, device: info.st_dev, inode: info.st_ino).read(directoryFD: directory, root: root)
        var current = stat()
        guard fstatat(parentFD, descriptor.generationId, &current, AT_SYMLINK_NOFOLLOW) == 0, current.st_dev == folder.st_dev, current.st_ino == folder.st_ino else { throw LocalReceiptBlobError.replaced }
        rewinddir(listing); names.removeAll(); errno = 0
        while let entry = readdir(listing) {
            let entryName = withUnsafePointer(to: entry.pointee.d_name) { pointer in pointer.withMemoryRebound(to: CChar.self, capacity: MemoryLayout.size(ofValue: entry.pointee.d_name)) { String(cString: $0) } }
            if entryName != "." && entryName != ".." { names.insert(entryName) }; errno = 0
        }
        guard errno == 0, names == [name] else { throw LocalReceiptBlobError.replaced }
        listingClosed = true; guard closedir(listing) == 0 else { throw LocalReceiptBlobError.file }
        pinClosed = true; let pinResult = Darwin.close(pin)
        directoryClosed = true; let directoryResult = Darwin.close(directory)
        parentClosed = true; let parentResult = Darwin.close(parentFD)
        guard pinResult == 0, directoryResult == 0, parentResult == 0 else { throw LocalReceiptBlobError.file }
        return data
    }
    func close() throws { let owned = owner; owner = nil; try owned?.cleanupOwned() }
    deinit { try? close() }
}

/// One operation owns a newly generated directory and validated UUID file names. The
/// Supplied parent is an already provisioned, private, backup-excluded storage
/// context. Provisioning precedes capability exposure; no metadata supplies paths.
/// Synchronous/off-main API. Group completion only seals this local file set.
final class LocalReceiptBlobGroup {
    enum Phase { case beforeCreate, afterWrite, afterSync, afterClose, beforeReopen, beforeComplete, afterCompleteReads }
    typealias Fault = (Phase, URL) throws -> Void
    let vaultId: String, generationId: String
    private let directory: URL, directoryName: String
    private var parentFD: Int32 = -1, directoryFD: Int32 = -1
    private var directoryIdentity = stat()
    private var root: SymmetricKey?
    private var handles: [LocalReceiptBlobHandle] = []
    // Keep the original inode allocated until cleanup; dev+ino alone can be
    // reused immediately after an attacker replaces an unlinked closed file.
    private var owned: [(String, dev_t, ino_t, Int32)] = []
    private var ids = Set<String>(), total = 0
    private var active = true
    private let cancellation: () throws -> Void, fault: Fault

    init(parent: URL, vaultId: String, root: SymmetricKey,
         cancellation: @escaping () throws -> Void = { try Task.checkCancellation() }, fault: @escaping Fault = { _, _ in }) throws {
        guard parent.isFileURL, UUID(uuidString: vaultId)?.uuidString.lowercased() == vaultId, root.bitCount == 256 else { throw LocalReceiptBlobError.descriptor }
        self.vaultId = vaultId; generationId = UUID().uuidString.lowercased(); directoryName = generationId
        directory = parent.appendingPathComponent(generationId, isDirectory: true); self.root = root
        self.cancellation = cancellation; self.fault = fault
        parentFD = Darwin.open(parent.path, O_RDONLY | O_DIRECTORY | O_NOFOLLOW | O_CLOEXEC)
        guard parentFD >= 0 else { throw LocalReceiptBlobError.file }
        do {
            var parentInfo = stat()
            guard fstat(parentFD, &parentInfo) == 0, parentInfo.st_mode & S_IFMT == S_IFDIR,
                  parentInfo.st_uid == geteuid(), parentInfo.st_mode & 0o077 == 0 else { throw LocalReceiptBlobError.file }
            func matchingParent() -> Bool {
                var current = stat()
                return lstat(parent.path, &current) == 0 && current.st_dev == parentInfo.st_dev
                    && current.st_ino == parentInfo.st_ino && current.st_mode & S_IFMT == S_IFDIR
            }
            guard matchingParent() else { throw LocalReceiptBlobError.replaced }
            let excluded = try URL(fileURLWithPath: parent.path).resourceValues(forKeys: [.isExcludedFromBackupKey]).isExcludedFromBackup
            guard excluded == true, matchingParent() else { throw LocalReceiptBlobError.file }
            try cancellation()
            guard mkdirat(parentFD, directoryName, S_IRWXU) == 0 else { throw LocalReceiptBlobError.file }
            guard fstatat(parentFD, directoryName, &directoryIdentity, AT_SYMLINK_NOFOLLOW) == 0,
                  directoryIdentity.st_mode & S_IFMT == S_IFDIR else { throw LocalReceiptBlobError.file }
            directoryFD = openat(parentFD, directoryName, O_RDONLY | O_DIRECTORY | O_NOFOLLOW | O_CLOEXEC)
            guard directoryFD >= 0, ownDirectory() else { throw LocalReceiptBlobError.file }
            guard fsync(parentFD) == 0 else { throw LocalReceiptBlobError.file }
            try cancellation()
        } catch { try abort(error) }
    }
    private func checkpoint(_ phase: Phase, _ url: URL) throws { try cancellation(); try fault(phase, url); try cancellation() }
    private func abort(_ original: Error) throws -> Never { try discard(); throw original }
    fileprivate func read(_ handle: LocalReceiptBlobHandle, root: SymmetricKey) throws -> Data {
        guard ownDirectory() else { throw LocalReceiptBlobError.replaced }
        return try handle.read(directoryFD: directoryFD, root: root)
    }
    private func ownDirectory() -> Bool {
        var info = stat()
        return parentFD >= 0 && directoryIdentity.st_ino != 0 && fstatat(parentFD, directoryName, &info, AT_SYMLINK_NOFOLLOW) == 0
            && info.st_dev == directoryIdentity.st_dev && info.st_ino == directoryIdentity.st_ino && info.st_mode & S_IFMT == S_IFDIR
            && info.st_uid == geteuid() && info.st_mode & 0o077 == 0
    }
    fileprivate func validateOwnership() throws {
        guard ownDirectory() else { throw LocalReceiptBlobError.replaced }
        try validateInventory()
        guard ownDirectory() else { throw LocalReceiptBlobError.replaced }
    }
    func append(_ image: ReceiptAttachment) throws -> LocalReceiptBlobHandle {
        guard active else { throw LocalReceiptBlobError.closed }
        do {
            let descriptor = try LocalReceiptDescriptor(vaultId: vaultId, generationId: generationId, id: image.id, expenseId: image.expenseId,
                mediaType: image.mediaType, byteCount: image.byteCount, sha256: image.sha256)
            return try append(image.bytes(), descriptor: descriptor)
        } catch { try abort(error) }
    }
    /// One bounded raw receipt; the declaration must belong to this owned group.
    func append(_ bytes: Data, descriptor: LocalReceiptDescriptor) throws -> LocalReceiptBlobHandle {
        guard active, let root else { throw LocalReceiptBlobError.closed }
        do {
            guard descriptor.vaultId == vaultId, descriptor.generationId == generationId else { throw LocalReceiptBlobError.descriptor }
            guard handles.count < ReceiptAttachment.maximumCount, !ids.contains(descriptor.id), total + descriptor.byteCount <= ReceiptAttachment.maximumTotalBytes else { throw LocalReceiptBlobError.capacity }
            try cancellation(); guard ownDirectory() else { throw LocalReceiptBlobError.replaced }
            let wire = try LocalReceiptBlob.seal(bytes, descriptor: descriptor, root: root)
            let name = descriptor.id + ".pennyreceipt", url = directory.appendingPathComponent(name)
            try checkpoint(.beforeCreate, url)
            let fd = penny_open_receipt_protected_at(directoryFD, name)
            guard fd >= 0 else { throw LocalReceiptBlobError.protection(errno) }
            let file = FileHandle(fileDescriptor: fd, closeOnDealloc: true); defer { try? file.close() }
            // If fstat itself fails there is no trustworthy identity to unlink;
            // leave the unknown entry and fail cleanup rather than delete by name.
            var info = stat(); guard fstat(fd, &info) == 0 else { throw LocalReceiptBlobError.file }
            let pin = openat(directoryFD, name, O_RDONLY | O_NONBLOCK | O_NOFOLLOW | O_CLOEXEC)
            var pinInfo = stat()
            guard pin >= 0, fstat(pin, &pinInfo) == 0, pinInfo.st_dev == info.st_dev, pinInfo.st_ino == info.st_ino else {
                if pin >= 0 { _ = Darwin.close(pin) }
                var current = stat()
                if fstatat(directoryFD, name, &current, AT_SYMLINK_NOFOLLOW) == 0, current.st_dev == info.st_dev, current.st_ino == info.st_ino { _ = unlinkat(directoryFD, name, 0) }
                throw LocalReceiptBlobError.file
            }
            owned.append((name, info.st_dev, info.st_ino, pin))
            guard info.st_mode & S_IFMT == S_IFREG, info.st_uid == geteuid(),
                  info.st_mode & 0o077 == 0, info.st_nlink == 1 else { throw LocalReceiptBlobError.file }
            try LocalReceiptProtectionMode.validate(fd)
            for offset in stride(from: 0, to: wire.count, by: 65_536) {
                try cancellation(); try file.write(contentsOf: wire[offset..<min(wire.count, offset + 65_536)])
                try checkpoint(.afterWrite, url)
            }
            try file.synchronize(); try checkpoint(.afterSync, url)
            try file.close(); try checkpoint(.afterClose, url)
            guard fsync(directoryFD) == 0 else { throw LocalReceiptBlobError.file }
            try checkpoint(.beforeReopen, url); guard ownDirectory() else { throw LocalReceiptBlobError.replaced }
            let handle = LocalReceiptBlobHandle(descriptor: descriptor, name: name, device: info.st_dev, inode: info.st_ino)
            _ = try read(handle, root: root); try cancellation()
            handles.append(handle); ids.insert(descriptor.id); total += descriptor.byteCount
            return handle
        } catch { try abort(error) }
    }
    func complete() throws -> LocalReceiptGeneration {
        guard active, let root else { throw LocalReceiptBlobError.closed }
        do {
            try checkpoint(.beforeComplete, directory); guard ownDirectory() else { throw LocalReceiptBlobError.replaced }
            try validateInventory()
            for handle in handles { try cancellation(); _ = try read(handle, root: root) }
            try checkpoint(.afterCompleteReads, directory)
            guard ownDirectory() else { throw LocalReceiptBlobError.replaced }
            try validateInventory()
            guard fsync(directoryFD) == 0 else { throw LocalReceiptBlobError.file }
            try cancellation(); active = false; self.root = nil
            return LocalReceiptGeneration(owner: self, receipts: handles)
        } catch { try abort(error) }
    }
    private func validateInventory() throws {
        let fd = dup(directoryFD); guard fd >= 0 else { throw LocalReceiptBlobError.file }
        guard let listing = fdopendir(fd) else { _ = Darwin.close(fd); throw LocalReceiptBlobError.file }
        // dup shares directory offset: every inventory must start at the beginning.
        rewinddir(listing)
        var closed = false; defer { if !closed { _ = closedir(listing) } }
        let expected = Dictionary(uniqueKeysWithValues: owned.map { ($0.0, ($0.1, $0.2)) }); var seen = Set<String>()
        errno = 0
        while let entry = readdir(listing) {
            let name = withUnsafePointer(to: entry.pointee.d_name) { pointer in
                pointer.withMemoryRebound(to: CChar.self, capacity: MemoryLayout.size(ofValue: entry.pointee.d_name)) { String(cString: $0) }
            }
            if name == "." || name == ".." { continue }
            guard let identity = expected[name] else { throw LocalReceiptBlobError.replaced }
            var info = stat()
            guard fstatat(directoryFD, name, &info, AT_SYMLINK_NOFOLLOW) == 0, info.st_mode & S_IFMT == S_IFREG,
                  info.st_uid == geteuid(), info.st_mode & 0o077 == 0, info.st_nlink == 1,
                  info.st_dev == identity.0, info.st_ino == identity.1, seen.insert(name).inserted else { throw LocalReceiptBlobError.replaced }
            errno = 0
        }
        guard errno == 0, seen == Set(expected.keys) else { throw LocalReceiptBlobError.file }
        closed = true; guard closedir(listing) == 0 else { throw LocalReceiptBlobError.file }
    }
    func discard() throws {
        guard active else { return }; active = false; root = nil
        try cleanupOwned()
    }
    fileprivate func cleanupOwned() throws {
        var failed = false
        for (name, device, inode, pin) in owned {
            var info = stat()
            if directoryFD >= 0, fstatat(directoryFD, name, &info, AT_SYMLINK_NOFOLLOW) == 0, info.st_dev == device, info.st_ino == inode {
                if unlinkat(directoryFD, name, 0) != 0 { failed = true }
            } else { failed = true }
            if Darwin.close(pin) != 0 { failed = true }
        }
        if ownDirectory() { if unlinkat(parentFD, directoryName, AT_REMOVEDIR) != 0 { failed = true } }
        else { failed = true }
        handles.removeAll(); ids.removeAll(); owned.removeAll()
        do { try closeDirectories() } catch { failed = true }
        if failed { throw LocalReceiptBlobError.file }
    }
    fileprivate func releaseLease() throws {
        var failed = false
        for (_, _, _, pin) in owned { if Darwin.close(pin) != 0 { failed = true } }
        owned.removeAll(); handles.removeAll(); ids.removeAll()
        do { try closeDirectories() } catch { failed = true }
        if failed { throw LocalReceiptBlobError.file }
    }
    private func closeDirectories() throws {
        var failed = false
        if directoryFD >= 0 { let fd = directoryFD; directoryFD = -1; if Darwin.close(fd) != 0 { failed = true } }
        if parentFD >= 0 { let fd = parentFD; parentFD = -1; if Darwin.close(fd) != 0 { failed = true } }
        if failed { throw LocalReceiptBlobError.file }
    }
    deinit { try? discard(); try? closeDirectories() }
}
