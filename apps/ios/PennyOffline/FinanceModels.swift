import Foundation

enum FinanceValidation {
    // ECMAScript trim whitespace used by the portable reference, including BOM.
    static let wireWhitespace = CharacterSet(charactersIn: "\u{0009}\u{000B}\u{000C}\u{0020}\u{00A0}\u{1680}\u{2000}\u{2001}\u{2002}\u{2003}\u{2004}\u{2005}\u{2006}\u{2007}\u{2008}\u{2009}\u{200A}\u{202F}\u{205F}\u{3000}\u{FEFF}\u{000A}\u{000D}\u{2028}\u{2029}")
    static let maximumTotal: Int64 = 999_999_999_999_999
    static func require(_ condition: Bool) throws { if !condition { throw ExpenseError.invalidFinance } }
    static func uuid(_ value: String) throws { try require(UUID(uuidString: value)?.uuidString.lowercased() == value) }
    static func name(_ value: String) throws { try require(!value.isEmpty && value.unicodeScalars.count <= 200 && value == value.trimmingCharacters(in: wireWhitespace)) }
    static func text(_ value: String) throws { try require(value.unicodeScalars.count <= 4_000) }
    static func money(_ value: Int64, zero: Bool = false) throws { try require(value >= (zero ? 0 : 1) && value <= Money.maximumMinor) }
    static func metadata(_ id: String, _ created: String, _ updated: String) throws {
        try uuid(id); try require(CivilDate.validTimestamp(created) && CivilDate.validTimestamp(updated) && updated >= created)
    }
    static func total(_ values: [Int64]) throws -> Int64 {
        var result: Int64 = 0
        for value in values {
            let (sum, overflow) = result.addingReportingOverflow(value)
            try require(!overflow && sum >= 0 && sum <= maximumTotal); result = sum
        }
        return result
    }
}

struct FinanceSchedule: Codable, Equatable, Sendable {
    static let frequencies = ["once", "weekly", "biweekly", "monthly", "yearly"]
    var frequency: String = "once"
    var startDate: String = CivilDate.string(Date())
    var endDate: String? = nil
    var dayOfMonth: Int? = nil
    static let keys: Set<String> = ["frequency", "startDate", "endDate", "dayOfMonth"]
    enum CodingKeys: String, CodingKey { case frequency, startDate, endDate, dayOfMonth }
    func encode(to encoder: Encoder) throws {
        var container = encoder.container(keyedBy: CodingKeys.self)
        try container.encode(frequency, forKey: .frequency)
        try container.encode(startDate, forKey: .startDate)
        try container.encode(endDate, forKey: .endDate)
        try container.encode(dayOfMonth, forKey: .dayOfMonth)
    }
    func validate() throws {
        try FinanceValidation.require(Self.frequencies.contains(frequency) && CivilDate.validDate(startDate))
        try FinanceValidation.require(endDate == nil || CivilDate.validDate(endDate!) && endDate! >= startDate)
        try FinanceValidation.require(dayOfMonth == nil || (1...31).contains(dayOfMonth!))
        try FinanceValidation.require(["monthly", "yearly"].contains(frequency) || dayOfMonth == nil)
    }
}

struct Budget: Codable, Equatable, Sendable, Identifiable {
    var category: String = Categories.other
    var month: String = String(CivilDate.string(Date()).prefix(7))
    var limitMinor: Int64 = 0
    var rollover: Bool = false
    var alertThresholdBps: Int = 8000
    var notificationsEnabled: Bool = false
    var id: String = UUID().uuidString.lowercased()
    var createdAt: String = CivilDate.timestamp()
    var updatedAt: String = CivilDate.timestamp()
    static let keys: Set<String> = ["category", "month", "limitMinor", "rollover", "alertThresholdBps", "notificationsEnabled", "id", "createdAt", "updatedAt"]
    enum CodingKeys: String, CodingKey { case category, month, limitMinor, rollover, alertThresholdBps, notificationsEnabled, id, createdAt, updatedAt }
    func encode(to encoder: Encoder) throws {
        var container = encoder.container(keyedBy: CodingKeys.self)
        try container.encode(category, forKey: .category)
        try container.encode(month, forKey: .month)
        try container.encode(limitMinor, forKey: .limitMinor)
        try container.encode(rollover, forKey: .rollover)
        try container.encode(alertThresholdBps, forKey: .alertThresholdBps)
        try container.encode(notificationsEnabled, forKey: .notificationsEnabled)
        try container.encode(id, forKey: .id)
        try container.encode(createdAt, forKey: .createdAt)
        try container.encode(updatedAt, forKey: .updatedAt)
    }
    func validate() throws {
        try FinanceValidation.metadata(id, createdAt, updatedAt)
        try FinanceValidation.require(Categories.all.contains(category) && GregorianDay.validMonth(month) && (0...10_000).contains(alertThresholdBps))
        try FinanceValidation.money(limitMinor, zero: true)
    }
}

