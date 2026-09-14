import Foundation

public protocol PennyV4Output: AnyObject {
    func write(_ bytes: Data) throws
    /// Synchronize and close before returning; failure is visible to the caller.
    func finish() throws
    func discard()
}
public struct PennyV4FrameWriteSummary: Sendable {
    public let plaintextBytes: Int64, ciphertextBytes: Int64, plaintextSHA256: String
}
/// Existing primitive only: caller must supply a logical writer and independently
/// reopen/validate output. Frame completion never authorizes backup export.
public enum PennyV4FrameWriter {
    public static func seal(source: any PennyV4Input, output: any PennyV4Output, recoveryKey: String,
                            cancellation: @escaping () throws -> Void = { try Task.checkCancellation() }) throws -> PennyV4FrameWriteSummary {
        var closed = false, completed = false
        defer { if !closed { try? source.close() }; if !completed { output.discard() } }
        let result = try V4FrameCodec.seal(input: Input(source), output: Output(output), recoveryKey: recoveryKey, cancellation: cancellation)
        closed = true; try source.close(); try cancellation(); completed = true
        return PennyV4FrameWriteSummary(plaintextBytes: result.plaintextBytes, ciphertextBytes: result.ciphertextBytes, plaintextSHA256: result.plaintextSHA256)
    }
    private final class Input: V4FrameInput {
        let held: any PennyV4Input
        init(_ held: any PennyV4Input) { self.held = held }
        func read(upToCount count: Int) throws -> Data { try held.read(maximum: count) }
    }
    private final class Output: V4CiphertextSink {
        let held: any PennyV4Output
        init(_ held: any PennyV4Output) { self.held = held }
        func write(_ bytes: Data) throws { try held.write(bytes) }
        func finish() throws { try held.finish() }
        func discard() { held.discard() }
    }
}
