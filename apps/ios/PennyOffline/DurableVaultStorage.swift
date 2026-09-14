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
/// Authenticated live metadata. Its body is never a complete portable Snapshot.
struct DurableLiveLoaded: Sendable {
    let body: VaultSnapshot, metadata: LocalVaultMetadata
    let snapshotBytes: Int, storeId: String
    let receipts: [LocalReceiptDescriptor]
}

/// Informational verified summary, never a reusable admission or receipt capability.
struct DurableVerifiedMetadata: Sendable {
    let vaultId: String, snapshotId: String, createdAt: String
    let counts: [String: Int]
    let expenseTotalMinor: Int64
    let receiptBytes: Int, snapshotBytes: Int
    /// SHA-256 of the authenticated local generation wire, not a portable digest.
    let digest: String
}

/// Typed receipt declaration only; no serialized parser, bytes or storage paths.
struct DurableReceiptDeclaration: Sendable {
    let id: String, expenseId: String, mediaType: String
    let byteCount: Int
    let sha256: String
    fileprivate func descriptor(vaultId: String, generationId: String) throws -> LocalReceiptDescriptor {
        try LocalReceiptDescriptor(vaultId: vaultId, generationId: generationId, id: id, expenseId: expenseId,
                                   mediaType: mediaType, byteCount: byteCount, sha256: sha256)
    }
}

/// Ownership transfers to append: exactly one close attempt, including failures.
protocol DurableReceiptSource: AnyObject {
    func read(maximum: Int) throws -> Data
    func close() throws
}