struct IncomeSource: Codable, Equatable, Sendable, Identifiable {
    static let categories = ["salary", "freelance", "bonus", "investment", "rental", "side_hustle", "gift", "other"]
    var name: String = ""
    var category: String = "other"
    var grossMinor: Int64 = 1
    var netMinor: Int64? = nil
    var currencyCode: String = "CAD"
    var taxable: Bool = true
    var isRecurring: Bool = false
    var isActive: Bool = true
    var description: String = ""
    var schedule: FinanceSchedule = FinanceSchedule()
    var lastReceivedAt: String? = nil
    var id: String = UUID().uuidString.lowercased()
    var createdAt: String = CivilDate.timestamp()
    var updatedAt: String = CivilDate.timestamp()
    static let keys: Set<String> = ["name", "category", "grossMinor", "netMinor", "currencyCode", "taxable", "isRecurring", "isActive", "description", "schedule", "lastReceivedAt", "id", "createdAt", "updatedAt"]
    enum CodingKeys: String, CodingKey { case name, category, grossMinor, netMinor, currencyCode, taxable, isRecurring, isActive, description, schedule, lastReceivedAt, id, createdAt, updatedAt }
    func encode(to encoder: Encoder) throws {
        var container = encoder.container(keyedBy: CodingKeys.self)
        try container.encode(name, forKey: .name)
        try container.encode(category, forKey: .category)
        try container.encode(grossMinor, forKey: .grossMinor)
        try container.encode(netMinor, forKey: .netMinor)
        try container.encode(currencyCode, forKey: .currencyCode)
        try container.encode(taxable, forKey: .taxable)
        try container.encode(isRecurring, forKey: .isRecurring)
        try container.encode(isActive, forKey: .isActive)
        try container.encode(description, forKey: .description)
        try container.encode(schedule, forKey: .schedule)
        try container.encode(lastReceivedAt, forKey: .lastReceivedAt)
        try container.encode(id, forKey: .id)
        try container.encode(createdAt, forKey: .createdAt)
        try container.encode(updatedAt, forKey: .updatedAt)
    }
    func validate() throws {
        try FinanceValidation.metadata(id, createdAt, updatedAt)
        try FinanceValidation.name(name)
        try FinanceValidation.require(Self.categories.contains(category) && currencyCode == "CAD")
        try FinanceValidation.money(grossMinor)
        if let netMinor { try FinanceValidation.money(netMinor, zero: true); try FinanceValidation.require(netMinor <= grossMinor) }
        try FinanceValidation.text(description)
        try schedule.validate()
        if let lastReceivedAt { try FinanceValidation.require(CivilDate.validTimestamp(lastReceivedAt)) }
    }
}

