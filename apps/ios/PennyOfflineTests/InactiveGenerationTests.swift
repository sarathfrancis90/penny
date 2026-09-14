import CryptoKit
import Darwin
import Foundation
import Synchronization
import XCTest
@testable import PennyOffline

@MainActor final class InactiveGenerationTests: XCTestCase {
    private let key = SymmetricKey(data: Data(repeating: 0x0b, count: 32))
    private let metadata = LocalVaultMetadata(writerId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", revision: 7, restoreEpoch: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb")
    private func directory() -> URL {
        let url = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        addTeardownBlock { try? FileManager.default.removeItem(at: url) }; return url
    }
    private func fixture(_ name: String) throws -> Data {
        try Data(contentsOf: XCTUnwrap(Bundle(for: Self.self).resourceURL).appendingPathComponent("fixtures/" + name))
    }
    private func input(_ name: String = "replacement") throws -> VaultSnapshot { try StrictJSON.snapshot(fixture("local-generation-v1/" + name + ".json")) }
    private func root(_ dir: URL) -> URL { dir.appendingPathComponent("PennyOffline") }
    private func live(_ dir: URL) throws -> Data { try Data(contentsOf: root(dir).appendingPathComponent(DurableVaultStorage.live)) }
    private func inventory(_ dir: URL) throws -> Set<String> { Set(try FileManager.default.contentsOfDirectory(atPath: root(dir).path)) }
    private func declaration(_ receipt: ReceiptAttachment) -> DurableReceiptDeclaration {
        DurableReceiptDeclaration(id: receipt.id, expenseId: receipt.expenseId, mediaType: receipt.mediaType, byteCount: receipt.byteCount, sha256: receipt.sha256)
    }
    private func storeId(_ dir: URL) throws -> String {
        let prefix = Data("PENNY-DURABLE:POINTER:1\n".utf8)
        let plain = try AES.GCM.open(AES.GCM.SealedBox(combined: live(dir).dropFirst(prefix.count)), using: key, authenticating: Data("PENNY-LOCAL-POINTER:1".utf8))
        return try JSONDecoder().decode(DurablePointer.self, from: plain).storeId
    }
    private func prepare(_ snapshot: VaultSnapshot, at dir: URL,
                         cancellation: @escaping () throws -> Void = { try Task.checkCancellation() },
                         fault: @escaping (DurableVaultStorage.Preparation.Phase) throws -> Void = { _ in },
                         receiptFault: @escaping LocalReceiptBlobGroup.Fault = { _, _ in }) throws -> DurableVaultStorage.Preparation {
        var body = snapshot; body.attachments = []
        return try DurableVaultStorage.Preparation.begin(directory: root(dir), key: key, body: body,
            receipts: snapshot.attachments.map(declaration), metadata: metadata, storeId: storeId(dir),
            cancellation: cancellation, fault: fault, receiptFault: receiptFault)
    }
    private func append(_ snapshot: VaultSnapshot, to preparation: DurableVaultStorage.Preparation) throws {
        for receipt in snapshot.attachments { try preparation.append(receiptId: receipt.id, bytes: receipt.bytes()) }
    }
    private func equal(_ actual: VaultSnapshot, _ expected: VaultSnapshot) throws {
        let encoder = JSONEncoder(); encoder.outputFormatting = [.sortedKeys, .withoutEscapingSlashes]
        XCTAssertEqual(try encoder.encode(actual), try encoder.encode(expected))
    }
    private func assertPreserved(_ dir: URL, pointer: Data, names: Set<String>) throws {
        XCTAssertEqual(try live(dir), pointer); XCTAssertEqual(try inventory(dir), names)
        try equal((try VaultStore(directory: dir, key: key).compatibilitySnapshot()), input("previous"))
    }

