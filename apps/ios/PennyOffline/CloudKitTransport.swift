@preconcurrency import CloudKit
import Foundation

struct CloudRemoteItem: Equatable, Sendable { let id: String; let name: String }
struct CloudRemotePage: Sendable { let items: [CloudRemoteItem]; let nextToken: String? }
@MainActor protocol CloudTransport: AnyObject {
    var provider: String { get }
    var accountEpoch: UUID { get }
    var onAccountChange: (() -> Void)? { get set }
    func identity() async throws -> String
    func upload(name: String, encryptedFile: URL) async throws
    func download(name: String, maximumBytes: Int) async throws -> Data
    func list(token: String?) async throws -> CloudRemotePage
}

enum CloudBuildConfiguration {
    static var containerIdentifier: String? {
        #if PENNY_SIGNED_CLOUDKIT && !targetEnvironment(simulator)
        let container = Bundle.main.object(forInfoDictionaryKey: "PennyCloudKitContainerIdentifier") as? String
        guard Bundle.main.object(forInfoDictionaryKey: "PennyCloudKitSignedBuild") as? Bool == true,
              let container, container.hasPrefix("iCloud."), container.count <= 255,
              container.range(of: #"^iCloud\.[A-Za-z0-9.-]+$"#, options: .regularExpression) != nil else { return nil }
        return container
        #else
        return nil
        #endif
    }
    // Configuration is not entitlement proof. The signed artifact must pass the
    // host codesign/container preflight before distributing an enabled build.
    static var available: Bool { containerIdentifier != nil }
}

@MainActor final class CloudKitTransport: CloudTransport {
    let provider = "icloud"
    private(set) var accountEpoch = UUID()
    var onAccountChange: (() -> Void)?
    private let container: CKContainer
    private let database: CKDatabase
    private var cursors: [String: CKQueryOperation.Cursor] = [:]
    private var accountObserver: NSObjectProtocol?
    init() throws {
        guard let identifier = CloudBuildConfiguration.containerIdentifier else { throw CloudFailure.unavailable }
        // No CKContainer API is reached by the default ad hoc/simulator build.
        let container = CKContainer(identifier: identifier)
        self.container = container; database = container.privateCloudDatabase
        accountObserver = NotificationCenter.default.addObserver(forName: .CKAccountChanged, object: nil, queue: .main) { [weak self] _ in
            MainActor.assumeIsolated { self?.accountEpoch = UUID(); self?.cursors.removeAll(); self?.onAccountChange?() }
        }
    }
    private func check(_ epoch: UUID) throws { try Task.checkCancellation(); guard epoch == accountEpoch else { throw CloudFailure.accountChanged } }
    func identity() async throws -> String {
        let epoch = accountEpoch; try check(epoch)
        do {
            let status = try await container.accountStatus(); try check(epoch)
            guard status == .available else { throw CloudFailure.permission }
            let user = try await container.userRecordID(); try check(epoch)
            _ = try CloudWire.accountTag(provider: provider, identity: user.recordName)
            return user.recordName
        } catch { throw mapped(error) }
    }
    private func maximum(_ name: String) throws -> Int {
        if name.range(of: #"^snapshot-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.pennybackup$"#, options: .regularExpression) != nil { return BackupArchive.maximumEnvelopeBytes }
        if name.range(of: #"^manifest-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.pennymanifest$"#, options: .regularExpression) != nil { return CloudWire.maximumEnvelope }
        throw CloudFailure.invalidManifest
    }
    func upload(name: String, encryptedFile: URL) async throws {
        let epoch = accountEpoch; try check(epoch)
        let bytes = try StrictJSON.boundedRead(encryptedFile, maximum: maximum(name))
        let id = CKRecord.ID(recordName: name)
        let record = CKRecord(recordType: "PennyEncryptedObject", recordID: id)
        record["payload"] = CKAsset(fileURL: encryptedFile)
        record["byteCount"] = NSNumber(value: bytes.count)
        do {
            let result = try await database.modifyRecords(saving: [record], deleting: [], savePolicy: .ifServerRecordUnchanged, atomically: true)
            try check(epoch)
            guard result.saveResults.count == 1, result.deleteResults.isEmpty, let saved = result.saveResults[id] else { throw CloudFailure.verification }
            let returned = try saved.get()
            guard returned.recordID == id else { throw CloudFailure.verification }
        } catch { throw mapped(error) }
    }
    func download(name: String, maximumBytes: Int) async throws -> Data {
        let epoch = accountEpoch; try check(epoch)
        guard maximumBytes > 0, maximumBytes <= (try maximum(name)) else { throw CloudFailure.verification }
        let id = CKRecord.ID(recordName: name)
        do {
            // Fetch size metadata before asking CloudKit to materialize an asset.
            let headers = try await database.records(for: [id], desiredKeys: ["byteCount"]); try check(epoch)
            guard let headerResult = headers[id] else { throw CloudFailure.verification }
            let header = try headerResult.get()
            guard let count = header["byteCount"] as? NSNumber, count.intValue > 0, count.intValue <= maximumBytes else { throw CloudFailure.verification }
            let records = try await database.records(for: [id], desiredKeys: ["payload", "byteCount"]); try check(epoch)
            guard let result = records[id] else { throw CloudFailure.verification }
            let record = try result.get()
            guard record.recordID == id, record.recordChangeTag == header.recordChangeTag,
                  let asset = record["payload"] as? CKAsset, let url = asset.fileURL else { throw CloudFailure.verification }
            // This URL comes from the explicit private-database fetch, never from
            // the local staging asset. CloudKit owns transfer/cache allocation.
            let bytes = try StrictJSON.boundedRead(url, maximum: maximumBytes)
            guard bytes.count == count.intValue else { throw CloudFailure.verification }
            try check(epoch); return bytes
        } catch { throw mapped(error) }
    }
    func list(token: String?) async throws -> CloudRemotePage {
        let epoch = accountEpoch; try check(epoch)
        do {
            let result: (matchResults: [(CKRecord.ID, Result<CKRecord, Error>)], queryCursor: CKQueryOperation.Cursor?)
            if let token {
                guard let cursor = cursors.removeValue(forKey: token) else { throw CloudFailure.incompleteListing }
                result = try await database.records(continuingMatchFrom: cursor, desiredKeys: [], resultsLimit: 100)
                try check(epoch)
            } else {
                cursors.removeAll()
                result = try await database.records(matching: CKQuery(recordType: "PennyEncryptedObject", predicate: NSPredicate(value: true)), desiredKeys: [], resultsLimit: 100)
                try check(epoch)
            }
            let items = try result.matchResults.map { id, value in
                let record = try value.get(); guard record.recordID == id else { throw CloudFailure.incompleteListing }
                return CloudRemoteItem(id: id.recordName, name: id.recordName)
            }
            let next = result.queryCursor.map { cursor -> String in let token = UUID().uuidString; cursors[token] = cursor; return token }
            return CloudRemotePage(items: items, nextToken: next)
        } catch { throw mapped(error) }
    }
    private func mapped(_ error: Error) -> Error {
        if error is CancellationError { return CloudFailure.cancelled }
        guard let error = error as? CKError else { return error }
        switch error.code {
        case .notAuthenticated, .permissionFailure, .accountTemporarilyUnavailable: return CloudFailure.permission
        case .quotaExceeded: return CloudFailure.quota
        case .serverRecordChanged, .constraintViolation: return CloudFailure.conflict
        default: return CloudFailure.transient
        }
    }
}
