import Clibsodium
import CryptoKit
import Foundation
import Security

// EXPERIMENTAL: authenticates frames only. No ledger/schema/image validation.
// All APIs are synchronous. A call owns its native state on its calling thread;
// callers must put bulk work off the UI thread and provide isolated sinks.
enum V4FrameError: Error, Equatable {
    case primitiveMismatch, invalidRecoveryKey, randomness, invalidHeader
    case truncated, invalidSequence, invalidLength, invalidTag, authentication
    case trailingBytes, capacity, sourceViolation, emptyPlaintext, closed
}

protocol V4FrameInput: AnyObject {
    /// Return at most the requested count. Empty Data means actual EOF only.
    func read(upToCount count: Int) throws -> Data
}

protocol V4CiphertextSink: AnyObject {
    func write(_ bytes: Data) throws
    func finish() throws
    /// Idempotent; remove only this operation's partial ciphertext.
    func discard()
}

protocol V4IsolatedPlaintextSink: AnyObject {
    /// Borrowed authenticated frame bytes. Stage encrypted data or consume in
    /// memory; never activate records or create plaintext files. A later frame,
    /// finality, EOF, cancellation or logical validator may still reject them.
    func appendAuthenticated(_ bytes: Data, sequence: Int64, final: Bool) throws
    /// This is frame completion only, NEVER a valid archive/restore approval.
    func finishFrames(_ summary: V4FrameSummary) throws
    func discard()
}

struct V4FrameSummary: Equatable {
    let frameCount: Int
    let plaintextBytes: Int64
    let ciphertextBytes: Int64
    let plaintextSHA256: String
}

private final class SecretBytes {
    let pointer: UnsafeMutablePointer<UInt8>
    let count: Int
    private var closed = false
    init(count: Int) {
        self.count = count
        pointer = .allocate(capacity: count)
        pointer.initialize(repeating: 0, count: count)
    }
    func close() {
        guard !closed else { return }
        sodium_memzero(pointer, count)
        pointer.deinitialize(count: count)
        pointer.deallocate()
        closed = true
    }
    deinit { close() }
}

private final class StreamState {
    let pointer: UnsafeMutablePointer<crypto_secretstream_xchacha20poly1305_state>
    private var closed = false
    init() {
        pointer = .allocate(capacity: 1)
        pointer.initialize(to: crypto_secretstream_xchacha20poly1305_state())
    }
    func close() {
        guard !closed else { return }
        sodium_memzero(pointer, MemoryLayout<crypto_secretstream_xchacha20poly1305_state>.size)
        pointer.deinitialize(count: 1)
        pointer.deallocate()
        closed = true
    }
    deinit { close() }
}

private final class BoundedReader {
    let input: any V4FrameInput
    let maximum: Int64
    let checkCancellation: () throws -> Void
    private(set) var consumed: Int64 = 0
    init(_ input: any V4FrameInput, maximum: Int64, cancellation: @escaping () throws -> Void) {
        self.input = input; self.maximum = maximum; checkCancellation = cancellation
    }
    func read(_ count: Int) throws -> Data {
        try checkCancellation()
        guard count > 0, count <= 65_536 else { throw V4FrameError.sourceViolation }
        let bytes = try input.read(upToCount: count)
        guard bytes.count <= count else { throw V4FrameError.sourceViolation }
        let (next, overflow) = consumed.addingReportingOverflow(Int64(bytes.count))
        guard !overflow, next <= maximum else { throw V4FrameError.capacity }
        consumed = next
        try checkCancellation()
        return bytes
    }
    func block(_ count: Int, prefix: Data = Data(), requireFull: Bool) throws -> Data {
        guard count >= prefix.count, count <= V4FrameCodec.maximumCiphertextChunk else { throw V4FrameError.invalidLength }
        var result = prefix
        result.reserveCapacity(count)
        while result.count < count {
            let bytes = try read(min(65_536, count - result.count))
            if bytes.isEmpty { break }
            result.append(bytes)
        }
        guard !requireFull || result.count == count else { throw V4FrameError.truncated }
        return result
    }
}

