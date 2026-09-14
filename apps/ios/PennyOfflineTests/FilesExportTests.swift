import CryptoKit
import Foundation
import XCTest
@testable import PennyOffline

@MainActor final class FilesExportTests: XCTestCase {
    private let key = SymmetricKey(data: Data(repeating: 0x0b, count: 32))
    private let recovery = "pny1-" + String(repeating: "07", count: 32)
    private func directory() throws -> URL {
        let url = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        try FileManager.default.createDirectory(at: url, withIntermediateDirectories: true)
        addTeardownBlock { try? FileManager.default.removeItem(at: url) }; return url
    }
    private func encoded(_ snapshot: VaultSnapshot) throws -> Data {
        let encoder = JSONEncoder(); encoder.outputFormatting = [.sortedKeys, .withoutEscapingSlashes]; return try encoder.encode(snapshot)
    }
    private func prepared() async throws -> (VaultStore, V4VerifiedExport) {
        let store = VaultStore(directory: try directory(), key: key)
        let fixture = try XCTUnwrap(Bundle(for: Self.self).resourceURL).appendingPathComponent("fixtures/local-generation-v1/replacement.json")
        try store.replace(StrictJSON.snapshot(Data(contentsOf: fixture)))
        return (store, try await store.prepareV4Export(recoveryKey: recovery))
    }
    func testCoordinatedDestinationRestoresExactFreshBackupAndPreservesExistingFile() async throws {
        let (store, export) = try await prepared(), folder = try directory(), source = try encoded(store.snapshot)
        let summary = await export.summary
        XCTAssertNotEqual(summary.snapshotId, store.snapshot.snapshotId)
        let destination = try await FilesExportWorker().save(export, to: folder, recoveryKey: recovery)
        let saved = try Data(contentsOf: destination)
        XCTAssertEqual(saved.prefix(8), Data("PNYBKP4\n".utf8))
        let expectedHash = await export.ciphertextSHA256
        XCTAssertEqual(SHA256.hash(data: saved).map { String(format: "%02x", $0) }.joined(), expectedHash)
        do { _ = try await FilesExportWorker().save(export, to: folder, recoveryKey: recovery); XCTFail("overwritten") } catch {}
        XCTAssertEqual(try Data(contentsOf: destination), saved)
        let target = try directory(), receiver = VaultStore(directory: target, key: key)
        let preview = try await receiver.prepareFilesRestore(destination, recoveryKey: recovery)
        XCTAssertEqual(preview.createdAt, summary.createdAt); try await preview.replace(in: receiver)
        var expected = store.snapshot; expected.snapshotId = summary.snapshotId; expected.createdAt = summary.createdAt
        XCTAssertEqual(try encoded(VaultStore(directory: target, key: key).snapshot), try encoded(expected))
        XCTAssertEqual(try encoded(store.snapshot), source); try await export.close()
    }
    func testWriteSyncCloseReadbackAndCancellationFailuresRemoveOnlyOwnedFile() async throws {
        let (_, export) = try await prepared(), folder = try directory()
        let sibling = folder.appendingPathComponent("existing.pennybackup"), original = Data("keep unchanged".utf8)
        try original.write(to: sibling)
        for phase in [VaultStore.V4OutputPhase.wroteChunk, .synced, .closed] {
            do { _ = try await FilesExportWorker().save(export, to: folder, recoveryKey: recovery, fault: { if $0 == phase { throw Failure.injected } }); XCTFail("injected write failure") } catch {}
            XCTAssertEqual(try FileManager.default.contentsOfDirectory(atPath: folder.path), [sibling.lastPathComponent])
        }
        for phase in [FilesExportWorker.Phase.copied, .beforeReadback, .verified] {
            do { _ = try await FilesExportWorker().save(export, to: folder, recoveryKey: recovery, checkpoint: { if $0 == phase { throw CancellationError() } }); XCTFail("cancel") } catch {}
            XCTAssertEqual(try FileManager.default.contentsOfDirectory(atPath: folder.path), [sibling.lastPathComponent])
        }
        do { _ = try await FilesExportWorker().save(export, to: folder, recoveryKey: "pny1-" + String(repeating: "08", count: 32)); XCTFail("wrong readback key") } catch {}
        XCTAssertEqual(try FileManager.default.contentsOfDirectory(atPath: folder.path), [sibling.lastPathComponent])
        XCTAssertEqual(try Data(contentsOf: sibling), original); try await export.close()
    }
    func testDestinationReplacementIsPreservedAndNeverConfirmed() async throws {
        let (_, export) = try await prepared(), folder = try directory(), summary = await export.summary
        let path = folder.appendingPathComponent("Penny-" + summary.snapshotId + ".pennybackup"), foreign = Data("replacement".utf8)
        do {
            _ = try await FilesExportWorker().save(export, to: folder, recoveryKey: recovery, checkpoint: { phase in
                if phase == .beforeReadback { try FileManager.default.removeItem(at: path); try foreign.write(to: path) }
            }); XCTFail("replacement accepted")
        } catch {}
        XCTAssertEqual(try Data(contentsOf: path), foreign); try await export.close()
    }
    private enum Failure: Error { case injected }
}
