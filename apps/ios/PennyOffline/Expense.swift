import Foundation

enum ExpenseError: LocalizedError {
    case invalidAmount, invalidMerchant, invalidDate, invalidCategory, invalidSnapshot, invalidFinance
    case lockedVault, missingKey, keychain(Int32), vaultCapacity, recordCapacity(String, Int)
    var errorDescription: String? {
        switch self {
        case .invalidAmount: "Enter an amount from $0.01 to $999,999,999.99 with at most two decimal places."
        case .invalidMerchant: "Enter a merchant name up to 200 characters."
        case .invalidDate: "Choose a valid expense date."
        case .invalidCategory: "Choose a supported expense category."
        case .invalidFinance: "A required finance value is invalid, duplicated, or refers to a missing record. Your saved data has not changed."
        case .invalidSnapshot: "This vault has unsupported or damaged data. Your existing file has been preserved."
        case .lockedVault: "Your vault could not be opened. Unlock your device and try again. Your existing data has been preserved."
        case .missingKey: "The device key is missing. Restore from an encrypted backup to recover your expenses."
        case .keychain: "The device could not securely access the vault key. Try again after unlocking your device."
        case .vaultCapacity: "The saved data exceeds the portable backup capacity (15 MiB of data with space reserved for the 20 MiB encrypted file). Reduce the new text or attachments. Your existing records have not changed."
        case .recordCapacity(let records, let maximum): "The limit of \(maximum.formatted()) \(records) has been reached. This change was not saved. Your existing records are preserved."
        }
    }
}

