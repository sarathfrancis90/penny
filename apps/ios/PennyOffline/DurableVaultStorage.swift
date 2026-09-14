import CryptoKit
import Darwin
import Foundation

/// Local formats only. Portable backup bytes and validation are unchanged.
struct DurableReference: Codable, Equatable, Sendable {
    let id: String, sha256: String
    func validate() throws { try FinanceValidation.uuid(id); guard sha256.count == 64, sha256.utf8.allSatisfy({ (48...57).contains($0) || (97...102).contains($0) }) else { throw ExpenseError.invalidSnapshot } }
    var name: String { id + ".pennygen" }
}
struct DurablePointer: Codable {
    let version: Int, storeId: String
    let current: DurableReference, previous: DurableReference?
    let journal: Data?
}
struct DurableJournal: Codable { let currentHash: String, previousHash: String? }
struct DurableRecord: Codable {
    let version: Int, storeId: String, generationId: String
    let metadata: LocalVaultMetadata
    let body: Data
    let receipts: [LocalReceiptDescriptor]
}
struct DurableLoaded: Sendable {
    let snapshot: VaultSnapshot, metadata: LocalVaultMetadata?
    let snapshotBytes: Int, storeId: String?
    let receipts: [LocalReceiptDescriptor]
}

/// One FD lease addresses the actual directory inode across every store instance.
/// Root provisioning occurs before this trusted storage context is exposed.
final class DurableVaultStorage {
    static let live = "vault-v1.pennyvault", rollback = "vault-rollback.pennyvault"
    private static let prefix = Data("PENNY-DURABLE:".utf8)
    private static let pointerMagic = Data("PENNY-DURABLE:POINTER:1\n".utf8)
    private static let recordMagic = Data("PENNY-DURABLE:RECORD:1\n".utf8)
    let url: URL
    private let fd: Int32
    private let identity: stat
    init(_ url: URL) throws {
        self.url = url
        // This private application root never comes from backup metadata.
        if !FileManager.default.fileExists(atPath: url.path) {
            try FileManager.default.createDirectory(at: url, withIntermediateDirectories: true, attributes: [.posixPermissions: 0o700])
            var flags = URLResourceValues(); flags.isExcludedFromBackup = true
            var provisioned = url; try provisioned.setResourceValues(flags)
        }
        fd = Darwin.open(url.path, O_RDONLY | O_DIRECTORY | O_NOFOLLOW | O_CLOEXEC)
        guard fd >= 0 else { throw LocalReceiptBlobError.file }
        var info = stat()
        guard fstat(fd, &info) == 0, info.st_uid == geteuid() else { _ = Darwin.close(fd); throw LocalReceiptBlobError.file }
        identity = info
        // One-time legacy root adoption occurs only for the old inline layout.
        if try info.st_mode & 0o077 != 0 || URL(fileURLWithPath: url.path).resourceValues(forKeys: [.isExcludedFromBackupKey]).isExcludedFromBackup != true {
            guard let old = try read(Self.live), !old.starts(with: Self.prefix), try names().allSatisfy({ [Self.live, Self.rollback, "cloud-state.pennyvault"].contains($0) }) else { throw LocalReceiptBlobError.file }
            guard fchmod(fd, 0o700) == 0 else { throw LocalReceiptBlobError.file }
            // Legacy root provisioning is a migration trust boundary; the file
            // capability is not exposed until the path/FD identity is checked.
            try checkRoot()
            var flags = URLResourceValues(); flags.isExcludedFromBackup = true
            var provisioned = url; try provisioned.setResourceValues(flags); try checkRoot()
        }
    }
    deinit { _ = Darwin.close(fd) }
    func leased<T>(_ body: () throws -> T) throws -> T {
        guard flock(fd, LOCK_EX | LOCK_NB) == 0 else { throw CloudFailure.staleRestore }
        let result: Result<T, Error>
        do { try checkRoot(); result = .success(try body()) } catch { result = .failure(error) }
        guard flock(fd, LOCK_UN) == 0 else { throw LocalReceiptBlobError.file }
        return try result.get()
    }
    private func checkRoot() throws {
        var info = stat()
        guard lstat(url.path, &info) == 0, info.st_dev == identity.st_dev, info.st_ino == identity.st_ino,
              info.st_mode & S_IFMT == S_IFDIR, info.st_uid == geteuid(), info.st_mode & 0o077 == 0 else { throw LocalReceiptBlobError.replaced }
    }
    static func digest(_ data: Data) -> String { SHA256.hash(data: data).map { String(format: "%02x", $0) }.joined() }
    private func read(_ name: String, maximum: Int = 32 * 1_024 * 1_024) throws -> Data? {
        let input = openat(fd, name, O_RDONLY | O_NOFOLLOW | O_CLOEXEC)
        if input < 0 { if errno == ENOENT { return nil }; throw LocalReceiptBlobError.file }
        let file = FileHandle(fileDescriptor: input, closeOnDealloc: true); defer { try? file.close() }
        var info = stat()
        guard fstat(input, &info) == 0, info.st_mode & S_IFMT == S_IFREG, info.st_uid == geteuid(), info.st_nlink == 1,
              info.st_size >= 0, info.st_size <= maximum else { throw LocalReceiptBlobError.file }
        if name.hasSuffix(".pennygen") || name.hasSuffix(".stage") {
            guard info.st_mode & 0o077 == 0 else { throw LocalReceiptBlobError.file }
            try LocalReceiptProtectionMode.validate(input)
        }
        var bytes = Data()
        while let chunk = try file.read(upToCount: min(65_536, maximum + 1 - bytes.count)), !chunk.isEmpty {
            bytes.append(chunk); guard bytes.count <= maximum else { throw LocalReceiptBlobError.bytes }
        }
        var current = stat()
        guard fstatat(fd, name, &current, AT_SYMLINK_NOFOLLOW) == 0, current.st_dev == info.st_dev, current.st_ino == info.st_ino else { throw LocalReceiptBlobError.replaced }
        if bytes.starts(with: Self.prefix) {
            guard info.st_mode & 0o077 == 0 else { throw LocalReceiptBlobError.file }
            try LocalReceiptProtectionMode.validate(input)
        }
        try file.close(); return bytes
    }
    func liveBytes() throws -> Data? { try read(Self.live) }
    private func names() throws -> [String] {
        let copy = openat(fd, ".", O_RDONLY | O_DIRECTORY | O_NOFOLLOW | O_CLOEXEC)
        guard copy >= 0, let stream = fdopendir(copy) else { if copy >= 0 { _ = Darwin.close(copy) }; throw LocalReceiptBlobError.file }
        var closed = false; defer { if !closed { _ = closedir(stream) } }
        var result: [String] = []; errno = 0
        while let entry = readdir(stream) {
            let name = withUnsafePointer(to: entry.pointee.d_name) { pointer in pointer.withMemoryRebound(to: CChar.self, capacity: MemoryLayout.size(ofValue: entry.pointee.d_name)) { String(cString: $0) } }
            if name != "." && name != ".." { result.append(name) }; errno = 0
        }
        guard errno == 0 else { throw LocalReceiptBlobError.file }; closed = true
        guard closedir(stream) == 0 else { throw LocalReceiptBlobError.file }; return result
    }
    func establishedWithoutLive() throws -> Bool { try liveBytes() == nil && !names().isEmpty }

