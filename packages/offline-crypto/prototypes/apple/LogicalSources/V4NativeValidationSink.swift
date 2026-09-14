import Foundation

/// Experimental validation-only sink. Retains bounded ID/uniqueness indexes and
/// at most one receipt, never a record graph or plaintext file. No candidate
/// database, persistence, commit, or release-validity claim is provided.
final class V4NativeValidationSink: V4LogicalValidationSink {
    private enum Lifecycle { case fresh, active, consumed }
    private var lifecycle = Lifecycle.fresh
    private var sources = Set<String>(), goals = Set<String>(), templates = Set<String>(), expenses = Set<String>()
    private var budgets = Set<String>(), incomeOccurrences = Set<String>(), expenseOccurrences = Set<String>()
    private var totals: [String: Int64] = [:], goalTotals: [String: Int64] = [:]
    private var receipt: V4ReceiptDescriptor?, bytes = Data()
    private(set) var completed = false, discarded = false, receiptCount = 0
    private(set) var metadata: V4LogicalBegin?
    var onBegin: (() throws -> Void)?
    var onFinish: (() throws -> Void)?
    func begin(_ metadata: V4LogicalBegin) throws {
        guard lifecycle == .fresh else { throw V4LogicalError.identity }
        lifecycle = .active
        self.metadata = metadata; try onBegin?()
    }
    func total(_ value: Int64, key: String) throws {
        totals[key] = try FinanceValidation.total([totals[key] ?? 0, value])
    }
    func validateDomain(kind: Int, json: Data) throws {
        guard lifecycle == .active else { throw V4LogicalError.order }
        let decoder = JSONDecoder()
        switch kind {
        case 2:
            let x = try decoder.decode(Budget.self, from: json); try x.validate()
            guard budgets.insert(x.category + "/" + x.month).inserted else { throw V4LogicalError.identity }
        case 3:
            let x = try decoder.decode(IncomeSource.self, from: json); try x.validate(); sources.insert(x.id)
        case 4:
            let x = try decoder.decode(IncomeEntry.self, from: json); try x.validate()
            guard sources.contains(x.sourceId) else { throw V4LogicalError.identity }
            if let occurrence = x.occurrenceDate { guard incomeOccurrences.insert(x.sourceId + "/" + occurrence).inserted else { throw V4LogicalError.identity } }
            try total(x.amountMinor, key: "income")
        case 5:
            let x = try decoder.decode(SavingsGoal.self, from: json); try x.validate(); goals.insert(x.id)
            goalTotals[x.id] = x.openingMinor; try total(x.openingMinor, key: "savings")
        case 6:
            let x = try decoder.decode(SavingsEntry.self, from: json); try x.validate()
            guard goals.contains(x.goalId) else { throw V4LogicalError.identity }
            goalTotals[x.goalId] = try FinanceValidation.total([goalTotals[x.goalId] ?? 0, x.amountMinor]); try total(x.amountMinor, key: "savings")
        case 7:
            let x = try decoder.decode(RecurringExpense.self, from: json); try x.validate(); templates.insert(x.id)
        case 8:
            let x = try decoder.decode(Expense.self, from: json); try x.validate(); expenses.insert(x.id)
            if let id = x.recurringTemplateId, let occurrence = x.recurringOccurrenceDate {
                guard templates.contains(id), expenseOccurrences.insert(id + "/" + occurrence).inserted else { throw V4LogicalError.identity }
            }
            try total(x.amountMinor, key: "expenses")
        default: throw V4LogicalError.order
        }
    }
    func beginReceipt(_ descriptor: V4ReceiptDescriptor) throws {
        guard lifecycle == .active, receipt == nil, expenses.contains(descriptor.expenseId) else { throw V4LogicalError.identity }
        receipt = descriptor; bytes.removeAll(keepingCapacity: true)
    }
    func appendReceipt(_ part: Data) throws {
        guard lifecycle == .active, let receipt, bytes.count + part.count <= receipt.byteCount, bytes.count + part.count <= 2_097_152 else { throw V4LogicalError.receipt }
        bytes.append(part)
    }
    func finishReceipt() throws {
        guard lifecycle == .active, let receipt, bytes.count == receipt.byteCount else { throw V4LogicalError.receipt }
        try autoreleasepool { try ReceiptAttachment(descriptor: receipt, data: bytes).validate() }
        receiptCount += 1; bytes.resetBytes(in: 0..<bytes.count); bytes.removeAll(keepingCapacity: true); self.receipt = nil
    }
    func finishLogical(_ summary: V4LogicalSummary) throws {
        guard lifecycle == .active, receipt == nil else { throw V4LogicalError.incomplete }
        lifecycle = .consumed
        completed = true; try onFinish?()
    }
    func discard() {
        lifecycle = .consumed
        completed = false; discarded = true; receipt = nil; receiptCount = 0; metadata = nil
        bytes.resetBytes(in: 0..<bytes.count); bytes.removeAll()
        sources.removeAll(); goals.removeAll(); templates.removeAll(); expenses.removeAll(); budgets.removeAll()
        incomeOccurrences.removeAll(); expenseOccurrences.removeAll(); totals.removeAll(); goalTotals.removeAll()
    }
}

private extension ReceiptAttachment {
    init(descriptor: V4ReceiptDescriptor, data: Data) {
        id = descriptor.id; expenseId = descriptor.expenseId; mediaType = descriptor.mediaType
        byteCount = Int(descriptor.byteCount); sha256 = descriptor.sha256; dataBase64 = data.base64EncodedString()
    }
}