enum V4FrameCodec {
    static let chunkBytes = 1_048_576
    static let maximumCiphertextChunk = chunkBytes + 17
    static let maximumPlaintext: Int64 = 671_088_640
    static let maximumFile: Int64 = 805_306_368
    static let maximumFrames = 640
    static let magic = Data("PNYBKP4\n".utf8)
    static let prefix = magic + Data([0, 4, 0, 16, 0, 0])
    static let context = "PENNY-OFFLINE-BACKUP:4:SECRETSTREAM"
    static let aadDomain = Data("PENNY-OFFLINE-BACKUP:4:FRAME\0".utf8)
    // Exact ECMAScript trim set retained by the native legacy key parser.
    private static let wireWhitespace = CharacterSet(charactersIn: "\u{0009}\u{000B}\u{000C}\u{0020}\u{00A0}\u{1680}\u{2000}\u{2001}\u{2002}\u{2003}\u{2004}\u{2005}\u{2006}\u{2007}\u{2008}\u{2009}\u{200A}\u{202F}\u{205F}\u{3000}\u{FEFF}\u{000A}\u{000D}\u{2028}\u{2029}")

    private static func checkPrimitives() throws {
        guard sodium_init() >= 0,
              crypto_secretstream_xchacha20poly1305_keybytes() == 32,
              crypto_secretstream_xchacha20poly1305_headerbytes() == 24,
              crypto_secretstream_xchacha20poly1305_abytes() == 17,
              crypto_secretstream_xchacha20poly1305_tag_message() == 0,
              crypto_secretstream_xchacha20poly1305_tag_final() == 3,
              crypto_kdf_hkdf_sha256_keybytes() == 32 else { throw V4FrameError.primitiveMismatch }
    }

    private static func key(_ recoveryKey: String, salt: Data) throws -> SecretBytes {
        guard salt.count == 32 else { throw V4FrameError.invalidHeader }
        let text = recoveryKey.trimmingCharacters(in: wireWhitespace)
        guard text.utf8.count == 69, text.hasPrefix("pny1-") else { throw V4FrameError.invalidRecoveryKey }
        let root = SecretBytes(count: 32), prk = SecretBytes(count: 32)
        defer { root.close(); prk.close() }
        let hex = Array(text.utf8.dropFirst(5))
        func nibble(_ value: UInt8) throws -> UInt8 {
            if (48...57).contains(value) { return value - 48 }
            if (97...102).contains(value) { return value - 87 }
            throw V4FrameError.invalidRecoveryKey
        }
        for index in 0..<32 { root.pointer[index] = try nibble(hex[index * 2]) * 16 + nibble(hex[index * 2 + 1]) }
        let extracted = salt.withUnsafeBytes { bytes in
            crypto_kdf_hkdf_sha256_extract(prk.pointer, bytes.baseAddress, bytes.count, root.pointer, 32)
        }
        guard extracted == 0 else { throw V4FrameError.primitiveMismatch }
        let derived = SecretBytes(count: 32)
        guard crypto_kdf_hkdf_sha256_expand(derived.pointer, 32, context, context.utf8.count, prk.pointer) == 0 else {
            derived.close(); throw V4FrameError.primitiveMismatch
        }
        return derived
    }

    static func encoded(_ value: UInt64) -> Data {
        Data((0..<8).reversed().map { UInt8(truncatingIfNeeded: value >> ($0 * 8)) })
    }
    private static func integer(_ data: Data) throws -> Int64 {
        guard data.count == 8 else { throw V4FrameError.truncated }
        let value = data.reduce(UInt64(0)) { ($0 << 8) | UInt64($1) }
        guard value <= UInt64(Int64.max) else { throw V4FrameError.invalidLength }
        return Int64(value)
    }
    private static func wipe(_ data: inout Data) {
        data.withUnsafeMutableBytes { bytes in if let base = bytes.baseAddress { sodium_memzero(base, bytes.count) } }
    }