struct IncomeEntry: Codable, Equatable, Sendable, Identifiable {
    var sourceId: String = ""
    var receivedDate: String = CivilDate.string(Date())
    var amountMinor: Int64 = 1
    var currencyCode: String = "CAD"
    var note: String = ""
    var occurrenceDate: String? = nil
    var id: String = UUID().uuidString.lowercased()
    var createdAt: String = CivilDate.timestamp()
    var updatedAt: String = CivilDate.timestamp()
    static let keys: Set<String> = ["sourceId", "receivedDate", "amountMinor", "currencyCode", "note", "occurrenceDate", "id", "createdAt", "updatedAt"]
    enum CodingKeys: String, CodingKey { case sourceId, receivedDate, amountMinor, currencyCode, note, occurrenceDate, id, createdAt, updatedAt }
    func encode(to encoder: Encoder) throws {
        var container = encoder.container(keyedBy: CodingKeys.self)
        try container.encode(sourceId, forKey: .sourceId)
        try container.encode(receivedDate, forKey: .receivedDate)
        try container.encode(amountMinor, forKey: .amountMinor)
        try container.encode(currencyCode, forKey: .currencyCode)
        try container.encode(note, forKey: .note)
        try container.encode(occurrenceDate, forKey: .occurrenceDate)
        try container.encode(id, forKey: .id)
        try container.encode(createdAt, forKey: .createdAt)
        try container.encode(updatedAt, forKey: .updatedAt)
    }
    func validate() throws {
        try FinanceValidation.metadata(id, createdAt, updatedAt)
        try FinanceValidation.uuid(sourceId)
        try FinanceValidation.require(CivilDate.validDate(receivedDate) && currencyCode == "CAD")
        try FinanceValidation.money(amountMinor)
        try FinanceValidation.text(note)
        if let occurrenceDate { try FinanceValidation.require(CivilDate.validDate(occurrenceDate)) }
    }
}

struct SavingsGoal: Codable, Equatable, Sendable, Identifiable {
    static let categories = ["emergency_fund", "travel", "education", "health", "house_down_payment", "car", "wedding", "retirement", "investment", "custom"]
    static let statuses = ["active", "achieved", "paused", "cancelled"]
    static let priorities = ["low", "medium", "high", "critical"]
    var name: String = ""
    var category: String = "custom"
    var targetMinor: Int64 = 1
    var openingMinor: Int64 = 0
    var monthlyContributionMinor: Int64 = 0
    var currencyCode: String = "CAD"
    var status: String = "active"
    var isActive: Bool = true
    var priority: String = "medium"
    var description: String = ""
    var emoji: String = ""
    var startDate: String = CivilDate.string(Date())
    var targetDate: String? = nil
    var achievedDate: String? = nil
    var lastContributionAt: String? = nil
    var id: String = UUID().uuidString.lowercased()
    var createdAt: String = CivilDate.timestamp()
    var updatedAt: String = CivilDate.timestamp()
    static let keys: Set<String> = ["name", "category", "targetMinor", "openingMinor", "monthlyContributionMinor", "currencyCode", "status", "isActive", "priority", "description", "emoji", "startDate", "targetDate", "achievedDate", "lastContributionAt", "id", "createdAt", "updatedAt"]
    enum CodingKeys: String, CodingKey { case name, category, targetMinor, openingMinor, monthlyContributionMinor, currencyCode, status, isActive, priority, description, emoji, startDate, targetDate, achievedDate, lastContributionAt, id, createdAt, updatedAt }
    func encode(to encoder: Encoder) throws {
        var container = encoder.container(keyedBy: CodingKeys.self)
        try container.encode(name, forKey: .name)
        try container.encode(category, forKey: .category)
        try container.encode(targetMinor, forKey: .targetMinor)
        try container.encode(openingMinor, forKey: .openingMinor)
        try container.encode(monthlyContributionMinor, forKey: .monthlyContributionMinor)
        try container.encode(currencyCode, forKey: .currencyCode)
        try container.encode(status, forKey: .status)
        try container.encode(isActive, forKey: .isActive)
        try container.encode(priority, forKey: .priority)
        try container.encode(description, forKey: .description)
        try container.encode(emoji, forKey: .emoji)
        try container.encode(startDate, forKey: .startDate)
        try container.encode(targetDate, forKey: .targetDate)
        try container.encode(achievedDate, forKey: .achievedDate)
        try container.encode(lastContributionAt, forKey: .lastContributionAt)
        try container.encode(id, forKey: .id)
        try container.encode(createdAt, forKey: .createdAt)
        try container.encode(updatedAt, forKey: .updatedAt)
    }
    func validate() throws {
        try FinanceValidation.metadata(id, createdAt, updatedAt)
        try FinanceValidation.name(name)
        try FinanceValidation.require(Self.categories.contains(category) && Self.statuses.contains(status) && Self.priorities.contains(priority) && currencyCode == "CAD")
        try FinanceValidation.money(targetMinor)
        try FinanceValidation.money(openingMinor, zero: true)
        try FinanceValidation.money(monthlyContributionMinor, zero: true)
        try FinanceValidation.text(description)
        try FinanceValidation.require(emoji.unicodeScalars.count <= 16 && CivilDate.validDate(startDate))
        for date in [targetDate, achievedDate].compactMap({ $0 }) { try FinanceValidation.require(CivilDate.validDate(date) && date >= startDate) }
        if let lastContributionAt { try FinanceValidation.require(CivilDate.validTimestamp(lastContributionAt)) }
    }
}

