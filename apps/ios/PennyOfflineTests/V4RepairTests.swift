import CryptoKit
import Foundation
import Synchronization
import XCTest
@testable import PennyOffline

@MainActor final class V4RepairTests: XCTestCase {
    private let oldKey = SymmetricKey(data: Data(repeating: 0x0b, count: 32))
    private let recovery = "pny1-" + String(repeating: "07", count: 32)
    private enum Injected: Error { case failure }
    private final class Keys: Sendable {
        struct State { var key: SymmetricKey?; var creates = 0; var locked = false; var appearance: SymmetricKey? }
        let state: Mutex<State>
        init(_ key: SymmetricKey?) { state = Mutex(State(key: key)) }
        func createAbsent() throws -> SymmetricKey {
            try state.withLock { value in
                guard !value.locked else { throw ExpenseError.keychain(-25308) }
                value.creates += 1
                if let appearance = value.appearance { value.key = appearance; value.appearance = nil }
                guard value.key == nil else { throw ExpenseError.keychain(-25299) }
                let key = SymmetricKey(data: Data(repeating: 0x0c, count: 32)); value.key = key; return key
            }
        }
        func read(_ create: Bool) throws -> SymmetricKey {
            try state.withLock { value in
                guard !value.locked else { throw ExpenseError.keychain(-25308) }
                if create { value.creates += 1 }
                if let key = value.key { return key }
                guard create else { throw ExpenseError.missingKey }
                let key = SymmetricKey(data: Data(repeating: 0x0c, count: 32)); value.key = key; return key
            }
        }
    }
    private func directory() -> URL {
        let url = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        addTeardownBlock { try? FileManager.default.removeItem(at: url) }; return url
    }
    private func file(_ name: String) throws -> URL { try XCTUnwrap(Bundle(for: Self.self).resourceURL).appendingPathComponent("fixtures/" + name) }
    private func archive() throws -> URL { try file("v4-native-writer-v1/android-finance.pennybackup") }
    private func expected() throws -> VaultSnapshot { try StrictJSON.snapshot(Data(contentsOf: file("v4-native-writer-v1/android-finance.snapshot.json"))) }
    private func seed(_ dir: URL) throws {
        try VaultStore(directory: dir, key: oldKey).replace(StrictJSON.snapshot(Data(contentsOf: file("local-generation-v1/previous.json"))))
    }
    private func live(_ dir: URL) -> URL { dir.appendingPathComponent("PennyOffline/vault-v1.pennyvault") }
    private func bytes(_ dir: URL) throws -> [String: Data] {
        let root = dir.appendingPathComponent("PennyOffline"), entries = try XCTUnwrap(FileManager.default.enumerator(at: root, includingPropertiesForKeys: [.isRegularFileKey]))
        var result: [String: Data] = [:]
        for case let path as URL in entries where try path.resourceValues(forKeys: [.isRegularFileKey]).isRegularFile == true {
            result[String(path.path.dropFirst(root.path.count))] = try Data(contentsOf: path)
        }
        return result
    }
    private func encode(_ snapshot: VaultSnapshot) throws -> Data {
        let encoder = JSONEncoder(); encoder.outputFormatting = [.sortedKeys, .withoutEscapingSlashes]; return try encoder.encode(snapshot)
    }
    private func equalReopened(_ dir: URL, keys: Keys) throws {
        let reopened = VaultStore(directory: dir, deviceKeyReader: { try keys.read($0) }, deviceKeyCreator: { try keys.createAbsent() })
        XCTAssertTrue(reopened.isReady)
        let actual = try reopened.compatibilitySnapshot(), expected = try expected()
        XCTAssertEqual(try encode(actual), try encode(expected))
        XCTAssertEqual(try actual.attachments.map { try $0.bytes() }, try expected.attachments.map { try $0.bytes() })
    }
    func testMissingKeyPreviewDoesNotProvisionAndConfirmedRepairReopensEveryDomain() async throws {
        let dir = directory(); try seed(dir); let keys = Keys(nil), before = try bytes(dir)
        let store = VaultStore(directory: dir, deviceKeyReader: { try keys.read($0) }, deviceKeyCreator: { try keys.createAbsent() }); XCTAssertFalse(store.isReady)
        let revision = store.revision, epoch = store.restoreEpoch
        let preview = try await store.prepareFilesRestore(archive(), recoveryKey: recovery)
        XCTAssertEqual(preview.recordCount, try expected().recordCount); XCTAssertEqual(preview.receiptCount, 1)
        XCTAssertEqual(try bytes(dir), before); XCTAssertEqual(keys.state.withLock { $0.creates }, 0)
        XCTAssertEqual(store.revision, revision); XCTAssertEqual(store.restoreEpoch, epoch)
        try await preview.replace(in: store)
        XCTAssertTrue(store.isReady); XCTAssertEqual(store.revision, revision + 1); XCTAssertNotEqual(store.restoreEpoch, epoch)
        XCTAssertEqual(keys.state.withLock { $0.creates }, 1); try equalReopened(dir, keys: keys)
        let after = try bytes(dir)
        for (name, original) in before where name != "/vault-v1.pennyvault" { XCTAssertEqual(after[name], original) }
        do { try await preview.replace(in: store); XCTFail("reused preview") } catch {}
    }
    func testCorruptPointerAndReceiptCanBeExplicitlyRepairedWithoutNewKey() async throws {
        for corruptPointer in [true, false] {
            let dir = directory(); try seed(dir)
            let path: URL
            if corruptPointer { path = live(dir) }
            else {
                let entries = try XCTUnwrap(FileManager.default.enumerator(at: dir, includingPropertiesForKeys: nil))
                path = try XCTUnwrap(entries.compactMap { $0 as? URL }.first { $0.pathExtension == "pennyreceipt" })
            }
            var damaged = try Data(contentsOf: path); damaged[damaged.count - 1] ^= 1; try damaged.write(to: path)
            let keys = Keys(oldKey), store = VaultStore(directory: dir, deviceKeyReader: { try keys.read($0) }, deviceKeyCreator: { try keys.createAbsent() }), before = try bytes(dir)
            XCTAssertFalse(store.isReady)
            let preview = try await store.prepareFilesRestore(archive(), recoveryKey: recovery)
            XCTAssertEqual(try bytes(dir), before); XCTAssertEqual(keys.state.withLock { $0.creates }, 0)
            try await preview.replace(in: store); try equalReopened(dir, keys: keys)
            XCTAssertEqual(keys.state.withLock { $0.creates }, 0)
            let after = try bytes(dir)
            for (name, original) in before where name != "/vault-v1.pennyvault" { XCTAssertEqual(after[name], original) }
        }
    }
    func testWrongKeyTruncationCancellationAndInaccessibleKeyPreserveOriginals() async throws {
        let dir = directory(); try seed(dir); let keys = Keys(nil), store = VaultStore(directory: dir, deviceKeyReader: { try keys.read($0) }, deviceKeyCreator: { try keys.createAbsent() })
        let before = try bytes(dir), wire = try Data(contentsOf: archive())
        for (index, input) in [wire, Data(wire.dropLast()), wire + Data([0]), try Data(contentsOf: file("v4-frames/full-final.pennyframe"))].enumerated() {
            let path = directory().appendingPathComponent("input.pennybackup")
            try FileManager.default.createDirectory(at: path.deletingLastPathComponent(), withIntermediateDirectories: true); try input.write(to: path)
            do { _ = try await store.prepareFilesRestore(path, recoveryKey: index == 0 ? "pny1-" + String(repeating: "08", count: 32) : recovery); XCTFail("invalid preview") } catch {}
            XCTAssertEqual(try bytes(dir), before); XCTAssertEqual(keys.state.withLock { $0.creates }, 0)
        }
        let cancelled = Task { try await store.prepareFilesRestore(archive(), recoveryKey: recovery, afterAcquisition: { withUnsafeCurrentTask { $0?.cancel() } }) }
        do { _ = try await cancelled.value; XCTFail("cancelled acquisition") } catch {}
        let preview = try await store.prepareFilesRestore(archive(), recoveryKey: recovery); try preview.close()
        do { try await preview.replace(in: store); XCTFail("closed preview") } catch {}
        keys.state.withLock { $0.locked = true }
        do { _ = try await store.prepareFilesRestore(archive(), recoveryKey: recovery); XCTFail("inaccessible treated as missing") } catch {}
        XCTAssertEqual(try bytes(dir), before); XCTAssertEqual(keys.state.withLock { $0.creates }, 0)
    }
    func testTargetKeyAndNamespaceChangesRejectBeforeProvisioning() async throws {
        for mode in 0..<7 {
            let dir = directory(); try seed(dir); let keys = Keys(mode == 2 ? oldKey : nil)
            if mode == 2 { var damaged = try Data(contentsOf: live(dir)); damaged[damaged.count - 1] ^= 1; try damaged.write(to: live(dir)) }
            let store = VaultStore(directory: dir, deviceKeyReader: { try keys.read($0) }, deviceKeyCreator: { try keys.createAbsent() })
            let preview = try await store.prepareFilesRestore(archive(), recoveryKey: recovery)
            switch mode {
            case 0, 2: keys.state.withLock { $0.key = SymmetricKey(data: Data(repeating: 0x0d, count: 32)) }
            case 1: var changed = try Data(contentsOf: live(dir)); changed[changed.count - 1] ^= 1; try changed.write(to: live(dir))
            case 3:
                let root = dir.appendingPathComponent("PennyOffline"), moved = dir.appendingPathComponent("retained-original")
                try FileManager.default.moveItem(at: root, to: moved); try FileManager.default.copyItem(at: moved, to: root)
            case 5, 6:
                let path = try XCTUnwrap(FileManager.default.enumerator(at: dir, includingPropertiesForKeys: nil)?.compactMap { $0 as? URL }.first { $0.pathExtension == (mode == 5 ? "pennygen" : "pennyreceipt") })
                var changed = try Data(contentsOf: path); changed[changed.count - 1] ^= 1; try changed.write(to: path)
            default: store.load() // same locked observation is not an authority refresh
            }
            let before = try bytes(dir)
            if mode == 4 {
                // A healthy foreign store cannot consume the original owner's preview.
                let foreign = VaultStore(directory: directory(), key: oldKey)
                do { try await preview.replace(in: foreign); XCTFail("foreign receiver") } catch {}
                try await preview.replace(in: store); try equalReopened(dir, keys: keys)
            } else {
                do { try await preview.replace(in: store); XCTFail("changed target") } catch {}
                XCTAssertEqual(try bytes(dir), before); XCTAssertEqual(keys.state.withLock { $0.creates }, 0)
                do { try await preview.replace(in: store); XCTFail("failed preview reused") } catch {}
            }
        }
        let dir = directory(); try seed(dir); let keys = Keys(nil), store = VaultStore(directory: dir, deviceKeyReader: { try keys.read($0) }, deviceKeyCreator: { try keys.createAbsent() })
        do {
            _ = try await store.prepareFilesRestore(archive(), recoveryKey: recovery, afterAcquisition: {
                var changed = try Data(contentsOf: self.live(dir)); changed[changed.count - 1] ^= 1; try changed.write(to: self.live(dir))
            }); XCTFail("target changed while validating")
        } catch {}
        XCTAssertEqual(keys.state.withLock { $0.creates }, 0)
    }
    func testFailureAfterKeyCreationAndPublicationPreservesUnreadablePredecessor() async throws {
        for stage in [VaultStore.CommitStage.staged, .committed, .verified, .journalCleared] {
            let dir = directory(); try seed(dir); let keys = Keys(nil), before = try bytes(dir)
            let store = VaultStore(directory: dir, deviceKeyReader: { try keys.read($0) }, deviceKeyCreator: { try keys.createAbsent() }, commitCheckpoint: { point in
                if point == stage {
                    if stage == .committed { withUnsafeCurrentTask { $0?.cancel() } }
                    else { throw Injected.failure }
                }
            })
            let preview = try await store.prepareFilesRestore(archive(), recoveryKey: recovery)
            let operation = Task { try await preview.replace(in: store) }
            do { try await operation.value; XCTFail("injected installation failure") } catch {}
            XCTAssertEqual(keys.state.withLock { $0.creates }, 1)
            let after = try bytes(dir)
            for (name, original) in before { XCTAssertEqual(after[name], original) }
            XCTAssertFalse(VaultStore(directory: dir, deviceKeyReader: { try keys.read($0) }, deviceKeyCreator: { try keys.createAbsent() }).isReady)
            // The created key is retained; an explicit new preview can repair the
            // preserved unreadable predecessor without recreating another key.
            let retry = VaultStore(directory: dir, deviceKeyReader: { try keys.read($0) }, deviceKeyCreator: { try keys.createAbsent() })
            let replacement = try await retry.prepareFilesRestore(archive(), recoveryKey: recovery)
            try await replacement.replace(in: retry); try equalReopened(dir, keys: keys)
            XCTAssertEqual(keys.state.withLock { $0.creates }, 1)
        }
    }
    func testAtomicKeyCreationRejectsAppearanceAndExistingPlatformAlias() async throws {
        let dir = directory(); try seed(dir); let keys = Keys(nil), before = try bytes(dir)
        let store = VaultStore(directory: dir, deviceKeyReader: { try keys.read($0) }, deviceKeyCreator: { try keys.createAbsent() })
        let preview = try await store.prepareFilesRestore(archive(), recoveryKey: recovery)
        let foreign = SymmetricKey(data: Data(repeating: 0x0e, count: 32))
        keys.state.withLock { $0.appearance = foreign }
        do { try await preview.replace(in: store); XCTFail("adopted key arriving inside create boundary") } catch {}
        XCTAssertEqual(try bytes(dir), before); XCTAssertEqual(keys.state.withLock { $0.key }, foreign)
        XCTAssertEqual(keys.state.withLock { $0.creates }, 1)
        do { try await preview.replace(in: store); XCTFail("failed preview reused") } catch {}
        // On the owned test simulator, exercise actual SecItemAdd duplicate
        // refusal without deleting or replacing the existing platform alias.
        let platformKey = try DeviceKey.load(create: true)
        XCTAssertThrowsError(try DeviceKey.createAbsent())
        XCTAssertEqual(try DeviceKey.load(create: false), platformKey)
    }
    func testHealthyTargetStillUsesExistingCandidateAndPreservesPreviewIsolation() async throws {
        let dir = directory(); try seed(dir); let keys = Keys(oldKey), store = VaultStore(directory: dir, deviceKeyReader: { try keys.read($0) }, deviceKeyCreator: { try keys.createAbsent() })
        let before = try Data(contentsOf: live(dir)), revision = store.revision
        let preview = try await store.prepareFilesRestore(archive(), recoveryKey: recovery)
        XCTAssertEqual(try Data(contentsOf: live(dir)), before); XCTAssertEqual(store.revision, revision)
        try await preview.replace(in: store); try equalReopened(dir, keys: keys)
        XCTAssertEqual(keys.state.withLock { $0.creates }, 0)
    }
}
