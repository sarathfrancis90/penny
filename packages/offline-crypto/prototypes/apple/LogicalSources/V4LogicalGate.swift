import CryptoKit
import Foundation

enum V4LogicalError: Error { case json, order, bound, identity, transcript, incomplete, receipt }

struct V4LogicalSummary {
    let snapshotId: String
    let vaultId: String
    let createdAt: String
    let counts: [String: Int64]
    let receiptBytes: Int64
    let nonReceiptBytes: Int64
    let policyMetadataBytes: Int64
    let recordCount: Int64
    let streamSha256: String
}

struct V4LogicalBegin {
    let snapshotId: String, vaultId: String, createdAt: String
    let counts: [String: Int64]
    let receiptBytes: Int64, nonReceiptBytes: Int64
}

/// Mandatory semantic validation and isolated staging. No implementation may
/// activate data. Every callback, including finish, must be reversible by discard.
protocol V4LogicalValidationSink: AnyObject {
    func begin(_ metadata: V4LogicalBegin) throws
    func validateDomain(kind: Int, json: Data) throws
    func beginReceipt(_ descriptor: V4ReceiptDescriptor) throws
    func appendReceipt(_ bytes: Data) throws
    /// Must perform complete native image decoding and ownership validation.
    func finishReceipt() throws
    /// Must reconcile cross-domain references, duplicates and financial totals.
    func finishLogical(_ summary: V4LogicalSummary) throws
    func discard()
}

struct V4ReceiptDescriptor {
    let id: String, expenseId: String, mediaType: String, sha256: String
    let byteCount: Int64
}

/// Only this entry point constructs the parser: callers cannot substitute fake
/// FINAL/EOF events. Result is a gate summary, never a restore authorization.
enum V4LogicalGate {
    static func read(input: any V4FrameInput, sink: any V4LogicalValidationSink, recoveryKey: String,
                     cancellation: @escaping () throws -> Void = { try Task.checkCancellation() }) throws -> V4LogicalSummary {
        let parser = Parser(sink: sink, cancellation: cancellation)
        _ = try V4FrameCodec.open(input: input, candidate: parser, recoveryKey: recoveryKey, cancellation: cancellation)
        guard let result = parser.result else { sink.discard(); throw V4LogicalError.incomplete }
        return result
    }

    private final class Parser: V4IsolatedPlaintextSink {
        static let names = ["budgets", "incomeSources", "incomeEntries", "savingsGoals", "savingsEntries", "recurringExpenses", "expenses", "attachments"]
        static let limits: [Int64] = [1200, 1000, 10000, 1000, 10000, 1000, 50000, 5000]
        static let beginKeys: Set<String> = ["schemaVersion", "capacityProfile", "snapshotId", "vaultId", "createdAt", "counts", "receiptBytes", "nonReceiptBytes"]
        static let endKeys: Set<String> = ["snapshotId", "counts", "receiptBytes", "nonReceiptBytes", "recordCount", "streamSha256"]
        static let receiptKeys: Set<String> = ["id", "expenseId", "mediaType", "byteCount", "sha256"]
        static let domainKeys: [Set<String>] = [Budget.keys, IncomeSource.keys, IncomeEntry.keys, SavingsGoal.keys, SavingsEntry.keys, RecurringExpense.keys,
            ["id", "merchant", "amountMinor", "currencyCode", "expenseDate", "category", "note", "createdAt", "updatedAt", "description", "recurringTemplateId", "recurringOccurrenceDate"]]
        let sink: any V4LogicalValidationSink
        let cancellation: () throws -> Void
        var header = Data(), payload = Data()
        var kind = 0, remaining: Int64 = 0, lastKind = 1
        var previousID: [Int: String] = [:], declared: [String: Int64] = [:], observed: [String: Int64] = [:]
        var snapshotID = "", rawDeclared: Int64 = 0, bodyDeclared: Int64 = 0
        var identity: V4LogicalBegin?
        var raw: Int64 = 0, body: Int64 = 0, metadata: Int64 = 0, records: Int64 = 0
        var transcript = SHA256(), receiptHash = SHA256()
        var pending: V4ReceiptDescriptor?, end: V4LogicalSummary?, result: V4LogicalSummary?
        init(sink: any V4LogicalValidationSink, cancellation: @escaping () throws -> Void) { self.sink = sink; self.cancellation = cancellation }