    /// Seal arbitrary nonempty plaintext frames. Output is NOT thereby a valid
    /// Penny backup. Caller must supply a pinned logical source in a later layer.
    static func seal(input: any V4FrameInput, output: any V4CiphertextSink, recoveryKey: String,
                     cancellation: @escaping () throws -> Void = { try Task.checkCancellation() }) throws -> V4FrameSummary {
        var completed = false
        defer { if !completed { output.discard() } }
        try checkPrimitives(); try cancellation()
        let state = StreamState(); defer { state.close() }
        var salt = Data(count: 32)
        let randomStatus = salt.withUnsafeMutableBytes { SecRandomCopyBytes(kSecRandomDefault, 32, $0.baseAddress!) }
        guard randomStatus == errSecSuccess else { throw V4FrameError.randomness }
        let derived = try key(recoveryKey, salt: salt)
        defer { derived.close() }
        var streamHeader = Data(count: 24)
        let initialized = streamHeader.withUnsafeMutableBytes {
            crypto_secretstream_xchacha20poly1305_init_push(state.pointer, $0.bindMemory(to: UInt8.self).baseAddress!, derived.pointer)
        }
        guard initialized == 0 else { throw V4FrameError.primitiveMismatch }
        derived.close()
        let header = prefix + salt + streamHeader
        let reader = BoundedReader(input, maximum: maximumPlaintext, cancellation: cancellation)
        var current = try reader.block(chunkBytes, requireFull: false)
        defer { wipe(&current) }
        guard !current.isEmpty else { throw V4FrameError.emptyPlaintext }
        try cancellation(); try output.write(header)
        var fileBytes: Int64 = 70, plaintextBytes: Int64 = 0, sequence = 0
        var hash = SHA256()
        while true {
            guard sequence < maximumFrames else { throw V4FrameError.capacity }
            let lookahead = try reader.read(1)
            let final = lookahead.isEmpty
            guard final || current.count == chunkBytes else { throw V4FrameError.sourceViolation }
            let frameHeader = encoded(UInt64(sequence)) + encoded(UInt64(current.count + 17))
            let aad = aadDomain + header + frameHeader
            var ciphertext = Data(count: current.count + 17), written: UInt64 = 0
            try cancellation()
            let status = ciphertext.withUnsafeMutableBytes { out in
                current.withUnsafeBytes { plain in
                    aad.withUnsafeBytes { authenticated in
                        crypto_secretstream_xchacha20poly1305_push(state.pointer, out.bindMemory(to: UInt8.self).baseAddress!, &written,
                            plain.bindMemory(to: UInt8.self).baseAddress!, UInt64(plain.count), authenticated.bindMemory(to: UInt8.self).baseAddress!,
                            UInt64(authenticated.count), final ? 3 : 0)
                    }
                }
            }
            guard status == 0, written == UInt64(ciphertext.count) else { throw V4FrameError.primitiveMismatch }
            let (nextFile, overflow) = fileBytes.addingReportingOverflow(Int64(16 + ciphertext.count))
            guard !overflow, nextFile <= maximumFile else { throw V4FrameError.capacity }
            try cancellation(); try output.write(frameHeader); try cancellation(); try output.write(ciphertext)
            fileBytes = nextFile; plaintextBytes += Int64(current.count); hash.update(data: current); sequence += 1
            wipe(&current)
            if final { break }
            current = try reader.block(chunkBytes, prefix: lookahead, requireFull: false)
        }
        try cancellation(); try output.finish(); try cancellation()
        let summary = V4FrameSummary(frameCount: sequence, plaintextBytes: plaintextBytes, ciphertextBytes: fileBytes,
                                     plaintextSHA256: hash.finalize().map { String(format: "%02x", $0) }.joined())
        completed = true
        return summary
    }

