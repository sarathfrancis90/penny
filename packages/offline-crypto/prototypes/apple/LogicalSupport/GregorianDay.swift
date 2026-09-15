// Frozen stateless prototype support from apps/ios/PennyOffline/FinanceEngine.swift; see source-provenance.json.
import Foundation

/// Gregorian integer-day arithmetic avoids Foundation's historical calendar cutover.
enum GregorianDay {
    static func components(_ civil: String) -> (year: Int, month: Int, day: Int) {
        let values = civil.split(separator: "-").map { Int($0)! }
        return (values[0], values[1], values.count == 3 ? values[2] : 1)
    }
    static func daysInMonth(_ year: Int, _ month: Int) -> Int {
        [31, year % 4 == 0 && (year % 100 != 0 || year % 400 == 0) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1]
    }
    static func ordinal(_ civil: String) -> Int {
        let c = components(civil); let y = c.year - 1
        return y * 365 + y / 4 - y / 100 + y / 400 + (1..<c.month).reduce(0) { $0 + daysInMonth(c.year, $1) } + c.day - 1
    }
    static func civil(_ ordinal: Int) -> String {
        var low = 1, high = 9_999
        while low < high {
            let mid = (low + high + 1) / 2
            if self.ordinal(String(format: "%04d-01-01", mid)) <= ordinal { low = mid } else { high = mid - 1 }
        }
        var remaining = ordinal - self.ordinal(String(format: "%04d-01-01", low)), month = 1
        while remaining >= daysInMonth(low, month) { remaining -= daysInMonth(low, month); month += 1 }
        return String(format: "%04d-%02d-%02d", low, month, remaining + 1)
    }
    static func validMonth(_ month: String) -> Bool { month.utf8.count == 7 && CivilDate.validDate(month + "-01") }
    static func moveMonth(_ month: String, by delta: Int) -> String? {
        guard validMonth(month) else { return nil }
        let c = components(month); let index = (c.year - 1) * 12 + c.month - 1 + delta
        guard (0..<119_988).contains(index) else { return nil }
        return String(format: "%04d-%02d", index / 12 + 1, index % 12 + 1)
    }
}
