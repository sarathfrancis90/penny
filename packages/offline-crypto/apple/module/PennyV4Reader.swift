import Foundation

/// Ownership transfers to validate: close is attempted exactly once, including
/// on rejection. Empty read means true EOF; each read returns at most maximum.
public protocol PennyV4Input: AnyObject {
    func read(maximum: Int) throws -> Data
    func close() throws
}

public struct PennyV4Declaration: Sendable {
    public let snapshotId: String, vaultId: String, createdAt: String
    public let counts: [String: Int64]
    public let receiptBytes: Int64, nonReceiptBytes: Int64
}

/// Read-only validation result, with no rows, receipt bytes or install capability.
public struct PennyV4Summary: Sendable {
    public let snapshotId: String, vaultId: String, createdAt: String
    public let counts: [String: Int64]
    public let receiptBytes: Int64, nonReceiptBytes: Int64, policyMetadataBytes: Int64
    public let recordCount: Int64, streamSha256: String
}

/// Internal app module boundary. Synchronous work belongs off the UI thread.
/// Frame authentication, real FINAL/EOF, logical semantics and full native image
/// decoding always run. Caller admission can only impose additional limits.
public enum PennyV4Reader {
    public static func validate(source: any PennyV4Input, recoveryKey: String,
                                admit: @escaping (PennyV4Declaration) throws -> Void,
                                cancellation: @escaping () throws -> Void = { try Task.checkCancellation() }) throws -> PennyV4Summary {
        let sink = V4NativeValidationSink()
        var closeAttempted = false
        defer {
            sink.discard()
            if !closeAttempted { try? source.close() }
        }
        sink.onBegin = {
            guard let begin = sink.metadata else { throw V4LogicalError.incomplete }
            try admit(PennyV4Declaration(snapshotId: begin.snapshotId, vaultId: begin.vaultId, createdAt: begin.createdAt,
                counts: begin.counts, receiptBytes: begin.receiptBytes, nonReceiptBytes: begin.nonReceiptBytes))
        }
        defer { sink.onBegin = nil }
        let result = try V4LogicalGate.read(input: Input(source), sink: sink, recoveryKey: recoveryKey, cancellation: cancellation)
        try cancellation()
        closeAttempted = true
        try source.close()
        try cancellation()
        return PennyV4Summary(snapshotId: result.snapshotId, vaultId: result.vaultId, createdAt: result.createdAt,
            counts: result.counts, receiptBytes: result.receiptBytes, nonReceiptBytes: result.nonReceiptBytes,
            policyMetadataBytes: result.policyMetadataBytes, recordCount: result.recordCount, streamSha256: result.streamSha256)
    }

    private final class Input: V4FrameInput {
        let source: any PennyV4Input
        init(_ source: any PennyV4Input) { self.source = source }
        func read(upToCount count: Int) throws -> Data { try source.read(maximum: count) }
    }
}
