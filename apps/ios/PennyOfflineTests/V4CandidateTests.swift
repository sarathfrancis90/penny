import CryptoKit
import Foundation
import Synchronization
import XCTest
@testable import PennyOffline
@testable import PennyV4

@MainActor final class V4CandidateTests: XCTestCase {
    private let key = SymmetricKey(data: Data(repeating: 0x0b, count: 32))
    private let recovery = "pny1-" + String(repeating: "07", count: 32)
    private func file(_ name: String) throws -> Data { try Data(contentsOf: XCTUnwrap(Bundle(for: Self.self).resourceURL).appendingPathComponent("fixtures/" + name)) }
    private func directory() -> URL {
        let result = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        addTeardownBlock { try? FileManager.default.removeItem(at: result) }; return result
    }
    private func fixture(_ name: String) throws -> PennyOffline.VaultSnapshot { try StrictJSON.snapshot(file("local-generation-v1/" + name + ".json")) }
    private func encoded(_ value: PennyOffline.VaultSnapshot) throws -> Data {
        let encoder = JSONEncoder(); encoder.outputFormatting = [.sortedKeys, .withoutEscapingSlashes]; return try encoder.encode(value)
    }
    private func disk(_ directory: URL) throws -> [String: Data] {
        let files = try XCTUnwrap(FileManager.default.enumerator(at: directory, includingPropertiesForKeys: [.isRegularFileKey]))
        var result: [String: Data] = [:]
        for case let url as URL in files where try url.resourceValues(forKeys: [.isRegularFileKey]).isRegularFile == true { result[url.path] = try Data(contentsOf: url) }
        return result
    }
    func testAllDomainTwoPassInstallAndOneShotFreshReopen() async throws {
        let dir = directory(), store = VaultStore(directory: dir, key: key)
        try store.replace(fixture("previous"))
        let before = try disk(dir), expected = try fixture("replacement"), probe = Probe()
        let candidate = try await store.prepareV4Replacement(source: Input(try seal(snapshot: encoded(expected)), probe: probe), recoveryKey: recovery, checkpoint: { phase in
            if phase == .captured || phase == .firstPassClosed { XCTAssertEqual(try self.disk(dir), before) }
        })
        XCTAssertEqual(try disk(dir)[dir.appendingPathComponent("PennyOffline/vault-v1.pennyvault").path], before[dir.appendingPathComponent("PennyOffline/vault-v1.pennyvault").path])
        XCTAssertEqual(candidate.summary.vaultId, expected.vaultId)
        XCTAssertEqual(probe.value.withLock { $0.closes }, 1)
        XCTAssertFalse(probe.value.withLock { $0.mainRead })
        try store.installLocalReceiptReplacement(candidate)
        XCTAssertEqual(try encoded(store.snapshot), try encoded(expected))
        XCTAssertEqual(try encoded(VaultStore(directory: dir, key: key).snapshot), try encoded(expected))
        do { try store.installLocalReceiptReplacement(candidate); XCTFail("candidate reused") } catch {}
    }
    func testAuthenticatedFramingAndNativeImageRejectionsPreserveVault() async throws {
        let dir = directory(), store = VaultStore(directory: dir, key: key); try store.replace(fixture("previous")); let before = try disk(dir)
        let valid = try file("v4-frames/one-receipt.pennyframe")
        var tampered = valid; tampered[tampered.count - 5] ^= 1
        var inputs = [Data(valid.dropLast()), valid + Data([0]), tampered, try file("v4-frames/full-final.pennyframe")]
        var snapshot = try XCTUnwrap(JSONSerialization.jsonObject(with: file("local-generation-v1/replacement.json")) as? [String: Any])
        let corpus = try XCTUnwrap(JSONSerialization.jsonObject(with: file("png-integrity-corpus.json")) as? [String: Any])
        let image = try XCTUnwrap((corpus["cases"] as? [[String: Any]])?.first { $0["id"] as? String == "rgba9-plain-invalid_filter" })
        var receipts = try XCTUnwrap(snapshot["attachments"] as? [[String: Any]])
        receipts[0]["byteCount"] = image["byteCount"]; receipts[0]["sha256"] = image["sha256"]; receipts[0]["dataBase64"] = image["dataBase64"]
        snapshot["attachments"] = receipts; inputs.append(try seal(snapshot: JSONSerialization.data(withJSONObject: snapshot)))
        for (index, bytes) in inputs.enumerated() {
            do { _ = try await store.prepareV4Replacement(source: Input(bytes), recoveryKey: recovery); XCTFail("accepted \(index)") } catch {}
            XCTAssertEqual(try disk(dir), before)
        }
        do { _ = try await store.prepareV4Replacement(source: Input(valid), recoveryKey: "pny1-" + String(repeating: "08", count: 32)); XCTFail("wrong key") } catch {}
        XCTAssertEqual(try disk(dir), before)
    }
    func testOriginalTargetBindingRejectsEditsBeforeBeginAndBeforeInstall() async throws {
        for phase in [VaultStore.V4Phase.captured, .firstPassClosed, .secondPassClosed] {
            let dir = directory(), store = VaultStore(directory: dir, key: key); try store.replace(fixture("previous"))
            var changed = try fixture("previous"); changed.expenses[0].note = "concurrent ordinary edit"
            let expected = changed, ciphertext = try seal(snapshot: encoded(fixture("replacement")))
            do {
                let candidate = try await store.prepareV4Replacement(source: Input(ciphertext), recoveryKey: recovery, checkpoint: { reached in
                    if reached == phase { try store.replace(expected) }
                })
                defer { try? candidate.close() }
                do { try store.installLocalReceiptReplacement(candidate); XCTFail("stale installed") } catch {}
            } catch {}
            XCTAssertEqual(try encoded(VaultStore(directory: dir, key: key).snapshot), try encoded(expected))
        }
    }
    func testInputReadCloseAndLateCancellationCleanup() async throws {
        let ciphertext = try file("v4-frames/one-receipt.pennyframe")
        for mode in 0..<5 {
            let dir = directory(), store = VaultStore(directory: dir, key: key); try store.replace(fixture("previous")); let before = try disk(dir)
            let probe = Probe(), cancelled = Mutex(false)
            let input = Input(ciphertext, probe: probe, readFailure: mode == 0, closeFailure: mode == 1)
            do {
                _ = try await store.prepareV4Replacement(source: input, recoveryKey: recovery, cancellation: {
                    if cancelled.withLock({ $0 }) { throw CancellationError() }; try Task.checkCancellation()
                }, checkpoint: { phase in
                    if (mode == 2 && phase == .firstPassClosed) || (mode == 3 && phase == .secondPassClosed) || (mode == 4 && phase == .snapshotClosed) { cancelled.withLock { $0 = true } }
                })
                XCTFail("accepted failure \(mode)")
            } catch {}
            XCTAssertEqual(probe.value.withLock { $0.closes }, 1); XCTAssertEqual(try disk(dir), before)
        }
    }
    func testMissingDeviceKeyNeverProvisionsOrReplaces() async throws {
        let dir = directory(), missing = Mutex(false), reads = Mutex<[Bool]>([]), supplied = key
        let store = VaultStore(directory: dir, deviceKeyReader: { create in
            reads.withLock { $0.append(create) }; if missing.withLock({ $0 }) { throw PennyOffline.ExpenseError.missingKey }; return supplied
        })
        try store.replace(fixture("previous")); let before = try disk(dir); reads.withLock { $0 = [] }
        do {
            _ = try await store.prepareV4Replacement(source: Input(file("v4-frames/one-receipt.pennyframe")), recoveryKey: recovery, checkpoint: { phase in
                if phase == .firstPassClosed { missing.withLock { $0 = true } }
            }); XCTFail("missing key accepted")
        } catch {}
        XCTAssertFalse(reads.withLock { $0.contains(true) }); XCTAssertEqual(try disk(dir), before)
    }
    func testOriginalInputMutationCannotChangePrivateSnapshot() async throws {
        let dir = directory(), store = VaultStore(directory: dir, key: key); try store.replace(fixture("previous"))
        let sourceURL = directory().appendingPathComponent("incoming.pennybackup")
        try FileManager.default.createDirectory(at: sourceURL.deletingLastPathComponent(), withIntermediateDirectories: true)
        let expected = try fixture("replacement"); try seal(snapshot: encoded(expected)).write(to: sourceURL)
        let candidate = try await store.prepareV4Replacement(source: FileInput(sourceURL), recoveryKey: recovery, checkpoint: { phase in
            if phase == .captured { try Data("changed ciphertext".utf8).write(to: sourceURL) }
        })
        try store.installLocalReceiptReplacement(candidate)
        XCTAssertEqual(try encoded(store.snapshot), try encoded(expected))
    }
    func testSharedSplitBoundariesInstallAndCurrentCapacityRejects() async throws {
        let bundle = try XCTUnwrap(Bundle(for: Self.self).resourceURL).appendingPathComponent("V4TestAssets/v4-logical-materialized")
        let manifest = try XCTUnwrap(JSONSerialization.jsonObject(with: Data(contentsOf: bundle.appendingPathComponent("fixture-manifest.json"))) as? [String: Any])
        for row in try XCTUnwrap(manifest["positives"] as? [[String: Any]]) {
            let name = try XCTUnwrap(row["name"] as? String)
            guard name.hasPrefix("split-") || name == "beyond-legacy-count" else { continue }
            let plaintext = try Data(contentsOf: bundle.appendingPathComponent(XCTUnwrap(row["file"] as? String)))
            let output = Output(); _ = try V4FrameCodec.seal(input: Input(plaintext), output: output, recoveryKey: recovery)
            let dir = directory(), store = VaultStore(directory: dir, key: key); try store.replace(fixture("previous"))
            let previous = try disk(dir)
            if name == "beyond-legacy-count" {
                do { _ = try await store.prepareV4Replacement(source: Input(output.data), recoveryKey: recovery); XCTFail("capacity") } catch {}
                XCTAssertEqual(try disk(dir), previous)
            } else {
                let candidate = try await store.prepareV4Replacement(source: Input(output.data), recoveryKey: recovery)
                let expected = try XCTUnwrap(row["summary"] as? [String: Any])
                XCTAssertEqual(candidate.summary.snapshotId, expected["snapshotId"] as? String)
                XCTAssertEqual(candidate.summary.counts, expected["counts"] as? [String: Int])
                try store.installLocalReceiptReplacement(candidate)
                XCTAssertEqual(try encoded(store.snapshot), try encoded(VaultStore(directory: dir, key: key).snapshot))
            }
        }
    }
    private func seal(snapshot: Data) throws -> Data {
        let root = try XCTUnwrap(JSONSerialization.jsonObject(with: snapshot) as? [String: Any])
        let names = ["budgets", "incomeSources", "incomeEntries", "savingsGoals", "savingsEntries", "recurringExpenses", "expenses", "attachments"]
        func json(_ x: [String: Any]) throws -> Data { try JSONSerialization.data(withJSONObject: x, options: [.sortedKeys, .withoutEscapingSlashes]) }
        func record(_ kind: UInt8, _ payload: Data) -> Data { var count = UInt64(payload.count).bigEndian; return Data([kind]) + withUnsafeBytes(of: &count) { Data($0) } + payload }
        var body = Data(), counts: [String: Int] = [:], raw = 0, metadata = 0, records = 1
        for (index, name) in names.enumerated() {
            let rows = try XCTUnwrap(root[name] as? [[String: Any]]).sorted { ($0["id"] as? String ?? "") < ($1["id"] as? String ?? "") }; counts[name] = rows.count
            for var row in rows {
                if name == "attachments" {
                    let bytes = try XCTUnwrap(Data(base64Encoded: XCTUnwrap(row.removeValue(forKey: "dataBase64") as? String)))
                    let wire = record(9, try json(row)); body.append(wire); body.append(record(10, bytes)); raw += bytes.count; metadata += wire.count + 9; records += 2
                } else { let wire = record(UInt8(index + 2), try json(row)); body.append(wire); metadata += wire.count; records += 1 }
            }
        }
        let begin: [String: Any] = ["schemaVersion": 4, "capacityProfile": "A", "snapshotId": try XCTUnwrap(root["snapshotId"]), "vaultId": try XCTUnwrap(root["vaultId"]), "createdAt": try XCTUnwrap(root["createdAt"]), "counts": counts, "receiptBytes": raw, "nonReceiptBytes": metadata]
        var plaintext = record(1, try json(begin)); plaintext.append(body)
        let end: [String: Any] = ["snapshotId": try XCTUnwrap(root["snapshotId"]), "counts": counts, "receiptBytes": raw, "nonReceiptBytes": metadata, "recordCount": records, "streamSha256": SHA256.hash(data: plaintext).map { String(format: "%02x", $0) }.joined()]
        plaintext.append(record(11, try json(end)))
        let output = Output(); _ = try V4FrameCodec.seal(input: Input(plaintext), output: output, recoveryKey: recovery); return output.data
    }
    private enum Failure: Error { case injected }
    private final class Probe: Sendable { let value = Mutex((closes: 0, mainRead: false)) }
    private final class Input: PennyV4Input, V4FrameInput {
        let data: Data, probe: Probe, readFailure: Bool, closeFailure: Bool
        var offset = 0
        init(_ data: Data, probe: Probe = Probe(), readFailure: Bool = false, closeFailure: Bool = false) { self.data = data; self.probe = probe; self.readFailure = readFailure; self.closeFailure = closeFailure }
        func read(maximum: Int) throws -> Data {
            probe.value.withLock { $0.mainRead = $0.mainRead || Thread.isMainThread }
            if readFailure && offset > 0 { throw Failure.injected }
            let end = min(data.count, offset + min(maximum, 211)); defer { offset = end }; return data.subdata(in: offset..<end)
        }
        func close() throws { probe.value.withLock { $0.closes += 1 }; if closeFailure { throw Failure.injected } }
        func read(upToCount count: Int) throws -> Data { try read(maximum: count) }
    }
    private final class FileInput: PennyV4Input {
        let handle: FileHandle
        init(_ url: URL) throws { handle = try FileHandle(forReadingFrom: url) }
        func read(maximum: Int) throws -> Data { try handle.read(upToCount: maximum) ?? Data() }
        func close() throws { try handle.close() }
    }
    private final class Output: V4CiphertextSink {
        var data = Data()
        func write(_ bytes: Data) throws { data.append(bytes) }; func finish() throws {}; func discard() { data.removeAll() }
    }
}
