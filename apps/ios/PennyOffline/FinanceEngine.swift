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

extension FinanceSchedule {
    func contains(_ date: String, enabled: Bool = true) -> Bool {
        guard CivilDate.validDate(date), date >= startDate, endDate == nil || date <= endDate! else { return false }
        if !enabled || frequency == "once" { return date == startDate }
        let distance = GregorianDay.ordinal(date) - GregorianDay.ordinal(startDate)
        if frequency == "weekly" { return distance % 7 == 0 }
        if frequency == "biweekly" { return distance % 14 == 0 }
        let start = GregorianDay.components(startDate), current = GregorianDay.components(date)
        let day = min(dayOfMonth ?? start.day, GregorianDay.daysInMonth(current.year, current.month))
        return current.day == day && (frequency == "monthly" || frequency == "yearly" && current.month == start.month)
    }
    func occurrences(from: String, to: String, enabled: Bool = true) throws -> [String] {
        try validate()
        try FinanceValidation.require(CivilDate.validDate(from) && CivilDate.validDate(to) && from <= to)
        let start = GregorianDay.ordinal(from), end = GregorianDay.ordinal(to)
        try FinanceValidation.require(end - start <= 366)
        return (start...end).map(GregorianDay.civil).filter { contains($0, enabled: enabled) }
    }
}

struct BudgetPosition: Identifiable {
    let budget: Budget
    let carry: Int64
    let available: Int64
    let spent: Int64
    var id: String { budget.id }
    var remaining: Int64 { available - spent }
    var thresholdReached: Bool {
        guard spent > 0 else { return false }
        if available == 0 { return true }
        let bps = Int64(budget.alertThresholdBps)
        let threshold = available / 10_000 * bps + (available % 10_000 * bps + 9_999) / 10_000
        return spent >= threshold
    }
}
struct MonthlyReport {
    let expenses: Int64
    let received: Int64
    let contributions: Int64
    let categories: [(category: String, amount: Int64)]
    let incomeCategories: [(category: String, amount: Int64)]
    var net: Int64 { received - expenses }
}
struct SavingsPosition {
    let current: Int64
    let remaining: Int64
    let progressBps: Int64
}
enum FinanceEngine {
    static func report(_ snapshot: VaultSnapshot, month: String) -> MonthlyReport {
        let expenses = snapshot.expenses.filter { $0.expenseDate.hasPrefix(month + "-") }
        let sources = Dictionary(uniqueKeysWithValues: snapshot.incomeSources.map { ($0.id, $0.category) })
        let received = snapshot.incomeEntries.filter { $0.receivedDate.hasPrefix(month + "-") }
        return MonthlyReport(expenses: expenses.reduce(0) { $0 + $1.amountMinor },
            received: snapshot.incomeEntries.filter { $0.receivedDate.hasPrefix(month + "-") }.reduce(0) { $0 + $1.amountMinor },
            contributions: snapshot.savingsEntries.filter { $0.date.hasPrefix(month + "-") }.reduce(0) { $0 + $1.amountMinor },
            categories: Categories.all.map { category in (category, expenses.filter { $0.category == category }.reduce(0) { $0 + $1.amountMinor }) },
            incomeCategories: IncomeSource.categories.map { category in (category, received.filter { sources[$0.sourceId] == category }.reduce(0) { $0 + $1.amountMinor }) })
    }
    static func budgets(_ snapshot: VaultSnapshot, month: String) -> [BudgetPosition] {
        var result: [BudgetPosition] = []
        for category in Categories.all {
            var previous: BudgetPosition?
            for budget in snapshot.budgets.filter({ $0.category == category && $0.month <= month }).sorted(by: { $0.month < $1.month }) {
                let spent = snapshot.expenses.filter { $0.category == category && $0.expenseDate.hasPrefix(budget.month + "-") }.reduce(Int64(0)) { $0 + $1.amountMinor }
                let carry: Int64
                if budget.rollover, let previous, let previousMonth = GregorianDay.moveMonth(budget.month, by: -1), previous.budget.month == previousMonth {
                    carry = max(0, previous.remaining)
                } else { carry = 0 }
                let position = BudgetPosition(budget: budget, carry: carry, available: budget.limitMinor + carry, spent: spent)
                previous = position
                if budget.month == month { result.append(position) }
            }
        }
        return result
    }
    static func savings(_ snapshot: VaultSnapshot, goal: SavingsGoal) -> SavingsPosition {
        let current = goal.openingMinor + snapshot.savingsEntries.filter { $0.goalId == goal.id }.reduce(0) { $0 + $1.amountMinor }
        return SavingsPosition(current: current, remaining: max(0, goal.targetMinor - current),
                               progressBps: current >= goal.targetMinor ? 10_000 : current * 10_000 / goal.targetMinor)
    }
    static func csvCell(_ text: String) -> String {
        let first = text.trimmingCharacters(in: FinanceValidation.wireWhitespace).first
        let unsafe = first.map { "=+-@".contains($0) } ?? false
        let value = (unsafe || text.first.map { "\t\r\n".contains($0) } ?? false) ? "'" + text : text
        return "\"" + value.replacingOccurrences(of: "\"", with: "\"\"") + "\""
    }
    static func csv(_ expenses: [Expense]) -> Data {
        var rows = [["id", "date", "merchant", "amount", "currency", "category", "description", "note"].map(csvCell).joined(separator: ",")]
        for expense in expenses.sorted(by: { $0.expenseDate == $1.expenseDate ? $0.id < $1.id : $0.expenseDate < $1.expenseDate }) {
            rows.append([expense.id, expense.expenseDate, expense.merchant, Money.input(expense.amountMinor), expense.currencyCode, expense.category, expense.description, expense.note].map(csvCell).joined(separator: ","))
        }
        return Data((rows.joined(separator: "\r\n") + "\r\n").utf8)
    }
}