        func add(_ value: Int64, to counter: inout Int64, maximum: Int64) throws {
            let (sum, overflow) = counter.addingReportingOverflow(value)
            guard !overflow, sum <= maximum else { throw V4LogicalError.bound }; counter = sum
        }
        func integer(_ object: [String: Any], _ key: String, _ maximum: Int64) throws -> Int64 {
            guard let raw = object[key], type(of: raw) == Double.self, let value = raw as? Double, value >= 0, value <= Double(maximum), value.rounded() == value else { throw V4LogicalError.json }
            return Int64(value)
        }
        func string(_ object: [String: Any], _ key: String) throws -> String {
            guard let value = object[key] as? String else { throw V4LogicalError.json }; return value
        }
        func uuid(_ value: String) throws { try FinanceValidation.uuid(value) }
        func counts(_ object: [String: Any]) throws -> [String: Int64] {
            guard let counts = object["counts"] as? [String: Any], Set(counts.keys) == Set(Self.names) else { throw V4LogicalError.json }
            return try Dictionary(uniqueKeysWithValues: zip(Self.names, Self.limits).map { name, limit in (name, try integer(counts, name, limit)) })
        }
        func parse(_ bytes: Data, keys: Set<String>) throws -> [String: Any] {
            try V4ExactNumbers.validate(bytes)
            return try V4RecordJSON.object(bytes, keys: keys)
        }
        func admitHeader() throws {
            kind = Int(header[0])
            let wire = header.dropFirst().reduce(UInt64(0)) { ($0 << 8) | UInt64($1) }
            guard wire <= UInt64(Int64.max), wire > 0 else { throw V4LogicalError.bound }
            remaining = Int64(wire)
            guard (1...11).contains(kind), end == nil, records < 84_202 else { throw V4LogicalError.order }
            if snapshotID.isEmpty { guard kind == 1 else { throw V4LogicalError.order } }
            else if pending != nil { guard kind == 10 else { throw V4LogicalError.order } }
            else { guard kind != 1 && kind != 10 && kind >= lastKind else { throw V4LogicalError.order } }
            if kind == 10 {
                guard let pending, remaining == pending.byteCount else { throw V4LogicalError.receipt }
                try add(remaining, to: &raw, maximum: min(536_870_912, rawDeclared))
            } else { guard remaining <= 65_536 else { throw V4LogicalError.bound } }
            try add(9, to: &metadata, maximum: 134_217_728)
            if kind != 1 && kind != 11 { try add(9, to: &body, maximum: bodyDeclared) }
            if kind != 11 { transcript.update(data: header) }
            payload.removeAll(keepingCapacity: true)
        }
        func completeRecord(final: Bool, atEndOfFrame: Bool) throws {
            if kind == 10 {
                guard receiptHash.finalize().map({ String(format: "%02x", $0) }).joined() == pending?.sha256 else { throw V4LogicalError.receipt }
                try sink.finishReceipt(); pending = nil; lastKind = 9
            } else {
                let keys = kind == 1 ? Self.beginKeys : kind == 11 ? Self.endKeys : kind == 9 ? Self.receiptKeys : Self.domainKeys[kind - 2]
                let object = try parse(payload, keys: keys)
                if kind == 1 {
                    guard try integer(object, "schemaVersion", 4) == 4, try string(object, "capacityProfile") == "A" else { throw V4LogicalError.json }
                    snapshotID = try string(object, "snapshotId"); try uuid(snapshotID); try uuid(string(object, "vaultId"))
                    guard try CivilDate.validTimestamp(string(object, "createdAt")) else { throw V4LogicalError.json }
                    declared = try counts(object); observed = Dictionary(uniqueKeysWithValues: Self.names.map { ($0, 0) })
                    rawDeclared = try integer(object, "receiptBytes", 536_870_912)
                    bodyDeclared = try integer(object, "nonReceiptBytes", 134_217_728)
                    let begin = V4LogicalBegin(snapshotId: snapshotID, vaultId: try string(object, "vaultId"), createdAt: try string(object, "createdAt"), counts: declared, receiptBytes: rawDeclared, nonReceiptBytes: bodyDeclared)
                    identity = begin; try sink.begin(begin)
                } else if kind == 11 {
                    guard final, atEndOfFrame, try string(object, "snapshotId") == snapshotID,
                          try counts(object) == declared, observed == declared,
                          try integer(object, "receiptBytes", 536_870_912) == rawDeclared, raw == rawDeclared,
                          try integer(object, "nonReceiptBytes", 134_217_728) == bodyDeclared, body == bodyDeclared,
                          try integer(object, "recordCount", 84_201) == records else { throw V4LogicalError.incomplete }
                    let digest = transcript.finalize().map { String(format: "%02x", $0) }.joined()
                    guard try string(object, "streamSha256") == digest else { throw V4LogicalError.transcript }
                    guard let identity else { throw V4LogicalError.incomplete }
                    end = V4LogicalSummary(snapshotId: snapshotID, vaultId: identity.vaultId, createdAt: identity.createdAt, counts: observed, receiptBytes: raw, nonReceiptBytes: body, policyMetadataBytes: metadata, recordCount: records, streamSha256: digest)
                } else {
                    let id = try string(object, "id"); try uuid(id)
                    guard previousID[kind].map({ $0 < id }) ?? true else { throw V4LogicalError.identity }; previousID[kind] = id
                    let name = Self.names[kind - 2]
                    var count = observed[name] ?? 0; try add(1, to: &count, maximum: declared[name] ?? 0); observed[name] = count
                    if kind == 9 {
                        let owner = try string(object, "expenseId"); try uuid(owner)
                        let length = try integer(object, "byteCount", 2_097_152), media = try string(object, "mediaType"), sha = try string(object, "sha256")
                        guard length > 0, ["image/png", "image/jpeg"].contains(media), sha.range(of: "^[0-9a-f]{64}$", options: .regularExpression) != nil else { throw V4LogicalError.receipt }
                        let descriptor = V4ReceiptDescriptor(id: id, expenseId: owner, mediaType: media, sha256: sha, byteCount: length)
                        pending = descriptor; receiptHash = SHA256(); try sink.beginReceipt(descriptor)
                    } else {
                        if kind == 3 || kind == 7 {
                            guard let schedule = object["schedule"] as? [String: Any], Set(schedule.keys) == FinanceSchedule.keys else { throw V4LogicalError.json }
                        }
                        try sink.validateDomain(kind: kind, json: payload)
                    }
                    lastKind = kind
                }
            }
            records += 1; header.removeAll(keepingCapacity: true); payload.removeAll(keepingCapacity: true); remaining = 0
        }
        func appendAuthenticated(_ bytes: Data, sequence: Int64, final: Bool) throws {
            var offset = 0
            while offset < bytes.count {
                try cancellation(); guard end == nil else { throw V4LogicalError.order }
                if header.count < 9 {
                    let count = min(9 - header.count, bytes.count - offset)
                    header.append(bytes.subdata(in: offset..<offset + count)); offset += count
                    if header.count < 9 { break }; try admitHeader()
                }
                let count = min(Int(remaining), bytes.count - offset, 65_536)
                if count == 0 { break }
                let part = bytes.subdata(in: offset..<offset + count); offset += count; remaining -= Int64(count)
                if kind != 11 { transcript.update(data: part) }
                if kind == 10 { receiptHash.update(data: part); try sink.appendReceipt(part) }
                else {
                    try add(Int64(count), to: &metadata, maximum: 134_217_728)
                    if kind != 1 && kind != 11 { try add(Int64(count), to: &body, maximum: bodyDeclared) }
                    payload.append(part)
                }
                if remaining == 0 { try completeRecord(final: final, atEndOfFrame: offset == bytes.count) }
            }
            if final { guard end != nil, header.isEmpty, pending == nil else { throw V4LogicalError.incomplete } }
        }
        func finishFrames(_ summary: V4FrameSummary) throws {
            guard let end, header.isEmpty, pending == nil, summary.plaintextBytes == raw + metadata else { throw V4LogicalError.incomplete }
            try cancellation(); try sink.finishLogical(end); try cancellation(); result = end
        }
        func discard() { sink.discard(); result = nil; end = nil; identity = nil; payload.resetBytes(in: 0..<payload.count); payload.removeAll(); header.removeAll() }
    }
}