/// Created only by the bound local entry; never decoded from incoming metadata.
struct LocalReceiptTarget {
    let owner: UUID, digest: String?, storeId: String, metadata: LocalVaultMetadata
    fileprivate init(owner: UUID, digest: String?, storeId: String, metadata: LocalVaultMetadata) {
        self.owner = owner; self.digest = digest; self.storeId = storeId; self.metadata = metadata
    }
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
    private let hydrationCheckpoint: (() throws -> Void)?
    init(_ url: URL, hydrationCheckpoint: (() throws -> Void)? = nil) throws {
        self.url = url
        self.hydrationCheckpoint = hydrationCheckpoint
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
    private struct ReceiptWire: Encodable {
        let id: String, expenseId: String, mediaType: String
        let byteCount: Int
        let sha256: String
        var dataBase64 = ""
        init(_ descriptor: LocalReceiptDescriptor) {
            id = descriptor.id; expenseId = descriptor.expenseId; mediaType = descriptor.mediaType
            byteCount = descriptor.byteCount; sha256 = descriptor.sha256
        }
    }
    /// Only this compatibility adapter accumulates receipt base64.
    private final class SnapshotHydration {
        var attachments: [ReceiptAttachment] = []
        var result: DurableLoaded?
        func receipt(_ descriptor: LocalReceiptDescriptor, bytes: Data) throws {
            var wire = ReceiptWire(descriptor); wire.dataBase64 = bytes.base64EncodedString()
            attachments.append(try JSONDecoder().decode(ReceiptAttachment.self, from: JSONEncoder().encode(wire)))
        }
        func finish(_ body: VaultSnapshot, record: DurableRecord, metadata: DurableVerifiedMetadata) throws {
            var snapshot = body; snapshot.attachments = attachments
            try snapshot.validate()
            result = DurableLoaded(snapshot: snapshot, metadata: record.metadata, snapshotBytes: metadata.snapshotBytes,
                                   storeId: record.storeId, receipts: record.receipts)
        }
    }
    private func summary(_ snapshot: VaultSnapshot, receiptCount: Int, receiptBytes: Int, snapshotBytes: Int, digest: String) throws -> DurableVerifiedMetadata {
        DurableVerifiedMetadata(vaultId: snapshot.vaultId, snapshotId: snapshot.snapshotId, createdAt: snapshot.createdAt,
            counts: ["expenses": snapshot.expenses.count, "attachments": receiptCount, "budgets": snapshot.budgets.count,
                     "incomeSources": snapshot.incomeSources.count, "incomeEntries": snapshot.incomeEntries.count,
                     "savingsGoals": snapshot.savingsGoals.count, "savingsEntries": snapshot.savingsEntries.count,
                     "recurringExpenses": snapshot.recurringExpenses.count],
            expenseTotalMinor: try FinanceValidation.total(snapshot.expenses.map(\.amountMinor)),
            receiptBytes: receiptBytes, snapshotBytes: snapshotBytes, digest: digest)
    }
    private func exportMetadata(_ ref: DurableReference, storeId: String, key: SymmetricKey) throws -> (DurableRecord, VaultSnapshot, Int, Int) {
        let wire = try referenced(ref)
        guard wire.starts(with: Self.recordMagic) else { throw ExpenseError.invalidSnapshot }
        let plain = try Self.open(wire.dropFirst(Self.recordMagic.count), key: key, domain: "PENNY-LOCAL-GENERATION:1\0" + storeId + "\0" + ref.id)
        let record = try Self.decode(DurableRecord.self, plain, keys: ["version","storeId","generationId","metadata","body","receipts"])
        guard record.version == 1, record.storeId == storeId, record.generationId == ref.id else { throw ExpenseError.invalidSnapshot }
        let shape = try StrictJSON.object(plain, keys: ["version","storeId","generationId","metadata","body","receipts"])
        guard let metadata = shape["metadata"] as? [String: Any], Set(metadata.keys) == ["writerId","revision","restoreEpoch"] else { throw ExpenseError.invalidSnapshot }
        try record.metadata.validate()
        let snapshot = try StrictJSON.snapshot(record.body)
        let (receiptBytes, snapshotBytes) = try Self.receiptCapacity(snapshot, receipts: record.receipts)
        return (record, snapshot, receiptBytes, snapshotBytes)
    }
    private func readVerified(_ ref: DurableReference, storeId: String, key: SymmetricKey,
                              hydration: SnapshotHydration? = nil,
                              localMetadata: ((LocalVaultMetadata) -> Void)? = nil,
                              receiptMetadata: ((LocalReceiptDescriptor) -> Void)? = nil,
                              live: ((DurableLiveLoaded) -> Void)? = nil) throws -> DurableVerifiedMetadata {
        let (record, snapshot, receiptBytes, snapshotBytes) = try exportMetadata(ref, storeId: storeId, key: key)
        for descriptor in record.receipts {
            try autoreleasepool {
                let bytes = try LocalReceiptGeneration.readCommitted(parent: url, descriptor: descriptor, root: key)
                try hydration?.receipt(descriptor, bytes: bytes)
            }
        }
        let result = try summary(snapshot, receiptCount: record.receipts.count, receiptBytes: receiptBytes, snapshotBytes: snapshotBytes, digest: ref.sha256)
        try hydration?.finish(snapshot, record: record, metadata: result)
        localMetadata?(record.metadata)
        record.receipts.forEach { receiptMetadata?($0) }
        live?(DurableLiveLoaded(body: snapshot, metadata: record.metadata, snapshotBytes: snapshotBytes, storeId: storeId, receipts: record.receipts))
        return result
    }
    private func live(_ ref: DurableReference, storeId: String, key: SymmetricKey) throws -> DurableLiveLoaded {
        var result: DurableLiveLoaded?
        _ = try readVerified(ref, storeId: storeId, key: key, live: { result = $0 })
        guard let result else { throw ExpenseError.invalidSnapshot }; return result
    }
    func loadLive(key: SymmetricKey, initial: LocalVaultMetadata, storeId: String) throws -> DurableLiveLoaded? {
        guard var wire = try recoveredWire(key: key) else { return nil }
        if !wire.starts(with: Self.prefix) {
            // One-time inline migration must decode the old representation. Only
            // the detached verified body survives adoption after this operation.
            let old = try decoded(wire, key: key), metadata = old.metadata ?? initial
            let prepared = try PreparedVaultWrite.prepare(old.snapshot, key: key, revision: metadata.revision,
                writerId: metadata.writerId, restoreEpoch: metadata.restoreEpoch, restoring: false,
                sourceDigest: Self.digest(wire), sourceStoreId: storeId)
            _ = try commit(prepared, sourceDigest: Self.digest(wire), storeId: storeId, receipts: [], checkpoint: nil)
            guard let migrated = try liveBytes() else { throw ExpenseError.lockedVault }; wire = migrated
        }
        let pointer = try pointer(wire, key: key)
        return try live(pointer.current, storeId: pointer.storeId, key: key)
    }
    private static func receiptCapacity(_ snapshot: VaultSnapshot, receipts: [LocalReceiptDescriptor]) throws -> (Int, Int) {
        let receiptBytes = receipts.reduce(0, { $0 + $1.byteCount })
        let owners = Set(snapshot.expenses.map(\.id))
        guard snapshot.attachments.isEmpty, receipts.count <= ReceiptAttachment.maximumCount,
              Set(receipts.map(\.id)).count == receipts.count,
              receiptBytes <= ReceiptAttachment.maximumTotalBytes,
              receipts.allSatisfy({ $0.vaultId == snapshot.vaultId && owners.contains($0.expenseId) }) else { throw ExpenseError.invalidSnapshot }
        // The validated body already includes attachments:[]. Insert each compact
        // receipt JSON shape and its exact unescaped base64 length, plus commas.
        let encoder = JSONEncoder(); encoder.outputFormatting = [.withoutEscapingSlashes]
        var snapshotBytes = try encoder.encode(snapshot).count
        for (index, descriptor) in receipts.enumerated() {
            snapshotBytes += try encoder.encode(ReceiptWire(descriptor)).count + 4 * ((descriptor.byteCount + 2) / 3) + (index == 0 ? 0 : 1)
        }
        try BackupArchive.validateExportCapacity(snapshotBytes)
        return (receiptBytes, snapshotBytes)
    }
    private func hydrate(_ ref: DurableReference, storeId: String, key: SymmetricKey) throws -> DurableLoaded {
        try hydrationCheckpoint?()
        let hydration = SnapshotHydration()
        _ = try readVerified(ref, storeId: storeId, key: key, hydration: hydration)
        guard let result = hydration.result else { throw ExpenseError.invalidSnapshot }; return result
    }
    private func decoded(_ wire: Data, key: SymmetricKey) throws -> DurableLoaded {
        if wire.starts(with: Self.prefix) { let p = try pointer(wire, key: key); return try hydrate(p.current, storeId: p.storeId, key: key) }
        let old = try LocalVaultFrame.decode(VaultCipher.open(wire, key: key))
        return DurableLoaded(snapshot: old.snapshot, metadata: old.metadata, snapshotBytes: old.snapshotBytes, storeId: nil, receipts: [])
    }
    private func verifiedDecoded(_ wire: Data, key: SymmetricKey, receiptMetadata: ((LocalReceiptDescriptor) -> Void)? = nil) throws -> DurableVerifiedMetadata {
        if wire.starts(with: Self.prefix) {
            let p = try pointer(wire, key: key)
            return try readVerified(p.current, storeId: p.storeId, key: key, receiptMetadata: receiptMetadata)
        }
        // Legacy inline archives necessarily decode their existing base64 representation.
        let old = try LocalVaultFrame.decode(VaultCipher.open(wire, key: key))
        return try summary(old.snapshot, receiptCount: old.snapshot.attachments.count,
                           receiptBytes: old.snapshot.attachments.reduce(0, { $0 + $1.byteCount }),
                           snapshotBytes: old.snapshotBytes, digest: Self.digest(wire))
    }
    private func recoveredWire(key: SymmetricKey) throws -> Data? {
        guard let wire = try liveBytes() else { guard try !establishedWithoutLive() else { throw ExpenseError.lockedVault }; return nil }
        guard wire.starts(with: Self.prefix) else { return wire }
        let p = try pointer(wire, key: key)
        guard let journal = p.journal else { return wire }
        let j = try Self.decode(DurableJournal.self, Self.open(journal, key: key, domain: "PENNY-LOCAL-JOURNAL:1\0" + p.storeId), keys: ["currentHash","previousHash"])
        guard j.currentHash == p.current.sha256, j.previousHash == p.previous?.sha256 else { throw ExpenseError.invalidSnapshot }
        do {
            _ = try readVerified(p.current, storeId: p.storeId, key: key)
            let verified = try encodePointer(DurablePointer(version: 1, storeId: p.storeId, current: p.current, previous: p.previous, journal: nil), key: key)
            try write(verified, name: Self.live, replacing: true)
            return verified
        } catch {
            guard let previous = p.previous else { throw error }
            let old = try referenced(previous)
            _ = try verifiedDecoded(old, key: key)
            try write(old, name: Self.live, replacing: true); return old
        }
    }
    func load(key: SymmetricKey) throws -> DurableLoaded? {
        guard let wire = try recoveredWire(key: key) else { return nil }; return try decoded(wire, key: key)
    }
    func verifiedMetadata(key: SymmetricKey) throws -> DurableVerifiedMetadata {
        try leased {
            guard let wire = try recoveredWire(key: key) else { throw ExpenseError.lockedVault }
            return try verifiedDecoded(wire, key: key)
        }
    }
    private func verifyTarget(_ target: LocalReceiptTarget, key: SymmetricKey) throws {
        try checkRoot()
        let wire = try liveBytes()
        guard wire.map(Self.digest) == target.digest else { throw CloudFailure.staleRestore }
        var actual: LocalVaultMetadata?
        if let wire {
            if wire.starts(with: Self.prefix) {
                let p = try pointer(wire, key: key)
                guard p.storeId == target.storeId, p.journal == nil else { throw CloudFailure.staleRestore }
                _ = try readVerified(p.current, storeId: p.storeId, key: key, localMetadata: { actual = $0 })
            } else { actual = try LocalVaultFrame.decode(VaultCipher.open(wire, key: key)).metadata }
        }
        if let actual {
            guard actual.writerId == target.metadata.writerId, actual.revision == target.metadata.revision,
                  actual.restoreEpoch == target.metadata.restoreEpoch else { throw CloudFailure.staleRestore }
        } else { guard target.metadata.revision == 0 else { throw CloudFailure.staleRestore } }
    }
    /// Captures only a private root capability and local authority on the store
    /// actor. Authentication and receipt pin acquisition happen on the worker.
    final class ExportRequest {
        private let storage: DurableVaultStorage, key: SymmetricKey, target: LocalReceiptTarget
        private let exportSnapshotId = UUID().uuidString.lowercased(), exportCreatedAt = CivilDate.timestamp()
        private var consumed = false
        init(directory: URL, key: SymmetricKey, owner: UUID, digest: String?, storeId: String, metadata: LocalVaultMetadata) throws {
            storage = try DurableVaultStorage(directory); self.key = key
            target = LocalReceiptTarget(owner: owner, digest: digest, storeId: storeId, metadata: metadata)
        }
        func open(receiptId: String? = nil) throws -> ExportSource {
            guard !consumed else { throw LocalReceiptBlobError.closed }; consumed = true
            return try storage.leased {
                try Task.checkCancellation()
                guard let wire = try storage.liveBytes(), DurableVaultStorage.digest(wire) == target.digest else { throw CloudFailure.staleRestore }
                let pointer = try storage.pointer(wire, key: key)
                guard pointer.journal == nil, pointer.storeId == target.storeId else { throw CloudFailure.staleRestore }
                let (record, capturedBody, _, _) = try storage.exportMetadata(pointer.current, storeId: target.storeId, key: key)
                var body = capturedBody
                body.snapshotId = exportSnapshotId; body.createdAt = exportCreatedAt
                guard record.metadata.writerId == target.metadata.writerId, record.metadata.revision == target.metadata.revision,
                      record.metadata.restoreEpoch == target.metadata.restoreEpoch else { throw CloudFailure.staleRestore }
                var pins: [ExportSource.Pin] = []
                let receipts = record.receipts.filter { receiptId == nil || $0.id == receiptId }
                guard receiptId == nil || receipts.count == 1 else { throw LocalReceiptBlobError.descriptor }
                do {
                    for generation in Set(receipts.map(\.generationId)).sorted() {
                        let pin = openat(storage.fd, generation, O_RDONLY | O_DIRECTORY | O_NOFOLLOW | O_CLOEXEC)
                        guard pin >= 0 else { throw LocalReceiptBlobError.file }
                        var info = stat()
                        guard fstat(pin, &info) == 0, info.st_uid == geteuid(), info.st_mode & S_IFMT == S_IFDIR,
                              info.st_mode & 0o077 == 0, flock(pin, LOCK_SH | LOCK_NB) == 0 else {
                            _ = Darwin.close(pin); throw LocalReceiptBlobError.file
                        }
                        pins.append(ExportSource.Pin(name: generation, fd: pin, identity: info))
                    }
                    let held = pins; pins = []
                    let source = ExportSource(storage: storage, key: key, body: body,
                        receipts: receipts.sorted { $0.id < $1.id }, pins: held)
                    try source.validatePins(); try Task.checkCancellation(); return source
                } catch { for pin in pins { _ = Darwin.close(pin.fd) }; throw error }
            }
        }
    }
    final class LiveEditRequest {
        private let storage: DurableVaultStorage, key: SymmetricKey, target: LocalReceiptTarget
        private let currentKey: @Sendable () throws -> SymmetricKey
        private var consumed = false
        init(directory: URL, key: SymmetricKey, owner: UUID, digest: String?, storeId: String,
             metadata: LocalVaultMetadata, currentKey: @escaping @Sendable () throws -> SymmetricKey,
             hydrationCheckpoint: (() throws -> Void)?) throws {
            storage = try DurableVaultStorage(directory, hydrationCheckpoint: hydrationCheckpoint)
            self.key = key; self.currentKey = currentKey
            target = LocalReceiptTarget(owner: owner, digest: digest, storeId: storeId, metadata: metadata)
        }
        func run(_ expense: Expense, checkpoint: (@Sendable (VaultStore.CommitStage) throws -> Void)?) throws -> (DurableLiveLoaded, String?) {
            guard !consumed else { throw LocalReceiptBlobError.closed }; consumed = true
            return try storage.leased {
                let result = try storage.editExpense(expense, target: target, key: key, checkpoint: checkpoint, currentKey: currentKey)
                return (result, try storage.liveBytes().map(DurableVaultStorage.digest))
            }
        }
    }
    /// Receipt-free metadata and existing SH directory locks protect one immutable
    /// generation while ordinary edits/GC proceed. This is not a Snapshot lease.
    final class ExportSource {
        fileprivate struct Pin { let name: String, fd: Int32, identity: stat }
        let body: VaultSnapshot, receipts: [LocalReceiptDescriptor]
        private let storage: DurableVaultStorage
        private var key: SymmetricKey?, pins: [Pin]
        fileprivate init(storage: DurableVaultStorage, key: SymmetricKey, body: VaultSnapshot, receipts: [LocalReceiptDescriptor], pins: [Pin]) {
            self.storage = storage; self.key = key; self.body = body; self.receipts = receipts; self.pins = pins
        }
        fileprivate func validatePins() throws {
            guard key != nil else { throw LocalReceiptBlobError.closed }; try storage.checkRoot()
            for pin in pins {
                var held = stat(), current = stat()
                guard fstat(pin.fd, &held) == 0, fstatat(storage.fd, pin.name, &current, AT_SYMLINK_NOFOLLOW) == 0,
                      held.st_dev == pin.identity.st_dev, held.st_ino == pin.identity.st_ino,
                      current.st_dev == held.st_dev, current.st_ino == held.st_ino,
                      current.st_uid == geteuid(), current.st_mode & S_IFMT == S_IFDIR, current.st_mode & 0o077 == 0 else { throw LocalReceiptBlobError.replaced }
            }
        }
        func receipt(at index: Int) throws -> Data {
            guard receipts.indices.contains(index), let key else { throw LocalReceiptBlobError.closed }
            try Task.checkCancellation(); try validatePins()
            let bytes = try LocalReceiptGeneration.readCommitted(parent: storage.url, descriptor: receipts[index], root: key)
            try validatePins(); try Task.checkCancellation(); return bytes
        }
        func close() throws {
            key = nil; let held = pins; pins = []; var failed = false
            for pin in held { if Darwin.close(pin.fd) != 0 { failed = true } }
            if failed { throw LocalReceiptBlobError.file }
        }
        deinit { try? close() }
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
        var keep = Set<String>()
        _ = try readVerified(p.current, storeId: p.storeId, key: key, receiptMetadata: { keep.insert($0.generationId) })
        if let previous = p.previous {
            // Key loss or unknown previous state prevents guessing reachability.
            _ = try verifiedDecoded(referenced(previous), key: key, receiptMetadata: { keep.insert($0.generationId) })
        }
        var removed = 0
        for name in try names() where name.hasSuffix(".pennygen") && name != p.current.name && name != p.previous?.name {
            let id = String(name.dropLast(".pennygen".count)); guard UUID(uuidString: id)?.uuidString.lowercased() == id else { continue }
            guard let bytes = try? read(name), bytes.starts(with: Self.recordMagic) else { continue }
            let ref = DurableReference(id: id, sha256: Self.digest(bytes))
            var receipts: [LocalReceiptDescriptor] = []
            guard (try? readVerified(ref, storeId: p.storeId, key: key, receiptMetadata: { receipts.append($0) })) != nil else { continue }
            for receipt in receipts where !keep.contains(receipt.generationId) {
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

    /// Pins the originally created inode through cleanup, including unlink/recreate races.
    private final class OwnedRecord {
        let reference: DurableReference
        private let storage: DurableVaultStorage, identity: stat
        private var pin: Int32
        init(storage: DurableVaultStorage, reference: DurableReference, identity: stat, pin: Int32) {
            self.storage = storage; self.reference = reference; self.identity = identity; self.pin = pin
        }
        func validateOwnership() throws {
            var held = stat(), current = stat()
            guard pin >= 0, fstat(pin, &held) == 0,
                  held.st_mode & S_IFMT == S_IFREG, held.st_uid == geteuid(), held.st_mode & 0o077 == 0, held.st_nlink == 1,
                  fstatat(storage.fd, reference.name, &current, AT_SYMLINK_NOFOLLOW) == 0,
                  current.st_dev == identity.st_dev, current.st_ino == identity.st_ino else { throw LocalReceiptBlobError.replaced }
            try LocalReceiptProtectionMode.validate(pin)
        }
        func close() throws {
            guard pin >= 0 else { return }
            let held = pin; pin = -1
            var current = stat(), failed = false
            if fstatat(storage.fd, reference.name, &current, AT_SYMLINK_NOFOLLOW) == 0,
               current.st_dev == identity.st_dev, current.st_ino == identity.st_ino {
                if unlinkat(storage.fd, reference.name, 0) != 0 || fsync(storage.fd) != 0 { failed = true }
            } else { failed = true }
            if Darwin.close(held) != 0 { failed = true }
            if failed { throw LocalReceiptBlobError.file }
        }
        func retainCommitted() throws {
            guard pin >= 0 else { return }; let held = pin; pin = -1
            guard Darwin.close(held) == 0 else { throw LocalReceiptBlobError.file }
        }
        deinit { try? close() }
    }
    private func inactiveRecord(_ bytes: Data, id: String, cancellation: () throws -> Void) throws -> OwnedRecord {
        try cancellation(); try checkRoot()
        let reference = DurableReference(id: id, sha256: Self.digest(bytes))
        let output = penny_open_receipt_protected_at(fd, reference.name)
        guard output >= 0 else { throw LocalReceiptBlobError.file }
        let file = FileHandle(fileDescriptor: output, closeOnDealloc: true); defer { try? file.close() }
        var info = stat(); guard fstat(output, &info) == 0 else { throw LocalReceiptBlobError.file }
        let pin = fcntl(output, F_DUPFD_CLOEXEC, 0)
        guard pin >= 0 else {
            var current = stat()
            if fstatat(fd, reference.name, &current, AT_SYMLINK_NOFOLLOW) == 0,
               current.st_dev == info.st_dev, current.st_ino == info.st_ino { _ = unlinkat(fd, reference.name, 0) }
            throw LocalReceiptBlobError.file
        }
        let owned = OwnedRecord(storage: self, reference: reference, identity: info, pin: pin)
        do {
            try LocalReceiptProtectionMode.validate(output)
            for offset in stride(from: 0, to: bytes.count, by: 65_536) {
                try cancellation(); try file.write(contentsOf: bytes[offset..<min(bytes.count, offset + 65_536)])
            }
            try file.synchronize(); try file.close()
            guard fsync(fd) == 0, try read(reference.name) == bytes else { throw LocalReceiptBlobError.bytes }
            try cancellation(); try checkRoot(); try owned.validateOwnership(); return owned
        } catch { try owned.close(); throw error }
    }

    /// Opaque local authority captured before parsing. Retains the actual root FD;
    /// never reconstructed from incoming metadata and consumed at candidate begin.
    final class ReceivingBinding {
        private let storage: DurableVaultStorage, key: SymmetricKey
        private let target: LocalReceiptTarget
        private var consumed = false
        private init(storage: DurableVaultStorage, key: SymmetricKey, target: LocalReceiptTarget) {
            self.storage = storage; self.key = key; self.target = target
        }
        static func capture(directory: URL, key: SymmetricKey, owner: UUID, digest: String?, storeId: String,
                            source: LocalVaultMetadata) throws -> ReceivingBinding {
            guard source.revision < CloudWire.maximumRevision else { throw ExpenseError.invalidSnapshot }
            let storage = try DurableVaultStorage(directory)
            let target = LocalReceiptTarget(owner: owner, digest: digest, storeId: storeId, metadata: source)
            try storage.leased { try storage.verifyTarget(target, key: key); try Task.checkCancellation() }
            return ReceivingBinding(storage: storage, key: key, target: target)
        }
        func matches(owner: UUID, digest: String?, storeId: String, source: LocalVaultMetadata) -> Bool {
            !consumed && target.owner == owner && target.digest == digest && target.storeId == storeId &&
                target.metadata.writerId == source.writerId && target.metadata.revision == source.revision && target.metadata.restoreEpoch == source.restoreEpoch
        }
        func invalidate(owner: UUID) { if target.owner == owner { consumed = true } }
        func begin(body: VaultSnapshot, receipts: [DurableReceiptDeclaration], owner: UUID, key: SymmetricKey,
                   cancellation: @escaping () throws -> Void = { try Task.checkCancellation() }) throws -> Preparation {
            guard target.owner == owner else { throw CloudFailure.staleRestore }
            guard !consumed else { throw CloudFailure.staleRestore }; consumed = true
            guard self.key == key else { throw ExpenseError.missingKey }
            return try storage.leased {
                try cancellation(); try storage.verifyTarget(target, key: key)
                guard body.attachments.isEmpty, receipts.count <= ReceiptAttachment.maximumCount else { throw ExpenseError.invalidSnapshot }
                try body.validate()
                _ = try DurableVaultStorage.receiptCapacity(body, receipts: receipts.map { try $0.descriptor(vaultId: body.vaultId, generationId: target.storeId) })
                let next = LocalVaultMetadata(writerId: target.metadata.writerId, revision: target.metadata.revision + 1, restoreEpoch: UUID().uuidString.lowercased())
                try next.validate(); try FinanceValidation.uuid(target.storeId)
                try cancellation(); try storage.checkRoot(); try storage.verifyTarget(target, key: key)
                let prepared = Preparation(storage: storage, key: key, body: body, declarations: receipts, metadata: next,
                    storeId: target.storeId, cancellation: cancellation, fault: { _ in }, receiptFault: { _, _ in })
                prepared.target = target; return prepared
            }
        }
    }

    /// Synchronous preparation. The bound entry is installable only by its local owner.
    /// Callers provide an already-owned device key; this type never accesses Keychain.
    final class Preparation {
        enum Phase { case beforeFinish, afterMetadataClose, afterVerification }
        private let storage: DurableVaultStorage, body: VaultSnapshot, declarations: [DurableReceiptDeclaration]
        private let metadata: LocalVaultMetadata, storeId: String
        private let cancellation: () throws -> Void, fault: (Phase) throws -> Void
        private let receiptFault: LocalReceiptBlobGroup.Fault
        private var key: SymmetricKey?, active = true
        private var groups: [LocalReceiptGeneration] = [], descriptors: [LocalReceiptDescriptor] = [], pins: [Int32] = []
        private var record: OwnedRecord?
        fileprivate var target: LocalReceiptTarget?

        static func beginBound(directory: URL, key: SymmetricKey, body: VaultSnapshot, receipts: [DurableReceiptDeclaration],
                               owner: UUID, digest: String?, storeId: String, source: LocalVaultMetadata) throws -> Preparation {
            try ReceivingBinding.capture(directory: directory, key: key, owner: owner, digest: digest, storeId: storeId, source: source)
                .begin(body: body, receipts: receipts, owner: owner, key: key)
        }

        static func begin(directory: URL, key: SymmetricKey?, body: VaultSnapshot, receipts: [DurableReceiptDeclaration],
                          metadata: LocalVaultMetadata, storeId: String,
                          cancellation: @escaping () throws -> Void = { try Task.checkCancellation() },
                          fault: @escaping (Phase) throws -> Void = { _ in },
                          receiptFault: @escaping LocalReceiptBlobGroup.Fault = { _, _ in }) throws -> Preparation {
            // All declaration/key checks precede even private root provisioning.
            guard let key, key.bitCount == 256 else { throw LocalReceiptBlobError.key }
            try cancellation(); guard body.attachments.isEmpty, receipts.count <= ReceiptAttachment.maximumCount else { throw ExpenseError.invalidSnapshot }
            try body.validate(); try metadata.validate(); try FinanceValidation.uuid(storeId)
            _ = try DurableVaultStorage.receiptCapacity(body, receipts: receipts.map { try $0.descriptor(vaultId: body.vaultId, generationId: storeId) })
            try cancellation()
            let storage = try DurableVaultStorage(directory)
            return Preparation(storage: storage, key: key, body: body, declarations: receipts, metadata: metadata,
                               storeId: storeId, cancellation: cancellation, fault: fault, receiptFault: receiptFault)
        }
        fileprivate init(storage: DurableVaultStorage, key: SymmetricKey, body: VaultSnapshot, declarations: [DurableReceiptDeclaration],
                     metadata: LocalVaultMetadata, storeId: String, cancellation: @escaping () throws -> Void,
                     fault: @escaping (Phase) throws -> Void, receiptFault: @escaping LocalReceiptBlobGroup.Fault) {
            self.storage = storage; self.key = key; self.body = body; self.declarations = declarations
            self.metadata = metadata; self.storeId = storeId; self.cancellation = cancellation; self.fault = fault; self.receiptFault = receiptFault
        }
        private func checkpoint(_ phase: Phase) throws { try cancellation(); try fault(phase); try cancellation() }
        /// Materializes at most one declared receipt. True EOF and source close
        /// precede encryption; no caller-supplied path or aggregate receipt graph.
        func append(receiptId: String, source: DurableReceiptSource) throws {
            var input: Result<Data, Error>
            do {
                guard active, descriptors.count < declarations.count,
                      declarations[descriptors.count].id == receiptId else { throw LocalReceiptBlobError.closed }
                let expected = declarations[descriptors.count].byteCount
                var bytes = Data()
                while true {
                    try cancellation()
                    let maximum = min(65_536, expected - bytes.count + 1)
                    let chunk = try source.read(maximum: maximum)
                    try cancellation()
                    guard chunk.count <= maximum else { throw LocalReceiptBlobError.bytes }
                    if chunk.isEmpty {
                        guard bytes.count == expected else { throw LocalReceiptBlobError.bytes }; break
                    }
                    guard bytes.count + chunk.count <= expected else { throw LocalReceiptBlobError.bytes }
                    bytes.append(chunk)
                }
                input = .success(bytes)
            } catch { input = .failure(error) }
            do { try source.close() } catch { input = .failure(error) }
            do {
                try cancellation()
                try append(receiptId: receiptId, bytes: input.get())
            } catch { try close(); throw error }
        }
        /// Input order is the declaration order. Every failure permanently consumes preparation.
        func append(receiptId: String, bytes: Data) throws {
            guard active, let key else { throw LocalReceiptBlobError.closed }
            do {
                try cancellation()
                guard descriptors.count < declarations.count, declarations[descriptors.count].id == receiptId else { throw LocalReceiptBlobError.descriptor }
                let declared = declarations[descriptors.count]
                guard bytes.count == declared.byteCount else { throw LocalReceiptBlobError.bytes }
                try storage.leased {
                    let group = try LocalReceiptBlobGroup(parent: storage.url, vaultId: body.vaultId, root: key, cancellation: cancellation, fault: receiptFault)
                    let descriptor = try declared.descriptor(vaultId: body.vaultId, generationId: group.generationId)
                    _ = try group.append(bytes, descriptor: descriptor)
                    let generation = try group.complete(); groups.append(generation)
                    let pin = openat(storage.fd, descriptor.generationId, O_RDONLY | O_DIRECTORY | O_NOFOLLOW | O_CLOEXEC)
                    guard pin >= 0 else { throw LocalReceiptBlobError.file }; pins.append(pin)
                    guard flock(pin, LOCK_SH | LOCK_NB) == 0 else { throw LocalReceiptBlobError.file }
                    descriptors.append(descriptor); try cancellation()
                }
            } catch { try close(); throw error }
        }
        func finish() throws -> InactiveCandidate {
            guard active, let key else { throw LocalReceiptBlobError.closed }
            do {
                try checkpoint(.beforeFinish)
                guard descriptors.count == declarations.count else { throw LocalReceiptBlobError.bytes }
                let summary = try storage.leased {
                    let id = UUID().uuidString.lowercased()
                    let value = DurableRecord(version: 1, storeId: storeId, generationId: id, metadata: metadata,
                                              body: try JSONEncoder().encode(body), receipts: descriptors)
                    let wire = try DurableVaultStorage.recordMagic + DurableVaultStorage.seal(JSONEncoder().encode(value), key: key,
                        domain: "PENNY-LOCAL-GENERATION:1\0" + storeId + "\0" + id)
                    record = try storage.inactiveRecord(wire, id: id, cancellation: cancellation)
                    try checkpoint(.afterMetadataClose)
                    guard let record else { throw LocalReceiptBlobError.file }
                    try validateOwnership()
                    let summary = try storage.readVerified(record.reference, storeId: storeId, key: key)
                    try checkpoint(.afterVerification); try validateOwnership(); return summary
                }
                try cancellation(); active = false
                return InactiveCandidate(owner: self, summary: summary)
            } catch { try close(); throw error }
        }
        fileprivate func verifiedSummary() throws -> DurableVerifiedMetadata {
            guard let record, let key else { throw LocalReceiptBlobError.closed }
            return try storage.leased {
                try cancellation(); try validateOwnership()
                let summary = try storage.readVerified(record.reference, storeId: storeId, key: key)
                try cancellation(); try validateOwnership(); return summary
            }
        }
        private func validateOwnership() throws {
            try record?.validateOwnership()
            for group in groups { try group.validateOwnership() }
        }
        fileprivate func install(owner: UUID, validate: (LocalReceiptTarget, SymmetricKey) throws -> Void,
                                 checkpoint: (@Sendable (VaultStore.CommitStage) throws -> Void)?) throws -> (DurableLoaded, String?, SymmetricKey) {
            guard let target, target.owner == owner, let key, let record else { throw CloudFailure.staleRestore }
            try cancellation(); try validate(target, key)
            return try storage.leased {
                try storage.verifyTarget(target, key: key); try validateOwnership(); try cancellation()
                let loaded = try storage.publish(record.reference, key: key, sourceDigest: target.digest, storeId: target.storeId,
                    checkpoint: checkpoint,
                    finalRead: { try self.storage.hydrate(record.reference, storeId: target.storeId, key: key) },
                    validateOwned: { try self.validateOwnership(); try self.cancellation() },
                    beforePublication: { try validate(target, key); try self.storage.verifyTarget(target, key: key) },
                    finalize: { try self.cancellation(); try self.validateOwnership(); try self.retainCommitted() },
                    uncertain: { try self.retainCommitted() })
                return (loaded, try storage.liveBytes().map(DurableVaultStorage.digest), key)
            }
        }
        fileprivate func matchesOwner(_ owner: UUID) -> Bool { target?.owner == owner }
        private func retainCommitted() throws {
            key = nil
            let ownedRecord = record, ownedGroups = groups, ownedPins = pins
            record = nil; groups.removeAll(); pins.removeAll(); descriptors.removeAll()
            var failed = false
            do { try ownedRecord?.retainCommitted() } catch { failed = true }
            for group in ownedGroups { do { try group.retainCommitted() } catch { failed = true } }
            for pin in ownedPins { if Darwin.close(pin) != 0 { failed = true } }
            if failed { throw LocalReceiptBlobError.file }
        }
        /// After transfer this cannot delete the candidate; candidate close owns cleanup.
        func close() throws { guard active else { return }; active = false; try cleanup() }
        fileprivate func cleanup() throws {
            key = nil
            let ownedRecord = record, ownedGroups = groups, ownedPins = pins
            record = nil; groups.removeAll(); pins.removeAll(); descriptors.removeAll()
            var failed = false
            // Pins remain held while removing own files. No blocking root lease is
            // needed: collectors can authenticate but cannot acquire group LOCK_EX.
            do { try ownedRecord?.close() } catch { failed = true }
            for group in ownedGroups { do { try group.close() } catch { failed = true } }
            for pin in ownedPins { if Darwin.close(pin) != 0 { failed = true } }
            if failed { throw LocalReceiptBlobError.file }
        }
        deinit { try? close() }
    }
    /// Opaque, one-shot candidate. Only a bound candidate can use local installation.
    final class InactiveCandidate {
        let summary: DurableVerifiedMetadata
        private var owner: Preparation?
        fileprivate init(owner: Preparation, summary: DurableVerifiedMetadata) { self.owner = owner; self.summary = summary }
        func verifiedSummary() throws -> DurableVerifiedMetadata {
            guard let owner else { throw LocalReceiptBlobError.closed }; return try owner.verifiedSummary()
        }
        func close() throws { let owned = owner; owner = nil; try owned?.cleanup() }
        func install(owner token: UUID, validate: (LocalReceiptTarget, SymmetricKey) throws -> Void,
                     checkpoint: (@Sendable (VaultStore.CommitStage) throws -> Void)?) throws -> (DurableLoaded, String?, SymmetricKey) {
            guard let held = owner else { throw LocalReceiptBlobError.closed }
            // A foreign receiver cannot consume the legitimate owner's capability.
            guard held.matchesOwner(token) else { throw CloudFailure.staleRestore }
            owner = nil
            do { return try held.install(owner: token, validate: validate, checkpoint: checkpoint) }
            catch { try held.cleanup(); throw error }
        }
        deinit { try? close() }
    }

    func commit(_ prepared: PreparedVaultWrite, sourceDigest: String?, storeId: String, receipts: [LocalReceiptDescriptor], checkpoint: (@Sendable (VaultStore.CommitStage) throws -> Void)?) throws -> DurableLoaded {
        let previousBytes = try liveBytes()
        guard previousBytes.map(Self.digest) == sourceDigest else { throw CloudFailure.staleRestore }
        var descriptors: [LocalReceiptDescriptor] = []
        var ownedGroups: [LocalReceiptGeneration] = []
        defer { for generation in ownedGroups { try? generation.close() } }
        for receipt in prepared.snapshot.attachments {
            if prepared.metadata.restoreEpoch == prepared.sourceRestoreEpoch, let old = receipts.first(where: { $0.id == receipt.id && $0.vaultId == prepared.snapshot.vaultId && $0.expenseId == receipt.expenseId && $0.sha256 == receipt.sha256 && $0.byteCount == receipt.byteCount && $0.mediaType == receipt.mediaType }) {
                // Complete candidate validation authenticates every reused receipt before staging.
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
        return try publish(current, key: prepared.key, sourceDigest: sourceDigest, storeId: storeId, checkpoint: checkpoint,
                           finalRead: { try self.hydrate(current, storeId: storeId, key: prepared.key) },
                           beforePublication: { for generation in ownedGroups { try generation.retainCommitted() } })
    }
    static func expenseEditProposal(_ expense: Expense, body original: VaultSnapshot, receipts: [LocalReceiptDescriptor]) throws -> VaultSnapshot {
        try expense.validate()
        var body = original
        if let index = body.expenses.firstIndex(where: { $0.id == expense.id }) { body.expenses[index] = expense }
        else { body.expenses.append(expense) }
        try body.validate(); _ = try receiptCapacity(body, receipts: receipts)
        return body
    }
    func editExpense(_ expense: Expense, target: LocalReceiptTarget, key: SymmetricKey,
                     checkpoint: (@Sendable (VaultStore.CommitStage) throws -> Void)?,
                     currentKey: () throws -> SymmetricKey) throws -> DurableLiveLoaded {
        guard try currentKey() == key else { throw ExpenseError.missingKey }
        try verifyTarget(target, key: key)
        guard let wire = try liveBytes() else { throw ExpenseError.lockedVault }
        let pointer = try pointer(wire, key: key)
        let (old, original, _, _) = try exportMetadata(pointer.current, storeId: target.storeId, key: key)
        let body = try Self.expenseEditProposal(expense, body: original, receipts: old.receipts)
        guard old.metadata.revision < CloudWire.maximumRevision else { throw ExpenseError.invalidSnapshot }
        let metadata = LocalVaultMetadata(writerId: old.metadata.writerId, revision: old.metadata.revision + 1, restoreEpoch: old.metadata.restoreEpoch)
        let id = UUID().uuidString.lowercased()
        let record = DurableRecord(version: 1, storeId: target.storeId, generationId: id, metadata: metadata,
            body: try JSONEncoder().encode(body), receipts: old.receipts)
        let encrypted = try Self.recordMagic + Self.seal(JSONEncoder().encode(record), key: key,
            domain: "PENNY-LOCAL-GENERATION:1\0" + target.storeId + "\0" + id)
        let ref = DurableReference(id: id, sha256: Self.digest(encrypted)); try write(encrypted, name: ref.name)
        return try publish(ref, key: key, sourceDigest: target.digest, storeId: target.storeId, checkpoint: checkpoint,
            finalRead: { try self.live(ref, storeId: target.storeId, key: key) },
            validateOwned: { guard try currentKey() == key else { throw ExpenseError.missingKey } })
    }
    /// Shared publication protocol for existing Snapshot writes and bound candidates.
    private func publish<T>(_ current: DurableReference, key: SymmetricKey, sourceDigest: String?, storeId: String,
                         checkpoint: (@Sendable (VaultStore.CommitStage) throws -> Void)?,
                         finalRead: () throws -> T,
                         validateOwned: () throws -> Void = {}, beforePublication: () throws -> Void = {},
                         finalize: () throws -> Void = {}, uncertain: () throws -> Void = {}) throws -> T {
        let previousBytes = try liveBytes()
        guard previousBytes.map(Self.digest) == sourceDigest else { throw CloudFailure.staleRestore }
        _ = try readVerified(current, storeId: storeId, key: key); try validateOwned(); try checkpoint?(.staged)
        let previous = try previousBytes.map { try reference($0) }
        if let previousBytes { try write(previousBytes, name: Self.rollback, replacing: true) }
        try checkpoint?(.rollbackSaved); try Task.checkCancellation()
        guard try liveBytes().map(Self.digest) == sourceDigest else { throw CloudFailure.staleRestore }
        _ = try readVerified(current, storeId: storeId, key: key); try validateOwned()
        let journal = try Self.seal(JSONEncoder().encode(DurableJournal(currentHash: current.sha256, previousHash: previous?.sha256)), key: key, domain: "PENNY-LOCAL-JOURNAL:1\0" + storeId)
        // Optional Codable omission is avoided for this closed journal schema.
        let journalObject: [String: Any] = ["currentHash":current.sha256,"previousHash":previous?.sha256 as Any? ?? NSNull()]
        let closedJournal = previous == nil ? try Self.seal(JSONSerialization.data(withJSONObject: journalObject), key: key, domain: "PENNY-LOCAL-JOURNAL:1\0" + storeId) : journal
        let pending = DurablePointer(version: 1, storeId: storeId, current: current, previous: previous, journal: closedJournal)
        // Transfer lifetime before an uncertain atomic publication can succeed.
        try beforePublication()
        do {
            try write(encodePointer(pending, key: key), name: Self.live, replacing: true)
            try checkpoint?(.committed)
            _ = try readVerified(current, storeId: storeId, key: key); try validateOwned()
            try checkpoint?(.verified)
            let loaded = try finalRead(); try validateOwned()
            try Task.checkCancellation()
            try write(encodePointer(DurablePointer(version: 1, storeId: storeId, current: current, previous: previous, journal: nil), key: key), name: Self.live, replacing: true)
            try checkpoint?(.journalCleared)
            try finalize()
            return loaded
        } catch {
            if case DurableCrash.interrupted = error { try uncertain(); throw error } // simulated interruption leaves journal intact
            do {
                if let previousBytes { try write(previousBytes, name: Self.live, replacing: true, cancellable: false) }
                else { guard unlinkat(fd, Self.live, 0) == 0, fsync(fd) == 0 else { throw LocalReceiptBlobError.file } }
            } catch { try uncertain(); throw error }
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