    /// Only authenticated frames reach the isolated sink. On any later failure,
    /// discard is mandatory. Completion says nothing about BEGIN/END or receipts.
    static func open(input: any V4FrameInput, candidate: any V4IsolatedPlaintextSink, recoveryKey: String,
                     cancellation: @escaping () throws -> Void = { try Task.checkCancellation() }) throws -> V4FrameSummary {
        var completed = false
        defer { if !completed { candidate.discard() } }
        try checkPrimitives(); try cancellation()
        let reader = BoundedReader(input, maximum: maximumFile, cancellation: cancellation)
        let header = try reader.block(70, requireFull: true)
        guard header.prefix(14) == prefix else { throw V4FrameError.invalidHeader }
        let derived = try key(recoveryKey, salt: header.subdata(in: 14..<46))
        defer { derived.close() }
        let state = StreamState(); defer { state.close() }
        let streamHeader = header.subdata(in: 46..<70)
        let initialized = streamHeader.withUnsafeBytes {
            crypto_secretstream_xchacha20poly1305_init_pull(state.pointer, $0.bindMemory(to: UInt8.self).baseAddress!, derived.pointer)
        }
        guard initialized == 0 else { throw V4FrameError.invalidHeader }
        derived.close()
        var sequence = 0, plaintextBytes: Int64 = 0, hash = SHA256()
        while true {
            guard sequence < maximumFrames else { throw V4FrameError.capacity }
            let frameHeader = try reader.block(16, requireFull: true)
            guard try integer(frameHeader.prefix(8)) == Int64(sequence) else { throw V4FrameError.invalidSequence }
            let declared = try integer(frameHeader.suffix(8))
            guard (18...Int64(maximumCiphertextChunk)).contains(declared) else { throw V4FrameError.invalidLength }
            let (nextPlaintext, overflow) = plaintextBytes.addingReportingOverflow(declared - 17)
            guard !overflow, nextPlaintext <= maximumPlaintext else { throw V4FrameError.capacity }
            let ciphertext = try reader.block(Int(declared), requireFull: true)
            let aad = aadDomain + header + frameHeader
            var plaintext = Data(count: Int(declared) - 17), length: UInt64 = 0, tag: UInt8 = 0
            defer { wipe(&plaintext) }
            try cancellation()
            let status = plaintext.withUnsafeMutableBytes { out in
                ciphertext.withUnsafeBytes { encrypted in
                    aad.withUnsafeBytes { authenticated in
                        crypto_secretstream_xchacha20poly1305_pull(state.pointer, out.bindMemory(to: UInt8.self).baseAddress!, &length, &tag,
                            encrypted.bindMemory(to: UInt8.self).baseAddress!, UInt64(encrypted.count), authenticated.bindMemory(to: UInt8.self).baseAddress!, UInt64(authenticated.count))
                    }
                }
            }
            guard status == 0 else { throw V4FrameError.authentication }
            guard length == UInt64(plaintext.count) else { throw V4FrameError.invalidLength }
            guard tag == 0 || tag == 3 else { throw V4FrameError.invalidTag }
            guard tag == 3 || plaintext.count == chunkBytes else { throw V4FrameError.invalidLength }
            plaintextBytes = nextPlaintext; hash.update(data: plaintext)
            try cancellation()
            try candidate.appendAuthenticated(plaintext, sequence: Int64(sequence), final: tag == 3)
            sequence += 1
            if tag == 3 {
                guard try reader.read(1).isEmpty else { throw V4FrameError.trailingBytes }
                let summary = V4FrameSummary(frameCount: sequence, plaintextBytes: plaintextBytes, ciphertextBytes: reader.consumed,
                                             plaintextSHA256: hash.finalize().map { String(format: "%02x", $0) }.joined())
                try cancellation(); try candidate.finishFrames(summary); try cancellation()
                completed = true
                return summary
            }
        }
    }
}
