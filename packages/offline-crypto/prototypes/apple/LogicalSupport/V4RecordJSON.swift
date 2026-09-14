// Frozen stateless prototype support from apps/ios/PennyOffline/StrictJSON.swift; see source-provenance.json.
import Foundation
import Darwin

/// Reject duplicate members (including escaped aliases) before Foundation decodes.
enum V4RecordJSON {
    static func object(_ data: Data, keys: Set<String>) throws -> [String: Any] {
        var parser = Scanner(bytes: Array(data))
        try parser.value(depth: 0)
        parser.whitespace()
        guard parser.index == parser.bytes.count,
              let object = try JSONDecoder().decode(InspectableJSON.self, from: data).value as? [String: Any],
              Set(object.keys) == keys else { throw ExpenseError.invalidSnapshot }
        return object
    }
    private enum InspectableJSON: Decodable {
        case object([String: InspectableJSON]), array([InspectableJSON]), string(String), number(Double), boolean(Bool), null
        struct Key: CodingKey {
            let stringValue: String
            var intValue: Int? { nil }
            init?(stringValue: String) { self.stringValue = stringValue }
            init?(intValue: Int) { return nil }
        }
        init(from decoder: Decoder) throws {
            if let object = try? decoder.container(keyedBy: Key.self) {
                var fields: [String: InspectableJSON] = [:]
                for key in object.allKeys { fields[key.stringValue] = try object.decode(Self.self, forKey: key) }
                self = .object(fields)
            } else if var array = try? decoder.unkeyedContainer() {
                var values: [InspectableJSON] = []
                while !array.isAtEnd { values.append(try array.decode(Self.self)) }
                self = .array(values)
            } else {
                let c = try decoder.singleValueContainer()
                if c.decodeNil() { self = .null }
                else if let value = try? c.decode(String.self) { self = .string(value) }
                else if let value = try? c.decode(Bool.self) { self = .boolean(value) }
                else { self = .number(try c.decode(Double.self)) }
            }
        }
        var value: Any {
            switch self {
            case .object(let fields): fields.mapValues(\.value)
            case .array(let values): values.map(\.value)
            case .string(let value): value
            case .number(let value): value
            case .boolean(let value): value
            case .null: NSNull()
            }
        }
    }
    private struct Scanner {
        let bytes: [UInt8]
        var index = 0
        mutating func whitespace() { while index < bytes.count && [9, 10, 13, 32].contains(bytes[index]) { index += 1 } }
        mutating func take(_ byte: UInt8) throws { whitespace(); guard index < bytes.count, bytes[index] == byte else { throw ExpenseError.invalidSnapshot }; index += 1 }
        mutating func string() throws -> String {
            whitespace(); let start = index
            try take(34)
            var escaped = false
            while index < bytes.count {
                let byte = bytes[index]; index += 1
                guard byte >= 32 else { throw ExpenseError.invalidSnapshot }
                if byte == 92 { escaped = true; guard index < bytes.count else { throw ExpenseError.invalidSnapshot }; index += 1 }
                else if byte == 34 {
                    if escaped { return try JSONDecoder().decode(String.self, from: Data(bytes[start..<index])) }
                    guard let value = String(validating: bytes[start + 1..<index - 1], as: UTF8.self) else { throw ExpenseError.invalidSnapshot }
                    return value
                }
            }
            throw ExpenseError.invalidSnapshot
        }
        mutating func value(depth: Int) throws {
            whitespace()
            guard depth <= 32, index < bytes.count else { throw ExpenseError.invalidSnapshot }
            switch bytes[index] {
            case 123:
                index += 1; whitespace(); var keys = Set<String>()
                if index < bytes.count, bytes[index] == 125 { index += 1; return }
                while true {
                    let key = try string(); guard keys.insert(key).inserted else { throw ExpenseError.invalidSnapshot }
                    try take(58); try value(depth: depth + 1); whitespace()
                    if index < bytes.count, bytes[index] == 125 { index += 1; return }; try take(44)
                }
            case 91:
                index += 1; whitespace()
                if index < bytes.count, bytes[index] == 93 { index += 1; return }
                while true {
                    try value(depth: depth + 1); whitespace()
                    if index < bytes.count, bytes[index] == 93 { index += 1; return }; try take(44)
                }
            case 34: _ = try string()
            default:
                let start = index
                while index < bytes.count && ![9, 10, 13, 32, 44, 93, 125].contains(bytes[index]) { index += 1 }
                guard start < index else { throw ExpenseError.invalidSnapshot }
            }
        }
    }
}