enum Money {
    static let maximumMinor: Int64 = 99_999_999_999
    static func parse(_ text: String) throws -> Int64 {
        let input = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard input.range(of: #"^[0-9]{1,9}([.,][0-9]{1,2})?$"#, options: .regularExpression) != nil else { throw ExpenseError.invalidAmount }
        let pieces = input.replacingOccurrences(of: ",", with: ".").split(separator: ".")
        guard let major = Int64(pieces[0]) else { throw ExpenseError.invalidAmount }
        let cents = pieces.count == 2 ? Int64(pieces[1].padding(toLength: 2, withPad: "0", startingAt: 0))! : 0
        let result = major * 100 + cents
        guard result > 0 && result <= maximumMinor else { throw ExpenseError.invalidAmount }
        return result
    }
    static func input(_ minor: Int64) -> String { "\(minor / 100).\(String(format: "%02lld", minor % 100))" }
    static func formatted(_ minor: Int64) -> String {
        let value = Decimal(minor) / 100
        return value.formatted(.currency(code: "CAD"))
    }
}

enum CivilDate {
    static func string(_ date: Date, timeZone: TimeZone = .current) -> String {
        let formatter = DateFormatter()
        formatter.calendar = Calendar(identifier: .gregorian)
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.dateFormat = "yyyy-MM-dd"
        formatter.timeZone = timeZone
        return formatter.string(from: date)
    }
    static func validDate(_ text: String) -> Bool {
        guard text.utf8.count == 10, text.range(of: #"^[0-9]{4}-[0-9]{2}-[0-9]{2}$"#, options: .regularExpression) != nil else { return false }
        let parts = text.split(separator: "-").compactMap { Int($0) }
        guard parts.count == 3, (1...9_999).contains(parts[0]), (1...12).contains(parts[1]) else { return false }
        let leap = parts[0] % 4 == 0 && (parts[0] % 100 != 0 || parts[0] % 400 == 0)
        let days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
        return (1...days[parts[1] - 1]).contains(parts[2])
    }
    // DatePicker conversion is deliberately separate from proleptic Gregorian
    // wire validation: Foundation's historical calendar has a 1582 cutover.
    static func date(_ text: String) -> Date? {
        guard validDate(text) else { return nil }
        let formatter = DateFormatter()
        formatter.calendar = Calendar(identifier: .gregorian)
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.dateFormat = "yyyy-MM-dd"
        formatter.timeZone = TimeZone(secondsFromGMT: 0)!
        formatter.isLenient = false
        guard let date = formatter.date(from: text), string(date, timeZone: formatter.timeZone) == text else { return nil }
        return date
    }
    static func timestamp() -> String {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return formatter.string(from: Date())
    }
    static func validTimestamp(_ text: String) -> Bool {
        guard text.utf8.count == 24,
              text.range(of: #"^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}\.[0-9]{3}Z$"#, options: .regularExpression) != nil,
              validDate(String(text.prefix(10))),
              let hours = Int(text.dropFirst(11).prefix(2)), hours < 24,
              let minutes = Int(text.dropFirst(14).prefix(2)), minutes < 60,
              let seconds = Int(text.dropFirst(17).prefix(2)), seconds < 60 else { return false }
        return true
    }
}

struct Expense: Codable, Identifiable, Equatable, Sendable {
    var id: String
    var merchant: String
    var amountMinor: Int64
    var currencyCode: String
    var expenseDate: String
    var category: String
    var note: String
    var createdAt: String
    var updatedAt: String
    var description: String = ""
    var recurringTemplateId: String? = nil
    var recurringOccurrenceDate: String? = nil
    enum CodingKeys: String, CodingKey { case id, merchant, amountMinor, currencyCode, expenseDate, category, note, createdAt, updatedAt, description, recurringTemplateId, recurringOccurrenceDate }
    func encode(to encoder: Encoder) throws {
        var c = encoder.container(keyedBy: CodingKeys.self)
        try c.encode(id, forKey: .id); try c.encode(merchant, forKey: .merchant); try c.encode(amountMinor, forKey: .amountMinor)
        try c.encode(currencyCode, forKey: .currencyCode); try c.encode(expenseDate, forKey: .expenseDate); try c.encode(category, forKey: .category)
        try c.encode(note, forKey: .note); try c.encode(createdAt, forKey: .createdAt); try c.encode(updatedAt, forKey: .updatedAt)
        try c.encode(description, forKey: .description); try c.encode(recurringTemplateId, forKey: .recurringTemplateId)
        try c.encode(recurringOccurrenceDate, forKey: .recurringOccurrenceDate)
    }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = try c.decode(String.self, forKey: .id); merchant = try c.decode(String.self, forKey: .merchant)
        amountMinor = try c.decode(Int64.self, forKey: .amountMinor); currencyCode = try c.decode(String.self, forKey: .currencyCode)
        expenseDate = try c.decode(String.self, forKey: .expenseDate); category = try c.decode(String.self, forKey: .category)
        note = try c.decode(String.self, forKey: .note); createdAt = try c.decode(String.self, forKey: .createdAt); updatedAt = try c.decode(String.self, forKey: .updatedAt)
        description = c.contains(.description) ? try c.decode(String.self, forKey: .description) : ""
        recurringTemplateId = try c.decodeIfPresent(String.self, forKey: .recurringTemplateId)
        recurringOccurrenceDate = try c.decodeIfPresent(String.self, forKey: .recurringOccurrenceDate)
    }
    init(id: String = UUID().uuidString.lowercased(), merchant: String, amountMinor: Int64, expenseDate: String,
         category: String, note: String = "", createdAt: String = CivilDate.timestamp()) throws {
        self.id = id
        self.merchant = merchant.trimmingCharacters(in: FinanceValidation.wireWhitespace)
        self.amountMinor = amountMinor
        self.currencyCode = "CAD"
        self.expenseDate = expenseDate
        self.category = category
        self.note = note
        self.createdAt = createdAt
        self.updatedAt = CivilDate.timestamp()
        try validate()
    }
    func validate() throws {
        guard UUID(uuidString: id) != nil, id == id.lowercased(), currencyCode == "CAD", note.unicodeScalars.count <= 4_000,
              CivilDate.validTimestamp(createdAt), CivilDate.validTimestamp(updatedAt), updatedAt >= createdAt else { throw ExpenseError.invalidSnapshot }
        guard !merchant.isEmpty, merchant == merchant.trimmingCharacters(in: FinanceValidation.wireWhitespace), merchant.unicodeScalars.count <= 200 else { throw ExpenseError.invalidMerchant }
        guard amountMinor > 0, amountMinor <= Money.maximumMinor else { throw ExpenseError.invalidAmount }
        guard CivilDate.validDate(expenseDate) else { throw ExpenseError.invalidDate }
        guard Categories.all.contains(category) else { throw ExpenseError.invalidCategory }
        try FinanceValidation.text(description)
        try FinanceValidation.require((recurringTemplateId == nil) == (recurringOccurrenceDate == nil))
        if let recurringTemplateId, let recurringOccurrenceDate {
            try FinanceValidation.uuid(recurringTemplateId)
            try FinanceValidation.require(CivilDate.validDate(recurringOccurrenceDate))
        }
    }
}

struct VaultSnapshot: Codable, Sendable {
    var schemaVersion = 3
    var snapshotId = UUID().uuidString.lowercased()
    var vaultId = UUID().uuidString.lowercased()
    var createdAt = CivilDate.timestamp()
    var expenses: [Expense] = []
    var attachments: [ReceiptAttachment] = []
    var budgets: [Budget] = []
    var incomeSources: [IncomeSource] = []
    var incomeEntries: [IncomeEntry] = []
    var savingsGoals: [SavingsGoal] = []
    var savingsEntries: [SavingsEntry] = []
    var recurringExpenses: [RecurringExpense] = []
    enum CodingKeys: String, CodingKey { case schemaVersion, snapshotId, vaultId, createdAt, expenses, attachments, budgets, incomeSources, incomeEntries, savingsGoals, savingsEntries, recurringExpenses }
    init() {}
    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        let version = try c.decode(Int.self, forKey: .schemaVersion)
        guard (1...3).contains(version) else { throw ExpenseError.invalidSnapshot }
        schemaVersion = version < 3 ? 3 : version
        snapshotId = try c.decode(String.self, forKey: .snapshotId); vaultId = try c.decode(String.self, forKey: .vaultId)
        createdAt = try c.decode(String.self, forKey: .createdAt)
        expenses = try c.decode([Expense].self, forKey: .expenses); attachments = try c.decode([ReceiptAttachment].self, forKey: .attachments)
        budgets = try c.decodeIfPresent([Budget].self, forKey: .budgets) ?? []
        incomeSources = try c.decodeIfPresent([IncomeSource].self, forKey: .incomeSources) ?? []
        incomeEntries = try c.decodeIfPresent([IncomeEntry].self, forKey: .incomeEntries) ?? []
        savingsGoals = try c.decodeIfPresent([SavingsGoal].self, forKey: .savingsGoals) ?? []
        savingsEntries = try c.decodeIfPresent([SavingsEntry].self, forKey: .savingsEntries) ?? []
        recurringExpenses = try c.decodeIfPresent([RecurringExpense].self, forKey: .recurringExpenses) ?? []
    }
    var recordCount: Int { expenses.count + budgets.count + incomeSources.count + incomeEntries.count + savingsGoals.count + savingsEntries.count + recurringExpenses.count }
    func validate() throws {
        guard expenses.count <= 10_000 else { throw ExpenseError.recordCapacity("expenses", 10_000) }
        guard schemaVersion == 3, UUID(uuidString: snapshotId) != nil, UUID(uuidString: vaultId) != nil,
              CivilDate.validTimestamp(createdAt), snapshotId == snapshotId.lowercased(), vaultId == vaultId.lowercased(),
              Set(expenses.map(\.id)).count == expenses.count else { throw ExpenseError.invalidSnapshot }
        try expenses.forEach { try $0.validate() }
        guard attachments.count <= ReceiptAttachment.maximumCount,
              attachments.reduce(0, { $0 + max(0, min($1.byteCount, ReceiptAttachment.maximumBytes + 1)) }) <= ReceiptAttachment.maximumTotalBytes else { throw ReceiptAttachment.ReceiptError.capacity }
        let owners = Set(expenses.map(\.id))
        guard Set(attachments.map(\.id)).count == attachments.count,
              attachments.allSatisfy({ owners.contains($0.expenseId) }) else { throw ExpenseError.invalidSnapshot }
        try attachments.forEach { try $0.validate() }
        _ = try FinanceValidation.total(expenses.map(\.amountMinor))
        try validateFinance()
    }
}