    func testSharedInactiveRoundtripIsolationAndSingleUse() throws {
        // Pin shared acceptance input in the actual runtime bundle; install rows are not claimed.
        _ = try JSONSerialization.jsonObject(with: fixture("local-candidate-v1/acceptance.json"))
        for snapshot in [try input("previous"), try input()] {
            let dir = directory(); try VaultStore(directory: dir, key: key).replace(input("previous"))
            let pointer = try live(dir), names = try inventory(dir), preparation = try prepare(snapshot, at: dir)
            XCTAssertEqual(try live(dir), pointer); XCTAssertEqual(try inventory(dir), names)
            try append(snapshot, to: preparation); XCTAssertEqual(try live(dir), pointer)
            let candidate = try preparation.finish(), summary = try candidate.verifiedSummary()
            XCTAssertEqual(summary.vaultId, snapshot.vaultId); XCTAssertEqual(summary.snapshotId, snapshot.snapshotId)
            XCTAssertEqual(summary.counts["expenses"], snapshot.expenses.count); XCTAssertEqual(summary.counts["attachments"], snapshot.attachments.count)
            XCTAssertEqual(summary.expenseTotalMinor, try FinanceValidation.total(snapshot.expenses.map(\.amountMinor)))
            let encoder = JSONEncoder(); encoder.outputFormatting = [.withoutEscapingSlashes]
            XCTAssertEqual(summary.snapshotBytes, try encoder.encode(snapshot).count)
            let added = try inventory(dir).subtracting(names)
            let name = try XCTUnwrap(added.first { $0.hasSuffix(".pennygen") })
            let wire = try Data(contentsOf: root(dir).appendingPathComponent(name)), id = String(name.dropLast(9))
            XCTAssertEqual(summary.digest, DurableVaultStorage.digest(wire))
            let recordBytes = try AES.GCM.open(AES.GCM.SealedBox(combined: wire.dropFirst(Data("PENNY-DURABLE:RECORD:1\n".utf8).count)), using: key,
                authenticating: Data(("PENNY-LOCAL-GENERATION:1\0" + storeId(dir) + "\0" + id).utf8))
            let record = try JSONDecoder().decode(DurableRecord.self, from: recordBytes)
            var body = snapshot; body.attachments = []
            try equal(StrictJSON.snapshot(record.body), body)
            XCTAssertEqual(record.metadata.revision, metadata.revision)
            for (descriptor, receipt) in zip(record.receipts, snapshot.attachments) {
                XCTAssertEqual(try LocalReceiptGeneration.readCommitted(parent: root(dir), descriptor: descriptor, root: key), try receipt.bytes())
            }
            XCTAssertThrowsError(try preparation.finish())
            XCTAssertThrowsError(try preparation.append(receiptId: snapshot.attachments[0].id, bytes: Data()))
            try preparation.close(); XCTAssertEqual(try candidate.verifiedSummary().digest, summary.digest)
            try candidate.close(); try candidate.close(); XCTAssertThrowsError(try candidate.verifiedSummary())
            try assertPreserved(dir, pointer: pointer, names: names)
        }
    }
    func testMissingKeyAndInvalidDeclarationsRejectBeforeProvisioning() throws {
        let source = try input(); var body = source; body.attachments = []
        let valid = source.attachments.map(declaration), storeId = UUID().uuidString.lowercased()
        let missing = directory()
        XCTAssertThrowsError(try DurableVaultStorage.Preparation.begin(directory: root(missing), key: nil, body: body, receipts: valid, metadata: metadata, storeId: storeId))
        XCTAssertFalse(FileManager.default.fileExists(atPath: missing.path))
        let invalidPlans = [valid + valid, Array(repeating: valid[0], count: 101),
            [DurableReceiptDeclaration(id: valid[0].id, expenseId: UUID().uuidString.lowercased(), mediaType: "image/png", byteCount: valid[0].byteCount, sha256: valid[0].sha256)],
            [DurableReceiptDeclaration(id: valid[0].id, expenseId: valid[0].expenseId, mediaType: "image/png", byteCount: ReceiptAttachment.maximumBytes + 1, sha256: valid[0].sha256)],
            [DurableReceiptDeclaration(id: valid[0].id, expenseId: valid[0].expenseId, mediaType: "image/png", byteCount: valid[0].byteCount, sha256: "invalid")]]
        for plan in invalidPlans {
            let dir = directory()
            XCTAssertThrowsError(try DurableVaultStorage.Preparation.begin(directory: root(dir), key: key, body: body, receipts: plan, metadata: metadata, storeId: storeId))
            XCTAssertFalse(FileManager.default.fileExists(atPath: dir.path))
        }
        body.incomeSources = []
        let invalidBody = directory()
        XCTAssertThrowsError(try DurableVaultStorage.Preparation.begin(directory: root(invalidBody), key: key, body: body, receipts: valid, metadata: metadata, storeId: storeId))
        XCTAssertFalse(FileManager.default.fileExists(atPath: invalidBody.path))
    }
    func testMissingDuplicateWrongHashLengthAndNativeInvalidReceiptDiscard() throws {
        let snapshot = try input(), receipt = snapshot.attachments[0]
        let corpus = try XCTUnwrap(JSONSerialization.jsonObject(with: fixture("png-integrity-corpus.json")) as? [String: Any])
        let cases = try XCTUnwrap(corpus["cases"] as? [[String: Any]])
        let invalid = try XCTUnwrap(cases.first { $0["id"] as? String == "rgba9-plain-invalid_filter" })
        let invalidBytes = try XCTUnwrap(Data(base64Encoded: XCTUnwrap(invalid["dataBase64"] as? String)))
        for variant in ["missing", "duplicate", "length", "hash", "nativeImage"] {
            let dir = directory(); try VaultStore(directory: dir, key: key).replace(input("previous"))
            let pointer = try live(dir), names = try inventory(dir)
            var body = snapshot; body.attachments = []
            let bytes = variant == "nativeImage" ? invalidBytes : try receipt.bytes()
            let declared = DurableReceiptDeclaration(id: receipt.id, expenseId: receipt.expenseId, mediaType: receipt.mediaType,
                byteCount: bytes.count, sha256: variant == "hash" ? String(repeating: "0", count: 64) : DurableVaultStorage.digest(bytes))
            let preparation = try DurableVaultStorage.Preparation.begin(directory: root(dir), key: key, body: body, receipts: [declared], metadata: metadata, storeId: storeId(dir))
            if variant == "missing" { XCTAssertThrowsError(try preparation.finish()) }
            else if variant == "duplicate" {
                try preparation.append(receiptId: receipt.id, bytes: bytes)
                XCTAssertThrowsError(try preparation.append(receiptId: receipt.id, bytes: bytes))
            } else { XCTAssertThrowsError(try preparation.append(receiptId: receipt.id, bytes: variant == "length" ? Data() : bytes)) }
            XCTAssertThrowsError(try preparation.finish()); try preparation.close()
            try assertPreserved(dir, pointer: pointer, names: names)
        }
    }
    func testInjectedWriteCloseAndFinishFailuresCleanOnlyOwnedState() throws {
        let snapshot = try input()
        for phase in [LocalReceiptBlobGroup.Phase.afterWrite, .afterSync, .afterClose] {
            let dir = directory(); try VaultStore(directory: dir, key: key).replace(input("previous"))
            let pointer = try live(dir), names = try inventory(dir)
            var visited = false
            let preparation = try prepare(snapshot, at: dir, receiptFault: { point, file in
                if point == phase {
                    visited = true; XCTAssertGreaterThan(try Data(contentsOf: file).count, 0)
                    throw LocalReceiptBlobError.file // injected after actual ciphertext write/sync/close
                }
            })
            XCTAssertThrowsError(try append(snapshot, to: preparation)); XCTAssertTrue(visited)
            XCTAssertThrowsError(try preparation.finish()); try assertPreserved(dir, pointer: pointer, names: names)
        }
        for phase in [DurableVaultStorage.Preparation.Phase.beforeFinish, .afterMetadataClose, .afterVerification] {
            let dir = directory(); try VaultStore(directory: dir, key: key).replace(input("previous"))
            let pointer = try live(dir), names = try inventory(dir)
            let preparation = try prepare(snapshot, at: dir, fault: { if $0 == phase { throw LocalReceiptBlobError.file } })
            try append(snapshot, to: preparation); XCTAssertThrowsError(try preparation.finish())
            try assertPreserved(dir, pointer: pointer, names: names)
        }
    }
    func testInputAndPostVerificationCancellationPermanentlyDiscard() async throws {
        let snapshot = try input()
        for final in [false, true] {
            let dir = directory(); try VaultStore(directory: dir, key: key).replace(input("previous"))
            let pointer = try live(dir), names = try inventory(dir)
            let task = Task { @MainActor in
                let preparation = try prepare(snapshot, at: dir, fault: { if $0 == .afterVerification { withUnsafeCurrentTask { $0?.cancel() } } })
                if !final { withUnsafeCurrentTask { $0?.cancel() } }
                try append(snapshot, to: preparation)
                _ = try preparation.finish()
            }
            do { try await task.value; XCTFail("Cancellation accepted") } catch is CancellationError {} catch { XCTFail("Expected cancellation: \(error)") }
            try assertPreserved(dir, pointer: pointer, names: names)
        }
    }
    func testCandidatePinsSurviveOrdinaryEditAndCollectorWithoutBlocking() throws {
        let dir = directory(), previous = try input("previous"), incoming = try input()
        let store = VaultStore(directory: dir, key: key); try store.replace(previous)
        let names = try inventory(dir), preparation = try prepare(incoming, at: dir)
        try append(incoming, to: preparation); let candidate = try preparation.finish()
        let group = try XCTUnwrap(inventory(dir).subtracting(names).first { UUID(uuidString: $0) != nil })
        let fd = Darwin.open(root(dir).appendingPathComponent(group).path, O_RDONLY | O_DIRECTORY | O_NOFOLLOW)
        XCTAssertGreaterThanOrEqual(fd, 0); defer { if fd >= 0 { _ = Darwin.close(fd) } }
        XCTAssertNotEqual(flock(fd, LOCK_EX | LOCK_NB), 0)
        var edit = previous.expenses[0]; edit.merchant = "Edit while preview exists"
        try store.save(edit); XCTAssertNoThrow(try store.collectReceiptGarbage())
        XCTAssertEqual(try candidate.verifiedSummary().vaultId, incoming.vaultId)
        XCTAssertTrue(FileManager.default.fileExists(atPath: root(dir).appendingPathComponent(group).path))
        try candidate.close(); XCTAssertFalse(FileManager.default.fileExists(atPath: root(dir).appendingPathComponent(group).path))
        XCTAssertEqual((try VaultStore(directory: dir, key: key).compatibilitySnapshot()).expenses[0].merchant, edit.merchant)
    }
    func testForeignMetadataReplacementAndAddedReceiptEntryArePreserved() throws {
        let dir = directory(); try VaultStore(directory: dir, key: key).replace(input("previous"))
        let pointer = try live(dir), names = try inventory(dir), snapshot = try input()
        let preparation = try prepare(snapshot, at: dir); try append(snapshot, to: preparation)
        let candidate = try preparation.finish()
        let name = try XCTUnwrap(inventory(dir).subtracting(names).first { $0.hasSuffix(".pennygen") })
        let path = root(dir).appendingPathComponent(name), foreign = Data("Foreign replacement".utf8)
        try FileManager.default.removeItem(at: path); try foreign.write(to: path)
        XCTAssertThrowsError(try candidate.close()); XCTAssertEqual(try Data(contentsOf: path), foreign)
        XCTAssertEqual(try live(dir), pointer)
        var foreignReceipt: URL?
        let second = try prepare(snapshot, at: dir, fault: { phase in
            if phase == .afterMetadataClose {
                let group = try XCTUnwrap(self.inventory(dir).first { UUID(uuidString: $0) != nil && !names.contains($0) })
                let file = self.root(dir).appendingPathComponent(group + "/foreign")
                try foreign.write(to: file); foreignReceipt = file
            }
        })
        try append(snapshot, to: second); XCTAssertThrowsError(try second.finish())
        XCTAssertEqual(try Data(contentsOf: XCTUnwrap(foreignReceipt)), foreign); XCTAssertEqual(try live(dir), pointer)
    }
    func testIdenticalCiphertextReplacementCannotUseOldCandidatePins() throws {
        for recordReplacement in [true, false] {
            let dir = directory(); try VaultStore(directory: dir, key: key).replace(input("previous"))
            let pointer = try live(dir), names = try inventory(dir), snapshot = try input()
            let preparation = try prepare(snapshot, at: dir); try append(snapshot, to: preparation)
            let candidate = try preparation.finish(), additions = try inventory(dir).subtracting(names)
            let path: URL
            if recordReplacement { path = root(dir).appendingPathComponent(try XCTUnwrap(additions.first { $0.hasSuffix(".pennygen") })) }
            else {
                let group = try XCTUnwrap(additions.first { UUID(uuidString: $0) != nil })
                path = root(dir).appendingPathComponent(group + "/" + snapshot.attachments[0].id + ".pennyreceipt")
            }
            let identical = try Data(contentsOf: path)
            try FileManager.default.removeItem(at: path); try identical.write(to: path)
            try FileManager.default.setAttributes([.posixPermissions: 0o600], ofItemAtPath: path.path)
            XCTAssertThrowsError(try candidate.verifiedSummary())
            XCTAssertThrowsError(try candidate.close())
            XCTAssertEqual(try Data(contentsOf: path), identical); XCTAssertEqual(try live(dir), pointer)
        }
    }
    private final class Source: DurableReceiptSource {
        let bytes: Data
        var offset = 0, closeCount = 0, reads = 0
        var readFault: (() throws -> Void)?, closeFault: (() throws -> Void)?
        init(_ bytes: Data) { self.bytes = bytes }
        func read(maximum: Int) throws -> Data {
            XCTAssertTrue((1...65_536).contains(maximum)); reads += 1
            if reads > 1 { try readFault?() }
            let end = min(bytes.count, offset + min(7, maximum))
            defer { offset = end }; return bytes.subdata(in: offset..<end)
        }
        func close() throws { closeCount += 1; try closeFault?() }
    }
    func testOwnedSourceExactEOFPartialReadAndCloseFailures() throws {
        var snapshot = try input()
        snapshot.attachments.append(try ReceiptAttachment(data: snapshot.attachments[0].bytes(), expenseId: snapshot.expenses[0].id))
        let last = snapshot.attachments[1], bytes = try last.bytes()
        for variant in ["valid", "partialRead", "close", "truncated", "trailing"] {
            let dir = directory(); try VaultStore(directory: dir, key: key).replace(input("previous"))
            let pointer = try live(dir), names = try inventory(dir), preparation = try prepare(snapshot, at: dir)
            try preparation.append(receiptId: snapshot.attachments[0].id, bytes: snapshot.attachments[0].bytes())
            let source = Source(variant == "truncated" ? bytes.dropLast() : variant == "trailing" ? bytes + Data([1]) : bytes)
            if variant == "partialRead" { source.readFault = { throw LocalReceiptBlobError.file } }
            if variant == "close" { source.closeFault = { throw LocalReceiptBlobError.file } }
            if variant == "valid" {
                try preparation.append(receiptId: last.id, source: source)
                let candidate = try preparation.finish(); XCTAssertEqual(candidate.summary.counts["attachments"], 2); try candidate.close()
            } else {
                XCTAssertThrowsError(try preparation.append(receiptId: last.id, source: source))
                XCTAssertThrowsError(try preparation.finish())
            }
            XCTAssertEqual(source.closeCount, 1)
            if variant == "partialRead" { XCTAssertGreaterThan(source.offset, 0); XCTAssertLessThan(source.offset, bytes.count) }
            if variant == "close" { XCTAssertEqual(source.offset, bytes.count) }
            try assertPreserved(dir, pointer: pointer, names: names)
        }
    }
    func testOwnedSourceCancellationDuringReadCloseAndConsumedPreparation() throws {
        let snapshot = try input(), receipt = snapshot.attachments[0]
        for point in ["read", "close", "beforeFinish", "afterWrite", "discarded"] {
            let dir = directory(); try VaultStore(directory: dir, key: key).replace(input("previous"))
            let pointer = try live(dir), names = try inventory(dir)
            var cancelled = false
            let preparation = try prepare(snapshot, at: dir, cancellation: { if cancelled { throw CancellationError() } },
                receiptFault: { phase, _ in if point == "afterWrite", phase == .afterWrite { cancelled = true } })
            let source = Source(try receipt.bytes())
            if point == "read" { source.readFault = { cancelled = true } }
            if point == "close" { source.closeFault = { cancelled = true } }
            if point == "discarded" { try preparation.close(); try preparation.close() }
            if point == "beforeFinish" {
                try preparation.append(receiptId: receipt.id, source: source); cancelled = true
                XCTAssertThrowsError(try preparation.finish())
            } else { XCTAssertThrowsError(try preparation.append(receiptId: receipt.id, source: source)) }
            XCTAssertEqual(source.closeCount, 1); XCTAssertThrowsError(try preparation.finish())
            try assertPreserved(dir, pointer: pointer, names: names)
        }
    }
    private func bound(_ snapshot: VaultSnapshot, store: VaultStore) throws -> DurableVaultStorage.Preparation {
        var body = snapshot; body.attachments = []
        return try store.beginLocalReceiptReplacement(body, receipts: snapshot.attachments.map(declaration))
    }
    private func candidate(_ snapshot: VaultSnapshot, store: VaultStore) throws -> DurableVaultStorage.InactiveCandidate {
        let preparation = try bound(snapshot, store: store); try append(snapshot, to: preparation); return try preparation.finish()
    }
    func testGuardedInstallReopensAllDomainsIncludingLegacySource() throws {
        for legacy in [false, true] {
            let dir = directory(), previous = try input("previous"), replacement = try input()
            if legacy {
                try FileManager.default.createDirectory(at: root(dir), withIntermediateDirectories: true)
                try VaultCipher.seal(JSONEncoder().encode(previous), key: key).write(to: root(dir).appendingPathComponent(DurableVaultStorage.live))
            } else { try VaultStore(directory: dir, key: key).replace(previous) }
            let store = VaultStore(directory: dir, key: key), pointer = try live(dir)
            let revision = store.revision, writer = store.writerId, epoch = store.restoreEpoch
            let preparation = try bound(replacement, store: store)
            try append(replacement, to: preparation); let value = try preparation.finish()
            XCTAssertEqual(try live(dir), pointer); XCTAssertEqual(store.revision, revision)
            try store.installLocalReceiptReplacement(value)
            XCTAssertEqual(store.revision, revision + 1); XCTAssertEqual(store.writerId, writer); XCTAssertNotEqual(store.restoreEpoch, epoch)
            try equal((try store.compatibilitySnapshot()), replacement)
            try preparation.close(); try value.close()
            XCTAssertThrowsError(try value.verifiedSummary()); XCTAssertThrowsError(try store.installLocalReceiptReplacement(value))
            let reopened = VaultStore(directory: dir, key: key); XCTAssertTrue(reopened.isReady)
            try equal((try reopened.compatibilitySnapshot()), replacement); XCTAssertEqual(reopened.revision, revision + 1)
            XCTAssertEqual(reopened.restoreEpoch, store.restoreEpoch)
        }
    }
    func testBoundInstallConsumesStaleOwnerRevisionIncarnationAndRoot() throws {
        for variant in ["sameOwnerEdit", "otherInstanceEdit", "incarnation", "otherOwner", "rootReplaced", "rootReplacedEmpty", "unbound"] {
            let dir = directory()
            var previous = try input("previous"), replacement = try input()
            if variant == "rootReplacedEmpty" { previous.attachments = []; replacement.attachments = [] }
            let store = VaultStore(directory: dir, key: key); try store.replace(previous)
            let value: DurableVaultStorage.InactiveCandidate
            if variant == "unbound" {
                let preparation = try prepare(replacement, at: dir); try append(replacement, to: preparation); value = try preparation.finish()
            } else { value = try candidate(replacement, store: store) }
            var destination = store
            if variant == "sameOwnerEdit" || variant == "otherInstanceEdit" {
                let writer = variant == "sameOwnerEdit" ? store : VaultStore(directory: dir, key: key)
                var edit = previous.expenses[0]; edit.merchant = "Authoritative intervening edit"; try writer.save(edit)
                XCTAssertNoThrow(try writer.collectReceiptGarbage())
                XCTAssertEqual(try value.verifiedSummary().vaultId, replacement.vaultId)
            } else if variant == "incarnation" {
                let revision = store.revision, epoch = store.restoreEpoch
                try VaultCipher.seal(JSONEncoder().encode(previous), key: key).write(to: root(dir).appendingPathComponent(DurableVaultStorage.live))
                let reincarnated = VaultStore(directory: dir, key: key)
                XCTAssertEqual(reincarnated.revision, revision); XCTAssertNotEqual(reincarnated.restoreEpoch, epoch)
            } else if variant == "otherOwner" { destination = VaultStore(directory: dir, key: key) }
            else if variant == "rootReplaced" || variant == "rootReplacedEmpty" {
                let moved = dir.appendingPathComponent("moved-root")
                try FileManager.default.moveItem(at: root(dir), to: moved); try FileManager.default.copyItem(at: moved, to: root(dir))
                var url = root(dir), flags = URLResourceValues(); flags.isExcludedFromBackup = true; try url.setResourceValues(flags)
            }
            let expected = (try VaultStore(directory: dir, key: key).compatibilitySnapshot()), pointer = try live(dir)
            XCTAssertThrowsError(try destination.installLocalReceiptReplacement(value), variant)
            if variant == "otherOwner" {
                XCTAssertEqual(try live(dir), pointer); XCTAssertEqual(try value.verifiedSummary().vaultId, replacement.vaultId)
                try store.installLocalReceiptReplacement(value)
                try value.close(); try equal((try VaultStore(directory: dir, key: key).compatibilitySnapshot()), replacement)
                continue
            }
            if variant == "unbound" {
                XCTAssertEqual(try value.verifiedSummary().vaultId, replacement.vaultId); try value.close()
                XCTAssertEqual(try live(dir), pointer); continue
            }
            XCTAssertThrowsError(try store.installLocalReceiptReplacement(value)); XCTAssertThrowsError(try value.verifiedSummary())
            try value.close(); XCTAssertEqual(try live(dir), pointer)
            try equal((try VaultStore(directory: dir, key: key).compatibilitySnapshot()), expected)
        }
    }
    func testBoundInstallChecksExistingKeyBeforeBeginAndBeforePublication() throws {
        let publicKey = key
        for stage in ["begin", "install", "prepublication", "changedKey"] {
            let dir = directory(), replacement = try input()
            let state = Mutex((available: true, changed: false, creates: 0))
            let store = VaultStore(directory: dir, deviceKeyReader: { create in
                try state.withLock { value in
                    if create { value.creates += 1 }
                    guard value.available else { throw ExpenseError.missingKey }
                    return value.changed ? SymmetricKey(data: Data(repeating: 0x0c, count: 32)) : publicKey
                }
            }, commitCheckpoint: { point in
                if stage == "prepublication", point == .rollbackSaved { state.withLock { $0.available = false } }
            })
            // Seed through a separate store so the tested checkpoint starts only at install.
            try VaultStore(directory: dir, key: key).replace(input("previous")); store.load()
            let pointer = try live(dir), provisionCount = state.withLock { $0.creates }
            if stage == "begin" {
                state.withLock { $0.available = false }; let before = try inventory(dir)
                XCTAssertThrowsError(try bound(replacement, store: store)); XCTAssertEqual(try inventory(dir), before)
            } else {
                let value = try candidate(replacement, store: store)
                if stage == "install" { state.withLock { $0.available = false } }
                if stage == "changedKey" { state.withLock { $0.changed = true } }
                XCTAssertThrowsError(try store.installLocalReceiptReplacement(value)); XCTAssertThrowsError(try value.verifiedSummary())
            }
            XCTAssertEqual(state.withLock { $0.creates }, provisionCount); XCTAssertFalse(store.isReady)
            XCTAssertEqual(try live(dir), pointer); try equal((try VaultStore(directory: dir, key: key).compatibilitySnapshot()), input("previous"))
        }
    }
    func testBoundInstallFailureRollbackAndUncertainRecovery() throws {
        for stage in [VaultStore.CommitStage.staged, .rollbackSaved, .committed, .verified, .journalCleared] {
            for crash in [false, true] {
                let dir = directory(), previous = try input("previous"), replacement = try input()
                try VaultStore(directory: dir, key: key).replace(previous)
                let store = VaultStore(directory: dir, key: key, commitCheckpoint: { point in
                    if point == stage { if crash { throw DurableCrash.interrupted }; throw LocalReceiptBlobError.file }
                })
                let pointer = try live(dir), value = try candidate(replacement, store: store)
                XCTAssertThrowsError(try store.installLocalReceiptReplacement(value)); try value.close()
                XCTAssertThrowsError(try value.verifiedSummary())
                let published = crash && [.committed, .verified, .journalCleared].contains(stage)
                if !published { XCTAssertEqual(try live(dir), pointer) }
                let reopened = VaultStore(directory: dir, key: key); XCTAssertTrue(reopened.isReady)
                try equal((try reopened.compatibilitySnapshot()), published ? replacement : previous)
            }
        }
    }
    func testBoundInstallActualCancellationRollsBackAfterPublication() async throws {
        for stage in [VaultStore.CommitStage.staged, .committed, .verified, .journalCleared] {
            let dir = directory(), previous = try input("previous"), replacement = try input()
            try VaultStore(directory: dir, key: key).replace(previous)
            let store = VaultStore(directory: dir, key: key, commitCheckpoint: { if $0 == stage { withUnsafeCurrentTask { $0?.cancel() } } })
            let pointer = try live(dir), value = try candidate(replacement, store: store)
            let task = Task { @MainActor in try store.installLocalReceiptReplacement(value) }
            do { try await task.value; XCTFail("Cancelled install accepted") } catch is CancellationError {} catch { XCTFail("Expected cancellation: \(error)") }
            XCTAssertEqual(try live(dir), pointer); try value.close()
            XCTAssertThrowsError(try value.verifiedSummary()); try equal((try VaultStore(directory: dir, key: key).compatibilitySnapshot()), previous)
        }
    }
    func testBoundInstallTamperBeforeAndAfterPublicationPreservesPrevious() throws {
        for stage in [VaultStore.CommitStage.staged, .committed] {
            let dir = directory(), previous = try input("previous"), replacement = try input()
            try VaultStore(directory: dir, key: key).replace(previous); let names = try inventory(dir)
            let store = VaultStore(directory: dir, key: key, commitCheckpoint: { point in
                if point == stage {
                    let folder = dir.appendingPathComponent("PennyOffline")
                    let group = try XCTUnwrap(FileManager.default.contentsOfDirectory(atPath: folder.path).first { UUID(uuidString: $0) != nil && !names.contains($0) })
                    let path = folder.appendingPathComponent(group + "/" + replacement.attachments[0].id + ".pennyreceipt")
                    var bytes = try Data(contentsOf: path); bytes[bytes.count - 1] ^= 1; try bytes.write(to: path)
                }
            })
            let pointer = try live(dir), value = try candidate(replacement, store: store)
            XCTAssertThrowsError(try store.installLocalReceiptReplacement(value)); try value.close()
            XCTAssertEqual(try live(dir), pointer); try equal((try VaultStore(directory: dir, key: key).compatibilitySnapshot()), previous)
        }
    }
}