/// Reject integer tokens that binary floating point could round into validity.
/// All numbers in these closed schemas are nonnegative integers <= 10^15-1.
enum V4ExactNumbers {
    static func validate(_ data: Data) throws {
        let bytes = Array(data); var index = 0, quoted = false
        while index < bytes.count {
            let byte = bytes[index]
            if quoted { if byte == 92 { index += 2; continue }; if byte == 34 { quoted = false }; index += 1; continue }
            if byte == 34 { quoted = true; index += 1; continue }
            if byte == 45 || (48...57).contains(byte) {
                let start = index
                while index < bytes.count && ![9, 10, 13, 32, 44, 93, 125].contains(bytes[index]) { index += 1 }
                try integer(String(decoding: bytes[start..<index], as: UTF8.self))
            } else { index += 1 }
        }
    }
    static func integer(_ token: String) throws {
        guard token.range(of: #"^-?(0|[1-9][0-9]*)(\.[0-9]+)?([eE][+-]?[0-9]+)?$"#, options: .regularExpression) != nil else { throw V4LogicalError.json }
        let parts = token.lowercased().split(separator: "e"), significand = String(parts[0])
        let decimal = significand.split(separator: "."), fractional = decimal.count == 2 ? decimal[1].count : 0
        var digits = significand.filter { $0.isNumber }; digits.removeFirst(min(digits.prefix(while: { $0 == "0" }).count, digits.count))
        if digits.isEmpty { return }
        guard !significand.hasPrefix("-") else { throw V4LogicalError.json }
        var exponent = 0
        if parts.count == 2 {
            let raw = String(parts[1]); let negative = raw.hasPrefix("-")
            for byte in raw.utf8 where (48...57).contains(byte) { exponent = min(1_000_000, exponent * 10 + Int(byte - 48)) }
            if negative { exponent = -exponent }
        }
        let shift = exponent - fractional
        if shift < 0 {
            guard -shift <= digits.count, digits.suffix(-shift).allSatisfy({ $0 == "0" }) else { throw V4LogicalError.json }
            digits.removeLast(-shift)
        } else {
            guard digits.count + shift <= 15 else { throw V4LogicalError.bound }
            digits += String(repeating: "0", count: shift)
        }
        guard let value = Int64(digits), value <= 999_999_999_999_999 else { throw V4LogicalError.bound }
    }
}
