import CryptoKit
import Foundation
import Darwin
import XCTest
import zlib
@testable import PennyOffline

final class LocalReceiptBlobTests: XCTestCase {
    private let root = SymmetricKey(data: Data(repeating: 11, count: 32))
    private let vault = "33333333-3333-4333-8333-333333333333", expense = "11111111-1111-4111-8111-111111111111"
    private var parent: URL!
    private enum Injected: Error { case failure }
    override func setUpWithError() throws {
        parent = FileManager.default.temporaryDirectory.appendingPathComponent("receipt-blob-\(UUID())")
        try FileManager.default.createDirectory(at: parent, withIntermediateDirectories: true, attributes: [.protectionKey: FileProtectionType.complete, .posixPermissions: 0o700])
        var flags = URLResourceValues(); flags.isExcludedFromBackup = true
        try parent.setResourceValues(flags)
    }
    override func tearDownWithError() throws { try FileManager.default.removeItem(at: parent) }
    private func fixture(_ name: String) throws -> Data { try Data(contentsOf: XCTUnwrap(Bundle(for: Self.self).resourceURL).appendingPathComponent("fixtures/local-receipt-v1/" + name)) }
    private func image(_ data: Data? = nil) throws -> ReceiptAttachment { try ReceiptAttachment(data: data ?? fixture("receipt.png"), expenseId: expense) }
    private func descriptor(_ fields: [String: Any]) throws -> LocalReceiptDescriptor {
        guard Set(fields.keys) == ["vaultId", "generationId", "id", "expenseId", "mediaType", "byteCount", "sha256"],
              let vault = fields["vaultId"] as? String, let generation = fields["generationId"] as? String,
              let id = fields["id"] as? String, let owner = fields["expenseId"] as? String,
              let media = fields["mediaType"] as? String, let sha = fields["sha256"] as? String,
              let n = fields["byteCount"] as? NSNumber, CFGetTypeID(n) != CFBooleanGetTypeID(),
              n.doubleValue.rounded() == n.doubleValue, n.doubleValue > 0, n.doubleValue <= Double(ReceiptAttachment.maximumBytes)
        else { throw LocalReceiptBlobError.descriptor }
        return try LocalReceiptDescriptor(vaultId: vault, generationId: generation, id: id, expenseId: owner, mediaType: media, byteCount: n.intValue, sha256: sha)
    }
    private func hex(_ data: Data) -> String { data.map { String(format: "%02x", $0) }.joined() }
    private func paddedPNG(_ size: Int = ReceiptAttachment.maximumBytes) throws -> Data {
        var png = try fixture("receipt.png"), chunk = Data("npAd".utf8)
        chunk.append(Data(count: size - png.count - 12))
        let crc = chunk.withUnsafeBytes { crc32(0, $0.bindMemory(to: Bytef.self).baseAddress, uInt($0.count)) }
        func be(_ value: Int) -> Data { Data((0..<4).reversed().map { UInt8(truncatingIfNeeded: value >> ($0 * 8)) }) }
        png.insert(contentsOf: be(chunk.count - 4) + chunk + be(Int(crc)), at: png.count - 12)
        return png
    }
    private func assertProtection(_ path: URL, fd: Int32? = nil) throws {
        #if targetEnvironment(simulator)
        XCTAssertEqual(LocalReceiptProtectionMode.current, .simulatedFilesystem)
        // The simulator executes all filesystem tests, but does not prove class A.
        #else
        XCTAssertEqual(LocalReceiptProtectionMode.current, .complete)
        if let fd { XCTAssertEqual(penny_receipt_protection_class(fd), 1) }
        XCTAssertEqual(try FileManager.default.attributesOfItem(atPath: path.path)[.protectionKey] as? FileProtectionType, .complete)
        #endif
    }
    func testDescriptorAddressedProtectionMode() throws {
        let path = parent.appendingPathComponent("fd-probe")
        let directory = Darwin.open(parent.path, O_RDONLY | O_DIRECTORY | O_NOFOLLOW)
        XCTAssertGreaterThanOrEqual(directory, 0); defer { _ = Darwin.close(directory) }
        let fd = penny_open_receipt_protected_at(directory, "fd-probe")
        let openError = errno
        guard fd >= 0 else { XCTFail("Protected openat failed with errno \(openError)"); return }
        defer { _ = Darwin.close(fd) }
        try assertProtection(path, fd: fd)
        var info = stat(); XCTAssertEqual(fstat(fd, &info), 0)
        XCTAssertEqual(info.st_mode & S_IFMT, S_IFREG); XCTAssertEqual(info.st_mode & 0o777, 0o600)
    }
    func testSharedGoldenAndEveryAADFieldSubstitution() throws {
        let manifest = try XCTUnwrap(JSONSerialization.jsonObject(with: fixture("fixture-manifest.json")) as? [String: Any])
        let entry = try XCTUnwrap((manifest["positives"] as? [[String: Any]])?.first), fields = try XCTUnwrap(entry["descriptor"] as? [String: Any])
        let d = try descriptor(fields), wire = try fixture("receipt.pennyreceipt"), plaintext = try fixture("receipt.png")
        XCTAssertEqual(try LocalReceiptBlob.open(wire, descriptor: d, root: root), plaintext)
        let derived = try LocalReceiptBlob.derivedKey(root: root, descriptor: d).withUnsafeBytes { hex(Data($0)) }
        XCTAssertEqual(derived, entry["derivedKeyHex"] as? String); XCTAssertEqual(hex(LocalReceiptBlob.aad(d)), entry["aadHex"] as? String)
        for key in ["vaultId", "generationId", "id", "expenseId", "mediaType", "byteCount", "sha256"] {
            var changed = fields
            changed[key] = key == "mediaType" ? "image/jpeg" : key == "byteCount" ? 71 : key == "sha256" ? String(repeating: "0", count: 64) : UUID().uuidString.lowercased()
            XCTAssertThrowsError(try LocalReceiptBlob.open(wire, descriptor: descriptor(changed), root: root), key)
        }
        for index in wire.indices { var changed = wire; changed[index] ^= 1; XCTAssertThrowsError(try LocalReceiptBlob.open(changed, descriptor: d, root: root)) }
        XCTAssertThrowsError(try LocalReceiptBlob.open(wire + Data([0]), descriptor: d, root: root))
        XCTAssertThrowsError(try LocalReceiptBlob.open(wire.dropLast(), descriptor: d, root: root))
        XCTAssertThrowsError(try LocalReceiptBlob.open(wire, descriptor: d, root: SymmetricKey(data: Data(repeating: 12, count: 32))))
        let first = try LocalReceiptBlob.seal(plaintext, descriptor: d, root: root), second = try LocalReceiptBlob.seal(plaintext, descriptor: d, root: root)
        XCTAssertNotEqual(first[8..<20], second[8..<20]); XCTAssertEqual(try LocalReceiptBlob.open(first, descriptor: d, root: root), plaintext)
        for count in [0, -1, ReceiptAttachment.maximumBytes + 1, Int.max] { var invalid = fields; invalid["byteCount"] = count; XCTAssertThrowsError(try descriptor(invalid)) }
        var invalid = fields; invalid["id"] = "../receipt"; XCTAssertThrowsError(try descriptor(invalid))
    }
    func testTransferReadProtectionAndOneShotCleanup() throws {
        let operation = try LocalReceiptBlobGroup(parent: parent, vaultId: vault, root: root), receipt = try image()
        let handle = try operation.append(receipt)
        let path = parent.appendingPathComponent(operation.generationId).appendingPathComponent(receipt.id + ".pennyreceipt")
        try assertProtection(path)
        XCTAssertEqual(try parent.resourceValues(forKeys: [.isExcludedFromBackupKey]).isExcludedFromBackup, true)
        XCTAssertEqual(handle.descriptor.generationId, operation.generationId)
        let generation = try operation.complete(); try operation.discard()
        XCTAssertEqual(try generation.read(receiptId: receipt.id, root: root), try receipt.bytes())
        XCTAssertThrowsError(try operation.complete()); XCTAssertThrowsError(try operation.append(receipt))
        try generation.close(); try generation.close()
        XCTAssertThrowsError(try generation.read(receiptId: receipt.id, root: root))
        XCTAssertFalse(FileManager.default.fileExists(atPath: path.path))
        let discarded = try LocalReceiptBlobGroup(parent: parent, vaultId: vault, root: root); try discarded.discard()
        XCTAssertThrowsError(try discarded.append(receipt)); XCTAssertThrowsError(try discarded.complete())
    }
    func testPostWriteSyncCloseReopenAndCompletionFaultCleanup() throws {
        let sibling = parent.appendingPathComponent("existing"); try Data([7]).write(to: sibling)
        for phase in [LocalReceiptBlobGroup.Phase.afterWrite, .afterSync, .afterClose, .beforeReopen, .beforeComplete] {
            let receipt = try image(phase == .afterWrite ? paddedPNG(131_072) : nil)
            var observedCiphertext = false
            let operation = try LocalReceiptBlobGroup(parent: parent, vaultId: vault, root: root, fault: { current, path in
                if current == phase {
                    if current != .beforeComplete {
                        let stored = try Data(contentsOf: path); observedCiphertext = stored.starts(with: LocalReceiptBlob.magic) && stored.count > 36
                        if current == .afterWrite { XCTAssertEqual(stored.count, 65_536); XCTAssertLessThan(stored.count, receipt.byteCount + 36) }
                    }
                    throw Injected.failure
                }
            })
            if phase == .beforeComplete { _ = try operation.append(receipt); XCTAssertThrowsError(try operation.complete()) }
            else { XCTAssertThrowsError(try operation.append(receipt)); XCTAssertTrue(observedCiphertext) }
            XCTAssertFalse(FileManager.default.fileExists(atPath: parent.appendingPathComponent(operation.generationId).path))
            XCTAssertEqual(try Data(contentsOf: sibling), Data([7])); XCTAssertThrowsError(try operation.complete())
        }
        var cancelled = false
        let cancelledOperation = try LocalReceiptBlobGroup(parent: parent, vaultId: vault, root: root, cancellation: { if cancelled { throw CancellationError() } }, fault: { phase, _ in if phase == .afterClose { cancelled = true } })
        XCTAssertThrowsError(try cancelledOperation.append(image())) { XCTAssertTrue($0 is CancellationError) }
        XCTAssertFalse(FileManager.default.fileExists(atPath: parent.appendingPathComponent(cancelledOperation.generationId).path))
    }
    func testCollisionAndSubstitutionPreserveUnownedEntries() throws {
        for substitution in [false, true] {
            var protected: URL?
            let operation = try LocalReceiptBlobGroup(parent: parent, vaultId: vault, root: root, fault: { phase, path in
                if phase == (substitution ? .beforeReopen : .beforeCreate) {
                    if substitution { try FileManager.default.removeItem(at: path) }
                    try Data([9, 8, 7]).write(to: path, options: .withoutOverwriting); protected = path
                }
            })
            XCTAssertThrowsError(try operation.append(image()))
            XCTAssertEqual(try Data(contentsOf: XCTUnwrap(protected)), Data([9, 8, 7]))
        }
        let target = parent.appendingPathComponent("target"); try Data([4]).write(to: target)
        var link: URL?
        let operation = try LocalReceiptBlobGroup(parent: parent, vaultId: vault, root: root, fault: { phase, path in
            if phase == .beforeCreate { try FileManager.default.createSymbolicLink(at: path, withDestinationURL: target); link = path }
        })
        XCTAssertThrowsError(try operation.append(image())); XCTAssertEqual(try Data(contentsOf: target), Data([4]))
        XCTAssertEqual(try FileManager.default.destinationOfSymbolicLink(atPath: XCTUnwrap(link).path), target.path)
    }
    func testParentSubstitutionCannotModifyExternalAttributesAndExtraInventoryFails() throws {
        let external = parent.appendingPathComponent("external"), receipt = try image()
        try FileManager.default.createDirectory(at: external, withIntermediateDirectories: true)
        let victim = external.appendingPathComponent(receipt.id + ".pennyreceipt"); try Data([3, 4]).write(to: victim)
        try FileManager.default.setAttributes([.protectionKey: FileProtectionType.none], ofItemAtPath: victim.path)
        let attributes = try FileManager.default.attributesOfItem(atPath: victim.path)
        let oldBackupFlag = try victim.resourceValues(forKeys: [.isExcludedFromBackupKey]).isExcludedFromBackup
        let operation = try LocalReceiptBlobGroup(parent: parent, vaultId: vault, root: root, fault: { phase, path in
            if phase == .beforeCreate {
                let original = path.deletingLastPathComponent()
                try FileManager.default.moveItem(at: original, to: original.appendingPathExtension("moved"))
                try FileManager.default.createSymbolicLink(at: original, withDestinationURL: external)
            }
        })
        XCTAssertThrowsError(try operation.append(receipt))
        XCTAssertEqual(try Data(contentsOf: victim), Data([3, 4]))
        XCTAssertEqual(try FileManager.default.attributesOfItem(atPath: victim.path)[.protectionKey] as? FileProtectionType, attributes[.protectionKey] as? FileProtectionType)
        XCTAssertEqual(try victim.resourceValues(forKeys: [.isExcludedFromBackupKey]).isExcludedFromBackup, oldBackupFlag)
        for mutationPhase in [LocalReceiptBlobGroup.Phase.beforeComplete, .afterCompleteReads] {
            var foreign: URL?
            let extra = try LocalReceiptBlobGroup(parent: parent, vaultId: vault, root: root, fault: { phase, path in
                if phase == mutationPhase { let file = path.appendingPathComponent("unowned"); try Data([5]).write(to: file); foreign = file }
            })
            _ = try extra.append(image()); XCTAssertThrowsError(try extra.complete())
            XCTAssertEqual(try Data(contentsOf: XCTUnwrap(foreign)), Data([5]))
        }
        let generationGroup = try LocalReceiptBlobGroup(parent: parent, vaultId: vault, root: root), item = try image()
        _ = try generationGroup.append(item); let generation = try generationGroup.complete()
        let unexpected = parent.appendingPathComponent(generationGroup.generationId).appendingPathComponent("foreign")
        try Data([6]).write(to: unexpected)
        XCTAssertThrowsError(try generation.close()); XCTAssertEqual(try Data(contentsOf: unexpected), Data([6])); try generation.close()
    }
    func testAllSharedNegativeEnvelopes() throws {
        let manifest = try XCTUnwrap(JSONSerialization.jsonObject(with: fixture("fixture-manifest.json")) as? [String: Any])
        let entries = try XCTUnwrap(manifest["negatives"] as? [[String: Any]]); XCTAssertEqual(entries.count, 35)
        func data(_ hex: String) -> Data { let chars = Array(hex); return Data(stride(from: 0, to: chars.count, by: 2).map { UInt8(String(chars[$0...$0 + 1]), radix: 16)! }) }
        for item in entries {
            let fields = try XCTUnwrap(item["descriptor"] as? [String: Any])
            let wire = data(try XCTUnwrap(item["envelopeHex"] as? String)), key = SymmetricKey(data: data(try XCTUnwrap(item["rootHex"] as? String)))
            XCTAssertThrowsError(try LocalReceiptBlob.open(wire, descriptor: descriptor(fields), root: key), item["name"] as? String ?? "negative")
        }
    }
    func testPublicParentAndHardlinkedBlobAreRejected() throws {
        let publicParent = parent.appendingPathComponent("public")
        try FileManager.default.createDirectory(at: publicParent, withIntermediateDirectories: true, attributes: [.posixPermissions: 0o755])
        XCTAssertThrowsError(try LocalReceiptBlobGroup(parent: publicParent, vaultId: vault, root: root))
        let included = parent.appendingPathComponent("included")
        try FileManager.default.createDirectory(at: included, withIntermediateDirectories: true, attributes: [.posixPermissions: 0o700])
        XCTAssertThrowsError(try LocalReceiptBlobGroup(parent: included, vaultId: vault, root: root))
        var link: URL?
        let group = try LocalReceiptBlobGroup(parent: parent, vaultId: vault, root: root, fault: { phase, path in
            if phase == .beforeReopen {
                let foreign = self.parent.appendingPathComponent("hardlink")
                try FileManager.default.linkItem(at: path, to: foreign); link = foreign
            }
        })
        XCTAssertThrowsError(try group.append(image()))
        XCTAssertTrue(FileManager.default.fileExists(atPath: try XCTUnwrap(link).path))
        XCTAssertThrowsError(try group.complete())
    }
    func testCurrentCountAggregateAndDuplicateCapacity() throws {
        let countGroup = try LocalReceiptBlobGroup(parent: parent, vaultId: vault, root: root)
        for _ in 0..<100 { _ = try countGroup.append(image()) }
        XCTAssertThrowsError(try countGroup.append(image())); XCTAssertThrowsError(try countGroup.complete())
        let duplicate = try LocalReceiptBlobGroup(parent: parent, vaultId: vault, root: root), receipt = try image()
        _ = try duplicate.append(receipt); XCTAssertThrowsError(try duplicate.append(receipt))
        let png = try paddedPNG()
        XCTAssertEqual(png.count, ReceiptAttachment.maximumBytes)
        let group = try LocalReceiptBlobGroup(parent: parent, vaultId: vault, root: root)
        for _ in 0..<4 { _ = try group.append(image(png)) }
        XCTAssertThrowsError(try group.append(image())); XCTAssertThrowsError(try group.complete())
    }
}