    private func write(_ bytes: Data, name: String, replacing: Bool = false, cancellable: Bool = true) throws {
        if cancellable { try Task.checkCancellation() }; try checkRoot()
        let temporary = UUID().uuidString.lowercased() + ".stage"
        let output = penny_open_receipt_protected_at(fd, temporary)
        guard output >= 0 else { throw LocalReceiptBlobError.file }
        let file = FileHandle(fileDescriptor: output, closeOnDealloc: true); defer { try? file.close() }
        var original = stat(); guard fstat(output, &original) == 0 else { throw LocalReceiptBlobError.file }
        let pin = fcntl(output, F_DUPFD_CLOEXEC, 0); guard pin >= 0 else { throw LocalReceiptBlobError.file }
        var pinClosed = false; defer { if !pinClosed { _ = Darwin.close(pin) } }
        var installed = false
        defer {
            if !installed {
                var current = stat()
                if fstatat(fd, temporary, &current, AT_SYMLINK_NOFOLLOW) == 0, current.st_dev == original.st_dev, current.st_ino == original.st_ino { _ = unlinkat(fd, temporary, 0) }
            }
        }
        try LocalReceiptProtectionMode.validate(output)
        try file.write(contentsOf: bytes); try file.synchronize(); try file.close()
        guard try read(temporary) == bytes else { throw LocalReceiptBlobError.bytes }
        if cancellable { try Task.checkCancellation() }; try checkRoot()
        if !replacing {
            guard linkat(fd, temporary, fd, name, 0) == 0 else { throw LocalReceiptBlobError.file }
            guard unlinkat(fd, temporary, 0) == 0 else { throw LocalReceiptBlobError.file }
        } else {
            _ = try read(name) // refuse symlinks/nonregular existing destinations
            guard renameat(fd, temporary, fd, name) == 0 else { throw LocalReceiptBlobError.file }
        }
        installed = true; guard fsync(fd) == 0 else { throw LocalReceiptBlobError.file }
        pinClosed = true; guard Darwin.close(pin) == 0 else { throw LocalReceiptBlobError.file }
    }
    private static func seal(_ bytes: Data, key: SymmetricKey, domain: String) throws -> Data {
        guard let wire = try AES.GCM.seal(bytes, using: key, authenticating: Data(domain.utf8)).combined else { throw LocalReceiptBlobError.bytes }; return wire
    }
    private static func open(_ wire: Data, key: SymmetricKey, domain: String) throws -> Data {
        try AES.GCM.open(AES.GCM.SealedBox(combined: wire), using: key, authenticating: Data(domain.utf8))
    }
    private static func decode<T: Decodable>(_ type: T.Type, _ bytes: Data, keys: Set<String>) throws -> T {
        _ = try StrictJSON.object(bytes, keys: keys); return try JSONDecoder().decode(type, from: bytes)
    }
    private func reference(_ bytes: Data) throws -> DurableReference {
        let ref = DurableReference(id: UUID().uuidString.lowercased(), sha256: Self.digest(bytes)); try write(bytes, name: ref.name); return ref
    }
    private func referenced(_ ref: DurableReference) throws -> Data {
        try ref.validate(); guard let bytes = try read(ref.name), Self.digest(bytes) == ref.sha256 else { throw LocalReceiptBlobError.bytes }; return bytes
    }
    private func pointer(_ wire: Data, key: SymmetricKey) throws -> DurablePointer {
        guard wire.starts(with: Self.pointerMagic), wire.count <= 8_192 else { throw ExpenseError.invalidSnapshot }
        let plain = try Self.open(wire.dropFirst(Self.pointerMagic.count), key: key, domain: "PENNY-LOCAL-POINTER:1")
        let p = try Self.decode(DurablePointer.self, plain, keys: ["version", "storeId", "current", "previous", "journal"])
        guard p.version == 1 else { throw ExpenseError.invalidSnapshot }; try FinanceValidation.uuid(p.storeId); try p.current.validate(); try p.previous?.validate()
        let shape = try StrictJSON.object(plain, keys: ["version", "storeId", "current", "previous", "journal"])
        for field in ["current", "previous"] { if let object = shape[field] as? [String: Any] { guard Set(object.keys) == ["id", "sha256"] else { throw ExpenseError.invalidSnapshot } } }
        return p
    }
    private func encodePointer(_ p: DurablePointer, key: SymmetricKey) throws -> Data {
        // Explicit null members form the closed local schema.
        var object: [String: Any] = ["version":p.version,"storeId":p.storeId,"current":["id":p.current.id,"sha256":p.current.sha256],"previous":NSNull(),"journal":NSNull()]
        if let ref = p.previous { object["previous"] = ["id":ref.id,"sha256":ref.sha256] }
        if let journal = p.journal { object["journal"] = journal.base64EncodedString() }
        return try Self.pointerMagic + Self.seal(JSONSerialization.data(withJSONObject: object), key: key, domain: "PENNY-LOCAL-POINTER:1")
    }
    private func hydrate(_ ref: DurableReference, storeId: String, key: SymmetricKey) throws -> DurableLoaded {
        let wire = try referenced(ref)
        guard wire.starts(with: Self.recordMagic) else { throw ExpenseError.invalidSnapshot }
        let plain = try Self.open(wire.dropFirst(Self.recordMagic.count), key: key, domain: "PENNY-LOCAL-GENERATION:1\0" + storeId + "\0" + ref.id)
        let record = try Self.decode(DurableRecord.self, plain, keys: ["version","storeId","generationId","metadata","body","receipts"])
        guard record.version == 1, record.storeId == storeId, record.generationId == ref.id else { throw ExpenseError.invalidSnapshot }
        let shape = try StrictJSON.object(plain, keys: ["version","storeId","generationId","metadata","body","receipts"])
        guard let metadata = shape["metadata"] as? [String: Any], Set(metadata.keys) == ["writerId","revision","restoreEpoch"] else { throw ExpenseError.invalidSnapshot }
        try record.metadata.validate()
        var snapshot = try StrictJSON.snapshot(record.body)
        guard snapshot.attachments.isEmpty, record.receipts.count <= ReceiptAttachment.maximumCount,
              Set(record.receipts.map(\.id)).count == record.receipts.count,
              record.receipts.reduce(0, { $0 + $1.byteCount }) <= ReceiptAttachment.maximumTotalBytes else { throw ExpenseError.invalidSnapshot }
        for descriptor in record.receipts {
            guard descriptor.vaultId == snapshot.vaultId else { throw ExpenseError.invalidSnapshot }
            let bytes = try LocalReceiptGeneration.readCommitted(parent: url, descriptor: descriptor, root: key)
            let receiptObject: [String: Any] = ["id":descriptor.id,"expenseId":descriptor.expenseId,"mediaType":descriptor.mediaType,"byteCount":descriptor.byteCount,"sha256":descriptor.sha256,"dataBase64":bytes.base64EncodedString()]
            snapshot.attachments.append(try JSONDecoder().decode(ReceiptAttachment.self, from: JSONSerialization.data(withJSONObject: receiptObject)))
        }
        try snapshot.validate(); let encoder = JSONEncoder(); encoder.outputFormatting = [.withoutEscapingSlashes]
        let bytes = try encoder.encode(snapshot).count; try BackupArchive.validateExportCapacity(bytes)
        return DurableLoaded(snapshot: snapshot, metadata: record.metadata, snapshotBytes: bytes, storeId: storeId, receipts: record.receipts)
    }
    private func decoded(_ wire: Data, key: SymmetricKey) throws -> DurableLoaded {
        if wire.starts(with: Self.prefix) { let p = try pointer(wire, key: key); return try hydrate(p.current, storeId: p.storeId, key: key) }
        let old = try LocalVaultFrame.decode(VaultCipher.open(wire, key: key))
        return DurableLoaded(snapshot: old.snapshot, metadata: old.metadata, snapshotBytes: old.snapshotBytes, storeId: nil, receipts: [])
    }
    func load(key: SymmetricKey) throws -> DurableLoaded? {
        guard let wire = try liveBytes() else { guard try !establishedWithoutLive() else { throw ExpenseError.lockedVault }; return nil }
        guard wire.starts(with: Self.prefix) else { return try decoded(wire, key: key) }
        let p = try pointer(wire, key: key)
        guard let journal = p.journal else { return try hydrate(p.current, storeId: p.storeId, key: key) }
        let j = try Self.decode(DurableJournal.self, Self.open(journal, key: key, domain: "PENNY-LOCAL-JOURNAL:1\0" + p.storeId), keys: ["currentHash","previousHash"])
        guard j.currentHash == p.current.sha256, j.previousHash == p.previous?.sha256 else { throw ExpenseError.invalidSnapshot }
        do {
            let result = try hydrate(p.current, storeId: p.storeId, key: key)
            try write(encodePointer(DurablePointer(version: 1, storeId: p.storeId, current: p.current, previous: p.previous, journal: nil), key: key), name: Self.live, replacing: true)
            return result
        } catch {
            guard let previous = p.previous else { throw error }
            let old = try referenced(previous), restored = try decoded(old, key: key)
            try write(old, name: Self.live, replacing: true); return restored
        }
    }
    func pinSnapshot(key: SymmetricKey) throws -> DurableSnapshotLease {
        guard let loaded = try load(key: key) else { throw ExpenseError.lockedVault }
        var pins: [Int32] = []
        do {
            for generation in Set(loaded.receipts.map(\.generationId)) {
                let pin = openat(fd, generation, O_RDONLY | O_DIRECTORY | O_NOFOLLOW | O_CLOEXEC)
                guard pin >= 0 else { throw LocalReceiptBlobError.file }; pins.append(pin)
                guard flock(pin, LOCK_SH | LOCK_NB) == 0 else { throw LocalReceiptBlobError.file }
            }
            return DurableSnapshotLease(snapshot: loaded.snapshot, descriptors: pins)
        } catch { for pin in pins { _ = Darwin.close(pin) }; throw error }
    }
    /// Explicit conservative GC. Pending transitions are never collected. Unknown
    /// entries and any group with a reader's shared directory lock are preserved.
    func collectGarbage(key: SymmetricKey) throws -> Int {
        guard let wire = try liveBytes(), wire.starts(with: Self.pointerMagic) else { return 0 }
        let p = try pointer(wire, key: key); guard p.journal == nil else { return 0 }
        var keep = Set(try hydrate(p.current, storeId: p.storeId, key: key).receipts.map(\.generationId))
        if let previous = p.previous {
            // Key loss or unknown previous state prevents guessing reachability.
            let old = try decoded(referenced(previous), key: key); keep.formUnion(old.receipts.map(\.generationId))
        }
        var removed = 0
        for name in try names() where name.hasSuffix(".pennygen") && name != p.current.name && name != p.previous?.name {
            let id = String(name.dropLast(".pennygen".count)); guard UUID(uuidString: id)?.uuidString.lowercased() == id else { continue }
            guard let bytes = try? read(name), bytes.starts(with: Self.recordMagic) else { continue }
            let ref = DurableReference(id: id, sha256: Self.digest(bytes))
            guard let candidate = try? hydrate(ref, storeId: p.storeId, key: key) else { continue }
            for receipt in candidate.receipts where !keep.contains(receipt.generationId) {
                let directory = openat(fd, receipt.generationId, O_RDONLY | O_DIRECTORY | O_NOFOLLOW | O_CLOEXEC)
                guard directory >= 0 else { continue }
                var directoryClosed = false; defer { if !directoryClosed { _ = Darwin.close(directory) } }
                guard flock(directory, LOCK_EX | LOCK_NB) == 0 else {
                    directoryClosed = true; guard Darwin.close(directory) == 0 else { throw LocalReceiptBlobError.file }; continue
                }
                let child = receipt.id + ".pennyreceipt"
                let pin = openat(directory, child, O_RDONLY | O_NOFOLLOW | O_CLOEXEC)
                guard pin >= 0 else {
                    directoryClosed = true; guard Darwin.close(directory) == 0 else { throw LocalReceiptBlobError.file }; continue
                }
                var pinClosed = false; defer { if !pinClosed { _ = Darwin.close(pin) } }
                var dirInfo = stat(), fileInfo = stat(), current = stat()
                guard fstat(directory, &dirInfo) == 0, fstat(pin, &fileInfo) == 0 else { throw LocalReceiptBlobError.file }
                // Full authenticated strict inventory read precedes deletion.
                _ = try LocalReceiptGeneration.readCommitted(parent: url, descriptor: receipt, root: key)
                guard fstatat(fd, receipt.generationId, &current, AT_SYMLINK_NOFOLLOW) == 0, current.st_dev == dirInfo.st_dev, current.st_ino == dirInfo.st_ino,
                      fstatat(directory, child, &current, AT_SYMLINK_NOFOLLOW) == 0, current.st_dev == fileInfo.st_dev, current.st_ino == fileInfo.st_ino else { throw LocalReceiptBlobError.replaced }
                guard unlinkat(directory, child, 0) == 0, fsync(directory) == 0, unlinkat(fd, receipt.generationId, AT_REMOVEDIR) == 0, fsync(fd) == 0 else { throw LocalReceiptBlobError.file }
                pinClosed = true; let pinResult = Darwin.close(pin)
                directoryClosed = true; let directoryResult = Darwin.close(directory)
                guard pinResult == 0, directoryResult == 0 else { throw LocalReceiptBlobError.file }
                removed += 1
            }
            // Keep authenticated metadata for conservative ownership provenance;
            // this collector only reclaims unreferenced receipt bytes.
        }
        return removed
    }
    func commit(_ prepared: PreparedVaultWrite, sourceDigest: String?, storeId: String, receipts: [LocalReceiptDescriptor], checkpoint: (@Sendable (VaultStore.CommitStage) throws -> Void)?) throws -> DurableLoaded {
        let previousBytes = try liveBytes()
        guard previousBytes.map(Self.digest) == sourceDigest else { throw CloudFailure.staleRestore }
        var descriptors: [LocalReceiptDescriptor] = []
        var ownedGroups: [LocalReceiptGeneration] = []
        defer { for generation in ownedGroups { try? generation.close() } }
        for receipt in prepared.snapshot.attachments {
            if prepared.metadata.restoreEpoch == prepared.sourceRestoreEpoch, let old = receipts.first(where: { $0.id == receipt.id && $0.vaultId == prepared.snapshot.vaultId && $0.expenseId == receipt.expenseId && $0.sha256 == receipt.sha256 && $0.byteCount == receipt.byteCount && $0.mediaType == receipt.mediaType }) {
                // The complete candidate hydrate below authenticates every reused receipt before staging.
                descriptors.append(old)
            } else {
                let group = try LocalReceiptBlobGroup(parent: url, vaultId: prepared.snapshot.vaultId, root: prepared.key)
                let handle = try group.append(receipt), generation = try group.complete()
                ownedGroups.append(generation); descriptors.append(handle.descriptor)
            }
        }
        var body = prepared.snapshot; body.attachments = []
        let id = UUID().uuidString.lowercased()
        let record = DurableRecord(version: 1, storeId: storeId, generationId: id, metadata: prepared.metadata, body: try JSONEncoder().encode(body), receipts: descriptors)
        let encrypted = try Self.recordMagic + Self.seal(JSONEncoder().encode(record), key: prepared.key, domain: "PENNY-LOCAL-GENERATION:1\0" + storeId + "\0" + id)
        let current = DurableReference(id: id, sha256: Self.digest(encrypted)); try write(encrypted, name: current.name)
        let loaded = try hydrate(current, storeId: storeId, key: prepared.key); try checkpoint?(.staged)
        let previous = try previousBytes.map { try reference($0) }
        if let previousBytes { try write(previousBytes, name: Self.rollback, replacing: true) }
        try checkpoint?(.rollbackSaved); try Task.checkCancellation()
        guard try liveBytes().map(Self.digest) == sourceDigest else { throw CloudFailure.staleRestore }
        _ = try hydrate(current, storeId: storeId, key: prepared.key)
        let journal = try Self.seal(JSONEncoder().encode(DurableJournal(currentHash: current.sha256, previousHash: previous?.sha256)), key: prepared.key, domain: "PENNY-LOCAL-JOURNAL:1\0" + storeId)
        // Optional Codable omission is avoided for this closed journal schema.
        let journalObject: [String: Any] = ["currentHash":current.sha256,"previousHash":previous?.sha256 as Any? ?? NSNull()]
        let closedJournal = previous == nil ? try Self.seal(JSONSerialization.data(withJSONObject: journalObject), key: prepared.key, domain: "PENNY-LOCAL-JOURNAL:1\0" + storeId) : journal
        let pending = DurablePointer(version: 1, storeId: storeId, current: current, previous: previous, journal: closedJournal)
        // Transfer lifetime before an uncertain atomic publication can succeed.
        for generation in ownedGroups { try generation.retainCommitted() }
        do {
            try write(encodePointer(pending, key: prepared.key), name: Self.live, replacing: true)
            try checkpoint?(.committed)
            _ = try hydrate(current, storeId: storeId, key: prepared.key)
            try checkpoint?(.verified)
            _ = try hydrate(current, storeId: storeId, key: prepared.key)
            try Task.checkCancellation()
            try write(encodePointer(DurablePointer(version: 1, storeId: storeId, current: current, previous: previous, journal: nil), key: prepared.key), name: Self.live, replacing: true)
            try checkpoint?(.journalCleared)
            return loaded
        } catch {
            if case DurableCrash.interrupted = error { throw error } // test-only simulated process interruption leaves journal intact
            if let previousBytes { try write(previousBytes, name: Self.live, replacing: true, cancellable: false) }
            else { guard unlinkat(fd, Self.live, 0) == 0, fsync(fd) == 0 else { throw LocalReceiptBlobError.file } }
            throw error
        }
    }
}
/// Internal checkpoint signal models interrupted recovery, not real process death.
enum DurableCrash: Error { case interrupted }

final class DurableSnapshotLease {
    let snapshot: VaultSnapshot
    private var descriptors: [Int32]
    init(snapshot: VaultSnapshot, descriptors: [Int32]) { self.snapshot = snapshot; self.descriptors = descriptors }
    func close() throws {
        let owned = descriptors; descriptors = []
        var failed = false; for fd in owned { if Darwin.close(fd) != 0 { failed = true } }
        if failed { throw LocalReceiptBlobError.file }
    }
    deinit { try? close() }
}
