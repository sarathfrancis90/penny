#if DEBUG
import Foundation

/// Explicit UI-test injection only. Never linked into a Release implementation.
@MainActor final class UITestCloudTransport: CloudTransport {
    static let publicKey = "pny1-1f1e1d1c1b1a191817161514131211100f0e0d0c0b0a09080706050403020100"
    let provider = "icloud"
    let accountEpoch = UUID()
    var onAccountChange: (() -> Void)?
    private var objects: [String: Data] = [:]
    func identity() async throws -> String { "synthetic-ui-account" }
    func upload(name: String, encryptedFile: URL) async throws {
        guard objects[name] == nil else { throw CloudFailure.conflict }
        objects[name] = try StrictJSON.boundedRead(encryptedFile, maximum: BackupArchive.maximumEnvelopeBytes)
    }
    func download(name: String, maximumBytes: Int) async throws -> Data {
        guard let data = objects[name], data.count <= maximumBytes else { throw CloudFailure.verification }; return data
    }
    func list(token: String?) async throws -> CloudRemotePage {
        guard token == nil, objects.count <= 100 else { throw CloudFailure.incompleteListing }
        return CloudRemotePage(items: objects.keys.map { CloudRemoteItem(id: $0, name: $0) }, nextToken: nil)
    }
}
@MainActor final class UITestBackupScheduler: BackupScheduling {
    func register(_ handler: @escaping @MainActor (any BackgroundBackupTask) -> Void) -> Bool { true }
    func schedule(at date: Date) throws {} // No operating-system scheduling in this harness.
    func cancel() {}
}
#endif