struct SavingsEntry: Codable, Equatable, Sendable, Identifiable {
    static let types = ["manual", "auto", "from_expense_savings"]
    var goalId: String = ""
    var goalName: String = ""
    var date: String = CivilDate.string(Date())
    var amountMinor: Int64 = 1
    var currencyCode: String = "CAD"
    var contributionType: String = "manual"
    var source: String = ""
    var note: String = ""
    var id: String = UUID().uuidString.lowercased()
    var createdAt: String = CivilDate.timestamp()
    var updatedAt: String = CivilDate.timestamp()
    static let keys: Set<String> = ["goalId", "goalName", "date", "amountMinor", "currencyCode", "contributionType", "source", "note", "id", "createdAt", "updatedAt"]
    enum CodingKeys: String, CodingKey { case goalId, goalName, date, amountMinor, currencyCode, contributionType, source, note, id, createdAt, updatedAt }
    func encode(to encoder: Encoder) throws {
        var container = encoder.container(keyedBy: CodingKeys.self)
        try container.encode(goalId, forKey: .goalId)
        try container.encode(goalName, forKey: .goalName)
        try container.encode(date, forKey: .date)
        try container.encode(amountMinor, forKey: .amountMinor)
        try container.encode(currencyCode, forKey: .currencyCode)
        try container.encode(contributionType, forKey: .contributionType)
        try container.encode(source, forKey: .source)
        try container.encode(note, forKey: .note)
        try container.encode(id, forKey: .id)
        try container.encode(createdAt, forKey: .createdAt)
        try container.encode(updatedAt, forKey: .updatedAt)
    }
    func validate() throws {
        try FinanceValidation.metadata(id, createdAt, updatedAt)
        try FinanceValidation.uuid(goalId)
        try FinanceValidation.name(goalName)
        try FinanceValidation.require(CivilDate.validDate(date) && currencyCode == "CAD" && Self.types.contains(contributionType))
        try FinanceValidation.money(amountMinor)
        try FinanceValidation.text(source); try FinanceValidation.text(note)
    }
}

struct RecurringExpense: Codable, Equatable, Sendable, Identifiable {
    var merchant: String = ""
    var amountMinor: Int64 = 1
    var currencyCode: String = "CAD"
    var category: String = Categories.other
    var description: String = ""
    var note: String = ""
    var isActive: Bool = true
    var schedule: FinanceSchedule = FinanceSchedule()
    var id: String = UUID().uuidString.lowercased()
    var createdAt: String = CivilDate.timestamp()
    var updatedAt: String = CivilDate.timestamp()
    static let keys: Set<String> = ["merchant", "amountMinor", "currencyCode", "category", "description", "note", "isActive", "schedule", "id", "createdAt", "updatedAt"]
    enum CodingKeys: String, CodingKey { case merchant, amountMinor, currencyCode, category, description, note, isActive, schedule, id, createdAt, updatedAt }
    func encode(to encoder: Encoder) throws {
        var container = encoder.container(keyedBy: CodingKeys.self)
        try container.encode(merchant, forKey: .merchant)
        try container.encode(amountMinor, forKey: .amountMinor)
        try container.encode(currencyCode, forKey: .currencyCode)
        try container.encode(category, forKey: .category)
        try container.encode(description, forKey: .description)
        try container.encode(note, forKey: .note)
        try container.encode(isActive, forKey: .isActive)
        try container.encode(schedule, forKey: .schedule)
        try container.encode(id, forKey: .id)
        try container.encode(createdAt, forKey: .createdAt)
        try container.encode(updatedAt, forKey: .updatedAt)
    }
    func validate() throws {
        try FinanceValidation.metadata(id, createdAt, updatedAt)
        try FinanceValidation.name(merchant)
        try FinanceValidation.require(currencyCode == "CAD" && Categories.all.contains(category))
        try FinanceValidation.money(amountMinor)
        try FinanceValidation.text(description); try FinanceValidation.text(note)
        try schedule.validate()
    }
}
