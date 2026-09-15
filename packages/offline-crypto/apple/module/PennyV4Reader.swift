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
public struct PennyV4Summary: Sendable, Equatable {
    public let snapshotId: String, vaultId: String, createdAt: String
    public let counts: [String: Int64]
    public let receiptBytes: Int64, nonReceiptBytes: Int64, policyMetadataBytes: Int64
    public let recordCount: Int64, streamSha256: String
}

public struct PennyV4Receipt: Sendable {
    public let id: String, expenseId: String, mediaType: String, sha256: String
    public let byteCount: Int64
}

/// Provisional events: each record has passed native validation, but the entire
/// input may still fail. A consumer must stage only and undo all events on discard.
/// Discard is idempotent: both the reader and app policy may reject the same attempt.
/// Receipt bytes are borrowed for this callback only, never retained as a graph.
public protocol PennyV4Events: AnyObject {
    func begin(_ metadata: PennyV4Declaration) throws
    func domain(kind: Int, json: Data) throws
    func receipt(_ descriptor: PennyV4Receipt, bytes: Data) throws
    func discard()
}

/// Internal app module boundary. Synchronous work belongs off the UI thread.
/// Frame authentication, real FINAL/EOF, logical semantics and full native image
/// decoding always run. Caller admission can only impose additional limits.
public enum PennyV4Reader {
    public static func validate(source: any PennyV4Input, recoveryKey: String,
                                admit: @escaping (PennyV4Declaration) throws -> Void,
                                events: (any PennyV4Events)? = nil,
                                cancellation: @escaping () throws -> Void = { try Task.checkCancellation() }) throws -> PennyV4Summary {
        let sink = ObservedSink(events: events)
        var closeAttempted = false, completed = false
        defer {
            sink.discard()
            if !completed { events?.discard() }
            if !closeAttempted { try? source.close() }
        }
        sink.admit = admit
        let result = try V4LogicalGate.read(input: Input(source), sink: sink, recoveryKey: recoveryKey, cancellation: cancellation)
        try cancellation()
        closeAttempted = true
        try source.close()
        try cancellation()
        completed = true
        return PennyV4Summary(snapshotId: result.snapshotId, vaultId: result.vaultId, createdAt: result.createdAt,
            counts: result.counts, receiptBytes: result.receiptBytes, nonReceiptBytes: result.nonReceiptBytes,
            policyMetadataBytes: result.policyMetadataBytes, recordCount: result.recordCount, streamSha256: result.streamSha256)
    }

    private final class ObservedSink: V4LogicalValidationSink {
        let native = V4NativeValidationSink()
        let events: (any PennyV4Events)?
        var admit: ((PennyV4Declaration) throws -> Void)?
        init(events: (any PennyV4Events)?) {
            self.events = events
            native.onValidatedReceipt = { descriptor, bytes in
                try events?.receipt(PennyV4Receipt(id: descriptor.id, expenseId: descriptor.expenseId,
                    mediaType: descriptor.mediaType, sha256: descriptor.sha256, byteCount: descriptor.byteCount), bytes: bytes)
            }
        }
        func begin(_ metadata: V4LogicalBegin) throws {
            try native.begin(metadata)
            let value = PennyV4Declaration(snapshotId: metadata.snapshotId, vaultId: metadata.vaultId, createdAt: metadata.createdAt,
                counts: metadata.counts, receiptBytes: metadata.receiptBytes, nonReceiptBytes: metadata.nonReceiptBytes)
            try admit?(value); try events?.begin(value)
        }
        func validateDomain(kind: Int, json: Data) throws { try native.validateDomain(kind: kind, json: json); try events?.domain(kind: kind, json: json) }
        func beginReceipt(_ descriptor: V4ReceiptDescriptor) throws { try native.beginReceipt(descriptor) }
        func appendReceipt(_ bytes: Data) throws { try native.appendReceipt(bytes) }
        func finishReceipt() throws { try native.finishReceipt() }
        func finishLogical(_ summary: V4LogicalSummary) throws { try native.finishLogical(summary) }
        func discard() { native.discard() }
    }

    private final class Input: V4FrameInput {
        let source: any PennyV4Input
        init(_ source: any PennyV4Input) { self.source = source }
        func read(upToCount count: Int) throws -> Data { try source.read(maximum: count) }
    }
}
